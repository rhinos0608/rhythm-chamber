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
import { HybridEmbeddings } from './embeddings.js';
import { VectorStore } from './vector-store.js';
import { DependencyGraph } from './dependency-graph.js';
import { EmbeddingCache } from './cache.js';

/**
 * Default patterns for files to index
 */
const DEFAULT_PATTERNS = [
  'js/**/*.js',
  'mcp-server/**/*.js',
  'tests/**/*.js'
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
  '**/coverage/**'
];

/**
 * Code Indexer class
 */
export class CodeIndexer {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.cacheDir = options.cacheDir || join(projectRoot, '.mcp-cache');

    // Components
    this.chunker = new CodeChunker(options.chunker);
    this.embeddings = new HybridEmbeddings(options.embeddings);
    // Pass embedding dimension to vector store
    this.vectorStore = new VectorStore({
      ...options.vectorStore,
      dimension: this.embeddings.getDimension()
    });
    this.dependencyGraph = new DependencyGraph();
    this.cache = new EmbeddingCache(this.cacheDir, { enabled: options.cache !== false });

    // Patterns
    this.patterns = options.patterns || DEFAULT_PATTERNS;
    this.ignore = options.ignore || DEFAULT_IGNORE;

    // State
    this.indexed = false;
    this.watcher = null;  // File watcher instance
    this._reindexLock = null;  // Concurrency control for reindexFiles()
    this._indexingInProgress = false;  // Track if indexing is currently running
    this._indexingError = null;  // Track any indexing errors
    this._indexingPromise = null;  // Track current indexing operation
    this.stats = {
      filesDiscovered: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesFromCache: 0,
      chunksIndexed: 0,
      embeddingSource: 'unknown',
      indexTime: 0,
      lastIndexed: null
    };
  }

  /**
   * Initialize the indexer
   */
  async initialize() {
    console.error('[Indexer] Initializing semantic search indexer...');

    // Initialize cache
    await this.cache.initialize();

    // Load cached data if available
    const stats = this.cache.getStats();
    if (stats.fileCount > 0) {
      console.error(`[Indexer] Found cached data for ${stats.fileCount} files`);
    }

    // Check embedding source and detect actual dimension
    const source = this.embeddings.getCurrentSource();
    this.stats.embeddingSource = source.source;
    console.error(`[Indexer] Embedding source: ${source.source} (${source.model})`);

    // Sync dimension to vector store (important for Transformers.js fallback)
    const actualDim = this.embeddings.getDimension();
    this.vectorStore.setDimension(actualDim);

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
    this.indexed = true;

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
        nodir: true
      });

      for (const file of files) {
        allFiles.add(file);
      }
    }

    const discovered = Array.from(allFiles);
    console.error(`[Indexer] Discovered ${discovered.length} files`);

    return discovered;
  }

  /**
   * Index all discovered files
   */
  async indexAll(options = {}) {
    const startTime = Date.now();
    const force = options.force || false;

    console.error('[Indexer] Starting indexing...');

    // Discover files
    const files = await this.discoverFiles();
    this.stats.filesDiscovered = files.length;

    // Check cache validity
    const validFiles = force ? new Map() : await this.cache.checkFilesValid(
      files.map(f => relative(this.projectRoot, f))
    );

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

    // Index new/modified files (with stop checking)
    let indexedCount = 0;
    for (const filePath of toIndex) {
      // Check if we should stop
      if (!this._indexingInProgress) {
        console.error('[Indexer] Indexing stopped by user request');
        break;
      }
      await this._indexFile(filePath);
      indexedCount++;
    }

    // Finalize
    this.stats.indexTime = Date.now() - startTime;
    this.stats.lastIndexed = new Date().toISOString();
    this.stats.filesIndexed = indexedCount;
    this.stats.filesFromCache = fromCache.length;
    this.indexed = true;

    // Save cache
    await this._saveCache();

    console.error('[Indexer] Indexing complete:', this._formatStats());

    return this.stats;
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

      // Chunk the source
      const chunks = this.chunker.chunkSourceFile(source, relPath);

      if (chunks.length === 0) {
        console.error(`[Indexer] No chunks generated for ${relPath}`);
        return;
      }

      // CRITICAL: Add file path prefix to chunk IDs to ensure uniqueness across files
      // Without this, chunks with the same local ID (e.g., function_init_L232) from
      // different files would collide and overwrite each other in the vector store.
      const sanitizedPath = this.chunker._sanitizeFilePath(relPath);
      for (const chunk of chunks) {
        const localId = chunk.id;
        chunk.id = `${sanitizedPath}_${localId}`;
        // Store local ID in metadata for fallback lookups
        chunk.metadata.localId = localId;
      }

      // Generate embeddings
      const texts = chunks.map(c => c.text);
      const embeddings = await this.embeddings.getBatchEmbeddings(texts);

      // Store in vector store and dependency graph
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

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

        // Add to dependency graph
        this.dependencyGraph.addChunk(chunk);
      }

      // Store in cache WITH embeddings (reuse fileStat from earlier)
      await this.cache.storeFileChunks(relPath, chunks, fileStat.mtimeMs, embeddings);

      this.stats.chunksIndexed += chunks.length;
      console.error(`[Indexer] Indexed ${relPath} (${chunks.length} chunks)`);

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
    for (const relPath of filePaths) {
      try {
        const chunkIds = this.cache.getFileChunks(relPath);

        for (const chunkId of chunkIds) {
          const chunkData = this.cache.getChunk(chunkId);

          if (chunkData) {
            // Use cached embedding if available
            let embedding = this.cache.getChunkEmbedding(chunkId);

            // Fallback: regenerate if embedding not in cache
            if (!embedding) {
              console.error(`[Indexer] Warning: Missing cached embedding for ${chunkId}, regenerating`);
              embedding = await this.embeddings.getEmbedding(chunkData.text);
            }

            // CRITICAL: Ensure text, name, and type are in metadata for retrieval
            // Cache stores these at root level, but vectorStore needs them in metadata
            const metadataWithText = {
              ...chunkData.metadata,
              text: chunkData.text,
              name: chunkData.name,
              type: chunkData.type
            };

            // Store in vector store
            this.vectorStore.upsert(chunkId, embedding, metadataWithText);

            // Add to dependency graph
            this.dependencyGraph.addChunk({
              id: chunkId,
              ...chunkData
            });

            this.stats.chunksIndexed++;
          }
        }

        this.stats.filesFromCache++;
      } catch (error) {
        console.error(`[Indexer] Failed to load cache for ${relPath}:`, error.message);
        // Invalidate and re-index on next run
        this.cache.invalidateFile(relPath);
      }
    }
  }

  /**
   * Save cache to disk with improved error handling
   *
   * FIX #3: Enhanced error handling and logging
   * - Logs detailed error information from cache stats
   * - Doesn't crash indexer if cache save fails
   * - Provides actionable debugging information
   */
  async _saveCache() {
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
        lastSaveTime: stats.lastSaveTime
      });

      // Log the error but don't crash the indexer
      // The cache will retry on next save operation
    }
  }

  /**
   * Semantic search with intelligent ranking
   * Prioritizes meaningful chunks (functions, methods, classes) over generic code
   */
  async search(query, options = {}) {
    if (!this.indexed) {
      throw new Error('Indexer not initialized. Call indexAll() first.');
    }

    const {
      limit = 10,
      threshold = 0.3,
      filters = {}
    } = options;

    // Fetch more results to allow re-ranking by type
    const fetchLimit = limit * 3;
    const results = await this.vectorStore.searchByText(query, this.embeddings, {
      limit: fetchLimit,
      threshold,
      filters
    });

    // Re-rank results: prioritize meaningful chunks over generic code
    const typePriority = {
      'function': 100,
      'method': 95,
      'class': 90,
      'class-declaration': 85,
      'variable': 60,
      'export': 50,
      'imports': 40,
      'code': 10,
      'fallback': 5
    };

    const ranked = results.map(r => ({
      ...r,
      rankScore: (r.similarity * 100) + (typePriority[r.metadata?.type] || 0)
    })).sort((a, b) => b.rankScore - a.rankScore);

    return ranked.slice(0, limit);
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
      const isLocalId = /^(function|method|class|variable|code|imports|export|fallback)_/.test(chunkId);
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
      related
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
          name: c.metadata.name
        }))
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
      embeddings: this.embeddings.getCacheStats()
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
      dependencyGraph: this.dependencyGraph.export()
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
      `Time: ${(stats.indexTime / 1000).toFixed(2)}s`
    ].join(', ');
  }

  /**
   * Reindex specific files
   */
  async reindexFiles(filePaths) {
    // Wait for existing reindex to complete (concurrency control)
    while (this._reindexLock) {
      await this._reindexLock;
    }

    // Acquire lock
    let resolveLock;
    this._reindexLock = new Promise(resolve => { resolveLock = resolve; });

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
        reindexed: filePaths.length
      };
    } finally {
      this._reindexLock = null;
      resolveLock();
    }
  }

  /**
   * Clear all index data
   */
  async clear() {
    console.error('[Indexer] Clearing index...');

    this.vectorStore.clear();
    this.dependencyGraph.clear();
    this.cache.clear();

    this.indexed = false;
    this.stats = {
      filesDiscovered: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesFromCache: 0,
      chunksIndexed: 0,
      embeddingSource: 'unknown',
      indexTime: 0,
      lastIndexed: null
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
   * Start the file watcher daemon
   */
  async startWatcher(options = {}) {
    if (this.watcher && this.watcher.isRunning()) {
      console.error('[Indexer] Watcher already running');
      return;
    }

    console.error('[Indexer] Starting file watcher...');

    const { FileWatcher } = await import('./file-watcher.js');
    this.watcher = new FileWatcher(this.projectRoot, this, options);
    await this.watcher.start();

    console.error('[Indexer] File watcher started');
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
        message: 'Watcher not initialized'
      };
    }

    return this.watcher.getStatus();
  }
}

export default CodeIndexer;
