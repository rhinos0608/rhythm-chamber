const STORAGE_EVENT_SCHEMAS = {
    'storage:updated': {
        description: 'Data saved to storage',
        payload: { store: 'string', key: 'string?', count: 'number?' },
    },
    'storage:cleared': {
        description: 'Storage cleared',
        payload: { store: 'string' },
    },
    'storage:connection_blocked': {
        description: 'Database upgrade blocked by other tabs',
        payload: { reason: 'string', message: 'string' },
    },
    'storage:connection_retry': {
        description: 'Database connection retry attempt',
        payload: {
            attempt: 'number',
            maxAttempts: 'number',
            nextRetryMs: 'number',
            error: 'string',
        },
    },
    'storage:connection_failed': {
        description: 'Database connection permanently failed',
        payload: { attempts: 'number', error: 'string', recoverable: 'boolean' },
    },
    'storage:connection_established': {
        description: 'Database connection successfully established',
        payload: { attempts: 'number' },
    },
    'storage:error': {
        description: 'Storage error occurred',
        payload: { type: 'string', error: 'string' },
    },
    'storage:quota_warning': {
        description: 'Storage quota warning (80% threshold)',
        payload: { usageBytes: 'number', quotaBytes: 'number', percentage: 'number' },
    },
    'storage:quota_critical': {
        description: 'Storage quota critical (95% threshold, writes blocked)',
        payload: { usageBytes: 'number', quotaBytes: 'number', percentage: 'number' },
    },
    'storage:quota_normal': {
        description: 'Storage quota returned to normal',
        payload: { usageBytes: 'number', quotaBytes: 'number', percentage: 'number' },
    },
    'storage:autorepair_config_changed': {
        description: 'Auto-repair configuration changed',
        payload: { config: 'object' },
    },
    'storage:autorepair_toggled': {
        description: 'Auto-repair enabled/disabled',
        payload: { enabled: 'boolean' },
    },
    'storage:repair_action': {
        description: 'Repair action logged',
        payload: {
            timestamp: 'string',
            issueType: 'string',
            action: 'string',
            success: 'boolean',
            details: 'object?',
        },
    },
};

export { STORAGE_EVENT_SCHEMAS };
