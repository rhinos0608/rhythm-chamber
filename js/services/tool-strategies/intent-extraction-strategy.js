/**
 * Intent Extraction Strategy (Level 4)
 * Extracts intent from user message and executes functions directly
 * Used as last resort when model cannot produce function calls
 * 
 * @module tool-strategies/intent-extraction-strategy
 */

import { BaseToolStrategy } from './base-strategy.js';

export class IntentExtractionStrategy extends BaseToolStrategy {
    get level() { return 4; }

    canHandle(responseMessage, capabilityLevel) {
        // This strategy is a last resort with lower confidence
        // It can handle any case where intent can be extracted from user message
        // However, it returns low confidence to defer to better strategies
        return this.confidence(0, 'Intent extraction handles via shouldAttemptExtraction');
    }

    /**
     * Get confidence for intent extraction (called by orchestrator)
     * @param {string} userMessage - Original user message
     * @returns {{ confidence: number, reason: string }}
     */
    getIntentConfidence(userMessage) {
        if (!userMessage || !this.FunctionCallingFallback?.extractQueryIntent) {
            return this.confidence(0, 'No user message or extraction not available');
        }

        const intent = this.FunctionCallingFallback.extractQueryIntent(userMessage);
        if (!intent) {
            return this.confidence(0, 'No intent extracted');
        }

        // Lower confidence as this is a fallback strategy
        // Confidence increases slightly based on intent specificity
        const confidence = intent.arguments && Object.keys(intent.arguments).length > 0 ? 0.6 : 0.5;
        return this.confidence(confidence, `Extracted intent: ${intent.function}`);
    }

    /**
     * Check if we should attempt intent extraction
     * @param {string} userMessage - Original user message
     * @returns {boolean}
     */
    shouldAttemptExtraction(userMessage) {
        return this.getIntentConfidence(userMessage).confidence > 0;
    }

    async execute(context) {
        const {
            responseMessage,
            providerConfig,
            key,
            onProgress,
            userMessage,
            streamsData,
            buildSystemPrompt,
            callLLM
        } = context;

        // HNW Guard: Check FunctionCallingFallback exists before calling extractQueryIntent
        // Mirrors the null check used in shouldAttemptExtraction()
        if (!this.FunctionCallingFallback?.extractQueryIntent) {
            console.warn('[IntentExtractionStrategy] FunctionCallingFallback not available');
            return { responseMessage };
        }

        // HNW Guard: Also verify executeFunctionCalls exists before we proceed
        const fc = this.FunctionCallingFallback;
        if (typeof fc.executeFunctionCalls !== 'function') {
            console.warn('[IntentExtractionStrategy] FunctionCallingFallback.executeFunctionCalls not available');
            return { responseMessage };
        }

        const intent = fc.extractQueryIntent(userMessage);

        if (!intent) {
            return { responseMessage };
        }

        console.log(`[IntentExtractionStrategy] Level 4: Extracted intent "${intent.function}" from user message`);

        if (onProgress) {
            onProgress({ type: 'fallback_intent', level: 4, function: intent.function });
            onProgress({ type: 'tool_start', tool: intent.function });
        }

        // Execute the extracted function using the validated reference
        // Use AbortSignal pattern to properly abort execution on timeout
        let results;
        try {
            const abortController = new AbortController();
            const timeoutId = setTimeout(() => abortController.abort(), this.TIMEOUT_MS);

            results = await fc.executeFunctionCalls([intent], streamsData, {
                signal: abortController.signal
            });

            clearTimeout(timeoutId);
        } catch (execError) {
            // Handle AbortError from timeout
            if (execError.name === 'AbortError') {
                execError.message = `Fallback function calls timed out after ${this.TIMEOUT_MS}ms`;
            }

            console.error('[IntentExtractionStrategy] Execution failed:', execError);
            if (onProgress) onProgress({ type: 'tool_end', tool: intent.function, error: true });
            return {
                earlyReturn: {
                    status: 'error',
                    content: `Function calls failed: ${execError.message}. Please try again or select a different model.`,
                    role: 'assistant',
                    isFunctionError: true
                }
            };
        }

        const hasResults = Array.isArray(results) && results.length > 0;
        const safeResults = hasResults ? results : [];
        const result = hasResults ? results[0] : undefined;
        if (onProgress && hasResults) {
            onProgress({ type: 'tool_end', tool: intent.function, result: result?.result });
        }

        if (result && !result.result?.error) {
            // Inject results into the response for a data-grounded answer
            const resultsMessage = this.FunctionCallingFallback?.buildFunctionResultsMessage?.(safeResults) ||
                `Function results: ${JSON.stringify(safeResults, null, 2)}`;

            // Make a new call with the data context
            const enrichedMessages = [
                { role: 'system', content: buildSystemPrompt() },
                ...this.getHistory(),
                { role: 'user', content: resultsMessage, isSystem: true }
            ];

            if (onProgress) onProgress({ type: 'thinking' });

            try {
                const enrichedResponse = await callLLM(providerConfig, key, enrichedMessages, undefined);
                // HNW Fix: Safely handle missing choices array
                const choices = Array.isArray(enrichedResponse?.choices) ? enrichedResponse.choices : [];
                const message = choices[0]?.message;
                if (message) {
                    return { responseMessage: message };
                }
                // Fallback if no message in response
                console.warn('[IntentExtractionStrategy] No message in enrichedResponse, using data context');
                const dataContext = JSON.stringify(result?.result ?? {}, null, 2);
                return {
                    responseMessage: {
                        role: 'assistant',
                        content: `${responseMessage?.content || ''}\n\n**Data from your listening history:**\n\`\`\`json\n${dataContext}\n\`\`\``
                    }
                };
            } catch (error) {
                console.error('[IntentExtractionStrategy] Enriched response failed:', error);
                // Return the original response with data context added
                const dataContext = JSON.stringify(result?.result ?? {}, null, 2);
                return {
                    responseMessage: {
                        role: 'assistant',
                        content: `${responseMessage?.content || ''}\n\n**Data from your listening history:**\n\`\`\`json\n${dataContext}\n\`\`\``
                    }
                };
            }
        }

        // No successful function execution
        return { responseMessage };
    }
}

export default IntentExtractionStrategy;
