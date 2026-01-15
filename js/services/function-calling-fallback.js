/**
 * Function Calling Fallback Service
 * 
 * Implements a 4-level fallback network for function calling when
 * native tool_calls are not supported by the LLM provider/model.
 * 
 * HNW Considerations:
 * - Hierarchy: Clear fallback chain (Level 1 → 2 → 3 → 4)
 * - Network: Integrates with ProviderInterface, Functions, and DataQuery
 * - Wave: Async execution with proper timeout handling per level
 * 
 * Fallback Levels:
 * 1. Native function calling (OpenAI-style tool_calls)
 * 2. Prompt injection (function definitions as text, parse <function_call> tags)
 * 3. Regex parsing (extract structured data from natural language responses)
 * 4. Direct query (extract intent from user message, run function directly)
 * 
 * @module services/function-calling-fallback
 */

// ==========================================
// Constants
// ==========================================

/**
 * Fallback capability levels
 */
export const CAPABILITY_LEVELS = {
    NATIVE: 1,           // Native OpenAI-style function calling
    PROMPT_INJECTION: 2, // Function definitions injected into prompt
    REGEX_PARSING: 3,    // Parse structured output from natural language
    DIRECT_QUERY: 4      // Extract intent and run function directly
};

/**
 * Models known to support native function calling by provider
 */
const TOOL_CAPABLE_MODELS = {
    openrouter: [
        // OpenAI models
        'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo',
        // Anthropic
        'claude-3', 'claude-3.5', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
        // Google
        'gemini-pro', 'gemini-1.5', 'gemini-2',
        // Mistral
        'mistral-large', 'mistral-medium', 'mistral-small',
        // Cohere
        'command-r', 'command-r-plus',
        // Qwen
        'qwen-2.5', 'qwen2.5',
        // DeepSeek
        'deepseek', 'deepseek-chat', 'deepseek-coder'
    ],
    ollama: [
        // From ollama.js TOOL_CAPABLE_MODELS, expanded
        'llama3.2', 'llama3.1', 'llama3.3',
        'mistral', 'mistral-nemo', 'mixtral',
        'qwen2.5', 'qwen2.5-coder',
        'deepseek-r1', 'deepseek-coder', 'deepseek-v2',
        'command-r', 'command-r-plus',
        'granite3-dense', 'granite3.1-dense',
        'hermes3', 'nemotron'
    ],
    lmstudio: [
        // LM Studio uses GGUF models - tool support depends on the base model
        // These are base model identifiers that typically support tools
        'llama-3', 'llama3', 'mistral', 'mixtral',
        'qwen2', 'qwen2.5', 'deepseek', 'command-r',
        'hermes', 'nous-hermes'
    ]
};

/**
 * Regex patterns for parsing function calls from text
 */
