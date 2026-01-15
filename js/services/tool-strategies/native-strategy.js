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
        return capabilityLevel === 1 &&
            responseMessage?.tool_calls?.length > 0;
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

        // Execute each function call
        for (const toolCall of responseMessage.tool_calls) {
            // Check circuit breaker before each call
            const breakerCheck = this.checkCircuitBreaker(onProgress);
            if (breakerCheck.blocked) {
                return { earlyReturn: breakerCheck.errorReturn };
            }

            const functionName = toolCall.function.name;
            const rawArgs = toolCall.function.arguments || '{}';

            // HNW Fix: Emit tool_start BEFORE parsing so listeners see start before any error
            if (onProgress) onProgress({ type: 'tool_start', tool: functionName });

            // Parse arguments
            let args;
            try {
                args = JSON.parse(rawArgs);
            } catch (parseError) {
                console.warn(`[NativeToolStrategy] Invalid arguments for ${functionName}:`, rawArgs);
                if (onProgress) onProgress({ type: 'tool_end', tool: functionName, error: true });
                return {
                    earlyReturn: {
                        status: 'error',
                        content: this.buildParseError(functionName, rawArgs),
                        role: 'assistant',
                        isFunctionError: true
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
                if (onProgress) onProgress({ type: 'tool_end', tool: functionName, error: true });
                return {
                    earlyReturn: {
                        status: 'error',
                        content: `Function call '${functionName}' failed: ${execError.message}. Please try again or select a different model.`,
                        role: 'assistant',
                        isFunctionError: true
                    }
                };
            }

            console.log(`[NativeToolStrategy] Result:`, result);
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

        const response = await callLLM(providerConfig, key, followUpMessages, undefined);
        // HNW Fix: Safely handle missing choices array
        const choices = Array.isArray(response?.choices) ? response.choices : [];
        return { responseMessage: choices[0]?.message ?? null };
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
