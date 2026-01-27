/**
 * DI Container - Improved Dependency Injection Container
 *
 * Features:
 * - Explicit dependency declarations
 * - Constructor injection support
 * - Circular dependency detection
 * - Dependency graph visualization
 * - Module-based initialization
 *
 * @module app/di-container
 */

export class DIContainer {
    constructor() {
        this._services = new Map();
        this._controllers = new Map();
        this._factories = new Map();
        this._singletons = new Map();
        this._modules = new Map();
        this._dependencyGraph = {
            services: [],
            controllers: {}
        };
        this._dependencyChains = new Map();
    }

    // ==========================================
    // Service Registration
    // ==========================================

    /**
     * Register a service instance
     * @param {string} name - Service name
     * @param {*} instance - Service instance
     */
    registerInstance(name, instance) {
        if (!name) {
            throw new Error('Service name is required');
        }
        this._services.set(name, instance);
        this._trackServiceDependency(name);
        return this;
    }

    /**
     * Register a controller
     * @param {string} name - Controller name
     * @param {Object} controller - Controller object with init method
     */
    registerController(name, controller) {
        if (!name) {
            throw new Error('Controller name is required');
        }
        if (!controller || typeof controller !== 'object') {
            throw new Error(`Controller '${name}' must be an object`);
        }
        this._controllers.set(name, controller);
        return this;
    }

    /**
     * Register a factory for constructor injection
     * @param {string} name - Service name
     * @param {Function} Factory - Constructor function or class
     * @param {Array<string>} dependencies - Array of dependency names
     * @param {Object} options - Options (e.g., { singleton: true })
     */
    registerFactory(name, Factory, dependencies = [], options = {}) {
        if (!name) {
            throw new Error('Factory name is required');
        }
        if (typeof Factory !== 'function') {
            throw new Error(`Factory '${name}' must be a constructor function`);
        }

        this._factories.set(name, {
            Factory,
            dependencies,
            singleton: options.singleton === true
        });

        this._trackServiceDependency(name, dependencies);
        return this;
    }

    /**
     * Declare a module with explicit dependencies
     * @param {Object} moduleDefinition - Module definition with name, dependencies, initialize
     */
    declareModule(moduleDefinition) {
        const { name, dependencies = [], initialize } = moduleDefinition;

        if (!name) {
            throw new Error('Module name is required');
        }
        if (typeof initialize !== 'function') {
            throw new Error(`Module '${name}' must have an initialize function`);
        }

        this._modules.set(name, {
            dependencies,
            initialize,
            initialized: false
        });

        return this;
    }

    // ==========================================
    // Service Retrieval
    // ==========================================

    /**
     * Get a registered service or controller
     * @param {string} name - Service/Controller name
     * @returns {*} Service instance or null
     */
    get(name) {
        return this._services.get(name) || this._controllers.get(name) || null;
    }

    /**
     * Check if a service or controller is registered
     * @param {string} name - Service/Controller name
     * @returns {boolean}
     */
    has(name) {
        return this._services.has(name) || this._controllers.has(name) || this._factories.has(name);
    }

    /**
     * Create an instance from a registered factory
     * @param {string} name - Factory name
     * @returns {*} Created instance
     */
    create(name) {
        const factory = this._factories.get(name);
        if (!factory) {
            throw new Error(`Factory '${name}' not found`);
        }

        // Check for singleton
        if (factory.singleton && this._singletons.has(name)) {
            return this._singletons.get(name);
        }

        // Check for circular dependencies
        this._checkCircularDependencies(name, factory.dependencies, []);

        // Resolve dependencies
        const deps = {};
        for (const depName of factory.dependencies) {
            const dep = this._resolveDependency(depName);
            if (!dep) {
                throw new Error(`Dependency '${depName}' not found for '${name}'`);
            }
            deps[depName] = dep;
        }

        // Create instance
        const instance = new factory.Factory(deps);

        // Store singleton
        if (factory.singleton) {
            this._singletons.set(name, instance);
        }

        return instance;
    }

