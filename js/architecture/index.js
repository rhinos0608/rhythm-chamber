/**
 * Architecture Layer Index
 *
 * Exports all architecture layer modules for organized imports.
 *
 * Layer Structure:
 * - Business Logic Layer (WHAT): Defines valid data and business rules
 * - Application Logic Layer (HOW): Orchestrates operations and transformations
 * - Infrastructure Layer (HOW TO IMPLEMENT): Low-level storage and operations
 *
 * @see ARCHITECTURE.md for detailed documentation
 */

// Business Logic Layer
export * as VectorBusiness from './vector-store-business-layer.js';

// Application Logic Layer
export * as SessionApplication from './session-persistence-application-layer.js';

// Infrastructure Layer
export * as VectorInfrastructure from './vector-store-infrastructure-layer.js';

// Re-export individual modules for convenience
export {
    // Vector Business
    validateVectorDimensions,
    validateVectorElements,
    validateVectorConsistency,
    buildVectorValidationReport,
    VALIDATION_ERRORS,
    VECTOR_DIMENSIONS
} from './vector-store-business-layer.js';

export {
    // Session Application
    filterMessagesForStorage,
    generateSessionTitle,
    buildSessionMetadata,
    prepareSessionForSave,
    DEFAULT_SESSION_TITLE,
    MAX_TITLE_LENGTH,
    MAX_SAVED_MESSAGES
} from './session-persistence-application-layer.js';

export {
    // Vector Infrastructure
    createSharedVectorBuffer,
    buildSharedVectorPayload,
    isSharedArrayBufferAvailable,
    InfrastructureError,
    INFRASTRUCTURE_ERRORS,
    BYTES_PER_FLOAT32
} from './vector-store-infrastructure-layer.js';
