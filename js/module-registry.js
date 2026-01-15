/**
 * Module Registry for Dynamic Imports
 * 
 * Centralizes dynamically loaded modules to eliminate window pollution.
 * Provides async getModule() API with lazy loading support.
 * 
 * Usage:
 *   import { ModuleRegistry } from './module-registry.js';
 *   const RAG = await ModuleRegistry.getModule('RAG');
 * 
 * @module module-registry
 */

/**
 * Registry for dynamically loaded modules
 * Replaces window.X pollution with explicit module access
 */
const ModuleRegistry = {
    /** @type {Map<string, any>} Loaded module instances */
    _modules: new Map(),

    /** @type {Map<string, () => Promise<any>>} Module loaders (lazy load functions) */
    _loaders: new Map(),

    /** @type {Map<string, Promise<any>>} Pending loads (prevents duplicate requests) */
    _pending: new Map(),

    /**
     * Register a module loader for lazy loading
     * @param {string} name - Module name (e.g., 'RAG', 'Ollama')
     * @param {() => Promise<{default?: any, [key: string]: any}>} loader - Dynamic import function
     * @param {string} [exportName] - Name of export to use (defaults to module name)
     */
    register(name, loader, exportName = null) {
        this._loaders.set(name, { loader, exportName: exportName || name });
    },

    /**
     * Get a module by name, loading it if necessary
     * @param {string} name - Module name
     * @returns {Promise<any>} The module instance or null if not registered
     */
    async getModule(name) {
        // Return cached module if already loaded
        if (this._modules.has(name)) {
            return this._modules.get(name);
        }

        // Check if load is already in progress (prevents duplicate loads)
        if (this._pending.has(name)) {
            return this._pending.get(name);
        }

        // Check if loader is registered
        const loaderConfig = this._loaders.get(name);
        if (!loaderConfig) {
            console.warn(`[ModuleRegistry] No loader registered for module: ${name}`);
            return null;
        }

        // Load the module
        const loadPromise = (async () => {
            try {
                const { loader, exportName } = loaderConfig;
                const moduleExports = await loader();

                // Get the specific export (named or default)
                const moduleInstance = moduleExports[exportName] || moduleExports.default || moduleExports;

                this._modules.set(name, moduleInstance);
                this._pending.delete(name);

                console.log(`[ModuleRegistry] Loaded module: ${name}`);
                return moduleInstance;
            } catch (error) {
                this._pending.delete(name);
                console.error(`[ModuleRegistry] Failed to load module ${name}:`, error);
                throw error;
            }
        })();

        this._pending.set(name, loadPromise);
        return loadPromise;
    },

    /**
     * Check if a module is already loaded (sync check for dependency validation)
     * @param {string} name - Module name
     * @returns {boolean} True if module is loaded and ready
     */
    isLoaded(name) {
        return this._modules.has(name);
    },

    /**
     * Get a loaded module synchronously (returns null if not loaded)
     * Use this only when you need sync access and have already ensured module is loaded
     * @param {string} name - Module name
     * @returns {any|null} The module instance or null
     */
    getModuleSync(name) {
        return this._modules.get(name) || null;
    },

    /**
     * Pre-load multiple modules in parallel
     * @param {string[]} names - Array of module names to load
     * @returns {Promise<Map<string, any>>} Map of loaded modules
     */
    async preloadModules(names) {
        const results = await Promise.allSettled(
            names.map(name => this.getModule(name))
        );

        const loaded = new Map();
        names.forEach((name, index) => {
            if (results[index].status === 'fulfilled') {
                loaded.set(name, results[index].value);
            }
        });

        return loaded;
    },

    /**
     * Check which modules are currently loaded
     * @returns {string[]} Array of loaded module names
     */
    getLoadedModules() {
        return Array.from(this._modules.keys());
    },

    /**
     * Check which modules are registered (but may not be loaded yet)
     * @returns {string[]} Array of registered module names  
     */
    getRegisteredModules() {
        return Array.from(this._loaders.keys());
    }
};

// Freeze to prevent modification
Object.freeze(ModuleRegistry);

export { ModuleRegistry };
