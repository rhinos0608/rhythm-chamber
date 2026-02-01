/**
 * Prompt Injection Strategy (Levels 2/3)
 * Handles function calls parsed from text responses using <function_call> tags
 *
 * @module tool-strategies/prompt-injection-strategy
 */

import { BaseToolStrategy } from './base-strategy.js';

export class PromptInjectionStrategy extends BaseToolStrategy {
    get level() {
        return 2;
    }

    /**
     * Persist partial results to conversation history
     * Extracted to eliminate duplication between circuit breaker and error handling
     * @param {string} content - Original assistant content
     * @param {Array} results - Accumulated results so far
     * @param {string} reason - Reason for partial persistence (for logging)
     */
    async _persistPartialResults(content, results, reason) {
        if (results.length === 0) return;

        await this.addToHistory({
            role: 'assistant',
            content: content,
        });
        const partialResultsMessage =
            this.FunctionCallingFallback?.buildFunctionResultsMessage?.(results) ||
            `Partial results (${reason}): ${JSON.stringify(results, null, 2)}`;
        await this.addToHistory({
            role: 'user',
            content: partialResultsMessage,
            isSystem: true,
        });
    }

    canHandle(responseMessage, capabilityLevel) {
        // Requires capability level 2 or higher
        if (capabilityLevel < 2) {
            return this.confidence(0, 'Capability level too low');
        }

        const content = responseMessage?.content || '';
        const parsedCalls =
            this.FunctionCallingFallback?.parseFunctionCallsFromText?.(content) || [];

        if (parsedCalls.length === 0) {
            return this.confidence(0, 'No function calls parsed from text');
        }

        // Moderate-high confidence, scaled by number of calls found
        // More calls = slightly higher confidence (max 0.85)
        const confidence = Math.min(0.85, 0.75 + parsedCalls.length * 0.02);
        return this.confidence(
            confidence,
            `Parsed ${parsedCalls.length} function call(s) from text`
        );
    }

    async execute(context) {
        const {
            responseMessage,
            providerConfig,
            key,
            onProgress,
            capabilityLevel,
            streamsData,
            buildSystemPrompt,
            callLLM,
        } = context;

        const content = responseMessage?.content || '';

        // HNW Fix: Use optional chaining for parseFunctionCallsFromText to prevent crash when undefined
        const parsedCalls = this.FunctionCallingFallback?.parseFunctionCallsFromText?.(content);

        // Early return if FunctionCallingFallback is unavailable or no calls parsed
        if (!parsedCalls || parsedCalls.length === 0) {
            console.warn(
                '[PromptInjectionStrategy] FunctionCallingFallback unavailable or no calls parsed'
            );
            return { responseMessage };
        }

        console.log(
            `[PromptInjectionStrategy] Level ${capabilityLevel}: Parsed ${parsedCalls.length} function calls from text`
        );

        if (onProgress) {
            onProgress({
                type: 'fallback_parsing',
                level: capabilityLevel,
                calls: parsedCalls.length,
            });
        }

        // Execute each parsed function call
        // HNW Fix: Accumulate partial results to persist work even on failure
        const results = [];
        for (const call of parsedCalls) {
            // Check circuit breaker before each call
            const breakerCheck = this.checkCircuitBreaker(onProgress);
            if (breakerCheck.blocked) {
                // Persist any partial successes before returning error
                await this._persistPartialResults(content, results, 'circuit breaker tripped');
                return { earlyReturn: breakerCheck.errorReturn };
            }

            if (onProgress) onProgress({ type: 'tool_start', tool: call.name });

            // Execute with timeout using AbortSignal pattern to properly abort execution
            let result;
            try {
                const abortController = new AbortController();
                const timeoutId = setTimeout(() => abortController.abort(), this.TIMEOUT_MS);

                result = (await this.Functions?.execute?.(call.name, call.arguments, streamsData, {
                    signal: abortController.signal,
                })) ?? { error: 'Functions module not available' };

                clearTimeout(timeoutId);
            } catch (execError) {
                // Handle AbortError from timeout
                if (execError.name === 'AbortError') {
                    execError.message = `Function ${call.name} timed out after ${this.TIMEOUT_MS}ms`;
                }

                console.error(
                    `[PromptInjectionStrategy] Execution failed for ${call.name}:`,
                    execError
                );
                if (onProgress) onProgress({ type: 'tool_end', tool: call.name, error: true });

                // HNW Fix: Persist any partial successes to history before returning error
                // Note: tool_end events for successful calls were already emitted during the loop
                // so we don't re-emit them here to avoid duplicate progress events
                await this._persistPartialResults(
                    content,
                    results,
                    `execution failed: ${execError.message}`
                );

                return {
                    earlyReturn: {
                        status: 'error',
                        content: `Function '${call.name}' failed: ${execError.message}. Please try again or select a different model.`,
                        role: 'assistant',
                        isFunctionError: true,
                    },
                };
            }

            if (onProgress) onProgress({ type: 'tool_end', tool: call.name, result });
            results.push({ name: call.name, result });
        }

        // HNW Fix: Use optional chaining for buildFunctionResultsMessage and provide fallback
        const resultsMessage =
            this.FunctionCallingFallback?.buildFunctionResultsMessage?.(results) ??
            `Function results: ${JSON.stringify(results, null, 2)}`;

        // Add responses to conversation history
        await this.addToHistory({
            role: 'assistant',
            content: content,
        });
        await this.addToHistory({
            role: 'user',
            content: resultsMessage,
            isSystem: true,
        });

        // Make follow-up call with function results
        const followUpMessages = [
            { role: 'system', content: buildSystemPrompt() },
            ...this.getHistory(),
        ];

        if (onProgress) onProgress({ type: 'thinking' });

        try {
            const followUpResponse = await callLLM(
                providerConfig,
                key,
                followUpMessages,
                undefined
            );
            // HNW Fix: Safely handle missing/empty choices array
            const choices = Array.isArray(followUpResponse?.choices)
                ? followUpResponse.choices
                : [];
            const message = choices.find(c => c?.message)?.message ?? followUpResponse?.message;

            if (message) {
                return { responseMessage: message };
            }

            // Fallback if no valid message found
            console.warn(
                '[PromptInjectionStrategy] No valid message in followUpResponse, returning direct results'
            );
            const directResponse = results
                .map(r => `${r.name}: ${JSON.stringify(r.result, null, 2)}`)
                .join('\n\n');
            return {
                responseMessage: {
                    role: 'assistant',
                    content: `I found this data for you:\n\n${directResponse}`,
                },
            };
        } catch (error) {
            console.error('[PromptInjectionStrategy] Follow-up call failed:', error);
            // Return results directly if follow-up fails
            const directResponse = results
                .map(r => `${r.name}: ${JSON.stringify(r.result, null, 2)}`)
                .join('\n\n');
            return {
                responseMessage: {
                    role: 'assistant',
                    content: `I found this data for you:\n\n${directResponse}`,
                },
            };
        }
    }
}

export default PromptInjectionStrategy;
