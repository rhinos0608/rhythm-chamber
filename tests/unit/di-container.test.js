/**
 * DI Container Tests
 *
 * Test-Driven Development approach for improving dependency injection:
 * 1. Tests for dependency resolution
 * 2. Tests for circular dependency detection
 * 3. Tests for dependency graph visualization
 * 4. Tests for constructor injection pattern
 *
 * @module tests/unit/di-container
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DIContainer } from '../../js/app/di-container.js';

describe('DIContainer', () => {
    let container;

    beforeEach(() => {
        container = new DIContainer();
    });

    afterEach(() => {
        container.clear();
    });

    describe('Service Registration', () => {
        it('should register a service instance', () => {
            const service = { name: 'test' };
            container.registerInstance('TestService', service);
            expect(container.has('TestService')).toBe(true);
        });

        it('should retrieve a registered service', () => {
            const service = { name: 'test' };
            container.registerInstance('TestService', service);
            expect(container.get('TestService')).toBe(service);
        });

        it('should return null for unregistered service', () => {
            expect(container.get('NonExistent')).toBeNull();
        });

        it('should check if service exists', () => {
            expect(container.has('TestService')).toBe(false);
            const service = { name: 'test' };
            container.registerInstance('TestService', service);
            expect(container.has('TestService')).toBe(true);
        });

        it('should allow overriding a registered service', () => {
            const service1 = { name: 'test1' };
            const service2 = { name: 'test2' };
            container.registerInstance('TestService', service1);
            container.registerInstance('TestService', service2);
            expect(container.get('TestService')).toBe(service2);
        });
    });

    describe('Controller Registration and Initialization', () => {
        it('should register a controller', () => {
            const controller = { init: () => {} };
            container.registerController('TestController', controller);
            expect(container.has('TestController')).toBe(true);
        });

        it('should initialize controller with dependencies', () => {
            const dep1 = { name: 'dep1' };
            const dep2 = { name: 'dep2' };
            let receivedDeps = null;

            const controller = {
                init: (deps) => {
                    receivedDeps = deps;
                }
            };

            container.registerInstance('Dep1', dep1);
            container.registerInstance('Dep2', dep2);
            container.registerController('TestController', controller);

            container.initController('TestController', ['Dep1', 'Dep2']);

            expect(receivedDeps).toEqual({ Dep1: dep1, Dep2: dep2 });
        });

        it('should throw error when initializing non-existent controller', () => {
            expect(() => {
                container.initController('NonExistent', []);
            }).toThrow("Controller 'NonExistent' not found");
        });

        it('should throw error when controller has no init method', () => {
            container.registerInstance('Dep1', { name: 'dep1' });
            container.registerController('BadController', { foo: 'bar' });

            expect(() => {
                container.initController('BadController', ['Dep1']);
            }).toThrow(/is not initializable/);
        });

        it('should throw error when dependency is missing', () => {
            let receivedDeps = null;
            const controller = {
                init: (deps) => {
                    receivedDeps = deps;
                }
            };

            container.registerController('TestController', controller);

            expect(() => {
                container.initController('TestController', ['NonExistent']);
            }).toThrow("Dependency 'NonExistent' not found");
        });
    });

    describe('Dependency Graph', () => {
        it('should track service dependencies', () => {
            const dep1 = { name: 'dep1' };
            const dep2 = { name: 'dep2' };

            container.registerInstance('Dep1', dep1);
            container.registerInstance('Dep2', dep2);

            let receivedDeps = null;
            const controller = {
                init: (deps) => {
                    receivedDeps = deps;
                }
            };
            container.registerController('TestController', controller);
            container.initController('TestController', ['Dep1', 'Dep2']);

            const graph = container.getDependencyGraph();
            expect(graph.services).toContain('Dep1');
            expect(graph.services).toContain('Dep2');
            expect(graph.controllers.TestController).toEqual(['Dep1', 'Dep2']);
        });

        it('should generate graph in DOT format for visualization', () => {
            const dep1 = { name: 'dep1' };
            const dep2 = { name: 'dep2' };

            container.registerInstance('Dep1', dep1);
            container.registerInstance('Dep2', dep2);

            const controller = {
                init: () => {}
            };
            container.registerController('TestController', controller);
            container.initController('TestController', ['Dep1', 'Dep2']);

            const dot = container.toDotFormat();
            expect(dot).toContain('digraph');
            expect(dot).toContain('TestController');
            expect(dot).toContain('Dep1');
            expect(dot).toContain('Dep2');
        });

        it('should provide dependency information for debugging', () => {
            const dep1 = { name: 'dep1' };
            container.registerInstance('Dep1', dep1);

            const controller = {
                init: () => {}
            };
            container.registerController('TestController', controller);
            container.initController('TestController', ['Dep1']);

            const info = container.getServiceInfo('TestController');
            expect(info).toBeDefined();
            expect(info.dependencies).toEqual(['Dep1']);
        });
    });

    describe('Constructor Injection Support', () => {
        it('should support factory-based registration', () => {
            class TestService {
                constructor({ config, logger }) {
                    this.config = config;
                    this.logger = logger;
                }

                getValue() {
                    return this.config.value;
                }
            }

            const config = { value: 42 };
            const logger = { log: () => {} };

            container.registerInstance('config', config);
            container.registerInstance('logger', logger);

            container.registerFactory('TestService', TestService, ['config', 'logger']);

            const service = container.create('TestService');
            expect(service).toBeInstanceOf(TestService);
            expect(service.getValue()).toBe(42);
        });

        it('should support singleton pattern with factory', () => {
            class TestService {
                constructor() {
                    this.timestamp = Date.now();
                }
            }

            container.registerFactory('TestService', TestService, [], { singleton: true });

            const instance1 = container.create('TestService');
            const instance2 = container.create('TestService');

            expect(instance1).toBe(instance2);
            expect(instance1.timestamp).toBe(instance2.timestamp);
        });

        it('should create new instances when not singleton', async () => {
            class TestService {
                constructor() {
                    this.timestamp = Date.now();
                }
            }

            container.registerFactory('TestService', TestService, [], { singleton: false });

            const instance1 = container.create('TestService');
            // Ensure different timestamp
            await new Promise(resolve => setTimeout(resolve, 2));
            const instance2 = container.create('TestService');

            expect(instance1).not.toBe(instance2);
        });
    });

    describe('Circular Dependency Detection', () => {
        it('should detect direct circular dependency', () => {
            // Service A depends on B, Service B depends on A
            container.registerFactory('ServiceA', class ServiceA {
                constructor({ ServiceB }) {
                    this.b = ServiceB;
                }
            }, ['ServiceB']);

            container.registerFactory('ServiceB', class ServiceB {
                constructor({ ServiceA }) {
                    this.a = ServiceA;
                }
            }, ['ServiceA']);

            expect(() => {
                container.create('ServiceA');
            }).toThrow(/circular dependency/i);
        });

        it('should detect indirect circular dependency', () => {
            // A -> B -> C -> A
            container.registerFactory('ServiceA', class ServiceA {
                constructor({ ServiceB }) {
                    this.b = ServiceB;
                }
            }, ['ServiceB']);

            container.registerFactory('ServiceB', class ServiceB {
                constructor({ ServiceC }) {
                    this.c = ServiceC;
                }
            }, ['ServiceC']);

            container.registerFactory('ServiceC', class ServiceC {
                constructor({ ServiceA }) {
                    this.a = ServiceA;
                }
            }, ['ServiceA']);

            expect(() => {
                container.create('ServiceA');
            }).toThrow(/circular dependency/i);
        });

        it('should report circular dependency path', () => {
            container.registerFactory('A', class A {
                constructor({ B }) { this.b = B; }
            }, ['B']);

            container.registerFactory('B', class B {
                constructor({ C }) { this.c = C; }
            }, ['C']);

            container.registerFactory('C', class C {
                constructor({ A }) { this.a = A; }
            }, ['A']);

            try {
                container.create('A');
                expect.fail('Should have thrown circular dependency error');
            } catch (error) {
                expect(error.message).toContain('A');
                expect(error.message).toContain('B');
                expect(error.message).toContain('C');
            }
        });

        it('should not detect circular dependency for valid chain', () => {
            // A -> B -> C (no cycle)
            container.registerFactory('ServiceC', class ServiceC {
                constructor() {}
            }, []);

            container.registerFactory('ServiceB', class ServiceB {
                constructor({ ServiceC }) {
                    this.c = ServiceC;
                }
            }, ['ServiceC']);

            container.registerFactory('ServiceA', class ServiceA {
                constructor({ ServiceB }) {
                    this.b = ServiceB;
                }
            }, ['ServiceB']);

            expect(() => {
                const service = container.create('ServiceA');
                expect(service).toBeDefined();
                expect(service.b).toBeDefined();
                expect(service.b.c).toBeDefined();
            }).not.toThrow();
        });
    });

    describe('Explicit Dependency Declarations', () => {
        it('should allow modules to declare their dependencies', () => {
            const moduleDefinition = {
                name: 'ChatModule',
                dependencies: ['Storage', 'AppState', 'EventBus'],
                initialize: (deps) => {
                    deps.Storage.setItem('test', 'value');
                    return { initialized: true };
                }
            };

            container.declareModule(moduleDefinition);

            const storage = { setItem: () => {} };
            const appState = { update: () => {} };
            const eventBus = { on: () => {} };

            container.registerInstance('Storage', storage);
            container.registerInstance('AppState', appState);
            container.registerInstance('EventBus', eventBus);

            const result = container.initializeModule('ChatModule');
            expect(result.initialized).toBe(true);
        });

        it('should validate all declared dependencies are available', () => {
            const moduleDefinition = {
                name: 'ChatModule',
                dependencies: ['Storage', 'MissingDep'],
                initialize: (deps) => ({ initialized: true })
            };

            container.declareModule(moduleDefinition);
            container.registerInstance('Storage', { setItem: () => {} });

            expect(() => {
                container.initializeModule('ChatModule');
            }).toThrow(/MissingDep/);
        });
    });

    describe('Container Inspection', () => {
        it('should list all registered services', () => {
            container.registerInstance('Service1', { name: 's1' });
            container.registerInstance('Service2', { name: 's2' });

            const services = container.getRegisteredServices();
            expect(services).toContain('Service1');
            expect(services).toContain('Service2');
        });

        it('should list all registered controllers', () => {
            const ctrl1 = { init: () => {} };
            const ctrl2 = { init: () => {} };

            container.registerController('Controller1', ctrl1);
            container.registerController('Controller2', ctrl2);

            const controllers = container.getRegisteredControllers();
            expect(controllers).toContain('Controller1');
            expect(controllers).toContain('Controller2');
        });

        it('should provide full container status', () => {
            container.registerInstance('Service1', { name: 's1' });
            container.registerInstance('Service2', { name: 's2' });

            const ctrl = { init: () => {} };
            container.registerController('Controller1', ctrl);
            container.initController('Controller1', ['Service1']);

            const status = container.getStatus();
            expect(status.serviceCount).toBe(2);
            expect(status.controllerCount).toBe(1);
            expect(status.initializedControllers).toContain('Controller1');
        });
    });

    describe('Error Handling', () => {
        it('should throw descriptive error for missing dependency', () => {
            container.registerFactory('TestService', class TestService {
                constructor({ MissingDep }) {
                    this.dep = MissingDep;
                }
            }, ['MissingDep']);

            expect(() => {
                container.create('TestService');
            }).toThrow(/MissingDep/);
        });

        it('should throw when factory is not a constructor', () => {
            expect(() => {
                container.registerFactory('BadService', null, []);
            }).toThrow(/constructor/i);
        });

        it('should handle initialization errors gracefully', () => {
            const failingController = {
                init: () => {
                    throw new Error('Init failed');
                }
            };

            container.registerInstance('Dep1', { name: 'dep1' });
            container.registerController('FailingController', failingController);

            expect(() => {
                container.initController('FailingController', ['Dep1']);
            }).toThrow('Init failed');
        });
    });

    describe('Clear and Reset', () => {
        it('should clear all registrations', () => {
            container.registerInstance('Service1', { name: 's1' });
            container.registerInstance('Service2', { name: 's2' });

            const ctrl = { init: () => {} };
            container.registerController('Controller1', ctrl);

            container.clear();

            expect(container.has('Service1')).toBe(false);
            expect(container.has('Service2')).toBe(false);
            expect(container.has('Controller1')).toBe(false);
        });

        it('should reset dependency graph', () => {
            container.registerInstance('Service1', { name: 's1' });

            const ctrl = { init: () => {} };
            container.registerController('Controller1', ctrl);
            container.initController('Controller1', ['Service1']);

            let graph = container.getDependencyGraph();
            expect(graph.services.length).toBeGreaterThan(0);

            container.clear();

            graph = container.getDependencyGraph();
            expect(graph.services).toEqual([]);
            expect(Object.keys(graph.controllers)).toEqual([]);
        });
    });
});
