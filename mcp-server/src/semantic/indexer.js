/**
 * Code Indexer
 *
 * Orchestrates the entire indexing pipeline:
 * 1. Discover files
 * 2. Chunk source code (AST-aware)
 * 3. Generate embeddings
 * 4. Store in vector database
 * 5. Build dependency graph
 *
 * Supports incremental indexing with cache invalidation.
 */

import { glob } from 'glob';
import { readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { existsSync } from 'fs';

import { CodeChunker } from './chunker.js';
import { MarkdownChunker } from './markdown-chunker.js';
import { HybridEmbeddings } from './embeddings.js';
import { VectorStore } from './vector-store.js';
import { DependencyGraph } from './dependency-graph.js';
import { EmbeddingCache } from './cache.js';
import { LexicalIndex } from './lexical-index.js';
import { QueryExpander } from './query-expander.js';
import { SemanticQueryCache } from './query-cache.js';
// FIX #13: Import centralized configuration for all magic numbers
import {
  TYPE_PRIORITY,
  TYPE_THRESHOLDS,
  ADAPTIVE_THRESHOLD,
  CALL_FREQUENCY,
  QUERY_EXPANSION,
  RRF_CONFIG,
} from './config.js';

/**
 * Default patterns for files to index
 */
const DEFAULT_PATTERNS = [
  'js/**/*.js',
  'mcp-server/**/*.js',
  'tests/**/*.js',
  'workers/**/*.js',
  'workers/**/*.mjs',
  'scripts/**/*.js',
  'scripts/**/*.mjs',
  'docs/**/*.md',
  'coverage/**/*.js',
  'coverage/**/*.html',
];

/**
 * Default ignore patterns
 */
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.mcp-cache/**',
  '**/*.test.js',
  '**/*.spec.js',
  '**/vendor/**',
  '**/vendor/**/*.js', // Skip large minified vendor files that cause chunker to hang
  'js/vendor/**', // More specific pattern for js/vendor directory
];

/**
 * Code Indexer class
 */
export class CodeIndexer {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.cacheDir = options.cacheDir || join(projectRoot, '.mcp-cache');

    // Components
    this.codeChunker = new CodeChunker(options.chunker);
    this.markdownChunker = new MarkdownChunker(options.markdownChunker);
    this.embeddings = new HybridEmbeddings(options.embeddings);
    // Pass embedding dimension to vector store
    this.vectorStore = new VectorStore({
      ...options.vectorStore,
      dimension: this.embeddings.getDimension(),
    });
    this.dependencyGraph = new DependencyGraph();
    this.cache = new EmbeddingCache(this.cacheDir, { enabled: options.cache !== false });
    this.lexicalIndex = new LexicalIndex(options.lexical);
    this.queryExpander = new QueryExpander(this.dependencyGraph);
    // FIX: Query cache to reduce redundant embedding API calls
    this.queryCache = new SemanticQueryCache(options.queryCache);

    // Patterns
    this.patterns = options.patterns || DEFAULT_PATTERNS;
    this.ignore = options.ignore || DEFAULT_IGNORE;

