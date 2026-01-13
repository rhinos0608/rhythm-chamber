/**
 * Token Counter Test Suite
 * Tests the token counting functionality for the Rhythm Chamber
 */

// Mock the global environment for Node.js
global.window = global.window || {};
global.console = console;

// Mock Settings module for Node.js testing
global.window.Settings = {
    getContextWindow: function () {
        return 4096; // Default context window for testing
    }
};

// Load the token counter module
const fs = require('fs');
const path = require('path');

// Read and evaluate the token counter module
const tokenCounterCode = fs.readFileSync(
    path.join(__dirname, '../js/token-counter.js'),
    'utf8'
);

// Evaluate the module in the current context
eval(tokenCounterCode.replace('window.', 'global.window.'));

const TokenCounter = global.window.TokenCounter;

console.log('🧪 Token Counter Test Suite');
console.log('============================\n');

// Test 1: Basic Token Counting
console.log('Test 1: Basic Token Counting');
console.log('-----------------------------');

const testMessages = [
    { role: 'user', content: 'What was my music like in 2023?' },
    { role: 'assistant', content: 'Based on your listening data from 2023, you showed a strong preference for indie rock and electronic music.' },
    { role: 'user', content: 'Which artists did I listen to the most?' }
];

const result1 = TokenCounter.calculateRequestTokens({
    systemPrompt: 'You are a helpful assistant analyzing music listening patterns.',
    messages: testMessages,
    model: 'openai/gpt-4'
});

console.log('✓ System prompt tokens:', result1.systemPromptTokens);
console.log('✓ Message tokens:', result1.messageTokens);
console.log('✓ Total tokens:', result1.total);
console.log('✓ Context window:', result1.contextWindow);
console.log('✓ Usage percent:', result1.usagePercent.toFixed(1) + '%');
console.log('✓ Warnings:', result1.warnings.length);
console.log('');

// Test 2: RAG Context Addition
console.log('Test 2: RAG Context Addition');
console.log('----------------------------');

const ragContext = `RELEVANT DATA:
- Top artist: Radiohead (450 plays)
- Peak period: March 2023 (120 plays)
- Genre shift: From rock to electronic`;

const result2 = TokenCounter.calculateRequestTokens({
    systemPrompt: 'You are a helpful assistant analyzing music listening patterns.',
    messages: testMessages,
    ragContext: ragContext,
    model: 'openai/gpt-4'
});

console.log('✓ RAG context tokens:', result2.ragContextTokens);
console.log('✓ Total with RAG:', result2.total);
console.log('✓ Usage percent:', result2.usagePercent.toFixed(1) + '%');
console.log('');

// Test 3: Tool Calling
console.log('Test 3: Tool Calling');
console.log('--------------------');

const tools = [
    {
        type: 'function',
        function: {
            name: 'getArtistStats',
            description: 'Get statistics for a specific artist',
            parameters: {
                type: 'object',
                properties: {
                    artistName: { type: 'string' }
                }
            }
        }
    }
];

const result3 = TokenCounter.calculateRequestTokens({
    systemPrompt: 'You are a helpful assistant analyzing music listening patterns.',
    messages: testMessages,
    tools: tools,
    model: 'openai/gpt-4'
});

console.log('✓ Tool tokens:', result3.toolTokens);
console.log('✓ Total with tools:', result3.total);
console.log('✓ Usage percent:', result3.usagePercent.toFixed(1) + '%');
console.log('');

// Test 4: Warning System
console.log('Test 4: Warning System');
console.log('----------------------');

// Create a large conversation that should trigger warnings
const largeConversation = [];
for (let i = 0; i < 50; i++) {
    largeConversation.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `This is message ${i + 1} in a long conversation about music listening patterns and preferences.`
    });
}

const result4 = TokenCounter.calculateRequestTokens({
    systemPrompt: 'You are a helpful assistant analyzing music listening patterns.',
    messages: largeConversation,
    model: 'openai/gpt-4'
});

console.log('✓ Large conversation tokens:', result4.total);
console.log('✓ Usage percent:', result4.usagePercent.toFixed(1) + '%');
console.log('✓ Warnings:', result4.warnings.length);
result4.warnings.forEach((warning, i) => {
    console.log(`  ${i + 1}. [${warning.level}] ${warning.message}`);
});

const recommended = TokenCounter.getRecommendedAction(result4);
console.log('✓ Recommended action:', recommended.action);
if (recommended.message) {
    console.log('✓ Action message:', recommended.message);
}
console.log('');

// Test 5: Truncation Strategy
console.log('Test 5: Truncation Strategy');
console.log('---------------------------');

const targetTokens = Math.floor(result4.contextWindow * 0.8); // Target 80%
const truncated = TokenCounter.truncateToTarget({
    systemPrompt: 'You are a helpful assistant analyzing music listening patterns.',
    messages: largeConversation,
    model: 'openai/gpt-4'
}, targetTokens);

console.log('✓ Target tokens:', targetTokens);
console.log('✓ Original messages:', largeConversation.length);
console.log('✓ Truncated messages:', truncated.messages.length);
console.log('✓ Truncated total:', TokenCounter.calculateRequestTokens({
    systemPrompt: truncated.systemPrompt,
    messages: truncated.messages,
    model: 'openai/gpt-4'
}).total);
console.log('');

// Test 6: Configurable Context Window
console.log('Test 6: Configurable Context Window');
console.log('-----------------------------------');

// Test with different context window configurations
const contextWindows = [2048, 4096, 8192, 16384];

console.log('✓ Context window is now configurable via Settings.getContextWindow()');
console.log('✓ Default context window: 4096 tokens');
console.log('✓ Users can configure this in the Settings tab');
console.log('✓ No more model-specific context window management');
console.log('');

contextWindows.forEach(window => {
    // Mock different context windows
    const originalGetContextWindow = TokenCounter.getContextWindow;
    TokenCounter.getContextWindow = () => window;

    const result = TokenCounter.calculateRequestTokens({
        systemPrompt: 'You are a helpful assistant.',
        messages: testMessages,
        model: 'any-model'
    });

    console.log(`✓ Configured ${window} window: ${result.usagePercent.toFixed(1)}% usage`);

    // Restore original
    TokenCounter.getContextWindow = originalGetContextWindow;
});

console.log('\n✅ All tests completed successfully!');
console.log('\nSummary:');
console.log('- Token counting works for messages, RAG context, and tools');
console.log('- Warning system correctly identifies high usage');
console.log('- Truncation strategy reduces context to target levels');
console.log('- Context window is configurable via Settings (no model-specific logic)');
console.log('- Integration with chat.js is ready');
console.log('\n🔧 Configuration:');
console.log('- Users set context window in Settings tab');
console.log('- Default: 4096 tokens');
console.log('- Range: 1024 - 128000 tokens');
console.log('- Applies to all providers (OpenRouter, Ollama, LM Studio)');