import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock window.OperationLock
function createMockOperationLock() {
    const activeLocks = [];
    return {
        getActiveLocks: () => [...activeLocks],
        acquire: vi.fn((operation) => {
            activeLocks.push(operation);
            return Promise.resolve(`lock-${operation}`);
        }),
        release: vi.fn((operation, lockId) => {
            const index = activeLocks.indexOf(operation);
            if (index > -1) {
                activeLocks.splice(index, 1);
            }
        }),
        _activeLocks: activeLocks
    };
}

describe('LockPolicy Hierarchy', () => {
    let LockPolicy;
    let mockOperationLock;

    beforeEach(async () => {
        vi.resetModules();
        
        // Setup mock window
        mockOperationLock = createMockOperationLock();
        globalThis.window = {
            OperationLock: mockOperationLock
        };
        
        // Import LockPolicy module
        LockPolicy = (await import('../../js/services/lock-policy-coordinator.js')).LockPolicy;
    });

    describe('getLevel', () => {
        it('should return correct level for system operations', () => {
            expect(LockPolicy.getLevel('privacy_clear')).toBe(0);
            expect(LockPolicy.getLevel('file_processing')).toBe(0);
            expect(LockPolicy.getLevel('embedding_generation')).toBe(0);
        });

        it('should return correct level for data operations', () => {
            expect(LockPolicy.getLevel('chat_save')).toBe(1);
            expect(LockPolicy.getLevel('spotify_fetch')).toBe(1);
        });

        it('should return correct level for user operations', () => {
            expect(LockPolicy.getLevel('user_message')).toBe(2);
            expect(LockPolicy.getLevel('user_query')).toBe(2);
        });

        it('should return default level for unknown operations', () => {
            expect(LockPolicy.getLevel('unknown_operation')).toBe(2);
        });
    });

    describe('getOperationsByLevel', () => {
        it('should return all operations at level 0', () => {
            const level0Ops = LockPolicy.getOperationsByLevel(0);
            expect(level0Ops).toContain('privacy_clear');
            expect(level0Ops).toContain('file_processing');
            expect(level0Ops).toContain('embedding_generation');
            expect(level0Ops.length).toBe(3);
        });

        it('should return all operations at level 1', () => {
            const level1Ops = LockPolicy.getOperationsByLevel(1);
            expect(level1Ops).toContain('chat_save');
            expect(level1Ops).toContain('spotify_fetch');
            expect(level1Ops.length).toBe(2);
        });

        it('should return all operations at level 2', () => {
            const level2Ops = LockPolicy.getOperationsByLevel(2);
            expect(level2Ops).toContain('user_message');
            expect(level2Ops).toContain('user_query');
            expect(level2Ops.length).toBe(2);
        });

        it('should return empty array for unknown level', () => {
            const unknownOps = LockPolicy.getOperationsByLevel(99);
            expect(unknownOps).toEqual([]);
        });
    });

    describe('getMaxLevel', () => {
        it('should return maximum level among operations', () => {
            expect(LockPolicy.getMaxLevel(['privacy_clear', 'chat_save', 'user_message'])).toBe(2);
            expect(LockPolicy.getMaxLevel(['privacy_clear', 'chat_save'])).toBe(1);
            expect(LockPolicy.getMaxLevel(['privacy_clear'])).toBe(0);
        });

        it('should return default level for empty array', () => {
            expect(LockPolicy.getMaxLevel([])).toBe(2);
        });
    });

    describe('getMinLevel', () => {
        it('should return minimum level among operations', () => {
            expect(LockPolicy.getMinLevel(['privacy_clear', 'chat_save', 'user_message'])).toBe(0);
            expect(LockPolicy.getMinLevel(['chat_save', 'user_message'])).toBe(1);
            expect(LockPolicy.getMinLevel(['user_message'])).toBe(2);
        });

        it('should return default level for empty array', () => {
            expect(LockPolicy.getMinLevel([])).toBe(2);
        });
    });

    describe('canAcquireInOrder', () => {
        it('should allow acquiring operations in correct order (lower to higher level)', () => {
            // Start with no active operations
            const result = LockPolicy.canAcquireInOrder(['privacy_clear'], []);
            expect(result.allowed).toBe(true);
            expect(result.conflicts).toEqual([]);
        });

        it('should block acquiring operations at same level when conflicts exist', () => {
            // Both are level 1
            const result = LockPolicy.canAcquireInOrder(['chat_save'], ['spotify_fetch']);
            expect(result.allowed).toBe(false);
            expect(result.conflicts).toEqual(['spotify_fetch']);
            expect(result.reason).toContain('Blocked by');
        });

        it('should prevent acquiring lower level after higher level (deadlock prevention)', () => {
            // user_message (level 2) is active, trying to acquire privacy_clear (level 0)
            const result = LockPolicy.canAcquireInOrder(['privacy_clear'], ['user_message']);
            expect(result.allowed).toBe(false);
            expect(result.resolution).toBe('abort');
            expect(result.reason).toContain('Blocked by');
        });

        it('should prevent acquiring user operation after system operation', () => {
            // privacy_clear (level 0) is active, trying to acquire user_message (level 2)
            const result = LockPolicy.canAcquireInOrder(['user_message'], ['privacy_clear']);
            expect(result.allowed).toBe(false);
            expect(result.resolution).toBe('abort');
            expect(result.reason).toContain('Blocked by');
        });

        it('should block acquiring data operation after system operation', () => {
            // privacy_clear (level 0) is active, trying to acquire chat_save (level 1)
            const result = LockPolicy.canAcquireInOrder(['chat_save'], ['privacy_clear']);
            expect(result.allowed).toBe(false);
            expect(result.conflicts).toEqual(['privacy_clear']);
            expect(result.reason).toContain('Blocked by');
        });

        it('should allow acquiring user operation after data operation', () => {
            // chat_save (level 1) is active, trying to acquire user_message (level 2)
            const result = LockPolicy.canAcquireInOrder(['user_message'], ['chat_save']);
            expect(result.allowed).toBe(true);
            expect(result.conflicts).toEqual([]);
        });

        it('should still check for conflicts before checking hierarchy', () => {
            // privacy_clear (level 0) conflicts with everything
            const result = LockPolicy.canAcquireInOrder(['privacy_clear'], ['file_processing']);
            expect(result.allowed).toBe(false);
            expect(result.conflicts).toContain('file_processing');
        });

        it('should handle multiple requested operations', () => {
            // Try to acquire both system and user operations
            const result = LockPolicy.canAcquireInOrder(['privacy_clear', 'user_message'], []);
            expect(result.allowed).toBe(true);
            expect(result.conflicts).toEqual([]);
        });

        it('should handle multiple active operations', () => {
            // Both system and data operations are active
            const result = LockPolicy.canAcquireInOrder(['user_message'], ['privacy_clear', 'chat_save']);
            expect(result.allowed).toBe(false);
            expect(result.resolution).toBe('abort');
            expect(result.reason).toContain('Blocked by');
        });
    });

    describe('canAcquireInOrder with OperationLock', () => {
        it('should use active operations from OperationLock when not provided', async () => {
            // Acquire a lock
            await mockOperationLock.acquire('privacy_clear');
            
            // Try to acquire user operation (should fail due to hierarchy)
            const result = LockPolicy.canAcquireInOrder(['user_message']);
            expect(result.allowed).toBe(false);
            expect(result.resolution).toBe('abort');
            expect(result.reason).toContain('Blocked by');
        });

        it('should allow acquiring when OperationLock has no active locks', async () => {
            // Release all locks
            mockOperationLock._activeLocks.length = 0;
            
            // Try to acquire operation
            const result = LockPolicy.canAcquireInOrder(['privacy_clear']);
            expect(result.allowed).toBe(true);
            expect(result.conflicts).toEqual([]);
        });
    });

    describe('canAcquireInOrder with conflicts', () => {
        it('should prioritize conflict detection over hierarchy check', () => {
            // privacy_clear conflicts with everything, even at same level
            const result = LockPolicy.canAcquireInOrder(['privacy_clear'], ['file_processing']);
            expect(result.allowed).toBe(false);
            expect(result.conflicts).toContain('file_processing');
            expect(result.reason).toContain('Blocked by');
        });

        it('should detect conflicts even when hierarchy is satisfied', () => {
            // chat_save and spotify_fetch conflict, both at level 1
            const result = LockPolicy.canAcquireInOrder(['chat_save'], ['spotify_fetch']);
            expect(result.allowed).toBe(false);
            expect(result.conflicts).toContain('spotify_fetch');
        });
    });
});
