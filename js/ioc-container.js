/**
 * IoC (Inversion of Control) Container
 *
 * A lightweight dependency injection container that manages service dependencies
 * using ES modules directly (no window globals). Inspired by ModuleRegistry pattern.
 *
 * Features:
 * - Register dependencies with factory functions
 * - Resolve dependencies with auto-wiring based on parameter names
 * - Singleton lifecycle (default)
 * - Transient lifecycle (create new instance each time)
 * - Lazy initialization (factories only called when first resolved)
 *
 * Usage:
 *   import { Container } from './ioc-container.js';
 *
 *   // Register dependencies
 *   Container.register('Storage', () => Storage);
 *   Container.register('AppState', () => AppState);
 *   Container.register('Chat', ['Storage', 'AppState'], (Storage, AppState) => ({
 *       ...Chat,
 *       init: () => Chat.init(Storage, AppState)
 *   }));
 *
 *   // Resolve dependency
 *   const chat = Container.resolve('Chat');
 *
 * @module ioc-container
 */

'use strict';

/**
 * Dependency injection container
 */
const Container = {
    /** @type {Map<string, {factory: Function, dependencies: string[], instance: any, lifecycle: string}>} Registered services */
    _registry: new Map(),

    /** @type {Map<string, Promise<any>>} Pending resolutions (prevents circular dependencies) */
    _pending: new Map(),

    /** @type {Set<string>} Resolution stack for circular dependency detection */
    _resolutionStack: new Set(),

    /**
     * Register a service with the container
     * @param {string} name - Service name
     * @param {string[]} dependencies - Array of dependency names (optional)
     * @param {Function} factory - Factory function that creates the service
     * @param {string} lifecycle - 'singleton' (default) or 'transient'
     */
    register(name, dependencies, factory, lifecycle = 'singleton') {
        // Support calling with (name, factory) for dependencies without deps
        if (typeof dependencies === 'function') {
            factory = dependencies;
            dependencies = [];
        }

        this._registry.set(name, {
            factory,
            dependencies: Array.isArray(dependencies) ? dependencies : [],
            instance: null,
            lifecycle
        });

        console.log(`[Container] Registered service: ${name} (lifecycle: ${lifecycle})`);
    },

    /**
     * Register an instance directly (useful for already-created singletons)
     * @param {string} name - Service name
     * @param {any} instance - The instance to register
     */
    registerInstance(name, instance) {
        this._registry.set(name, {
            factory: () => instance,
            dependencies: [],
            instance,
            lifecycle: 'singleton'
        });

        console.log(`[Container] Registered instance: ${name}`);
    },

    /**
     * Check if a service is registered
     * @param {string} name - Service name
     * @returns {boolean}
     */
    has(name) {
        return this._registry.has(name);
    },

    /**
     * Resolve a service by name
     * @param {string} name - Service name
     * @returns {any} The resolved service
     * @throws {Error} If service is not registered or circular dependency detected
     */
    resolve(name) {
        // Check for circular dependency
        if (this._resolutionStack.has(name)) {
            const cycle = Array.from(this._resolutionStack).concat(name).join(' -> ');
            throw new Error(`Circular dependency detected: ${cycle}`);
        }

        const entry = this._registry.get(name);
        if (!entry) {
            throw new Error(`Service not registered: ${name}`);
        }

        // Return cached instance for singletons
        if (entry.lifecycle === 'singleton' && entry.instance !== null) {
            return entry.instance;
        }

        // Add to resolution stack
        this._resolutionStack.add(name);

        try {
            // Resolve dependencies first
            const resolvedDeps = {};
            for (const depName of entry.dependencies) {
                resolvedDeps[depName] = this.resolve(depName);
            }

            // Call factory with resolved dependencies
            const instance = entry.factory(resolvedDeps);

            // Cache instance for singletons
            if (entry.lifecycle === 'singleton') {
                entry.instance = instance;
            }

            return instance;
        } finally {
            // Remove from resolution stack
            this._resolutionStack.delete(name);
        }
    },

    /**
     * Resolve a service asynchronously (for factories that return Promises)
     * @param {string} name - Service name
     * @returns {Promise<any>} The resolved service
     */
    async resolveAsync(name) {
        // Check if already being resolved
        if (this._pending.has(name)) {
            return this._pending.get(name);
        }

        const entry = this._registry.get(name);
        if (!entry) {
            throw new Error(`Service not registered: ${name}`);
        }

        // Return cached instance for singletons
        if (entry.lifecycle === 'singleton' && entry.instance !== null) {
            return entry.instance;
        }

        // Create resolution promise
        const promise = (async () => {
            // Resolve dependencies first
            const resolvedDeps = {};
            for (const depName of entry.dependencies) {
                resolvedDeps[depName] = await this.resolveAsync(depName);
            }

            // Call factory with resolved dependencies
            const instance = await entry.factory(resolvedDeps);

            // Cache instance for singletons
            if (entry.lifecycle === 'singleton') {
                entry.instance = instance;
            }

            this._pending.delete(name);
            return instance;
        })();

        this._pending.set(name, promise);
        return promise;
    },

    /**
     * Create a dependency map for a controller
     * Resolves all specified dependencies and returns them as an object
     * @param {string[]} names - Array of dependency names
     * @returns {Object} Object with resolved dependencies
     */
    resolveDependencies(names) {
        const deps = {};
        for (const name of names) {
            deps[name] = this.resolve(name);
        }
        return deps;
    },

    /**
     * Initialize a controller with its dependencies
     * Controllers follow the pattern: controller.init(dependencies)
     * @param {string} controllerName - Name of the controller in registry
     * @param {string[]} depNames - Array of dependency names to inject
     * @returns {Object} The initialized controller
     */
    initController(controllerName, depNames) {
        const controller = this.resolve(controllerName);
        const dependencies = this.resolveDependencies(depNames);

        if (typeof controller.init === 'function') {
            controller.init(dependencies);
        }

        return controller;
    },

    /**
     * Get all registered service names
     * @returns {string[]} Array of registered service names
     */
    getRegisteredServices() {
        return Array.from(this._registry.keys());
    },

    /**
     * Clear all registrations (useful for testing)
     */
    clear() {
        this._registry.clear();
        this._pending.clear();
        this._resolutionStack.clear();
        console.log('[Container] Cleared all registrations');
    },

    /**
     * Create a child container with isolated registrations
     * Child container inherits parent's registrations but can override them
     * @returns {Container} New child container
     */
    createChild() {
        const child = Object.create(this);
        child._registry = new Map(this._registry);
        child._pending = new Map();
        child._resolutionStack = new Set();
        return child;
    }
};

// Freeze to prevent accidental modification of core methods
Object.freeze(Container);

export { Container };