    // State
    this.indexed = false;
    this.watcher = null; // File watcher instance
    this._reindexLock = null; // Concurrency control for reindexFiles()
    this._indexingInProgress = false; // Track if indexing is currently running
    this._indexingError = null; // Track any indexing errors
    this._indexingPromise = null; // Track current indexing operation
    this.stats = {
      filesDiscovered: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesFromCache: 0,
      chunksIndexed: 0,
      cacheFailures: 0, // Track cache storage failures
      lastCacheFailureTime: null, // Track when last cache failure occurred
      embeddingSource: 'unknown',
      indexTime: 0,
      lastIndexed: null,
    };
  }

  /**
   * Initialize the indexer
   */
  async initialize() {
    console.error('[Indexer] Initializing semantic search indexer...');

    // Initialize cache with model version for invalidation tracking
    const modelInfo = this.embeddings.getModelInfo();
    this.cache.setModelVersion(modelInfo.name);
    await this.cache.initialize();

    // Load cached data if available
    const stats = this.cache.getStats();
    if (stats.fileCount > 0) {
      console.error(
        `[Indexer] Found cached data for ${stats.fileCount} files (model: ${stats.modelVersion || 'unknown'})`
      );
    }

    // Check embedding source and detect actual dimension
    const source = this.embeddings.getCurrentSource();
    this.stats.embeddingSource = source.source;
    console.error(`[Indexer] Embedding source: ${source.source} (${source.model})`);

    // Sync dimension to vector store (important for Transformers.js fallback)
    const actualDim = this.embeddings.getDimension();
    const wasCleared = this.vectorStore.setDimension(actualDim);

    // FIX: If vector store was cleared due to dimension mismatch, reset stats
    if (wasCleared) {
      console.error('[Indexer] Dimension mismatch caused vector store clear - resetting stats');
      this.stats.chunksIndexed = 0;
      this.stats.filesIndexed = 0;
      this.stats.filesFromCache = 0;
    }

    return true;
  }

  /**
   * Load cached chunks into vector store (fast path for server startup)
   * This only loads previously cached chunks, does not generate new embeddings
   */
  async loadCachedChunks() {
    const startTime = Date.now();
    const cachedFiles = this.cache.getCachedFiles();

    if (cachedFiles.length === 0) {
      console.error('[Indexer] No cached chunks to load');
      return;
    }

    console.error(`[Indexer] Loading ${cachedFiles.length} cached files into vector store...`);

    await this._loadCachedChunks(cachedFiles);

    // Mark as indexed since we've loaded cached data
    // FIX: Set indexed flag when we have loaded data, even if full index wasn't run
    this.indexed = true;
    // NOTE: filesFromCache and chunksIndexed are already incremented in _loadCachedChunks()

    const elapsed = Date.now() - startTime;
    console.error(`[Indexer] Loaded ${this.stats.chunksIndexed} chunks from cache in ${elapsed}ms`);
  }

  /**
   * Discover files to index
   */
  async discoverFiles() {
    console.error('[Indexer] Discovering files...');

    const allFiles = new Set();

    for (const pattern of this.patterns) {
      const files = await glob(pattern, {
        cwd: this.projectRoot,
        ignore: this.ignore,
        absolute: true,
        nodir: true,
      });

      for (const file of files) {
        allFiles.add(file);
      }
    }

    // Explicit filter: skip vendor files (fix for glob ignore not working consistently)
    const discovered = Array.from(allFiles).filter(file => {
      const shouldSkip = file.includes('/vendor/') || file.includes('\\vendor\\');
      if (shouldSkip) {
        console.error(`[Indexer] Skipping vendor file: ${file}`);
      }
      return !shouldSkip;
    });

    console.error(`[Indexer] Discovered ${discovered.length} files`);

    return discovered;
  }

  /**
   * Index all discovered files
   */
  async indexAll(options = {}) {
    // CRITICAL: Prevent concurrent indexing
    if (this._indexingInProgress) {
      console.error('[Indexer] Indexing already in progress, ignoring duplicate request');
      // Return the existing promise if available
      if (this._indexingPromise) {
        return this._indexingPromise;
      }
      throw new Error('Indexing already in progress');
    }

    const startTime = Date.now();
    const force = options.force || false;

    console.error('[Indexer] Starting indexing...');

    // Set indexing flags
    this._indexingInProgress = true;
    this._indexingError = null;

    // FIX: Reset stats at start of indexAll to prevent accumulation across runs
    // This ensures stats accurately reflect THIS indexing run, not cumulative totals
    this.stats = {
      filesDiscovered: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesFromCache: 0,
      chunksIndexed: 0,
      cacheFailures: 0,
      lastCacheFailureTime: null,
      embeddingSource: this.embeddings.getModelInfo().source || 'unknown',
      indexTime: 0,
      lastIndexed: null,
    };

    // FIX: When force=true, clear vector store and dependency graph to prevent mismatch
    // Without this, old vectors remain while stats reset, causing count discrepancies
    if (force) {
      console.error('[Indexer] Force mode: clearing vector store and dependency graph...');
      this.vectorStore.clear();
      this.dependencyGraph.clear();
      this.lexicalIndex.clear();
      // Note: cache.clear() is NOT called - we just bypass it for validity checks
      // This allows cache to be rebuilt as files are re-indexed
    }

    // Create indexing promise
    const indexPromise = (async () => {
      try {
        // Discover files
        const files = await this.discoverFiles();
        this.stats.filesDiscovered = files.length;

        // Check cache validity
        const validFiles = force
          ? new Map()
          : await this.cache.checkFilesValid(files.map(f => relative(this.projectRoot, f)));

        // Separate files to index vs cached
        const toIndex = [];
        const fromCache = [];

        for (const absPath of files) {
          const relPath = relative(this.projectRoot, absPath);
          const isValid = validFiles.get(relPath);

          if (isValid) {
            fromCache.push(relPath);
          } else {
            toIndex.push(absPath);
          }
        }

        console.error(`[Indexer] ${toIndex.length} files to index, ${fromCache.length} from cache`);

        // Load cached chunks
        await this._loadCachedChunks(fromCache);

        // Index new/modified files (with stop checking and progress)
        let indexedCount = 0;
        const totalToIndex = toIndex.length;

        // Skip progress logging if no files to index
        if (totalToIndex === 0) {
          console.error('[Indexer] No new files to index (all files cached)');
        } else {
          const progressInterval = Math.max(1, Math.floor(totalToIndex / 10)); // Log ~10 progress updates
          let lastProgressLog = 0;

          for (const filePath of toIndex) {
            // Check if we should stop
            if (!this._indexingInProgress) {
              console.error('[Indexer] Indexing stopped by user request');
              break;
            }

            // Index the file FIRST
            await this._indexFile(filePath);

            // THEN report progress
            indexedCount++;
            if (
              indexedCount - lastProgressLog >= progressInterval ||
              indexedCount === totalToIndex
            ) {
              const progress = ((indexedCount / totalToIndex) * 100).toFixed(1);
              console.error(
                `[Indexer] Progress: ${indexedCount}/${totalToIndex} files (${progress}%)`
              );
              lastProgressLog = indexedCount;

              // FIX: Periodic cache save every 10 files to prevent data loss on interruption
              if (indexedCount % 10 === 0) {
                try {
                  await this._saveCache();
                  console.error(`[Indexer] Checkpoint: Saved cache at ${indexedCount} files`);
                } catch (cacheError) {
                  console.error('[Indexer] Checkpoint save failed:', cacheError.message);
                  // Non-critical - continue indexing
                }
              }
            }
          }
        }

        // Finalize
        this.stats.indexTime = Date.now() - startTime;
        this.stats.lastIndexed = new Date().toISOString();
        // FIX: Don't overwrite filesIndexed - it's now tracked incrementally in _indexFile()
        // this.stats.filesIndexed = indexedCount;  // REMOVED
        // FIX: filesFromCache is already set in loadCachedChunks(), don't overwrite
        // this.stats.filesFromCache = fromCache.length;  // REMOVED
        this.indexed = true;

        // Save cache
        await this._saveCache();

        console.error('[Indexer] Indexing complete:', this._formatStats());

        return this.stats;
      } catch (error) {
        console.error('[Indexer] Indexing failed:', error);
        this._indexingError = error.message || String(error);
        throw error;
      } finally {
        // Always clear indexing flag
        this._indexingInProgress = false;
        this._indexingPromise = null;
      }
    })();

    // Store promise for concurrent request detection
    this._indexingPromise = indexPromise;

    return indexPromise;
  }

  /**
   * Index a single file
   */
  async _indexFile(filePath) {
    const relPath = relative(this.projectRoot, filePath);

    try {
      // Invalidate old cache for this file FIRST
      // This ensures we don't have stale data if read fails
      this.cache.invalidateFile(relPath);

      // CRITICAL: Check file size before reading to skip empty files early
      const fileStat = await stat(filePath);
      if (fileStat.size === 0) {
        console.warn(`[Indexer] Skipping empty file: ${relPath}`);
        this.stats.filesSkipped++;
        return;
      }

      // Read source
      const source = await readFile(filePath, 'utf-8');

      // Route to appropriate chunker based on file extension
      const isMarkdown = this.markdownChunker.isSupported(relPath);
      const chunks = isMarkdown
        ? this.markdownChunker.chunkSourceFile(source, relPath)
        : this.codeChunker.chunkSourceFile(source, relPath);

      if (chunks.length === 0) {
        console.error(`[Indexer] No chunks generated for ${relPath}`);
        return;
      }

      // CRITICAL: Add file path prefix to chunk IDs to ensure uniqueness across files
      // Without this, chunks with the same local ID (e.g., function_init_L232) from
      // different files would collide and overwrite each other in the vector store.
      const sanitizedPath = isMarkdown
        ? this.markdownChunker._sanitizeFilePath(relPath)
        : this.codeChunker._sanitizeFilePath(relPath);
      for (const chunk of chunks) {
        const localId = chunk.id;
        chunk.id = `${sanitizedPath}_${localId}`;
        // Store local ID in metadata for fallback lookups
        chunk.metadata.localId = localId;
      }

      // Generate embeddings
      const texts = chunks.map(c => c.text);
      const embeddings = await this.embeddings.getBatchEmbeddings(texts);

      // CRITICAL: Validate embeddings before processing
      if (!Array.isArray(embeddings)) {
        throw new Error(`getBatchEmbeddings returned non-array: ${typeof embeddings}`);
      }

      if (embeddings.length !== chunks.length) {
        console.error(
          `[Indexer] Embedding count mismatch for ${relPath}: expected ${chunks.length}, got ${embeddings.length}`
        );
        throw new Error(
          `Embedding array length (${embeddings.length}) does not match chunks array length (${chunks.length})`
        );
      }

      // Expected embedding dimension
      const expectedDim = this.embeddings.getDimension();

      // Filter out invalid embeddings instead of failing entire file
      const validChunks = [];
      const validEmbeddings = [];
      const invalidReasons = [];

      for (let i = 0; i < embeddings.length; i++) {
        const emb = embeddings[i];
        const chunkId = chunks[i]?.id || `chunk_${i}`;

        // Check 1: Not null/undefined
        if (emb === undefined || emb === null) {
          invalidReasons.push(`${chunkId}=null/undefined`);
          continue;
        }

        // Check 2: Is Array or Float32Array
        if (!Array.isArray(emb) && !(emb instanceof Float32Array)) {
          invalidReasons.push(`${chunkId}=type:${typeof emb}`);
          continue;
        }

        // Check 3: Correct dimension
        if (emb.length !== expectedDim) {
          invalidReasons.push(`${chunkId}=dim:${emb.length}(expected${expectedDim})`);
          continue;
        }

        // Check 4: No NaN/Infinity values (check all elements for data integrity)
        let hasInvalidValue = false;
        for (let j = 0; j < emb.length; j++) {
          if (!Number.isFinite(emb[j])) {
            invalidReasons.push(`${chunkId}=nonfinite@${j}`);
            hasInvalidValue = true;
            break;
          }
        }
        if (hasInvalidValue) continue;

        // Check 5: No all-zero embeddings (indicates generation failure)
        // Check all elements for comprehensive validation (already iterating for NaN check above)
        let sumSquares = 0;
        for (let j = 0; j < emb.length; j++) {
          sumSquares += emb[j] * emb[j];
        }
        // If embedding is essentially zero, reject it
        if (sumSquares < 0.001) {
          invalidReasons.push(`${chunkId}=zero_magnitude`);
          continue;
        }

        // All checks passed
        validChunks.push(chunks[i]);
        validEmbeddings.push(emb);
      }

      // Log validation results
      const validCount = validChunks.length;
      const invalidCount = invalidReasons.length;

      if (invalidCount > 0) {
        console.error(
          `[Indexer] Filtered ${invalidCount} invalid embeddings for ${relPath}: ${invalidReasons.slice(0, 5).join(', ')}${invalidReasons.length > 5 ? '...' : ''}`
        );
      }

      // If ALL embeddings are invalid, then fail
      if (validCount === 0) {
        throw new Error(
          `All ${chunks.length} embeddings for ${relPath} are invalid. Reasons: ${invalidReasons.slice(0, 3).join(', ')}`
        );
      }

      console.error(
        `[Indexer] Generated ${validCount}/${chunks.length} valid embeddings for ${relPath}${invalidCount > 0 ? ` (${invalidCount} filtered)` : ''}`
      );

      // Store in vector store and dependency graph
      let vectorsStored = 0;
      let symbolsAdded = 0;

      for (let i = 0; i < validChunks.length; i++) {
        const chunk = validChunks[i];
        const embedding = validEmbeddings[i];

        try {
          // Add file path to chunk metadata
          chunk.metadata.file = relPath;

          // CRITICAL: Store chunk text and name in metadata for retrieval
          // This ensures get_chunk_details can return the actual source code
          chunk.metadata.text = chunk.text;
          chunk.metadata.name = chunk.name;
          chunk.metadata.type = chunk.type;

          // Store context in metadata for retrieval
          if (chunk.context) {
            chunk.metadata.contextBefore = chunk.context.before;
            chunk.metadata.contextAfter = chunk.context.after;
          }

          // Store in vector store
          this.vectorStore.upsert(chunk.id, embedding, chunk.metadata);
          vectorsStored++;

          // Add to dependency graph
          this.dependencyGraph.addChunk(chunk);
          symbolsAdded++;
        } catch (storeError) {
          console.error(
            `[Indexer] Failed to store chunk ${chunk.id} from ${relPath}:`,
            storeError.message
          );
          // Continue with next chunk instead of failing entire file
        }
      }

      console.error(
        `[Indexer] Stored ${vectorsStored} vectors and ${symbolsAdded} symbols for ${relPath}`
      );

      // Index chunks in lexical index (index only valid chunks that passed embedding validation)
      try {
        this.lexicalIndex.index(validChunks);
      } catch (lexicalError) {
        console.error(`[Indexer] Lexical indexing failed for ${relPath}:`, lexicalError.message);
        // Non-critical, continue
      }

      // Store in cache WITH embeddings (reuse fileStat from earlier)
      // CRITICAL: Store only valid chunks/embeddings to prevent cache corruption
      let cacheSuccess = true;
      try {
        await this.cache.storeFileChunks(relPath, validChunks, fileStat.mtimeMs, validEmbeddings);
      } catch (cacheError) {
        cacheSuccess = false;
        console.error(`[Indexer] Cache storage FAILED for ${relPath}:`, cacheError.message);
        console.error(
          '[Indexer] ⚠️  Cache degradation detected - re-embedding will be required on restart'
        );
        // Track cache failures with timestamp
        this.stats.cacheFailures = (this.stats.cacheFailures || 0) + 1;
        this.stats.lastCacheFailureTime = Date.now();
        // Non-critical for indexing, but expensive on restart
      }

      // FIX: Track successfully stored vectors, not just valid chunks
      // This ensures chunksIndexed matches actual vectors in the store
      this.stats.chunksIndexed += vectorsStored;

      // FIX: Increment filesIndexed for each successfully processed file
      // This counter was previously only updated at the end of indexAll()
      this.stats.filesIndexed++;

      console.error(
        `[Indexer] Indexed ${relPath} (${validCount} valid chunks, ${vectorsStored} vectors, ${symbolsAdded} symbols${!cacheSuccess ? ', CACHE FAILED' : ''})`
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File disappeared during indexing
        console.warn(`[Indexer] File disappeared during indexing: ${relPath}`);

        // CRITICAL: Ensure it's fully removed from vector store and dependency graph
        // This prevents orphaned chunks from being returned in searches
        const chunks = this.vectorStore.getByFile(relPath);
        for (const chunk of chunks) {
          this.vectorStore.delete(chunk.chunkId);
          this.dependencyGraph.removeChunk(chunk.chunkId);
        }
        console.warn(`[Indexer] Cleaned up ${chunks.length} orphaned chunks for ${relPath}`);
      } else if (error.code === 'EACCES') {
        console.error(`[Indexer] Permission denied for ${relPath} - check file permissions`);
      } else if (error.code === 'EISDIR') {
        console.error(`[Indexer] BUG: Tried to index directory ${relPath} - file discovery bug`);
      } else if (error.code === 'EMFILE') {
        console.error('[Indexer] Too many open files - system limit reached, consider throttling');
      } else {
        console.error(`[Indexer] Failed to index ${relPath}:`, error.message);
      }
      this.stats.filesSkipped++;
    }
  }

  /**
   * Load cached chunks
   */
  async _loadCachedChunks(filePaths) {
    const chunksToIndexLexically = [];

    for (const relPath of filePaths) {
      try {
        const chunkIds = this.cache.getFileChunks(relPath);

        // FIX: Skip files that are already loaded (prevent double-counting)
        // This happens when loadCachedChunks() is called at startup,
        // then indexAll() calls _loadCachedChunks() again for the same files
        const alreadyLoaded = chunkIds.every(id => this.vectorStore.has(id));
        if (alreadyLoaded && chunkIds.length > 0) {
          console.error(`[Indexer] Skipping already loaded file: ${relPath}`);
          continue;
        }

        for (const chunkId of chunkIds) {
          const chunkData = this.cache.getChunk(chunkId);

          if (chunkData) {
            // FIX: Skip chunks already in vector store (prevent double-counting)
            if (this.vectorStore.has(chunkId)) {
              continue;
            }

            // Use cached embedding if available
            let embedding = this.cache.getChunkEmbedding(chunkId);

            // Fallback: regenerate if embedding not in cache
            if (!embedding) {
              console.error(
                `[Indexer] Warning: Missing cached embedding for ${chunkId}, regenerating`
              );
              embedding = await this.embeddings.getEmbedding(chunkData.text);
            }

            // CRITICAL: Ensure text, name, and type are in metadata for retrieval
            // Cache stores these at root level, but vectorStore needs them in metadata
            const metadataWithText = {
              ...chunkData.metadata,
              text: chunkData.text,
              name: chunkData.name,
              type: chunkData.type,
            };

            // FIX: Wrap upsert in try/catch to handle storage failures gracefully
            try {
              // Store in vector store
              this.vectorStore.upsert(chunkId, embedding, metadataWithText);
            } catch (upsertError) {
              console.error(
                `[Indexer] Failed to store chunk ${chunkId} in vector store:`,
                upsertError.message
              );
              // Skip this chunk - don't add to dependency graph or lexical index
              continue;
            }

            // Add to dependency graph
            this.dependencyGraph.addChunk({
              id: chunkId,
              ...chunkData,
            });

            // Collect chunk for lexical indexing
            chunksToIndexLexically.push({
              id: chunkId,
              text: chunkData.text,
              metadata: metadataWithText,
            });

            this.stats.chunksIndexed++;
          }
        }

        // FIX: Only count file if we actually loaded any chunks from it
        const wasAlreadyLoaded = this.vectorStore.getByFile(relPath).length > 0;
        if (!wasAlreadyLoaded || chunkIds.some(id => !this.vectorStore.has(id))) {
          this.stats.filesFromCache++;
        }
      } catch (error) {
        console.error(`[Indexer] Failed to load cache for ${relPath}:`, error.message);
        // Invalidate and re-index on next run
        this.cache.invalidateFile(relPath);
      }
    }

    // Index all cached chunks in lexical index (batch operation)
    if (chunksToIndexLexically.length > 0) {
      this.lexicalIndex.index(chunksToIndexLexically);
    }
  }

  /**
   * Save cache to disk with improved error handling
   *
   * FIX #3: Enhanced error handling and race condition prevention
   * - Uses lock to prevent concurrent saves
   * - Logs detailed error information from cache stats
   * - Doesn't crash indexer if cache save fails
   * - Provides actionable debugging information
   */
  async _saveCache() {
    // Note: Cache has its own Promise-based locking mechanism (cache._saveLock)
    // No additional locking needed at indexer level
    try {
      const result = await this.cache.save();
      if (result === false) {
        // Cache was not dirty or disabled - this is fine
        return;
      }
    } catch (error) {
      // Enhanced error logging with cache statistics
      const stats = this.cache.stats || {};
      console.error('[Indexer] Failed to save cache:', {
        error: error.message,
        savesSucceeded: stats.savesSucceeded || 0,
        savesFailed: stats.savesFailed || 0,
        lastSaveError: stats.lastSaveError,
        lastSaveTime: stats.lastSaveTime,
      });

      // Log the error but don't crash the indexer
      // The cache will retry on next save operation
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF) for combining vector and lexical search results
   *
   * RRF is a rank aggregation method that combines multiple ranked lists without
   * relying on score magnitudes. It's particularly effective for combining different
   * retrieval methods (e.g., vector similarity and BM25) that may have incompatible
   * score distributions.
   *
   * Formula: RRF(score) = 1 / (k + rank)
   * Where k is a constant (default 60) that dampens the influence of high ranks
   *
   * @param {Array} vectorResults - Vector search results with chunkId
   * @param {Array} lexicalResults - Lexical search results with chunkId and score
   * @param {number} k - RRF constant (uses RRF_CONFIG.k if not provided)
   * @returns {Array} Combined results sorted by RRF score
   */
  reciprocalRankFusion(vectorResults, lexicalResults, k = undefined) {
    const scores = new Map();
    // FIX #13: Use configured k value if not provided
    const rrfK = k ?? RRF_CONFIG.k;

    // FIX #3: Both loops must accumulate scores consistently
    // Previously vector loop overwrote, lexical loop accumulated - fixed below

    // Add vector search scores (1-indexed rank)
    for (let i = 0; i < vectorResults.length; i++) {
      const rank = i + 1;
      const chunkId = vectorResults[i].chunkId;
      const rrfScore = 1 / (rrfK + rank);
      scores.set(chunkId, (scores.get(chunkId) || 0) + rrfScore);
    }

    // Add lexical search scores (1-indexed rank)
    for (let i = 0; i < lexicalResults.length; i++) {
      const rank = i + 1;
      const chunkId = lexicalResults[i].chunkId;
      const rrfScore = 1 / (rrfK + rank);
      scores.set(chunkId, (scores.get(chunkId) || 0) + rrfScore);
    }

    // Convert to array and sort by RRF score
    const combined = Array.from(scores.entries(), ([chunkId, rrfScore]) => ({
      chunkId,
      rrfScore,
    })).sort((a, b) => b.rrfScore - a.rrfScore);

    return combined;
  }

  /**
   * Semantic search with intelligent ranking
   * Prioritizes meaningful chunks (functions, methods, classes) over generic code
   *
   * Features:
   * - Query expansion: Generates alternative query formulations for better recall
   * - Hybrid search: Combines vector similarity and lexical BM25 via RRF
   * - Adaptive threshold: If too few results, automatically retries with lower threshold
   * - Type-based reranking: Boosts function/method/class chunks
   * - Enhanced scoring: Considers symbol name matches, exported status, and call frequency
   * - Per-type thresholds: Uses chunk-type-specific similarity thresholds
   * - Performance monitoring: Returns timing metrics for each search phase
   */
  async search(query, options = {}) {
    if (!this.indexed) {
      throw new Error('Indexer not initialized. Call indexAll() first.');
    }

    // CRITICAL FIX: Validate query parameter
    if (!query || typeof query !== 'string') {
      throw new TypeError('Query must be a non-empty string');
    }

    if (query.trim().length === 0) {
      throw new TypeError('Query cannot be empty or whitespace only');
    }

    if (query.length > 10000) {
      throw new RangeError('Query too long (max 10000 characters)');
    }

    const {
      limit = 10,
      threshold = 0.3,
      filters = {},
      queryText = null,
      useHybrid = true,
      useQueryExpansion = true,
    } = options;

    // Performance monitoring: track timing for each phase
    const perf = {
      embeddingTime: 0,
      queryExpansionTime: 0,
      vectorSearchTime: 0,
      lexicalSearchTime: 0,
      rankingTime: 0,
      totalTime: 0,
    };

    const searchStart = Date.now();

    // Determine type-specific threshold if chunkType filter is set
    const effectiveThreshold =
      filters.chunkType && TYPE_THRESHOLDS[filters.chunkType]
        ? Math.max(threshold, TYPE_THRESHOLDS[filters.chunkType])
        : threshold;

    if (filters.chunkType && TYPE_THRESHOLDS[filters.chunkType]) {
      console.error(
        `[Indexer] Using type-specific threshold for ${filters.chunkType}: ${effectiveThreshold.toFixed(3)}`
      );
    }

    // FIX #13: Use centralized configuration
    const MIN_THRESHOLD = ADAPTIVE_THRESHOLD.MIN_THRESHOLD;

    // Fetch more results to allow re-ranking by type
    const fetchLimit = limit * 3;

    // Query expansion: Generate alternative query formulations
    const expansionStart = Date.now();
    const queriesToSearch = useQueryExpansion
      ? this.queryExpander.expand(queryText || query)
      : [queryText || query];
    perf.queryExpansionTime = Date.now() - expansionStart;

    // Keep query-cache model tracking up-to-date so switching embedding models
    // doesn't cross-pollute cached embeddings.
    this.queryCache.setCurrentModel(this.embeddings.getModelInfo().name);

    console.error(`[Indexer] Query expansion: ${queriesToSearch.length} queries to search`);

    // Perform vector search with expanded queries
    const vectorSearchStart = Date.now();
    const vectorResults = [];
    const seenChunkIds = new Set();
    const bestSimilarities = new Map(); // Track highest similarity per chunk

    // FIX: Use query cache to reduce redundant embedding API calls
    // Generate embeddings with caching and semantic similarity deduplication
    const queryEmbeddings = new Map();
    for (const expandedQuery of queriesToSearch) {
      const embedding = await this.queryCache.get(
        expandedQuery,
        // Compute function: generate embedding if not cached
        async () => await this.embeddings.getEmbedding(expandedQuery),
        // Optional: existing embedding for semantic similarity check
        queryEmbeddings.size > 0 ? Array.from(queryEmbeddings.values())[0] : null,
        // Model-aware caching: prevent cross-model reuse
        this.embeddings.getModelInfo().name
      );
      queryEmbeddings.set(expandedQuery, embedding);
    }

    for (const [expandedQuery, queryEmbedding] of queryEmbeddings.entries()) {
      // Use cached embedding to avoid redundant API calls
      const results = await this.vectorStore.searchByText(expandedQuery, this.embeddings, {
        limit: fetchLimit,
        threshold: effectiveThreshold,
        filters,
        queryText: expandedQuery,
        queryEmbedding, // Pass cached embedding
      });

      // Merge results, keeping HIGHEST similarity per chunkId (FIX #4)
      for (const result of results) {
        const existingSimilarity = bestSimilarities.get(result.chunkId) ?? -1;
        if (result.similarity > existingSimilarity) {
          // Remove old entry if exists, add new one
          if (existingSimilarity >= 0) {
            const oldIndex = vectorResults.findIndex(r => r.chunkId === result.chunkId);
            if (oldIndex !== -1) {
              vectorResults[oldIndex] = result;
            }
          } else {
            vectorResults.push(result);
            seenChunkIds.add(result.chunkId);
          }
          bestSimilarities.set(result.chunkId, result.similarity);
        }
      }

      // Stop if we have enough results
      if (vectorResults.length >= fetchLimit * 2) {
        break;
      }
    }

    // Adaptive threshold: If too few results, retry with lower threshold and expanded queries
    if (vectorResults.length < limit && effectiveThreshold > MIN_THRESHOLD) {
      const adjustedThreshold = Math.max(
        MIN_THRESHOLD,
        effectiveThreshold * ADAPTIVE_THRESHOLD.REDUCTION_MULTIPLIER
      );
      console.error(
        `[Indexer] Too few results (${vectorResults.length} < ${limit}), retrying with threshold ${adjustedThreshold.toFixed(3)}`
      );

      // FIX: Use expanded queries for retry (original + RETRY_QUERY_COUNT-1 expanded)
      // This improves recall by trying alternative query formulations
      const retryQueries =
        useQueryExpansion && queriesToSearch.length > 1
          ? queriesToSearch.slice(0, QUERY_EXPANSION.RETRY_QUERY_COUNT + 1)
          : [queryText || query];

      console.error(
        `[Indexer] Retrying with ${retryQueries.length} expanded queries: ${retryQueries.map(q => `"${q}"`).join(', ')}`
      );

      for (const retryQuery of retryQueries) {
        // Use cached embedding if available, otherwise compute new one
        const retryEmbedding = queryEmbeddings.has(retryQuery)
          ? queryEmbeddings.get(retryQuery)
          : await this.queryCache.get(
            retryQuery,
            async () => await this.embeddings.getEmbedding(retryQuery),
            null,
            this.embeddings.getModelInfo().name
          );

        // Store in map for potential reuse
        if (!queryEmbeddings.has(retryQuery)) {
          queryEmbeddings.set(retryQuery, retryEmbedding);
        }

        const additionalResults = await this.vectorStore.searchByText(retryQuery, this.embeddings, {
          limit: fetchLimit,
          threshold: adjustedThreshold,
          filters,
          queryText: retryQuery,
          queryEmbedding: retryEmbedding, // Use cached embedding
        });

        // Merge results, keeping HIGHEST similarity per chunkId
        for (const result of additionalResults) {
          const existingSimilarity = bestSimilarities.get(result.chunkId) ?? -1;
          if (result.similarity > existingSimilarity) {
            if (existingSimilarity >= 0) {
              const oldIndex = vectorResults.findIndex(r => r.chunkId === result.chunkId);
              if (oldIndex !== -1) {
                vectorResults[oldIndex] = result;
              }
            } else {
              vectorResults.push(result);
              seenChunkIds.add(result.chunkId);
            }
            bestSimilarities.set(result.chunkId, result.similarity);
          }
        }

        // Early termination if we have enough results
        if (vectorResults.length >= limit) {
          console.error(
            `[Indexer] Retry found sufficient results (${vectorResults.length}), stopping early`
          );
          break;
        }
      }
    }

    perf.vectorSearchTime = Date.now() - vectorSearchStart;

    // Hybrid search: combine vector and lexical results using RRF
    let finalResults;

    if (useHybrid) {
      try {
        const lexicalStart = Date.now();

        // FIX #7: Apply query expansion to lexical search too
        // Use the same expanded queries for BM25 to maintain consistency
        // FIX #10: Pass filters to lexical search for consistency
        const lexicalQueries = useQueryExpansion ? queriesToSearch : [queryText || query];
        const lexicalResultsMap = new Map(); // chunkId -> best BM25 score

        for (const lexQuery of lexicalQueries) {
          const lexResults = this.lexicalIndex.search(lexQuery, fetchLimit, filters);
          // Keep highest BM25 score per chunk
          for (const lr of lexResults) {
            const existing = lexicalResultsMap.get(lr.chunkId);
            if (!existing || lr.score > existing) {
              lexicalResultsMap.set(lr.chunkId, lr.score);
            }
          }
        }

        // Convert Map to array format
        const lexicalResults = Array.from(lexicalResultsMap.entries()).map(([chunkId, score]) => ({
          chunkId,
          score,
        }));

        perf.lexicalSearchTime = Date.now() - lexicalStart;

        // Combine results using Reciprocal Rank Fusion
        const combined = this.reciprocalRankFusion(vectorResults, lexicalResults);

        // Build full result objects with metadata from vector store
        finalResults = combined
          .map(item => {
            const vectorResult = vectorResults.find(r => r.chunkId === item.chunkId);
            if (vectorResult) {
              return {
                ...vectorResult,
                rrfScore: item.rrfScore,
              };
            }
            // Lexical-only result: fetch from vector store
            const fromStore = this.vectorStore.get(item.chunkId);
            if (fromStore) {
              return {
                chunkId: item.chunkId,
                similarity: 0, // No vector similarity for lexical-only results
                rrfScore: item.rrfScore,
                metadata: fromStore.metadata,
              };
            }
            return null;
          })
          .filter(r => r !== null);
      } catch (error) {
        console.error(
          '[Indexer] Lexical search failed, falling back to vector-only:',
          error.message
        );
        finalResults = vectorResults;
      }
    } else {
      finalResults = vectorResults;
    }

    // FIX #13: Use centralized type priority configuration
    const typePriority = TYPE_PRIORITY;

    const queryLower = (queryText || query).toLowerCase();

    const rankingStart = Date.now();
    const ranked = finalResults
      .map(r => {
        // FIX #1: Use consistent scaling for RRF and similarity
        // RRF scores range ~0-0.02, similarity ranges 0-1
        // Scale both to similar range (0-100) for fair comparison
        const baseScore =
          r.rrfScore !== undefined
            ? r.rrfScore * RRF_CONFIG.SCALING // RRF: max ~0.02 * 5000 = 100
            : r.similarity * 100; // Similarity: max 1.0 * 100 = 100

        let rankScore = baseScore + (typePriority[r.metadata?.type] || 0);

        // Exact symbol name match bonus: +50
        if (r.metadata?.name && queryLower === r.metadata.name.toLowerCase()) {
          rankScore += 50;
        }

        // Exported status bonus: +20
        if (r.metadata?.exported) {
          rankScore += 20;
        }

        // FIX #11: Call frequency bonus using sqrt scaling to prevent domination
        // Old: Math.floor(usages/10) could give +100, overwhelming semantic relevance
        // New: Sqrt scaling provides meaningful bonus progression: 1-9 calls=0, 10-99 calls=1-3, 100-999 calls=3-9, 1000+=10-20 (capped)
        if (r.metadata?.name) {
          const symbolName = r.metadata.name;
          let usages = [];

          // FIX: Try fully-qualified name first for overloaded method disambiguation
          // For methods like "UserService.getUser", try the full name first
          if (r.metadata?.type === 'method' && symbolName.includes('.')) {
            // Try qualified name first (e.g., "UserService.getUser")
            usages = this.dependencyGraph.findUsages(symbolName);

            // If no results with qualified name, try short name (e.g., "getUser")
            if (usages.length === 0) {
              const shortName = symbolName.split('.').pop();
              usages = this.dependencyGraph.findUsages(shortName);
            }
          } else {
            // For non-methods, use the symbol name directly
            usages = this.dependencyGraph.findUsages(symbolName);
          }

          if (usages.length > 0) {
            // FIX #13: Use centralized call frequency config
            const callBonus = CALL_FREQUENCY.USE_SQRT_SCALING
              ? Math.min(
                CALL_FREQUENCY.MAX_BONUS,
                Math.floor(Math.sqrt(Math.max(0, usages.length / 10)))
              )
              : Math.floor(usages.length / 10);
            rankScore += callBonus;
          }
        }

        return {
          ...r,
          rankScore,
        };
      })
      .sort((a, b) => b.rankScore - a.rankScore);
    perf.rankingTime = Date.now() - rankingStart;

    // FIX #14: Parent-child deduplication - filter out children when parent also in results
    // If both parent and child chunks match, prefer parent (more context)
    // But keep children if parent is below threshold
    const seenParentIds = new Set();
    const allChunkIds = new Set(ranked.map(r => r.chunkId));

    const deduplicated = ranked.filter(r => {
      const parentChunkId = r.metadata?.parentChunkId;
      if (!parentChunkId) {
        // Not a child chunk
        // Mark this as a parent if it has children (for filtering children later)
        if (r.metadata?.childCount && r.metadata.childCount > 0) {
          seenParentIds.add(r.chunkId);
        }
        return true; // Always keep non-child chunks
      }
      // This is a child chunk - only keep if parent is NOT also in results
      // If parent chunk exists in results, prefer it (has more context)
      return !allChunkIds.has(parentChunkId);
    });

    perf.totalTime = Date.now() - searchStart;

    const results = deduplicated.slice(0, limit);

    // Attach performance metadata to results
    results.performance = perf;
    results.queryInfo = {
      originalQuery: query,
      queryText: queryText || query,
      expandedQueries: queriesToSearch.length,
      effectiveThreshold,
      typeSpecificThreshold: filters.chunkType ? TYPE_THRESHOLDS[filters.chunkType] : null,
    };

    return results;
  }

  /**
   * Get chunk details with flexible ID resolution
   *
   * Supports multiple ID formats for backward compatibility:
   * 1. Full ID with file prefix: "js_services_message-validator_function_init_L232"
   * 2. Local ID without prefix: "function_init_L232" (falls back to file+line lookup)
   *
   * @param {string} chunkId - The chunk identifier (full or local)
   * @returns {Object|null} Chunk details with metadata and related chunks
   */
  getChunkDetails(chunkId) {
    let result = this.vectorStore.get(chunkId);
    let actualChunkId = chunkId;

    // Fallback: If not found and ID looks like a local ID (no file prefix), try localId lookup
    // Local IDs start with type prefixes like function_, method_, class_, variable_, etc.
    if (!result) {
      const isLocalId = /^(function|method|class|variable|code|imports|export|fallback)_/.test(
        chunkId
      );
      if (isLocalId) {
        // Search by localId in metadata
        for (const [id, metadata] of this.vectorStore.metadata.entries()) {
          if (metadata.localId === chunkId) {
            result = this.vectorStore.get(id);
            actualChunkId = id;
            break;
          }
        }
      }
    }

    if (!result) {
      return null;
    }

    const { vector, metadata } = result;

    // Get related chunks from dependency graph
    const related = this.dependencyGraph.findRelatedChunks(actualChunkId);

    return {
      chunkId: actualChunkId,
      originalQuery: chunkId !== actualChunkId ? chunkId : undefined,
      metadata,
      related,
    };
  }

  /**
   * List indexed files
   */
  listIndexedFiles() {
    const files = this.vectorStore.getFiles();

    return files.map(file => {
      const chunks = this.vectorStore.getByFile(file);
      const isValid = this.cache.files.get(file);

      return {
        file,
        chunkCount: chunks.length,
        lastModified: isValid ? new Date(isValid.mtime).toISOString() : null,
        chunks: chunks.map(c => ({
          id: c.chunkId,
          type: c.metadata.type,
          name: c.metadata.name,
        })),
      };
    });
  }

  /**
   * Get indexing statistics
   */
  getStats() {
    return {
      ...this.stats,
      vectorStore: this.vectorStore.getStats(),
      dependencyGraph: this.dependencyGraph.getStats(),
      cache: this.cache.getStats(),
      embeddings: this.embeddings.getCacheStats(),
      lexicalIndex: this.lexicalIndex.getStats(),
    };
  }

  /**
   * Export all index data
   */
  export() {
    return {
      version: 1,
      timestamp: Date.now(),
      stats: this.stats,
      vectorStore: this.vectorStore.export(),
      dependencyGraph: this.dependencyGraph.export(),
    };
  }

  /**
   * Format stats for display
   */
  _formatStats() {
    const stats = this.stats;
    return [
      `Files: ${stats.filesIndexed} indexed, ${stats.filesFromCache} from cache, ${stats.filesSkipped} skipped`,
      `Chunks: ${stats.chunksIndexed}`,
      `Source: ${stats.embeddingSource}`,
      `Time: ${(stats.indexTime / 1000).toFixed(2)}s`,
    ].join(', ');
  }

  /**
   * Reindex specific files
   */
  async reindexFiles(filePaths) {
    // Serialize reindex operations to avoid concurrent writes to cache/vector store.
    // Important: avoid busy-waiting; waiting callers should await the active promise.
    if (this._reindexPromise) {
      await this._reindexPromise;
    }

    const runPromise = (async () => {
      this._reindexInProgress = true;

      try {
        console.error(`[Indexer] Reindexing ${filePaths.length} files...`);

        for (const filePath of filePaths) {
          const absPath = filePath.startsWith('/') ? filePath : join(this.projectRoot, filePath);

          if (existsSync(absPath)) {
            await this._indexFile(absPath);
          } else {
            console.error(`[Indexer] File not found: ${filePath}`);
          }
        }

        await this._saveCache();

        return {
          reindexed: filePaths.length,
        };
      } finally {
        this._reindexInProgress = false;
        if (this._reindexPromise === runPromise) {
          this._reindexPromise = null;
        }
      }
    })();

    this._reindexPromise = runPromise;
    return await runPromise;
  }

  /**
   * Clear all index data
   */
  async clear() {
    console.error('[Indexer] Clearing index...');

    this.vectorStore.clear();
    this.dependencyGraph.clear();
    this.cache.clear();
    this.lexicalIndex.clear();

    this.indexed = false;
    this.stats = {
      filesDiscovered: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesFromCache: 0,
      chunksIndexed: 0,
      cacheFailures: 0, // Track cache storage failures
      lastCacheFailureTime: null, // Track when last cache failure occurred
      embeddingSource: 'unknown',
      indexTime: 0,
      lastIndexed: null,
    };

    await this.cache.save();

    console.error('[Indexer] Index cleared');
  }

  /**
   * Check if LM Studio is available
   */
  async isLMStudioAvailable() {
    return await this.embeddings.isLMStudioAvailable();
  }

  /**
   * Start the file watcher daemon with health monitoring
   *
   * ENHANCEMENT: Auto-starts health monitor to detect and auto-recover from:
   * - Vector store mismatches (chunks indexed but not stored)
   * - Cache degradation (high failure rates)
   * - Orphaned dependency graph entries
   */
  async startWatcher(options = {}) {
    if (this.watcher && this.watcher.isRunning()) {
      console.error('[Indexer] Watcher already running');
      return;
    }

    console.error('[Indexer] Starting file watcher with health monitoring...');

    const { FileWatcher } = await import('./file-watcher.js');
    this.watcher = new FileWatcher(this.projectRoot, this, options);
    await this.watcher.start();

    // ENHANCEMENT: Auto-start health monitor for corruption detection
    // This automatically detects and fixes corrupted index data
    try {
      const { HealthMonitor } = await import('./health-monitor.js');
      this.healthMonitor = new HealthMonitor(this, this.watcher, options);
      this.healthMonitor.start();
      console.error('[Indexer] Health monitor started - will auto-detect corruption');
    } catch (error) {
      // Health monitor is optional - continue without it
      console.warn('[Indexer] Health monitor not available:', error.message);
    }

    console.error('[Indexer] File watcher and health monitor started');
  }

  /**
   * Stop the file watcher daemon
   */
  async stopWatcher() {
    if (!this.watcher) {
      return;
    }

    console.error('[Indexer] Stopping file watcher...');
    await this.watcher.stop();
    this.watcher = null;
    console.error('[Indexer] File watcher stopped');
  }

  /**
   * Get the file watcher status
   */
  getWatcherStatus() {
    if (!this.watcher) {
      return {
        running: false,
        message: 'Watcher not initialized',
      };
    }

    return this.watcher.getStatus();
  }
}

export default CodeIndexer;