    /**
     * Resolve a dependency by name
     * @param {string} name - Dependency name
     * @returns {*} Resolved dependency
     * @private
     */
    _resolveDependency(name) {
        // Check services first
        if (this._services.has(name)) {
            return this._services.get(name);
        }

        // Check factories
        if (this._factories.has(name)) {
            return this.create(name);
        }

        return null;
    }

    // ==========================================
    // Controller Initialization
    // ==========================================

    /**
     * Initialize a controller with its dependencies
     * @param {string} controllerName - Controller name
     * @param {Array<string>} depNames - Array of dependency names
     */
    initController(controllerName, depNames = []) {
        const controller = this._controllers.get(controllerName);
        if (!controller) {
            throw new Error(`Controller '${controllerName}' not found`);
        }
        if (typeof controller.init !== 'function') {
            throw new Error(`Controller '${controllerName}' is not initializable (missing init method)`);
        }

        const dependencies = {};
        for (const name of depNames) {
            const dep = this.get(name);
            if (!dep) {
                throw new Error(`Dependency '${name}' not found for controller '${controllerName}'`);
            }
            dependencies[name] = dep;
        }

        controller.init(dependencies);

        // Track in dependency graph
        this._dependencyGraph.controllers[controllerName] = depNames;
    }

    /**
     * Initialize a declared module
     * @param {string} moduleName - Module name
     * @returns {*} Result of module initialization
     */
    initializeModule(moduleName) {
        const module = this._modules.get(moduleName);
        if (!module) {
            throw new Error(`Module '${moduleName}' not found`);
        }

        if (module.initialized) {
            console.warn(`Module '${moduleName}' is already initialized`);
            return null;
        }

        // Validate all dependencies are available
        const missing = module.dependencies.filter(dep => !this.has(dep));
        if (missing.length > 0) {
            throw new Error(`Module '${moduleName}' has missing dependencies: ${missing.join(', ')}`);
        }

        // Resolve dependencies
        const deps = {};
        for (const depName of module.dependencies) {
            deps[depName] = this.get(depName);
        }

        const result = module.initialize(deps);
        module.initialized = true;

        return result;
    }

    // ==========================================
    // Circular Dependency Detection
    // ==========================================

    /**
     * Check for circular dependencies in a dependency chain
     * @param {string} name - Service name
     * @param {Array<string>} dependencies - Dependencies of the service
     * @param {Array<string>} chain - Current dependency chain
     * @private
     */
    _checkCircularDependencies(name, dependencies, chain) {
        const newChain = [...chain, name];

        for (const dep of dependencies) {
            if (dep === name) {
                throw new Error(`Self-dependency detected: '${name}' depends on itself`);
            }

            if (chain.includes(dep)) {
                const cycle = [...newChain, dep].join(' -> ');
                throw new Error(`Circular dependency detected: ${cycle}`);
            }

            const depFactory = this._factories.get(dep);
            if (depFactory) {
                this._checkCircularDependencies(dep, depFactory.dependencies, newChain);
            }
        }
    }

    /**
     * Check if there's a circular dependency involving a service
     * @param {string} serviceName - Service name to check
     * @returns {boolean} True if circular dependency exists
     */
    hasCircularDependency(serviceName) {
        try {
            const factory = this._factories.get(serviceName);
            if (factory) {
                this._checkCircularDependencies(serviceName, factory.dependencies, []);
            }
            return false;
        } catch (error) {
            return error.message.includes('Circular dependency');
        }
    }

    // ==========================================
    // Dependency Graph
    // ==========================================

    /**
     * Track service dependency for graph visualization
     * @param {string} name - Service name
     * @param {Array<string>} dependencies - Dependencies (optional)
     * @private
     */
    _trackServiceDependency(name, dependencies = []) {
        if (!this._dependencyGraph.services.includes(name)) {
            this._dependencyGraph.services.push(name);
        }

        if (dependencies.length > 0) {
            this._dependencyGraph.controllers[name] = dependencies;
        }
    }

    /**
     * Get the dependency graph
     * @returns {Object} Dependency graph structure
     */
    getDependencyGraph() {
        return {
            services: [...this._dependencyGraph.services],
            controllers: { ...this._dependencyGraph.controllers }
        };
    }

