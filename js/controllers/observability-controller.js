/**
 * Observability Controller (Backward Compatibility Shim)
 *
 * This file now re-exports from the refactored location to maintain
 * backward compatibility with existing imports.
 *
 * The actual implementation has been moved to:
 * js/observability/controller.js
 *
 * @module ObservabilityController
 * @deprecated Import from js/observability/controller.js instead
 * @author Rhythm Chamber Architecture Team
 * @version 2.0.0
 */

// Re-export from new location
export { ObservabilityController, default } from '../observability/controller.js';
