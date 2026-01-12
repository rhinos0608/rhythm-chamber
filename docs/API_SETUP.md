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

---

## Power User Configuration

### Bring Your Own Keys (BYOK)

Rhythm Chamber is designed for power users who want control:

**Why BYOK is a feature:**
- **Privacy**: You control your API keys
- **Transparency**: No black box
- **Flexibility**: Choose your model
- **Cost**: Pay only for what you use

### Local Model Support (Advanced)

For ultimate privacy, use local models:

```javascript
const Config = {
  openrouter: {
    // Optional: Use local model instead
    useLocal: true,
    localEndpoint: 'http://localhost:11434',
    localModel: 'llama3.1:8b'
  }
};
```

**Requirements:**
- Ollama installed locally
- Model downloaded (`ollama pull llama3.1:8b`)
- Server running (`ollama serve`)

### Qdrant Cloud Setup (For Semantic Search)

1. **Create free Qdrant cluster:**
   - Go to [cloud.qdrant.io](https://cloud.qdrant.io)
   - Sign up for free tier
   - Create cluster

2. **Get credentials:**
   - URL: `https://xxxxx.cloud.qdrant.io`
   - API key: from dashboard

3. **Configure in app:**
   - Open Settings → RAG Configuration
   - Enter Qdrant URL and API key
   - Click "Generate Embeddings"

4. **Use in chat:**
   - Ask questions like "What was I listening to in March?"
   - System uses semantic search to find relevant chunks

---

## Security Best Practices

### API Key Storage

**Never commit API keys:**
- `js/config.js` is gitignored
- Keys stored in localStorage (encrypted)
- Session-bound encryption

### Key Rotation

If you suspect your key is compromised:
1. Revoke it in OpenRouter dashboard
2. Generate new key
3. Update `js/config.js`
4. Refresh app

### Secure Context

Rhythm Chamber only works in secure contexts (HTTPS or localhost). This prevents:
- Man-in-the-middle attacks
- Credential theft
- XSS exploitation

---

## Cost Management

### Free Tier Usage

**What's free:**
- OpenRouter free models
- Local processing
- Client-side storage

**What's not free:**
- Premium LLM models (~$0.003/1K tokens)
- Qdrant cloud (free tier available)

### Monitoring Usage

1. **OpenRouter dashboard:** Track API calls
2. **Qdrant dashboard:** Track vector storage
3. **Browser console:** Check for errors

### Budget Control

**Set limits:**
- Use free models for testing
- Upgrade to paid for quality
- Monitor monthly spend

---

## Advanced: Self-Hosted Everything

For maximum control, self-host all components:

### 1. OpenAI API Compatible Endpoint

```javascript
const Config = {
  openrouter: {
    apiUrl: 'https://your-llm-proxy.com/v1/chat/completions',
    model: 'your-model-name'
  }
};
```

### 2. Self-Hosted Qdrant

```javascript
// In app settings
Qdrant URL: http://localhost:6333
API Key: (none for local)
```

### 3. Static Hosting

Deploy to any static host:
- Vercel
- Netlify
- GitHub Pages
- Your own server

**Total cost: $0** (excluding your own infrastructure)

---

## Why This Matters

### The Stats.fm Problem

Stats.fm requires:
- Server infrastructure
- Database storage
- Ongoing maintenance
- Monetization to survive

**This means:**
- They control your data
- They can shut down
- They must charge you
- You depend on them

### The Rhythm Chamber Solution

**Zero-backend architecture:**
- No servers needed
- No data collection
- Free forever
- You control everything

**BYOK model:**
- You provide the keys
- You control the AI
- You choose the model
- You own your data

**For power users, this is the only acceptable architecture.**

---

## Getting Help

### Common Issues

1. **"Config not found"** → Copy `config.example.js` to `config.js`
2. **"API key invalid"** → Check for typos, regenerate if needed
3. **"Model not found"** → Verify model name in OpenRouter docs
4. **"Rate limit"** → Wait or upgrade to paid model

### Community Support

- Check `docs/` for detailed guides
- Review `SECURITY.md` for security questions
- Check browser console for specific errors

### Professional Setup

For teams or businesses needing help:
- Review architecture docs
- Consider paid models for quality
- Set up proper key management
- Implement monitoring

---

## The Bottom Line

**Rhythm Chamber is designed for power users who:**

1. **Value privacy** → Local-first, BYOK
2. **Want control** → Transparent, configurable
3. **Understand APIs** → Can set up keys
4. **Appreciate simplicity** → Zero backend

**If you can set up an API key, you can use Rhythm Chamber. If you can't, it's not for you—and that's intentional.**
