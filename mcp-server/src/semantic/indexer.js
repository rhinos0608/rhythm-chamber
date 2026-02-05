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
import { TypeScriptChunker } from './typescript-chunker.js';
import { HybridEmbeddings } from './embeddings.js';
import { VectorStore } from './vector-store.js';
import { SqliteVectorAdapter } from './sqlite-adapter.js';
import { createVectorAdapter } from './adapter-factory.js';
import { SymbolIndex } from './symbol-index.js';
import { EmbeddingCache } from './cache.js';
import { LexicalIndex } from './lexical-index.js';
import { QueryExpander } from './query-expander.js';
import { SemanticQueryCache } from './query-cache.js';
import { migrateToV2, getMigrationVersion } from './migration-symbols.js';
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
  'js/**/*.ts',
  'js/**/*.tsx',
  'js/**/*.mtsx',
  'tests/**/*.js',
  'tests/**/*.ts',
  'workers/**/*.js',
  'workers/**/*.mjs',
  'scripts/**/*.js',
  'scripts/**/*.mjs',
  'docs/**/*.md',
  'coverage/**/*.js',
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
    this.typeScriptChunker = new TypeScriptChunker(options.typescriptChunker);
    this.embeddings = new HybridEmbeddings(options.embeddings);
    // Pass embedding dimension and dbPath to vector store
    this.vectorStore = new VectorStore({
      ...options.vectorStore,
      dimension: this.embeddings.getDimension(),
      dbPath: join(this.cacheDir, 'vectors.db'),
    });
    // Phase 2: Use SymbolIndex instead of DependencyGraph
    this.dependencyGraph = new SymbolIndex(join(this.cacheDir, 'vectors.db'));
    // Pass modelVersion to cache for proper invalidation when model changes
    this.cache = new EmbeddingCache(this.cacheDir, {
      enabled: options.cache !== false,
      modelVersion: this.embeddings.getModelVersion()
    });
    this.lexicalIndex = new LexicalIndex(options.lexical);
    this.queryExpander = new QueryExpander(this.dependencyGraph);
    // FIX: Query cache to reduce redundant embedding API calls
    this.queryCache = new SemanticQueryCache(options.queryCache);
    // FIX: Maximum chunks limit to prevent OOM on large codebases
    // Supports environment variable RC_MAX_CHUNKS (e.g., 10000 for limited indexing)
    this.maxChunks = options.maxChunks || parseInt(process.env.RC_MAX_CHUNKS || '50000', 10);

    // CRITICAL FIX #2: Prevent concurrent SymbolIndex initialization
    this._symbolInitializing = false;

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
    this._stopRequested = false; // Flag for cooperative stop signal from external code
    this._reindexInProgress = false; // Track if reindexing is in progress (used by file-watcher.js SAFEGUARD #5)
    this._reindexPromise = null; // Promise for current reindexing operation
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
   * @throws {Error} If embeddings or cache initialization fails
   */
  async initialize() {
    console.error('[Indexer] Initializing semantic search indexer...');

    // CRITICAL FIX #3: Validate embeddings state before proceeding
    try {
      // Check if embeddings has initialize method
      if (typeof this.embeddings.initialize === 'function') {
        await this.embeddings.initialize();
        console.error('[Indexer] Embeddings initialized successfully');
      }

      // Validate embeddings is in valid state
      const modelInfo = this.embeddings.getModelInfo();
      if (!modelInfo || !modelInfo.name) {
        throw new Error('[Indexer] Embeddings not in valid state: missing model info');
      }
    } catch (error) {
      console.error('[Indexer] Embeddings initialization failed:', error.message);
      throw new Error(`[Indexer] Failed to initialize embeddings: ${error.message}`);
    }

    // Initialize cache with model version for invalidation tracking
    try {
      const modelInfo = this.embeddings.getModelInfo();
      this.cache.setModelVersion(modelInfo.name);
      await this.cache.initialize();
      console.error('[Indexer] Cache initialized successfully');
    } catch (error) {
      console.error('[Indexer] Cache initialization failed:', error.message);
      throw new Error(`[Indexer] Failed to initialize cache: ${error.message}`);
    }

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

    // FIX: Initialize and recover SQLite adapter if database exists
    await this._initializeVectorStore();

    // Phase 2: Initialize SymbolIndex and run migration
    await this._initializeSymbolIndex();

    // OOM FIX #1: Log memory snapshot at startup
    this.logMemorySnapshot('initialize');

    return true;
  }

  /**
   * Initialize SymbolIndex with migration
   * @private
   */
  async _initializeSymbolIndex() {
    // CRITICAL FIX #2: Prevent concurrent initialization
    if (this._symbolInitializing) {
      console.warn('[Indexer] SymbolIndex initialization already in progress, skipping');
      return;
    }

    this._symbolInitializing = true;

    try {
      const dbPath = join(this.cacheDir, 'vectors.db');

      console.error('[Indexer] Initializing SymbolIndex (Phase 2)...');

      // Check current migration version
      const currentVersion = getMigrationVersion(dbPath);
      console.error(`[Indexer] Current migration version: ${currentVersion}`);

      // Run migration if needed
      if (currentVersion < 2) {
        console.error('[Indexer] Running Phase 2 migration for symbol tracking...');
        try {
          migrateToV2(dbPath);
          console.error('[Indexer] Phase 2 migration completed successfully');
        } catch (error) {
          console.error('[Indexer] Phase 2 migration failed:', error.message);
          // Continue anyway - SymbolIndex will handle missing tables gracefully
        }
      }

      // Initialize SymbolIndex
      try {
        this.dependencyGraph.initialize(dbPath);
        console.error('[Indexer] SymbolIndex initialized successfully');
      } catch (error) {
        console.error('[Indexer] SymbolIndex initialization failed:', error.message);
        // Continue anyway - will fallback to in-memory mode
      }
    } finally {
      this._symbolInitializing = false;
    }
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

    // Explicit filter: skip vendor files and problematic auto-generated docs
    const discovered = Array.from(allFiles).filter(file => {
      // Skip vendor files (minified libraries)
      const isVendor = file.includes('/vendor/') || file.includes('\\vendor\\');
      // Skip auto-generated files that cause OOM (too large, low value for search)
      const isAutoGenerated = file.includes('DEPENDENCY_GRAPH.md') ||
                             file.includes('SERVICE_CATALOG.md');
      const shouldSkip = isVendor || isAutoGenerated;
      if (shouldSkip) {
        const reason = isVendor ? 'vendor file' : 'auto-generated file (too large)';
        console.error(`[Indexer] Skipping ${reason}: ${file}`);
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
    this._stopRequested = false; // Reset stop flag at start of new indexing operation

    // FIX: Reset stats at start of indexAll to prevent accumulation across runs
    // This ensures stats accurately reflect THIS indexing run, not cumulative totals
    // CRITICAL: Preserve filesFromCache and chunksIndexed from initial loadCachedChunks()
    // If loadCachedChunks() was called before indexAll(), we need to keep those counts
    const initialFilesFromCache = this.stats.filesFromCache || 0;
    const initialChunksIndexed = this.stats.chunksIndexed || 0;

    this.stats = {
      filesDiscovered: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesFromCache: 0, // Will be incremented in _loadCachedChunks()
      chunksIndexed: 0, // Will be incremented in _loadCachedChunks() and _indexFile()
      cacheFailures: 0,
      lastCacheFailureTime: null,
      embeddingSource: this.embeddings.getModelInfo().source || 'unknown',
      indexTime: 0,
      lastIndexed: null,
    };

    // FIX: Restore initial counts if loadCachedChunks() was called before indexAll()
    // This prevents losing the initial cache load statistics
    // CRITICAL: Only restore if NOT force=true (force means clear and reload)
    if (!force && (initialFilesFromCache > 0 || initialChunksIndexed > 0)) {
      console.error(`[Indexer] Preserving initial cache load stats: ${initialFilesFromCache} files, ${initialChunksIndexed} chunks`);
      this.stats.filesFromCache = initialFilesFromCache;
      this.stats.chunksIndexed = initialChunksIndexed;
    }

    // FIX: When force=true, clear vector store and dependency graph to prevent mismatch
    // Without this, old vectors remain while stats reset, causing count discrepancies
    if (force) {
      console.error('[Indexer] Force mode: clearing vector store and dependency graph...');
      this.vectorStore.clear();
      this.dependencyGraph.clear();
      this.lexicalIndex.clear();
      // Note: cache.clear() is NOT called - we just bypass it for validity checks
      // This allows cache to be rebuilt as files are re-indexed

      // INCREMENTAL RESUME: Clear SQLite file index in force mode
      // This ensures all files are re-indexed even if they haven't changed
      if (this.vectorStore.useSqlite && this.vectorStore.adapter && this.vectorStore.adapter.clearAll) {
        this.vectorStore.adapter.clearAll();
        console.error('[Indexer] Cleared SQLite database for force reindex');
      }
    }

    // Create indexing promise
    const indexPromise = (async () => {
      try {
        // Discover files
        const files = await this.discoverFiles();
        this.stats.filesDiscovered = files.length;

        // INCREMENTAL RESUME: Check SQLite file index FIRST (before cache)
        // This allows resuming from crashes even if cache is partial/corrupted
        // Use normalized model name for comparison (strips provider prefix for backward compatibility)
        const normalizedModelName = this.embeddings.getNormalizedModelName();
        const sqliteIndexed = new Map(); // relPath -> mtime
        const sqliteSkipped = [];
        const deletedFiles = []; // Track files that were deleted since last index

        if (this.vectorStore.useSqlite && this.vectorStore.adapter && !force) {
          console.error('[Indexer] Checking SQLite file index for incremental resume...');

          // DEFENSIVE: Check if adapter has getAllFileIndexes method (SqliteAdapter-specific)
          if (typeof this.vectorStore.adapter.getAllFileIndexes !== 'function') {
            console.warn('[Indexer] Adapter does not support getAllFileIndexes, skipping incremental resume');
            // Fall through to full indexing
          } else {
            // First pass: detect deleted files that need cleanup
            const indexedFiles = this.vectorStore.adapter.getAllFileIndexes();
            const discoveredSet = new Set(files.map(f => relative(this.projectRoot, f)));

            for (const indexedFile of indexedFiles) {
              if (!discoveredSet.has(indexedFile.file)) {
              // File was deleted from codebase
                deletedFiles.push(indexedFile.file);
              }
            }

            // Clean up deleted files
            if (deletedFiles.length > 0) {
              console.error(`[Indexer] Found ${deletedFiles.length} deleted files, cleaning up from SQLite`);
              for (const deletedFile of deletedFiles) {
                this.vectorStore.adapter.removeFileIndex(deletedFile);
                // Use batch delete for efficiency (single transaction per file)
                if (this.vectorStore.adapter.deleteChunksByFile) {
                  this.vectorStore.adapter.deleteChunksByFile(deletedFile);
                } else {
                // Fallback to individual deletes
                  const chunks = this.vectorStore.getByFile(deletedFile);
                  for (const chunk of chunks) {
                    this.vectorStore.delete(chunk.chunkId);
                    this.dependencyGraph.removeChunk(chunk.chunkId);
                  }
                }
              }
            }

            // Second pass: check which discovered files are already indexed
            for (const absPath of files) {
              const relPath = relative(this.projectRoot, absPath);
              const indexState = this.vectorStore.adapter.getFileIndexState(relPath);

              // Normalize both model versions for comparison (strip provider prefix)
              // This handles both old format (bare model name) and new format (provider/model)
              const storedModelVersion = indexState?.modelVersion?.includes('/')
                ? indexState.modelVersion.split('/')[1]  // Extract "model" from "provider/model"
                : indexState?.modelVersion;              // Already normalized (just "model")

              if (indexState && storedModelVersion === normalizedModelName) {
              // File is indexed, check if mtime still matches
                try {
                  const currentStat = await stat(absPath);
                  // Use tolerance to account for filesystem mtime precision differences
                  // 100ms tolerance handles most cross-platform and network filesystem issues
                  const MTIME_TOLERANCE_MS = 100;
                  if (currentStat.mtimeMs <= indexState.mtime + MTIME_TOLERANCE_MS) {
                  // File hasn't changed since indexing - skip it
                    sqliteIndexed.set(relPath, indexState.mtime);
                    sqliteSkipped.push(relPath);
                  }
                } catch (statError) {
                // File disappeared - remove from index
                  console.warn(`[Indexer] File ${relPath} disappeared, removing from index`);
                  this.vectorStore.adapter.removeFileIndex(relPath);
                }
              }
            }
            console.error(`[Indexer] SQLite: ${sqliteSkipped.length} files already indexed, skipping`);
          }
        }

        // Check cache validity for remaining files
        const remainingFiles = files.filter(absPath => {
          const relPath = relative(this.projectRoot, absPath);
          return !sqliteIndexed.has(relPath);
        });

        // Check cache validity
        const validFiles = force
          ? new Map()
          : await this.cache.checkFilesValid(remainingFiles.map(f => relative(this.projectRoot, f)));

        // Separate files to index vs cached
        const toIndex = [];
        const fromCache = [];

        for (const absPath of remainingFiles) {
          const relPath = relative(this.projectRoot, absPath);
          const isValid = validFiles.get(relPath);

          if (isValid) {
            fromCache.push(relPath);
          } else {
            toIndex.push(absPath);
          }
        }

        // Count SQLite-skipped files as "from cache" for stats
        this.stats.filesFromSqliteIndex = sqliteSkipped.length;

        console.error(`[Indexer] ${toIndex.length} files to index, ${fromCache.length} from cache, ${sqliteSkipped.length} from SQLite index`);

        // Load cached chunks
        await this._loadCachedChunks(fromCache);

        // Index new/modified files (with stop checking and progress)
        let indexedCount = 0;
        const totalToIndex = toIndex.length;

        // ENHANCED FIX: Configure batch size for event loop yielding
        // Larger batches = better performance, but server appears "laggy"
        // Smaller batches = more responsive, but slower overall indexing
        const YIELD_BATCH_SIZE = parseInt(process.env.RC_YIELD_BATCH_SIZE || '1', 10);
        console.error(`[Indexer] Yield batch size: ${YIELD_BATCH_SIZE} file(s) per event loop cycle`);

        // Skip progress logging if no files to index
        if (totalToIndex === 0) {
          console.error('[Indexer] No new files to index (all files cached)');
        } else {
          const progressInterval = Math.max(1, Math.floor(totalToIndex / 10)); // Log ~10 progress updates
          let lastProgressLog = 0;

          for (const filePath of toIndex) {
            // Check if we've hit the chunk limit
            if (this.stats.chunksIndexed >= this.maxChunks) {
              console.warn(
                `[Indexer] ⚠️  Reached maximum chunk limit (${this.maxChunks}). ` +
                `Stopping indexing. Progress: ${this.stats.filesIndexed} files processed.`
              );
              break;
            }
            // Check if we should stop (either _indexingInProgress is false OR _stopRequested is true)
            // RACE CONDITION FIX: Check both flags for backward compatibility.
            // External code should set _stopRequested=true, but may also set _indexingInProgress=false
            // for the cooperative stop check. We check both to handle either approach.
            if (!this._indexingInProgress || this._stopRequested) {
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
            }

            // CRITICAL FIX: Yield after every file (or batch) to keep MCP server responsive
            // This prevents Claude's client from killing the "unresponsive" server
            // Without this, the server blocks during indexing and gets restarted at ~17% progress
            if (indexedCount % YIELD_BATCH_SIZE === 0) {
              await this._yield();
            }

            // FIX: Periodic cache save every 10 files to prevent data loss on interruption
            // Moved OUTSIDE progress logging condition to ensure it fires consistently
            if (indexedCount % 10 === 0) {
              try {
                // Yield before save to ensure server can process pending messages
                await this._yield();

                await this._saveCache();
                console.error(`[Indexer] Checkpoint: Saved cache at ${indexedCount} files`);

                // Yield after save to let server respond immediately
                await this._yield();

                // FIX: Track successful checkpoints
                this.stats.checkpointSuccesses = (this.stats.checkpointSuccesses || 0) + 1;
                this.stats.lastCheckpointTime = Date.now();
              } catch (cacheError) {
                console.error('[Indexer] Checkpoint save failed:', cacheError.message);
                // FIX: Track checkpoint failures in stats for monitoring
                this.stats.checkpointFailures = (this.stats.checkpointFailures || 0) + 1;
                this.stats.lastCheckpointFailureTime = Date.now();
                this.stats.lastCheckpointFailure = {
                  message: cacheError.message,
                  indexedCount: indexedCount,
                  time: new Date().toISOString(),
                };
              }
            }

            // CRITICAL FIX: Clear in-memory cache every 50 files to prevent OOM
            // The cache persists to disk, and we only need it for temporary buffering
            // VectorStore, DependencyGraph, and LexicalIndex are kept in memory
            // because they're needed for search after indexing completes
            if (indexedCount % 50 === 0) {
              const cacheSizeBefore = this.cache.embeddings.size;
              const vectorStoreStats = this.vectorStore.getStats();
              const depGraphStats = this.dependencyGraph.getStats();
              const lexicalDocsSize = this.lexicalIndex.documents.size;

              // Log memory breakdown before clearing
              const estimatedVectorStoreMB = (vectorStoreStats.memoryBytes / 1024 / 1024).toFixed(2);
              console.error(
                `[Indexer] Memory breakdown at ${indexedCount} files:` +
                `\n  - Cache: ${cacheSizeBefore} chunks` +
                `\n  - VectorStore: ${vectorStoreStats.chunkCount} chunks (${estimatedVectorStoreMB}MB)` +
                `\n  - DependencyGraph: ${depGraphStats.symbols} symbols, ${depGraphStats.definitions} definitions, ${depGraphStats.usages} usages` +
                `\n  - LexicalIndex: ${lexicalDocsSize} documents`
              );

              this.cache.clear();

              // OOM FIX: Also clear DependencyGraph and LexicalIndex periodically
              // These indices accumulate data (symbols, usages, documents) that cause OOM
              // Since we use SQLite for storage, we can rebuild these on-demand
              const depStats = this.dependencyGraph.getStats();
              const lexDocs = this.lexicalIndex.documents.size;
              if (depStats.symbols > 10000 || lexDocs > 5000) {
                console.error(`[Indexer] Memory: Clearing ${depStats.symbols} symbols and ${lexDocs} documents at ${indexedCount} files`);
                this.dependencyGraph.clear();
                this.lexicalIndex.clear();
              }

              // Force garbage collection to free memory immediately
              if (global.gc) {
                global.gc();
              }
              console.error(`[Indexer] Memory: Cleared ${cacheSizeBefore} cache embeddings at ${indexedCount} files`);

              // CRITICAL: Yield after GC to let server respond
              await this._yield();
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
        this._stopRequested = false; // Reset stop flag when indexing completes

        // FIX: Post-indexing cleanup to free memory
        if (this.indexed && this.cache) {
          const cacheSize = this.cache.embeddings.size;
          this.cache.clear();

          // Force garbage collection
          if (global.gc) {
            global.gc();
          }

          console.error(`[Indexer] Cleared ${cacheSize} cached embeddings after indexing`);
        }
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
      // CRASH DEBUGGING: Log file being indexed with memory snapshot
      const mem = process.memoryUsage();
      const heapUsedMB = mem.heapUsed / 1024 / 1024;
      const rssMB = mem.rss / 1024 / 1024;
      const fileIndex = this.stats.filesIndexed;
      console.error(
        `[Indexer] [CRASH-DEBUG] ========== STARTING FILE #${fileIndex + 1} ==========`
      );
      console.error(`[Indexer] [CRASH-DEBUG] File: ${relPath}`);
      console.error(`[Indexer] [CRASH-DEBUG] Memory: heap=${heapUsedMB.toFixed(1)}MB, rss=${rssMB.toFixed(1)}MB`);

      // CRITICAL: Check memory before indexing each file
      // Prevents OOM crashes during large indexing operations
      // FIX: Use fixed limit (6GB) instead of heapTotal (which is only ~131MB initially)
      // The --max-old-space-size=8192 gives us 8GB, so use 6GB as safety limit
      const heapLimitMB = 6144; // 6GB

      // Warn at 75% of heap limit
      if (heapUsedMB > heapLimitMB * 0.75) {
        console.warn(`[Indexer] ⚠️  High memory usage: ${heapUsedMB.toFixed(0)}MB / ${heapLimitMB.toFixed(0)}MB`);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          const newMem = process.memoryUsage();
          console.warn(`[Indexer] After GC: ${(newMem.heapUsed / 1024 / 1024).toFixed(0)}MB`);
        }
      }

      // Abort at 90% of heap limit
      if (heapUsedMB > heapLimitMB * 0.90) {
        throw new Error(
          `Memory limit exceeded (${heapUsedMB.toFixed(0)}MB / ${heapLimitMB.toFixed(0)}MB). ` +
          'Aborting indexing to prevent OOM crash. ' +
          `Progress: ${this.stats.filesIndexed} files indexed. ` +
          'Use --max-chunks flag to limit indexing scope.'
        );
      }

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

      // CRASH GUARDRAIL #1: Skip files over 2MB to prevent OOM
      const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
      if (fileStat.size > MAX_FILE_SIZE_BYTES) {
        console.warn(`[Indexer] 🛡️  Skipping large file (${(fileStat.size / 1024 / 1024).toFixed(1)}MB > 2MB limit): ${relPath}`);
        this.stats.filesSkipped++;
        return;
      }

      // CRASH GUARDRAIL #2: Skip minified bundles and build artifacts
      const skipPatterns = [
        /\.min\.js$/i,           // minified JavaScript
        /\.min\.css$/i,          // minified CSS
        /\/dist\//i,             // dist/ directories
        /\/build\//i,            // build/ directories
        /\/out\//i,              // out/ directories (TypeScript)
        /\/\.next\//i,           // Next.js build output
        /\/\.nuxt\//i,           // Nuxt.js build output
        /bundle\.js$/i,          // bundle files
        /chunk\.js$/i,           // chunk files
        /vendor\.js$/i,           // vendor bundles
      ];
      const shouldSkip = skipPatterns.some(pattern => pattern.test(relPath));
      if (shouldSkip) {
        console.warn(`[Indexer] 🛡️  Skipping build artifact: ${relPath}`);
        this.stats.filesSkipped++;
        return;
      }

      // CRASH DEBUGGING: Log file size
      const fileSizeKB = fileStat.size / 1024;
      console.error(`[Indexer] [CRASH-DEBUG] File size: ${fileSizeKB.toFixed(1)}KB (${fileStat.size} bytes)`);

      // Read source
      let source = await readFile(filePath, 'utf-8');

      // CRASH DEBUGGING: Log source text size
      const sourceTextLen = source.length;
      console.error(`[Indexer] [CRASH-DEBUG] Source text length: ${sourceTextLen} chars`);

      // Route to appropriate chunker based on file extension
      const isMarkdown = this.markdownChunker.isSupported(relPath);
      const isTypeScript = this.typeScriptChunker.isSupported(relPath);

      let chunks;
      if (isMarkdown) {
        chunks = this.markdownChunker.chunkSourceFile(source, relPath);
      } else if (isTypeScript) {
        // Phase 2: Use TypeScriptChunker for .ts/.tsx files
        chunks = this.typeScriptChunker.chunkSourceFile(source, relPath);
      } else {
        chunks = this.codeChunker.chunkSourceFile(source, relPath);
      }

      if (chunks.length === 0) {
        console.error(`[Indexer] No chunks generated for ${relPath}`);
        return;
      }

      // Drop extremely low-signal markdown chunks (e.g. tiny fragments)
      // to prevent them dominating search results.
      if (isMarkdown) {
        const MIN_MARKDOWN_CHUNK_TEXT_LENGTH = 50;
        chunks = chunks.filter(c => (c.text || '').trim().length >= MIN_MARKDOWN_CHUNK_TEXT_LENGTH);

        if (chunks.length === 0) {
          console.error(`[Indexer] All markdown chunks filtered as low-signal for ${relPath}`);
          return;
        }
      }

      // CRASH GUARDRAIL #3: Cap chunks per file to prevent OOM from massive files
      // Large markdown files (e.g., DEPENDENCY_GRAPH.md with 1600 lines) can generate
      // hundreds of chunks, causing memory spikes. Lower limit prevents OOM crashes.
      const MAX_CHUNKS_PER_FILE = 200;
      if (chunks.length > MAX_CHUNKS_PER_FILE) {
        console.warn(
          `[Indexer] 🛡️  File has too many chunks (${chunks.length} > ${MAX_CHUNKS_PER_FILE} limit), truncating: ${relPath}`
        );
        chunks.length = MAX_CHUNKS_PER_FILE;
      }

      // CRASH DEBUGGING: Log chunk count
      console.error(`[Indexer] [CRASH-DEBUG] Chunks generated: ${chunks.length}`);

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

      // OOM FIX #4: Process chunks in smaller batches to prevent memory spikes
      // Files with 100+ chunks were causing memory accumulation before any cleanup
      const BATCH_SIZE = 20;

      // Expected embedding dimension
      const expectedDim = this.embeddings.getDimension();

      // Accumulate valid chunks/embeddings across all batches
      const allValidChunks = [];
      const allValidEmbeddings = [];
      const allInvalidReasons = [];

      // Process chunks in batches
      for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
        const batchChunks = chunks.slice(batchStart, batchEnd);

        // Generate embeddings for this batch only
        const batchTexts = batchChunks.map(c => c.text);
        const batchEmbeddings = await this.embeddings.getBatchEmbeddings(batchTexts);

        // CRITICAL: Validate batch embeddings before processing
        if (!Array.isArray(batchEmbeddings)) {
          throw new Error(`getBatchEmbeddings returned non-array: ${typeof batchEmbeddings}`);
        }

        if (batchEmbeddings.length !== batchChunks.length) {
          console.error(
            `[Indexer] Embedding count mismatch for ${relPath} batch ${batchStart}-${batchEnd}: expected ${batchChunks.length}, got ${batchEmbeddings.length}`
          );
          throw new Error(
            `Embedding array length (${batchEmbeddings.length}) does not match chunks array length (${batchChunks.length})`
          );
        }

        // Filter out invalid embeddings in this batch (same 5 checks as before)
        for (let i = 0; i < batchEmbeddings.length; i++) {
          const emb = batchEmbeddings[i];
          const chunkId = batchChunks[i]?.id || `chunk_${batchStart + i}`;

          // Check 1: Not null/undefined
          if (emb === undefined || emb === null) {
            if (allInvalidReasons.length < 100) {
              allInvalidReasons.push(`${chunkId}=null/undefined`);
            }
            continue;
          }

          // Check 2: Is Array or Float32Array
          if (!Array.isArray(emb) && !(emb instanceof Float32Array)) {
            if (allInvalidReasons.length < 100) {
              allInvalidReasons.push(`${chunkId}=type:${typeof emb}`);
            }
            continue;
          }

          // Check 3: Correct dimension
          if (emb.length !== expectedDim) {
            if (allInvalidReasons.length < 100) {
              allInvalidReasons.push(`${chunkId}=dim:${emb.length}(expected${expectedDim})`);
            }
            continue;
          }

          // Check 4: No NaN/Infinity values
          let hasInvalidValue = false;
          for (let j = 0; j < emb.length; j++) {
            if (!Number.isFinite(emb[j])) {
              if (allInvalidReasons.length < 100) {
                allInvalidReasons.push(`${chunkId}=nonfinite@${j}`);
              }
              hasInvalidValue = true;
              break;
            }
          }
          if (hasInvalidValue) continue;

          // Check 5: No all-zero embeddings
          let sumSquares = 0;
          for (let j = 0; j < emb.length; j++) {
            sumSquares += emb[j] * emb[j];
          }
          if (sumSquares < 0.001) {
            if (allInvalidReasons.length < 100) {
              allInvalidReasons.push(`${chunkId}=zero_magnitude`);
            }
            continue;
          }

          // All checks passed - add to valid arrays
          allValidChunks.push(batchChunks[i]);
          allValidEmbeddings.push(emb);
        }

        // Yield between batches to allow GC and event loop processing
        // Note: batchTexts, batchEmbeddings, batchChunks go out of scope here
        // V8's GC will collect them automatically without explicit nulling
        if (batchEnd < chunks.length) {
          await this._yield();
        }
      }

      // Log validation results
      const validCount = allValidChunks.length;
      const invalidCount = allInvalidReasons.length;

      // CRASH DEBUGGING: Log memory after embeddings
      const memAfterEmbed = process.memoryUsage();
      console.error(`[Indexer] [CRASH-DEBUG] After embeddings: heap=${(memAfterEmbed.heapUsed / 1024 / 1024).toFixed(1)}MB, valid=${validCount}, invalid=${invalidCount}`);

      if (invalidCount > 0) {
        const sampleReasons = allInvalidReasons.slice(0, 5);
        const truncatedMsg = invalidCount > 5 ? ` and ${invalidCount - 5} more` : '';
        console.error(
          `[Indexer] Filtered ${invalidCount} invalid embeddings for ${relPath}: ${sampleReasons.join(', ')}${truncatedMsg}`
        );
      }

      // If ALL embeddings are invalid, then fail
      if (validCount === 0) {
        const sampleReasons = allInvalidReasons.slice(0, 3);
        const truncatedMsg = invalidCount > 3 ? ` and ${invalidCount - 3} more issues` : '';
        throw new Error(
          `All ${chunks.length} embeddings for ${relPath} are invalid. Reasons: ${sampleReasons.join(', ')}${truncatedMsg}`
        );
      }

      // FIX: Skip caching if ANY embeddings are invalid
      // This prevents caching partial/Incomplete files that cause inconsistency
      // Without this fix, a file with 10 chunks where 2 are invalid would cache only 8 chunks
      // On restart, the cache would have 8 chunks but the file has 10, causing mismatch
      const hasInvalidChunks = invalidCount > 0;
      if (hasInvalidChunks) {
        console.warn(
          `[Indexer] ⚠️  Skipping cache for ${relPath}: ${invalidCount} invalid chunks detected (file will be re-indexed on restart)`
        );
      }

      console.error(
        `[Indexer] Generated ${validCount}/${chunks.length} valid embeddings for ${relPath}${invalidCount > 0 ? ` (${invalidCount} filtered)` : ''}`
      );

      // Store in vector store and dependency graph
      let vectorsStored = 0;
      let symbolsAdded = 0;

      // OOM FIX: Process storage in smaller batches to reduce memory spike
      // Instead of storing all chunks at once, batch them for vector store operations
      const STORAGE_BATCH_SIZE = 50;
      for (let batchStart = 0; batchStart < allValidChunks.length; batchStart += STORAGE_BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + STORAGE_BATCH_SIZE, allValidChunks.length);

        // Prepare batch items for vector store
        const batchItems = [];
        for (let i = batchStart; i < batchEnd; i++) {
          const chunk = allValidChunks[i];
          const embedding = allValidEmbeddings[i];

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

          batchItems.push({ chunkId: chunk.id, embedding, metadata: chunk.metadata });
        }

        // Use batch upsert for better performance
        if (batchItems.length > 0) {
          if (this.vectorStore.useSqlite && this.vectorStore.adapter?.upsertBatch) {
            this.vectorStore.adapter.upsertBatch(batchItems);
            vectorsStored += batchItems.length;
          } else {
            // Fallback to individual upserts
            for (const item of batchItems) {
              this.vectorStore.upsert(item.chunkId, item.embedding, item.metadata);
            }
            vectorsStored += batchItems.length;
          }
        }

        // Add to dependency graph (can't be batched easily)
        for (let i = batchStart; i < batchEnd; i++) {
          const chunk = allValidChunks[i];
          try {
            this.dependencyGraph.addChunk(chunk);
            symbolsAdded++;
          } catch (depError) {
            console.error(`[Indexer] Failed to add chunk ${chunk.id} to dependency graph:`, depError.message);
          }
        }

        // Yield between storage batches to allow GC
        if (batchEnd < allValidChunks.length) {
          await this._yield();
        }
      }

      console.error(
        `[Indexer] Stored ${vectorsStored} vectors and ${symbolsAdded} symbols for ${relPath}`
      );

      // Index chunks in lexical index (index only valid chunks that passed embedding validation)
      try {
        this.lexicalIndex.index(allValidChunks);
      } catch (lexicalError) {
        console.error(`[Indexer] Lexical indexing failed for ${relPath}:`, lexicalError.message);
        // Non-critical, continue
      }

      // Store in cache WITH embeddings (reuse fileStat from earlier)
      // CRITICAL: Store only valid chunks/embeddings to prevent cache corruption
      // FIX: Skip caching if any chunks were invalid to prevent partial cache inconsistency
      let cacheSuccess = true;

      if (!hasInvalidChunks) {
        // FIX: Add retry logic with exponential backoff for cache save failures
        const maxRetries = 3;
        let retryCount = 0;
        while (retryCount < maxRetries) {
          try {
            await this.cache.storeFileChunks(relPath, allValidChunks, fileStat.mtimeMs, allValidEmbeddings);
            break; // Success - exit retry loop
          } catch (cacheError) {
            retryCount++;
            if (retryCount >= maxRetries) {
              // Final attempt failed - give up
              cacheSuccess = false;
              console.error(`[Indexer] Cache storage FAILED after ${maxRetries} retries for ${relPath}:`, cacheError.message);
              console.error(
                '[Indexer] ⚠️  Cache degradation detected - re-embedding will be required on restart'
              );
              // Track cache failures with timestamp
              this.stats.cacheFailures = (this.stats.cacheFailures || 0) + 1;
              this.stats.lastCacheFailureTime = Date.now();
              break;
            }
            // Retry with exponential backoff
            const delay = 1000 * retryCount; // 1s, 2s, 3s delays
            console.warn(
              `[Indexer] Cache save attempt ${retryCount}/${maxRetries} failed for ${relPath}, retrying in ${delay}ms...`
            );
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      } else {
        // Mark as intentionally skipped (not a failure)
        cacheSuccess = false;
      }

      // FIX: Track successfully stored vectors, not just valid chunks
      // This ensures chunksIndexed matches actual vectors in the store
      this.stats.chunksIndexed += vectorsStored;

      // FIX: Increment filesIndexed for each successfully processed file
      // This counter was previously only updated at the end of indexAll()
      this.stats.filesIndexed++;

      // INCREMENTAL RESUME: Update SQLite file index ONLY if all chunks stored successfully
      // This prevents marking files as "indexed" when they have partial data
      if (this.vectorStore.useSqlite && this.vectorStore.adapter) {
        // Store normalized model name (without provider prefix) for backward compatibility
        const modelVersion = this.embeddings.getNormalizedModelName();

        if (vectorsStored === validCount) {
          // All chunks stored successfully - safe to mark as indexed
          this.vectorStore.adapter.updateFileIndex(relPath, fileStat.mtimeMs, vectorsStored, modelVersion);
        } else if (vectorsStored > 0 && vectorsStored < validCount) {
          // Partial failure - remove from index to force retry on next run
          console.warn(
            `[Indexer] Partial indexing for ${relPath}: ${vectorsStored}/${validCount} chunks, removing from file index to force retry`
          );
          this.vectorStore.adapter.removeFileIndex(relPath);
        }
        // If vectorsStored === 0, nothing was stored, don't update index
      }

      console.error(
        `[Indexer] Indexed ${relPath} (${validCount} valid chunks, ${vectorsStored} vectors, ${symbolsAdded} symbols${!cacheSuccess ? ', CACHE FAILED' : ''})`
      );

      // CRASH DEBUGGING: Log completion with final memory snapshot
      const memFinal = process.memoryUsage();
      console.error(`[Indexer] [CRASH-DEBUG] ========== COMPLETED FILE #${this.stats.filesIndexed} ==========`);
      console.error(`[Indexer] [CRASH-DEBUG] Final memory: heap=${(memFinal.heapUsed / 1024 / 1024).toFixed(1)}MB, rss=${(memFinal.rss / 1024 / 1024).toFixed(1)}MB`);
      console.error(`[Indexer] [CRASH-DEBUG] Stored: ${vectorsStored} vectors, ${symbolsAdded} symbols`);
      console.error('');  // Empty line for readability

      // OOM FIX: Explicitly clean up large temporary objects to prevent memory accumulation
      // These variables can hold large strings/arrays that accumulate across loop iterations
      // Without explicit cleanup, V8's GC may not collect them fast enough
      source = null;      // Large file content string (can be 100KB+)
      chunks = null;      // Array of chunk objects with text properties
      // Note: Batch variables (batchTexts, batchEmbeddings, batchChunks) go out of scope at end of loop
      // allValidChunks, allValidEmbeddings, allInvalidReasons go out of scope here

      // OOM FIX: Force GC after each file when processing small batches
      // When processing <50 files, the periodic GC at % 50 never triggers
      // This prevents heap fragmentation from accumulating across files
      if (global.gc) {
        global.gc();
        const memAfterGC = process.memoryUsage();
        console.error(`[Indexer] [MEMORY] After GC: heap=${(memAfterGC.heapUsed / 1024 / 1024).toFixed(1)}MB`);
      }
    } catch (error) {
      // INCREMENTAL RESUME: Remove from file index only for specific errors
      // Don't remove for transient issues like cache failures or post-index errors
      const shouldRemoveIndex =
        error.code === 'ENOENT' || // File disappeared
        error.code === 'EACCES' || // Permission denied
        error.code === 'EISDIR' || // Tried to index directory
        (error.message && (
          error.message.includes('embedding') || // Embedding generation failed
          error.message.includes('chunk') || // Chunk processing failed
          error.message.includes('parsing') || // Parse error
          error.message.includes('chunking') // Chunking error
        ));

      if (shouldRemoveIndex && this.vectorStore.useSqlite && this.vectorStore.adapter) {
        this.vectorStore.adapter.removeFileIndex(relPath);
      }

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
   * Yield to event loop to allow processing of pending events
   * Critical for MCP servers to remain responsive during long operations
   */
  async _yield() {
    return new Promise(resolve => setImmediate(resolve));
  }

  /**
   * Initialize VectorStore with adapter factory (SQLite or Memory fallback)
   * Checks for existing database and recovers VectorStore state
   * @private
   */
  async _initializeVectorStore() {
    // CRITICAL FIX: Use adapter factory for automatic fallback
    // This handles native module issues gracefully
    if (!this.vectorStore.dbPath) {
      console.error('[Indexer] No dbPath provided, using in-memory Map storage');
      return;
    }

    const dbExists = existsSync(this.vectorStore.dbPath);
    if (dbExists) {
      console.error(`[Indexer] Found existing database: ${this.vectorStore.dbPath}`);
    } else {
      console.error(`[Indexer] Creating new database: ${this.vectorStore.dbPath}`);
    }

    // Use factory to create appropriate adapter (SQLite or Memory fallback)
    try {
      const { adapter, type } = await createVectorAdapter({
        preferNative: true,
        dbPath: this.vectorStore.dbPath,
        dimension: this.vectorStore.dimension,
      });

      console.error(`[Indexer] Using ${type} adapter for vector storage`);

      // Recover VectorStore state or enable adapter mode for fresh database
      const stats = adapter.getStats();
      const recovered = this.vectorStore.initialize({ adapter });

      // CRITICAL FIX: Always use adapter when available, even if empty
      // This ensures consistent storage behavior
      if (!this.vectorStore.useSqlite) {
        console.error(`[Indexer] Enabling ${type} adapter mode`);
        this.vectorStore.adapter = adapter;
        this.vectorStore.useSqlite = true;
        this.vectorStore.chunkCount = stats.chunkCount || 0;
        this.vectorStore.vectors.clear();
        this.vectorStore.metadata.clear();
      }

      if (recovered && stats.chunkCount > 0) {
        console.error(
          `[Indexer] Successfully recovered ${stats.chunkCount} chunks from ${type} storage`
        );
      } else {
        console.error(`[Indexer] ${type} adapter ready for new embeddings`);
      }

      // OOM FIX: Disable in-memory cache when SQLite is active
      // SQLite is the source of truth for embeddings - cache duplication causes OOM
      if (type === 'sqlite' && this.cache?.enabled) {
        console.error('[Indexer] SQLite active - disabling in-memory cache to prevent OOM');
        // Set flag so cache.save() skips embedding serialization
        this.cache.sqliteActive = true;
        // Clear any existing in-memory embeddings to free memory
        if (this.cache.embeddings?.size > 0) {
          console.error(`[Indexer] Cleared ${this.cache.embeddings.size} cached embeddings from memory`);
          this.cache.embeddings.clear();
        }
      }

      // Log storage type for debugging
      if (type === 'memory') {
        console.warn('[Indexer] Note: Using in-memory storage (no persistence). ' +
          'Set RC_FORCE_MEMORY_STORE=true to suppress this warning.');
      }
    } catch (error) {
      console.error(`[Indexer] Failed to initialize vector adapter: ${error.message}`);
      console.error('[Indexer] Falling back to basic Map storage');
    }
  }

  /**
   * Load cached chunks with periodic yielding to maintain responsiveness
   * This prevents the MCP server from appearing "frozen" during cache loading
   */
  async _loadCachedChunks(filePaths) {
    // CRITICAL FIX: Skip cache loading if SQLite already has the data
    // This prevents double-loading and OOM crashes
    if (this.vectorStore.useSqlite && this.vectorStore.adapter) {
      const stats = this.vectorStore.adapter.getStats();
      if (stats.chunkCount > 0) {
        console.error(
          `[Indexer] SQLite has ${stats.chunkCount} chunks, skipping cache load to prevent double-loading`
        );
        console.error(`[Indexer] Cache loading skipped: ${filePaths.length} files already in SQLite`);
        return; // Skip entirely - SQLite is the source of truth
      }
    }

    // CRITICAL FIX: Use streaming approach for lexical index to prevent OOM
    // Instead of collecting all chunks in memory, index them in batches
    const LEXICAL_BATCH_SIZE = 1000; // Index 1000 chunks at a time, then clear
    const chunksToIndexLexically = [];
    const totalFiles = filePaths.length;
    const progressInterval = Math.max(1, Math.floor(totalFiles / 10)); // Log ~10 progress updates
    let processedFiles = 0;
    let lastProgressLog = 0;
    let totalChunksLexical = 0;

    console.error(`[Indexer] Loading ${totalFiles} cached files with progressive yielding...`);
    console.error(`[Indexer] Using batch size ${LEXICAL_BATCH_SIZE} for lexical indexing to prevent OOM`);

    for (const relPath of filePaths) {
      try {
        const chunkIds = this.cache.getFileChunks(relPath);

        // FIX: Skip files that are already loaded (prevent double-counting)
        // This happens when loadCachedChunks() is called at startup,
        // then indexAll() calls _loadCachedChunks() again for the same files
        const alreadyLoaded = chunkIds.every(id => this.vectorStore.has(id));
        if (alreadyLoaded && chunkIds.length > 0) {
          console.error(`[Indexer] Skipping already loaded file: ${relPath}`);
          processedFiles++;
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

            // Collect chunk for lexical indexing (with batch limit)
            chunksToIndexLexically.push({
              id: chunkId,
              text: chunkData.text,
              metadata: metadataWithText,
            });

            this.stats.chunksIndexed++;

            // CRITICAL FIX: Index in batches and clear array to prevent OOM
            // When we reach the batch size, index the current batch and clear
            if (chunksToIndexLexically.length >= LEXICAL_BATCH_SIZE) {
              this.lexicalIndex.index(chunksToIndexLexically);
              totalChunksLexical += chunksToIndexLexically.length;
              chunksToIndexLexically.length = 0; // Clear the array

              // Yield after batch to let server respond
              await this._yield();

              // Force garbage collection if available to free memory
              if (global.gc) {
                global.gc();
              }
            }
          }
        }

        // FIX: Only count file if we actually loaded any chunks from it
        const wasAlreadyLoaded = this.vectorStore.getByFile(relPath).length > 0;
        if (!wasAlreadyLoaded || chunkIds.some(id => !this.vectorStore.has(id))) {
          this.stats.filesFromCache++;
        }

        processedFiles++;

        // CRITICAL FIX: Yield after every file to keep MCP server responsive
        // This allows the server to respond to Claude's protocol messages during cache loading
        // Without this, Claude kills the "unresponsive" server after ~2 seconds
        await this._yield();

        // Log progress periodically
        if (processedFiles - lastProgressLog >= progressInterval || processedFiles === totalFiles) {
          const progress = ((processedFiles / totalFiles) * 100).toFixed(1);
          console.error(
            `[Indexer] Cache loading progress: ${processedFiles}/${totalFiles} files (${progress}%), ${this.stats.chunksIndexed} chunks, ${totalChunksLexical} lexically indexed`
          );
          lastProgressLog = processedFiles;
        }
      } catch (error) {
        console.error(`[Indexer] Failed to load cache for ${relPath}:`, error.message);
        // Invalidate and re-index on next run
        this.cache.invalidateFile(relPath);
      }
    }

    // Index any remaining chunks in lexical index (final batch)
    if (chunksToIndexLexically.length > 0) {
      this.lexicalIndex.index(chunksToIndexLexically);
      totalChunksLexical += chunksToIndexLexically.length;
      chunksToIndexLexically.length = 0;
    }

    console.error(`[Indexer] Lexical indexing complete: ${totalChunksLexical} chunks indexed`);
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
    // Initialize with vectorResults to ensure finalResults is always defined
    let finalResults = vectorResults;

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
        // finalResults already set to vectorResults above
      }
    }  // End of if (useHybrid)

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

        const chunkType = r.metadata?.type;
        const isMarkdownType = typeof chunkType === 'string' && chunkType.startsWith('md-');

        const filePath = r.metadata?.file || '';
        const isMarkdownFile =
          typeof filePath === 'string' &&
          /\.(md|markdown|mdown|mkd)$/i.test(filePath);

        const isMarkdownChunk = isMarkdownType || isMarkdownFile;

        let rankScore = baseScore + (typePriority[chunkType] || 0);

        // Exact symbol name match bonus: +50
        // Symbol heuristics should not apply to markdown heading names.
        if (!isMarkdownChunk && r.metadata?.name && queryLower === r.metadata.name.toLowerCase()) {
          rankScore += 50;
        }

        // Exported status bonus: +20
        if (r.metadata?.exported) {
          rankScore += 20;
        }

        // FIX #11: Call frequency bonus using sqrt scaling to prevent domination
        // Old: Math.floor(usages/10) could give +100, overwhelming semantic relevance
        // New: Sqrt scaling provides meaningful bonus progression: 1-9 calls=0, 10-99 calls=1-3, 100-999 calls=3-9, 1000+=10-20 (capped)
        // Symbol heuristics should not apply to markdown heading names.
        if (!isMarkdownChunk && r.metadata?.name) {
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

    // OOM FIX #1: Log memory snapshot after search for monitoring
    // Only log periodically (every 10th search) to avoid spam, or if search was slow (>1s)
    const searchDurationMs = perf.totalTime;
    if (searchDurationMs > 1000 || Math.random() < 0.1) {
      this.logMemorySnapshot(`search (${searchDurationMs}ms)`);
    }

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
   * Close the indexer and release resources
   * Closes SQLite adapter if active, stops watcher
   */
  async close() {
    console.error('[Indexer] Closing indexer...');

    // FIX: Dispose embeddings instance to free 100MB-500MB
    if (this.embeddings && this.embeddings.transformersPipeline) {
      try {
        // Wait for any pending initialization
        if (this.embeddings.initPromises) {
          const promises = Array.from(this.embeddings.initPromises.values());
          await Promise.allSettled(promises);
          this.embeddings.initPromises.clear();
        }

        // Dispose the pipeline
        await this.embeddings.transformersPipeline.dispose();
        this.embeddings.transformersPipeline = null;
        console.error('[Indexer] Disposed embeddings pipeline');
      } catch (error) {
        console.error(`[Indexer] Error disposing embeddings: ${error.message}`);
      }
    }

    // Close SQLite adapter if active
    if (this.vectorStore.adapter) {
      try {
        this.vectorStore.adapter.close();
        console.error('[Indexer] Closed SQLite adapter');
      } catch (error) {
        console.error(`[Indexer] Error closing SQLite adapter: ${error.message}`);
      }
    }

    // Stop file watcher if active
    if (this.watcher) {
      try {
        await this.watcher.stop();
        console.error('[Indexer] Stopped file watcher');
      } catch (error) {
        console.error(`[Indexer] Error stopping watcher: ${error.message}`);
      }
    }

    console.error('[Indexer] Indexer closed');
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
    const mem = process.memoryUsage();
    const parts = [
      `Files: ${stats.filesIndexed} indexed, ${stats.filesFromCache} from cache, ${stats.filesSkipped} skipped`,
    ];

    // Add SQLite resume count if available
    if (stats.filesFromSqliteIndex > 0) {
      parts.push(`${stats.filesFromSqliteIndex} from SQLite index`);
    }

    parts.push(
      `Chunks: ${stats.chunksIndexed}`,
      `Source: ${stats.embeddingSource}`,
      `Time: ${(stats.indexTime / 1000).toFixed(2)}s`,
      `Memory: ${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB heap / ${(mem.heapTotal / 1024 / 1024).toFixed(0)}MB total`
    );

    return parts.join(', ');
  }

  /**
   * OOM FIX #1: Log memory snapshot to identify biggest retained buckets
   * Call at startup and after each tool call to track memory growth
   * Returns object with all memory metrics for programmatic inspection
   */
  logMemorySnapshot(context = 'unknown') {
    const mem = process.memoryUsage();
    const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const externalMB = (mem.external / 1024 / 1024).toFixed(1);

    // Get component-level cache sizes
    const embeddingCacheSize = this.cache?.embeddings?.size ?? 0;
    const hybridCacheStats = this.embeddings?.getCacheStats?.() ?? {};
    const hybridCacheSize = hybridCacheStats.size ?? 0;
    const vectorStoreStats = this.vectorStore?.getStats?.() ?? {};
    const depGraphStats = this.dependencyGraph?.getStats?.() ?? {};
    const lexicalStats = this.lexicalIndex?.getStats?.() ?? {};

    // Calculate estimated memory usage for each component
    const vectorStoreBytes = vectorStoreStats.memoryBytes ?? 0;
    const vectorStoreMB = (vectorStoreBytes / 1024 / 1024).toFixed(1);
    const chunkCount = vectorStoreStats.chunkCount ?? 0;

    const depGraphSymbols = depGraphStats.symbols ?? 0;
    const depGraphDefinitions = depGraphStats.definitions ?? 0;
    const depGraphUsages = depGraphStats.usages ?? 0;

    const lexicalDocs = lexicalStats.documentCount ?? lexicalStats.documents?.size ?? 0;

    console.error(
      `[Memory] Snapshot at "${context}":\n` +
      `  Heap: ${heapUsedMB}MB used / ${heapTotalMB}MB total (external: ${externalMB}MB)\n` +
      `  EmbeddingCache: ${embeddingCacheSize} chunks in memory\n` +
      `  HybridEmbeddings: ${hybridCacheSize} cached (hits:${hybridCacheStats.hits ?? 0}, misses:${hybridCacheStats.misses ?? 0}, evicted:${hybridCacheStats.evicted ?? 0})\n` +
      `  VectorStore: ${chunkCount} chunks (${vectorStoreMB}MB in ${this.vectorStore?.useSqlite ? 'SQLite' : 'memory'})\n` +
      `  DependencyGraph: ${depGraphSymbols} symbols, ${depGraphDefinitions} definitions, ${depGraphUsages} usages\n` +
      `  LexicalIndex: ${lexicalDocs} documents\n` +
      `  Stats: ${this.stats?.chunksIndexed ?? 0} chunks indexed, ${this.stats?.filesIndexed ?? 0} files indexed`
    );

    // Return for programmatic use
    return {
      context,
      timestamp: Date.now(),
      heap: { used: heapUsedMB, total: heapTotalMB, external: externalMB },
      caches: {
        embeddingCache: embeddingCacheSize,
        hybridCache: hybridCacheSize,
        hybridStats: hybridCacheStats,
      },
      vectorStore: { chunkCount, memoryMB: vectorStoreMB },
      dependencyGraph: { symbols: depGraphSymbols, definitions: depGraphDefinitions, usages: depGraphUsages },
      lexicalIndex: { documents: lexicalDocs },
    };
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
