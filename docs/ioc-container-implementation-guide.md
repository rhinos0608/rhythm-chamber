# IoC Container Implementation Guide

## Overview

This document describes the lightweight Inversion of Control (IoC) Container implementation for the Rhythm Chamber application. The IoC container centralizes dependency management and eliminates the "God Object" maintenance liability in `app.js`.

## Problem Solved

Previously, the `initializeControllers()` function in `/js/app.js` manually injected dependencies into every controller and service:

```javascript
// OLD: Manual dependency injection ( brittle, hard to maintain )
FileUploadController.init({
    Storage,
    AppState,
    OperationLock,
    Patterns,
    Personality,
    ViewController,
    showToast
});

// Repeated for every controller...
```

As the app grew, this became a maintenance liability:
- Adding a new dependency required modifying multiple init() calls
- No single source of truth for what each controller needs
- Difficult to see dependency relationships at a glance
- Risk of inconsistent dependencies across controllers

## Solution

### New IoC Container (`/js/ioc-container.js`)

A lightweight dependency injection container that:

1. **Uses ES modules directly** - No more window globals
2. **Provides register/resolve API** - Standard DI pattern
3. **Supports singleton lifecycle** - Default behavior for ES modules
4. **Auto-wires dependencies** - Based on declared requirements
5. **Detects circular dependencies** - Prevents infinite loops

### API Overview

```javascript
import { Container } from './ioc-container.js';

// Register a factory with dependencies
Container.register('ServiceName', ['Dep1', 'Dep2'], (deps) => {
    return new Service(deps.Dep1, deps.Dep2);
});

// Register an existing instance (for ES module singletons)
Container.registerInstance('ModuleName', moduleObject);

// Resolve a dependency
const service = Container.resolve('ServiceName');

// Initialize a controller with dependencies
Container.initController('ControllerName', ['Dep1', 'Dep2', 'Dep3']);
```

## Implementation Details

### Container Methods

| Method | Description |
|--------|-------------|
| `register(name, deps, factory, lifecycle)` | Register a service factory |
| `registerInstance(name, instance)` | Register an existing singleton |
| `has(name)` | Check if service is registered |
| `resolve(name)` | Get a service instance |
| `resolveAsync(name)` | Get a service asynchronously |
| `resolveDependencies(names)` | Get multiple services as an object |
| `initController(name, depNames)` | Init controller with deps |
| `getRegisteredServices()` | List all registered services |
| `clear()` | Clear all registrations (testing) |
| `createChild()` | Create isolated child container |

### Lifecycle Options

- **singleton** (default): One instance created, cached, and reused
- **transient**: New instance created on each resolve

## Changes Made

### 1. New File: `/js/ioc-container.js`

The IoC container implementation with the following features:

- Service registry with Map-based storage
- Dependency resolution with auto-wiring
- Circular dependency detection
- Both sync and async resolution support
- Child container support for isolation

### 2. Updated: `/js/app.js`

**Added import:**
```javascript
import { Container } from './ioc-container.js';
```

**New function: `registerContainerServices()`**
```javascript
function registerContainerServices() {
    // Register core services as singletons
    Container.registerInstance('Storage', Storage);
    Container.registerInstance('AppState', AppState);
    // ... etc

    // Register controllers
    Container.registerInstance('FileUploadController', FileUploadController);
    // ... etc

    // Register utility functions
    Container.registerInstance('showToast', showToast);
}
```

**Refactored: `initializeControllers()`**
```javascript
async function initializeControllers() {
    // Ensure services are registered
    if (!Container.has('Storage')) {
        registerContainerServices();
    }

    // Dependency mapping for each controller
    const controllerDependencies = {
        FileUploadController: [
            'Storage', 'AppState', 'OperationLock', 'Patterns',
            'Personality', 'ViewController', 'showToast'
        ],
        // ... etc
    };

    // Initialize each controller with its dependencies
    for (const [controllerName, depNames] of Object.entries(controllerDependencies)) {
        Container.initController(controllerName, depNames);
    }
}
```

## Dependency Mapping

### FileUploadController
- Storage, AppState, OperationLock, Patterns, Personality, ViewController, showToast

### SpotifyController
- Storage, AppState, Spotify, Patterns, Personality, ViewController, showToast

### DemoController
- AppState, DemoData, ViewController, Patterns, showToast

### ResetController
- Storage, AppState, Spotify, Chat, OperationLock, ViewController, showToast, FileUploadController

### MessageOperations
- DataQuery, TokenCounter, Functions (RAG loaded on-demand)

### SidebarController
- Self-initializing via ES module imports (no DI needed yet)

### ChatUIController
- Self-initializing via ES module imports (no DI needed yet)

## Adding New Dependencies

### To Add a New Controller

1. Import the controller in `app.js`:
```javascript
import { NewController } from './controllers/new-controller.js';
```

2. Register it in `registerContainerServices()`:
```javascript
Container.registerInstance('NewController', NewController);
```

3. Add dependency mapping in `initializeControllers()`:
```javascript
const controllerDependencies = {
    // ... existing controllers
    NewController: ['Storage', 'AppState', 'showToast']
};
```

### To Add a New Dependency to an Existing Controller

Simply add the dependency name to the controller's array in `controllerDependencies`:

```javascript
const controllerDependencies = {
    FileUploadController: [
        'Storage', 'AppState', 'OperationLock', 'Patterns',
        'Personality', 'ViewController', 'showToast',
        'NewDependency'  // Just add here!
    ]
};
```

## Testing

The IoC container supports testing through:

1. **Clear method** - Reset state between tests:
```javascript
Container.clear();
```

2. **Child containers** - Isolated test environments:
```javascript
const testContainer = Container.createChild();
testContainer.registerInstance('mockService', mockService);
```

3. **Instance override** - Swap implementations:
```javascript
// Register mock for testing
Container.registerInstance('Storage', mockStorage);
```

## Migration Path

The implementation is backward compatible:

1. Existing controllers still work with their `init(dependencies)` pattern
2. No changes required to controller implementations
3. Only the initialization code in `app.js` changed

## Future Enhancements

Potential improvements to consider:

1. **Decorator-based registration** - Use decorators to auto-register classes
2. **Lazy loading** - Defer module imports until first resolve
3. **Scope management** - Request-scoped or custom scopes
4. **Configuration profiles** - Different dependency graphs for dev/prod
5. **Dependency visualization** - Generate dependency graphs
6. **Hot reload support** - Re-register modules during development

## Files Modified

- `/js/ioc-container.js` (NEW) - IoC container implementation
- `/js/app.js` (MODIFIED) - Uses IoC container for controller initialization

## Related Patterns

This IoC container follows the same pattern as the existing `ModuleRegistry`:

- Both use a Map-based registry
- Both support lazy loading
- Both prevent duplicate initialization
- Both are frozen to prevent modification

The IoC container extends this pattern to add:
- Dependency injection
- Auto-wiring
- Lifecycle management
- Circular dependency detection