const FUNCTION_CALL_PATTERNS = {
    // <function_call>{"name": "...", "arguments": {...}}</function_call>
    xmlTag: /<function_call>\s*({[\s\S]*?})\s*<\/function_call>/gi,

    // ```function_call\n{"name": "...", "arguments": {...}}\n```
    codeBlock: /```function_call\s*\n([\s\S]*?)\n```/gi,

    // JSON object with name and arguments (less reliable)
    // NOTE: This is a last-resort fallback pattern. It only captures the function name and
    // the start of the arguments object; the arguments payload is parsed using brace balancing.
    jsonObject: /\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:\s*\{/gi
};

/**
 * Intent patterns for Level 4 direct query extraction
 */
const INTENT_PATTERNS = [
    // Top artists queries
    {
        pattern: /(?:top|favorite|most\s+(?:played|listened))\s+artists?\s+(?:in|from|during|for)?\s*(\d{4})?/i,
        function: 'get_top_artists',
        extractArgs: (match) => ({ year: match[1] ? parseInt(match[1]) : new Date().getFullYear() })
    },
    // Top tracks queries
    {
        pattern: /(?:top|favorite|most\s+(?:played|listened))\s+(?:tracks?|songs?)\s+(?:in|from|during|for)?\s*(\d{4})?/i,
        function: 'get_top_tracks',
        extractArgs: (match) => ({ year: match[1] ? parseInt(match[1]) : new Date().getFullYear() })
    },
    // Artist history
    {
        pattern: /(?:when\s+did\s+I\s+(?:start|stop|first|last)\s+listen(?:ing)?\s+to|history\s+(?:of|for))\s+["']?([^"'?]+)["']?/i,
        function: 'get_artist_history',
        extractArgs: (match) => ({ artist_name: match[1].trim() })
    },
    // Listening stats
    {
        pattern: /(?:listening\s+)?stats?\s+(?:in|from|for)?\s*(\d{4})?/i,
        function: 'get_listening_stats',
        extractArgs: (match) => ({ year: match[1] ? parseInt(match[1]) : undefined })
    },
    // Compare periods
    {
        pattern: /compare\s+(\d{4})\s+(?:and|vs?\.?|versus|to|with)\s+(\d{4})/i,
        function: 'compare_periods',
        extractArgs: (match) => ({ year1: parseInt(match[1]), year2: parseInt(match[2]) })
    },
    // Search tracks
    {
        pattern: /(?:search|find|look\s+for)\s+(?:track|song)\s+["']?([^"'?]+)["']?/i,
        function: 'search_tracks',
        extractArgs: (match) => ({ track_name: match[1].trim() })
    },
    // Listening clock
    {
        pattern: /(?:when|what\s+time|time\s+of\s+day)\s+do\s+I\s+(?:usually\s+)?listen/i,
        function: 'get_listening_clock',
        extractArgs: () => ({})
    },
    // Ghosted artists
    {
        pattern: /(?:artists?\s+I\s+(?:stopped|quit|don't)\s+listen(?:ing)?|ghosted\s+artists?)/i,
        function: 'get_bottom_artists',
        extractArgs: () => ({ min_plays: 50 })
    }
];

// ==========================================
// Capability Detection
// ==========================================

/**
 * Detect the capability level for a provider/model combination
 * @param {string} provider - Provider name (openrouter, ollama, lmstudio)
 * @param {string} model - Model name/identifier
 * @returns {{level: number, reason: string}}
 */
export function detectCapabilityLevel(provider, model) {
    if (!provider || !model) {
        return {
            level: CAPABILITY_LEVELS.DIRECT_QUERY,
            reason: 'Missing provider or model configuration'
        };
    }

    const normalizedProvider = provider.toLowerCase();
    const normalizedModel = model.toLowerCase();

    // Check if model is in the known tool-capable list for this provider
    const providerModels = TOOL_CAPABLE_MODELS[normalizedProvider] || [];

    const isToolCapable = providerModels.some(capable => {
        // Handle model name variations (e.g., "llama3.2:latest" matches "llama3.2")
        const baseCapable = capable.split(':')[0].toLowerCase();
        const baseModel = normalizedModel.split(':')[0].split('/').pop(); // Handle "org/model:tag" format
        return baseModel.includes(baseCapable) || baseCapable.includes(baseModel);
    });

    if (isToolCapable) {
        return {
            level: CAPABILITY_LEVELS.NATIVE,
            reason: `Model ${model} supports native function calling`
        };
    }

    // For OpenRouter, try native first (many models support it even if not in our list)
    if (normalizedProvider === 'openrouter') {
        return {
            level: CAPABILITY_LEVELS.NATIVE,
            reason: 'OpenRouter - attempting native function calling'
        };
    }

    // For local providers with unknown models, use prompt injection
    return {
        level: CAPABILITY_LEVELS.PROMPT_INJECTION,
        reason: `Model ${model} not confirmed for native function calling, using prompt injection`
    };
}

/**
 * Check if a provider/model combination supports native function calling
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @returns {boolean}
 */
export function supportsNativeFunctionCalling(provider, model) {
    const { level } = detectCapabilityLevel(provider, model);
    return level === CAPABILITY_LEVELS.NATIVE;
}

// ==========================================
// Request Building
// ==========================================

/**
 * Build function definitions text for prompt injection (Level 2)
 * @param {Array} tools - OpenAI-style tool schemas
 * @returns {string} Function definitions as text
 */
export function buildFunctionDefinitionsText(tools) {
    if (!tools || tools.length === 0) return '';

    const definitions = tools.map(tool => {
        const fn = tool.function;
        const params = fn.parameters?.properties || {};
        const required = fn.parameters?.required || [];

        const paramList = Object.entries(params).map(([name, schema]) => {
            const isRequired = required.includes(name);
            const typeInfo = schema.type || 'any';
            const desc = schema.description || '';
            return `  - ${name} (${typeInfo}${isRequired ? ', required' : ', optional'}): ${desc}`;
        }).join('\n');

        return `### ${fn.name}\n${fn.description}\nParameters:\n${paramList || '  (none)'}`;
    }).join('\n\n');

    return definitions;
}

/**
 * Build the prompt injection system message addition for Level 2
 * @param {Array} tools - OpenAI-style tool schemas
 * @returns {string} System message addition
 */
export function buildPromptInjectionAddition(tools) {
    const definitions = buildFunctionDefinitionsText(tools);

    return `

## FUNCTION CALLING INSTRUCTIONS
You have access to the following functions to query the user's music listening data.
When the user asks about specific data (artists, tracks, time periods, statistics), you MUST use these functions.

To call a function, respond with EXACTLY this format (the tags are required):
<function_call>{"name": "function_name", "arguments": {"param1": "value1"}}</function_call>

After calling a function, you will receive the results. Use them to provide a helpful, data-grounded response.

## AVAILABLE FUNCTIONS

${definitions}

## IMPORTANT RULES
1. ALWAYS use functions when users ask about specific data - never guess or make up numbers
2. Use the exact format shown above - the <function_call> tags are required
3. Only call ONE function at a time
4. Wait for function results before responding with insights
`;
}

/**
 * Modify request for Level 2 prompt injection
 * @param {Array} messages - Original messages array
 * @param {Array} tools - Function tools
 * @returns {Array} Modified messages with injected function definitions
 */
export function buildLevel2Request(messages, tools) {
    if (!messages || messages.length === 0) return messages;

    const addition = buildPromptInjectionAddition(tools);

    // Find any existing system message in the array (not just index 0)
    const systemMessageIndex = messages.findIndex(msg => msg.role === 'system');

    // Clone all messages to avoid mutating the original array
    const modifiedMessages = messages.map(msg => ({ ...msg }));

    if (systemMessageIndex !== -1) {
        // Append the function definitions to the existing system message
        modifiedMessages[systemMessageIndex] = {
            ...modifiedMessages[systemMessageIndex],
            content: modifiedMessages[systemMessageIndex].content + addition
        };
    } else {
        // No system message exists - prepend a new one with the function definitions
        modifiedMessages.unshift({
            role: 'system',
            content: addition.trim() // Trim since addition starts with newlines
        });
    }

    return modifiedMessages;
}

// ==========================================
// Response Parsing
// ==========================================

/**
 * Parse function calls from a text response (Level 2/3)
 * @param {string} content - Response content
 * @returns {Array<{name: string, arguments: object}>} Parsed function calls
 */
export function parseFunctionCallsFromText(content) {
    if (!content || typeof content !== 'string') return [];

    const calls = [];
    const extractArgumentsObject = (text, startIndex) => {
        if (text[startIndex] !== '{') return null;

        let depth = 0;
        let inString = false;

        const isEscaped = (index) => {
            let backslashCount = 0;
            let cursor = index - 1;
            while (cursor >= 0 && text[cursor] === '\\') {
                backslashCount++;
                cursor--;
            }
            return backslashCount % 2 === 1;
        };

        for (let i = startIndex; i < text.length; i++) {
            const char = text[i];

            if (char === '"' && !isEscaped(i)) {
                inString = !inString;
                continue;
            }

            if (inString) continue;

            if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
                if (depth === 0) {
                    return text.slice(startIndex, i + 1);
                }
            }
        }

        return null;
    };

    // Try XML tag pattern first (most reliable)
    let match;
    const xmlRegex = new RegExp(FUNCTION_CALL_PATTERNS.xmlTag.source, 'gi');
    while ((match = xmlRegex.exec(content)) !== null) {
        try {
            const parsed = JSON.parse(match[1]);
            if (parsed.name) {
                calls.push({
                    name: parsed.name,
                    arguments: parsed.arguments || {}
                });
            }
        } catch (e) {
            console.warn('[FunctionFallback] Failed to parse XML tag function call:', match[1]);
        }
    }

    if (calls.length > 0) return calls;

    // Try code block pattern
    const codeRegex = new RegExp(FUNCTION_CALL_PATTERNS.codeBlock.source, 'gi');
    while ((match = codeRegex.exec(content)) !== null) {
        try {
            const parsed = JSON.parse(match[1]);
            if (parsed.name) {
                calls.push({
                    name: parsed.name,
                    arguments: parsed.arguments || {}
                });
            }
        } catch (e) {
            console.warn('[FunctionFallback] Failed to parse code block function call:', match[1]);
        }
    }

    if (calls.length > 0) return calls;

    // Last resort: try JSON object pattern (higher false positive risk)
    const jsonRegex = new RegExp(FUNCTION_CALL_PATTERNS.jsonObject.source, 'gi');
    while ((match = jsonRegex.exec(content)) !== null) {
        const matchedString = match[0];
        const functionName = match[1];
        const argsStartIndex = match.index + matchedString.length - 1; // Opening brace for arguments
        const argsString = extractArgumentsObject(content, argsStartIndex);

        if (!argsString) {
            console.warn('[FunctionFallback] Failed to locate balanced arguments for JSON function call');
            continue;
        }

        try {
            const args = JSON.parse(argsString);
            calls.push({
                name: functionName,
                arguments: args
            });
        } catch (e) {
            console.warn('[FunctionFallback] Failed to parse JSON function call arguments');
        }
    }

    return calls;
}

/**
 * Extract function intent from user message (Level 4)
 * @param {string} message - User message
 * @returns {{function: string, arguments: object}|null} Extracted intent or null
 */
export function extractQueryIntent(message) {
    if (!message || typeof message !== 'string') return null;

    for (const { pattern, function: fnName, extractArgs } of INTENT_PATTERNS) {
        const match = message.match(pattern);
        if (match) {
            try {
                const args = extractArgs(match);
                console.log(`[FunctionFallback] Level 4: Extracted intent for ${fnName}`, args);
                return {
                    function: fnName,
                    arguments: args
                };
            } catch (e) {
                console.warn(`[FunctionFallback] Failed to extract args for ${fnName}:`, e);
            }
        }
    }

    return null;
}

// ==========================================
// Function Execution
// ==========================================

/**
 * Execute parsed function calls and return results
 * @param {Array<{name: string, arguments: object}>} calls - Parsed function calls
 * @param {Array} streams - User's streaming data
 * @returns {Promise<Array<{name: string, result: object}>>} Execution results
 */
export async function executeFunctionCalls(calls, streams) {
    if (!calls || calls.length === 0) return [];

    const results = [];

    for (const call of calls) {
        try {
            // Use the global Functions module
            if (window.Functions?.execute) {
                const result = await window.Functions.execute(call.name, call.arguments, streams);
                results.push({
                    name: call.name,
                    result: result
                });
                console.log(`[FunctionFallback] Executed ${call.name}:`, result);
            } else {
                results.push({
                    name: call.name,
                    result: { error: 'Functions module not available' }
                });
            }
        } catch (error) {
            console.error(`[FunctionFallback] Error executing ${call.name}:`, error);
            results.push({
                name: call.name,
                result: { error: error.message }
            });
        }
    }

    return results;
}

/**
 * Build a follow-up message with function results for Level 2
 * @param {Array<{name: string, result: object}>} results - Function execution results
 * @returns {string} Formatted results message
 */
export function buildFunctionResultsMessage(results) {
    if (!results || results.length === 0) return '';

    const formatted = results.map(({ name, result }) => {
        const resultStr = JSON.stringify(result, null, 2);
        return `<function_result name="${name}">\n${resultStr}\n</function_result>`;
    }).join('\n\n');

    return `Here are the function results:\n\n${formatted}\n\nPlease use this data to provide an insightful response to the user's question.`;
}

// ==========================================
// Main Fallback Handler
// ==========================================

/**
 * Handle function calling with fallback support
 * This is the main entry point for the fallback system
 * 
 * @param {object} options - Options
 * @param {string} options.provider - LLM provider
 * @param {string} options.model - Model name
 * @param {Array} options.messages - Chat messages
 * @param {Array} options.tools - Function tools
 * @param {Array} options.streams - User's streaming data
 * @param {object} options.response - Initial LLM response (for Level 1 checking)
 * @returns {Promise<{level: number, calls: Array, results: Array, needsFollowup: boolean}>}
 */
export async function handleFunctionCallingWithFallback({
    provider,
    model,
    messages,
    tools,
    streams,
    response
}) {
    // Detect capability level
    const { level, reason } = detectCapabilityLevel(provider, model);
    console.log(`[FunctionFallback] Capability level ${level}: ${reason}`);

    // Level 1: Check if we got native tool_calls in the response
    if (level === CAPABILITY_LEVELS.NATIVE && response?.choices?.[0]?.message?.tool_calls) {
        console.log('[FunctionFallback] Level 1: Native function calling succeeded');
        return {
            level: CAPABILITY_LEVELS.NATIVE,
            calls: response.choices[0].message.tool_calls,
            results: null, // Let chat.js handle execution
            needsFollowup: true
        };
    }

    // Level 2/3: Try to parse function calls from text response
    const content = response?.choices?.[0]?.message?.content || '';
    const parsedCalls = parseFunctionCallsFromText(content);

    if (parsedCalls.length > 0) {
        console.log(`[FunctionFallback] Level 2/3: Parsed ${parsedCalls.length} function calls from text`);
        const results = await executeFunctionCalls(parsedCalls, streams);
        return {
            level: CAPABILITY_LEVELS.PROMPT_INJECTION,
            calls: parsedCalls,
            results: results,
            needsFollowup: true // Need to send results back to model
        };
    }

    // Level 4: Extract intent from the last user message
    const lastUserMessage = messages
        .filter(m => m.role === 'user')
        .pop();

    if (lastUserMessage) {
        const intent = extractQueryIntent(lastUserMessage.content);
        if (intent) {
            console.log(`[FunctionFallback] Level 4: Extracted intent from user message`);
            const results = await executeFunctionCalls([intent], streams);
            return {
                level: CAPABILITY_LEVELS.DIRECT_QUERY,
                calls: [intent],
                results: results,
                needsFollowup: false // We'll inject results directly
            };
        }
    }

    // No function calls needed or found
    return {
        level: level,
        calls: [],
        results: [],
        needsFollowup: false
    };
}

// ==========================================
// Public API
// ==========================================

export const FunctionCallingFallback = {
    // Constants
    CAPABILITY_LEVELS,

    // Detection
    detectCapabilityLevel,
    supportsNativeFunctionCalling,

    // Request building
    buildFunctionDefinitionsText,
    buildPromptInjectionAddition,
    buildLevel2Request,

    // Response parsing
    parseFunctionCallsFromText,
    extractQueryIntent,

    // Execution
    executeFunctionCalls,
    buildFunctionResultsMessage,

    // Main handler
    handleFunctionCallingWithFallback
};

// Window global for backwards compatibility
if (typeof window !== 'undefined') {
    window.FunctionCallingFallback = FunctionCallingFallback;
}

console.log('[FunctionCallingFallback] Service loaded');