    /**
     * Get service information including dependencies
     * @param {string} name - Service/Controller name
     * @returns {Object|null} Service info
     */
    getServiceInfo(name) {
        const factory = this._factories.get(name);
        if (factory) {
            return {
                name,
                type: 'factory',
                dependencies: factory.dependencies,
                singleton: factory.singleton
            };
        }

        if (this._dependencyGraph.controllers[name]) {
            return {
                name,
                type: 'controller',
                dependencies: this._dependencyGraph.controllers[name]
            };
        }

        if (this._services.has(name)) {
            return {
                name,
                type: 'instance',
                dependencies: []
            };
        }

        return null;
    }

    /**
     * Generate DOT format graph for visualization
     * @returns {string} DOT format graph
     */
    toDotFormat() {
        const lines = ['digraph DependencyGraph {'];
        lines.push('  rankdir=LR;');
        lines.push('  node [shape=box];');

        // Add service nodes
        for (const service of this._dependencyGraph.services) {
            const isFactory = this._factories.has(service);
            lines.push(`  "${service}" [style=${isFactory ? 'dashed' : 'filled'}];`);
        }

        // Add controller nodes
        for (const [controller, deps] of Object.entries(this._dependencyGraph.controllers)) {
            lines.push(`  "${controller}" [shape=ellipse, style=filled, fillcolor=lightblue];`);

            // Add edges
            for (const dep of deps) {
                lines.push(`  "${controller}" -> "${dep}";`);
            }
        }

        // Add factory dependencies
        for (const [name, factory] of this._factories.entries()) {
            for (const dep of factory.dependencies) {
                lines.push(`  "${name}" -> "${dep}" [style=dashed];`);
            }
        }

        lines.push('}');
        return lines.join('\n');
    }

    // ==========================================
    // Container Inspection
    // ==========================================

    /**
     * Get all registered service names
     * @returns {Array<string>} Service names
     */
    getRegisteredServices() {
        return [...this._services.keys()];
    }

    /**
     * Get all registered controller names
     * @returns {Array<string>} Controller names
     */
    getRegisteredControllers() {
        return [...this._controllers.keys()];
    }

    /**
     * Get all registered factory names
     * @returns {Array<string>} Factory names
     */
    getRegisteredFactories() {
        return [...this._factories.keys()];
    }

    /**
     * Get all declared module names
     * @returns {Array<string>} Module names
     */
    getDeclaredModules() {
        return [...this._modules.keys()];
    }

    /**
     * Get container status
     * @returns {Object} Container status
     */
    getStatus() {
        const initializedControllers = Object.keys(this._dependencyGraph.controllers);
        const initializedModules = [...this._modules.entries()]
            .filter(([_, mod]) => mod.initialized)
            .map(([name]) => name);

        return {
            serviceCount: this._services.size,
            controllerCount: this._controllers.size,
            factoryCount: this._factories.size,
            moduleCount: this._modules.size,
            singletonCount: this._singletons.size,
            initializedControllers,
            initializedModules
        };
    }

    // ==========================================
    // Clear and Reset
    // ==========================================

    /**
     * Clear all registrations
     */
    clear() {
        this._services.clear();
        this._controllers.clear();
        this._factories.clear();
        this._singletons.clear();
        this._modules.clear();
        this._dependencyGraph = {
            services: [],
            controllers: {}
        };
        this._dependencyChains.clear();
    }
}

/**
 * Create a singleton container instance for backward compatibility
 */
export const Container = new DIContainer();

/**
 * Backward compatibility: Legacy container interface
 * Maps to new DIContainer methods
 */
export const LegacyContainer = {
    _services: Container._services,
    _controllers: Container._controllers,

    registerInstance(name, instance) {
        return Container.registerInstance(name, instance);
    },

    registerController(name, controller) {
        return Container.registerController(name, controller);
    },

    has(name) {
        return Container.has(name);
    },

    get(name) {
        return Container.get(name);
    },

    initController(controllerName, depNames) {
        return Container.initController(controllerName, depNames);
    }
};

export default DIContainer;
