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
        // This is the fallback - only use if higher levels didn't handle
        // Check is done in the strategy orchestrator after other strategies fail
        return false; // Handled specially by orchestrator
    }

    /**
     * Check if we should attempt intent extraction
     * @param {string} userMessage - Original user message
     * @returns {boolean}
     */
    shouldAttemptExtraction(userMessage) {
        if (!userMessage || !this.FunctionCallingFallback?.extractQueryIntent) {
            return false;
        }
        const intent = this.FunctionCallingFallback.extractQueryIntent(userMessage);
        return intent !== null;
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

        const intent = this.FunctionCallingFallback.extractQueryIntent(userMessage);

        if (!intent) {
            return { responseMessage };
        }

        console.log(`[IntentExtractionStrategy] Level 4: Extracted intent "${intent.function}" from user message`);

        if (onProgress) {
            onProgress({ type: 'fallback_intent', level: 4, function: intent.function });
            onProgress({ type: 'tool_start', tool: intent.function });
        }

        // Execute the extracted function
        let results;
        try {
            results = await Promise.race([
                this.FunctionCallingFallback.executeFunctionCalls([intent], streamsData),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error(`Fallback function calls timed out after ${this.TIMEOUT_MS}ms`)),
                        this.TIMEOUT_MS
                    )
                )
            ]);
        } catch (timeoutError) {
            console.error('[IntentExtractionStrategy] Execution failed:', timeoutError);
            if (onProgress) onProgress({ type: 'tool_end', tool: intent.function, error: true });
            return {
                earlyReturn: {
                    status: 'error',
                    content: `Function calls timed out: ${timeoutError.message}. Please try again or select a different model.`,
                    role: 'assistant',
                    isFunctionError: true
                }
            };
        }

        const result = results[0];
        if (onProgress) {
            onProgress({ type: 'tool_end', tool: intent.function, result: result?.result });
        }

        if (result && !result.result?.error) {
            // Inject results into the response for a data-grounded answer
            const resultsMessage = this.FunctionCallingFallback?.buildFunctionResultsMessage?.(results) ||
                `Function results: ${JSON.stringify(results, null, 2)}`;

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
                const dataContext = JSON.stringify(result.result, null, 2);
                return {
                    responseMessage: {
                        role: 'assistant',
                        content: `${responseMessage?.content || ''}\n\n**Data from your listening history:**\n\`\`\`json\n${dataContext}\n\`\`\``
                    }
                };
            } catch (error) {
                console.error('[IntentExtractionStrategy] Enriched response failed:', error);
                // Return the original response with data context added
                const dataContext = JSON.stringify(result.result, null, 2);
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
