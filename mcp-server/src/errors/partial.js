/**
 * Partial Result Error Types
 * For pessimistic design - return useful data even on failure
 */

/**
 * Create a response with metadata for confidence signaling
 */
export function createResponse(success, data, metadata = {}) {
  return {
    success,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      confidence: metadata.confidence || 'HIGH',
      completeness: metadata.completeness || 100,
      warnings: metadata.warnings || [],
      ...metadata
    }
  };
}

/**
 * Create a partial result response (success but incomplete)
 */
export function createPartialResponse(data, warnings = {}) {
  return createResponse(true, data, {
    confidence: 'MEDIUM',
    completeness: warnings.completeness || 60,
    warnings: [
      ...(warnings.messages || []),
      ...(warnings.suggestions ? warnings.suggestions.map(s => `💡 ${s}`) : [])
    ]
  });
}

/**
 * Create an error response with partial data if available
 */
export function createErrorResponse(error, partialData = null) {
  const response = {
    content: [{
      type: 'text',
      text: partialData ? partialData.text : `Error: ${error.message}`
    }],
    isError: true,
    metadata: {
      timestamp: new Date().toISOString(),
      confidence: partialData ? 'MEDIUM' : 'LOW',
      completeness: partialData ? 50 : 0,
      warnings: partialData ? partialData.warnings || [] : []
    }
  };

  // If we have partial data, mark it as partial success
  if (partialData) {
    response.isError = false;
    response.metadata.partial = true;
    response.metadata.error = error.message;
  }

  return response;
}

/**
 * Calculate confidence based on analysis completeness
 */
export function calculateConfidence(completeness, errorCount = 0) {
  if (completeness >= 90 && errorCount === 0) return 'HIGH';
  if (completeness >= 50 && errorCount < 5) return 'MEDIUM';
  return 'LOW';
}
