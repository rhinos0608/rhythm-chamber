/**
 * Native Tool Strategy (Level 1)
 * Handles native OpenAI-style tool_calls from LLM responses
 * 
 * @module tool-strategies/native-strategy
 */

import { BaseToolStrategy } from './base-strategy.js';

export class NativeToolStrategy extends BaseToolStrategy {
    get level() { return 1; }

    canHandle(responseMessage, capabilityLevel) {
        // Only handle native tool calls at capability level 1
        if (capabilityLevel !== 1) {
            return this.confidence(0, 'Capability level mismatch');
        }

        const toolCalls = responseMessage?.tool_calls;
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
            return this.confidence(0, 'No tool_calls in response');
        }

        // High confidence when native tool_calls present
        return this.confidence(0.95, `Native tool_calls detected: ${toolCalls.length} call(s)`);
    }

    async execute(context) {
        const {
            responseMessage,
            providerConfig,
            key,
            onProgress,
            streamsData,
            buildSystemPrompt,
            callLLM
        } = context;

        console.log('[NativeToolStrategy] Processing native tool calls:',
            responseMessage.tool_calls.map(tc => tc?.function?.name || tc?.id || '<missing>'));

        // Add assistant's tool call message to conversation
        this.addToHistory({
            role: 'assistant',
            content: responseMessage.content || null,
            tool_calls: responseMessage.tool_calls
        });

        // Track if any function calls returned errors
        let hadFunctionErrors = false;
        const functionErrors = [];

        // Execute each function call
        for (const toolCall of responseMessage.tool_calls) {
            // Check circuit breaker before each call
            const breakerCheck = this.checkCircuitBreaker(onProgress);
            if (breakerCheck.blocked) {
                return { earlyReturn: breakerCheck.errorReturn };
            }

            const functionCallData = toolCall?.function || {};
            const functionName = functionCallData.name || '<unknown>';
            const rawArgs = typeof functionCallData.arguments === 'string'
                ? functionCallData.arguments
                : JSON.stringify(functionCallData.arguments ?? {});

            // HNW Fix: Emit tool_start BEFORE parsing so listeners see start before any error
            if (onProgress) onProgress({ type: 'tool_start', tool: functionName });

            // Parse arguments
            let args;
            try {
                args = JSON.parse(rawArgs);
            } catch (parseError) {
                console.warn(`[NativeToolStrategy] Invalid arguments for ${functionName}:`, rawArgs);
                // Track parse error for proper error reporting
                hadFunctionErrors = true;
                functionErrors.push({ function: functionName, error: `Invalid arguments: ${parseError.message}` });
                if (onProgress) onProgress({ type: 'tool_end', tool: functionName, error: true });
                return {
                    earlyReturn: {
                        status: 'error',
                        content: this.buildParseError(functionName, rawArgs),
                        role: 'assistant',
                        isFunctionError: true,
                        hadFunctionErrors: true,
                        functionErrors: [{ function: functionName, error: `Invalid arguments: ${parseError.message}` }]
                    }
                };
            }

            console.log(`[NativeToolStrategy] Executing: ${functionName}`, args);

            // Execute with timeout
            let result;
            try {
                result = await this.executeWithTimeout(functionName, args, streamsData);
            } catch (execError) {
                console.error(`[NativeToolStrategy] Execution failed:`, execError);
                // Track execution error for proper error reporting
                hadFunctionErrors = true;
                functionErrors.push({ function: functionName, error: execError.message });
                if (onProgress) onProgress({ type: 'tool_end', tool: functionName, error: true });
                const errorReturn = {
                    earlyReturn: {
                        status: 'error',
                        content: `Function call '${functionName}' failed: ${execError.message}. Please try again or select a different model.`,
                        role: 'assistant',
                        isFunctionError: true,
                        hadFunctionErrors: true,
                        functionErrors: [{ function: functionName, error: execError.message }]
                    }
                };
                return errorReturn;
            }

            console.log(`[NativeToolStrategy] Result:`, result);

            // Check if function returned an error object
            if (result && typeof result === 'object' && 'error' in result) {
                hadFunctionErrors = true;
                functionErrors.push({ function: functionName, error: result.error });
                console.warn(`[NativeToolStrategy] Function ${functionName} returned error:`, result.error);
            }

            if (onProgress) onProgress({ type: 'tool_end', tool: functionName, result });

            // Add tool result to conversation
            this.addToHistory({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
            });
        }

        // Make follow-up call with function results
        const followUpMessages = [
            { role: 'system', content: buildSystemPrompt() },
            ...this.getHistory()
        ];

        if (onProgress) onProgress({ type: 'thinking' });

        try {
            const response = await callLLM(providerConfig, key, followUpMessages, undefined);
            // HNW Fix: Safely handle missing choices array
            const choices = Array.isArray(response?.choices) ? response.choices : [];
            const result = {
                responseMessage: choices[0]?.message ?? null
            };
            // Include function error information if any occurred
            if (hadFunctionErrors) {
                result.functionErrors = functionErrors;
                result.hadFunctionErrors = true;
            }
            return result;
        } catch (error) {
            console.error('[NativeToolStrategy] Follow-up LLM call failed:', error);
            const result = { responseMessage: null };
            if (hadFunctionErrors) {
                result.functionErrors = functionErrors;
                result.hadFunctionErrors = true;
            }
            return result;
        }
    }

    /**
     * Build error message for parse failures
     */
    buildParseError(functionName, rawArgs) {
        const isCodeLike = /```|function\s|\bconst\b|\blet\b|=>|return\s/i.test(rawArgs);
        if (isCodeLike) {
            return `The AI tried to call '${functionName}' but only shared code instead of executing it. Ask it to run the tool directly (no code blocks) or try again.`;
        }
        return `Function call '${functionName}' failed because the tool arguments were invalid. Please try again or select a different model.`;
    }
}

export default NativeToolStrategy;
