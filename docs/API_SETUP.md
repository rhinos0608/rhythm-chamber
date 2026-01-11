# API Setup Guide

## OpenRouter Configuration

Rhythm Chamber uses [OpenRouter](https://openrouter.ai) to power the chat feature. OpenRouter provides access to multiple AI models through a single API.

### Getting Your API Key

1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up or log in
3. Navigate to [Keys](https://openrouter.ai/keys)
4. Create a new API key
5. Copy the key (you won't be able to see it again)

### Setting Up the Config File

1. **Copy the example config:**
   ```bash
   cp js/config.example.js js/config.js
   ```

2. **Edit `js/config.js`:**
   ```javascript
   const Config = {
     openrouter: {
       apiKey: 'sk-or-v1-xxxxxxxxxxxxx', // ← Paste your key here
       apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
       model: 'mistralai/mistral-7b-instruct:free',
       maxTokens: 500,
       temperature: 0.7
     },
     // ...
   };
   ```

3. **Save the file**

> **Important:** `js/config.js` is gitignored and will never be committed to version control. Your API key stays private.

---

## Model Selection

### Free Models (No Cost)

```javascript
model: 'mistralai/mistral-7b-instruct:free'
```

Good for testing and casual use. Rate limited but functional.

### Paid Models (Better Quality)

For better conversation quality, upgrade to a paid model:

```javascript
// Anthropic Claude (best for personality analysis)
model: 'anthropic/claude-3.5-sonnet'

// OpenAI GPT-4
model: 'openai/gpt-4-turbo'

// Google Gemini
model: 'google/gemini-pro-1.5'
```

Check [OpenRouter pricing](https://openrouter.ai/models) for costs.

---

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `apiKey` | `'your-api-key-here'` | Your OpenRouter API key |
| `apiUrl` | OpenRouter endpoint | Usually don't change this |
| `model` | `mistral-7b-instruct:free` | Which AI model to use |
| `maxTokens` | `500` | Max response length |
| `temperature` | `0.7` | Creativity (0=focused, 1=creative) |

---

## Fallback Behavior

If no API key is configured, the chat will still work with **fallback responses** based on your detected patterns. These are less conversational but still functional.

To get the full AI chat experience, add your OpenRouter API key.

---

## Troubleshooting

### "Config not loaded" error

Make sure:
1. `js/config.js` exists (copy from `config.example.js`)
2. The file is loaded in `app.html` before other scripts
3. No syntax errors in your config file

### Chat returns fallback responses

Check:
1. API key is set in `config.js`
2. API key is not still `'your-api-key-here'`
3. You have credits in your OpenRouter account
4. Check browser console for API errors

### Rate limit errors

Free models have rate limits. Either:
- Wait a few minutes
- Upgrade to a paid model
- Add credits to your OpenRouter account
