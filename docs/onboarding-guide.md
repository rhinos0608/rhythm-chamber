# API Key Setup Guide

This guide will help you get started with Rhythm Chamber by setting up an API key for the AI provider of your choice.

## Why Do I Need an API Key?

Rhythm Chamber uses a "Bring Your Own AI" (BYOI) approach. This means:
- **Zero server costs** for the free tier
- **Your data stays private** - we don't proxy or store your conversations
- **You choose the AI** that works best for you

## Option 1: Google AI Studio (Gemini) - FREE Recommended

Gemini 2.0 Flash is completely free with generous limits. No credit card required!

### How to Get Your Gemini API Key

1. **Visit Google AI Studio**
   - Go to [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Sign in with your Google account

2. **Create an API Key**
   - Click "Create API Key" (or "Generate API Key")
   - Give your key a name like "Rhythm Chamber"
   - Copy the generated key (starts with `AIzaSy...`)

3. **Add to Rhythm Chamber**
   - Open Rhythm Chamber
   - Click the Settings (gear) icon
   - Select "Gemini (Google AI Studio)" from the LLM Provider dropdown
   - Paste your API key in the API Key field
   - Click "Save Settings"

### Free Tier Limits

| Model | Requests/Day | Context Window | Function Calling |
|-------|--------------|----------------|------------------|
| Gemini 2.5 Flash | 500 | 1M tokens | Yes |
| Gemini 2.0 Flash | 500 | 1M tokens | Yes |
| Gemini 1.5 Flash | 500 | 1M tokens | Yes |

**This is plenty for most users!** The free tier handles hundreds of questions about your music data.

---

## Option 2: OpenRouter

OpenRouter gives you access to many AI models (GPT-4, Claude, Gemini, etc.) from a single API key.

### How to Get Your OpenRouter API Key

1. **Visit OpenRouter**
   - Go to [https://openrouter.ai/keys](https://openrouter.ai/keys)
   - Sign up for an account (email, Google, or GitHub)

2. **Create an API Key**
   - Click "Create Key"
   - Name your key (e.g., "Rhythm Chamber")
   - Copy the key (starts with `sk-or-v1-...`)

3. **Add to Rhythm Chamber**
   - Open Rhythm Chamber
   - Click the Settings (gear) icon
   - Select "OpenRouter (Cloud)" from the LLM Provider dropdown
   - Paste your API key in the API Key field
   - Choose a model (free options available)
   - Click "Save Settings"

### Free Models on OpenRouter

- Xiaomi Mimo v2 Flash
- Mistral 7B Instruct
- Llama 3.1 8B Instruct
- Gemma 2 9B IT

### Paid Models (require credits)

- GPT-4o Mini
- Claude 3.5 Sonnet
- GPT-4 Turbo

---

## Option 3: Local AI (Ollama or LM Studio)

For maximum privacy, run AI models directly on your computer.

### Ollama Setup

1. **Download Ollama** from [https://ollama.ai](https://ollama.ai)
2. **Install and run** `ollama serve`
3. **Pull a model**: `ollama pull llama3.2`
4. **In Rhythm Chamber Settings**:
   - Select "Ollama (Local)" as provider
   - Default endpoint: `http://localhost:11434`

### LM Studio Setup

1. **Download LM Studio** from [https://lmstudio.ai](https://lmstudio.ai)
2. **Load a model** in the app
3. **Enable the local server** in settings
4. **In Rhythm Chamber Settings**:
   - Select "LM Studio (Local)" as provider
   - Default endpoint: `http://localhost:1234/v1`

---

## Option 4: OpenAI-Compatible Provider

Use any OpenAI-compatible API endpoint with your choice. This option gives you maximum flexibility to connect to:

- **Self-hosted servers**: vLLM, Text Generation WebUI, LocalAI
- **Cloud providers**: Together AI, Anyscale, DeepInfra, Groq, etc.
- **Local OpenAI-compatible servers**: Ollama with OpenAI compatibility mode
- **Official OpenAI API**: Direct integration

### Setup

1. **Get your API endpoint and key**
   - Obtain the base URL from your provider (e.g., `https://api.together.xyz/v1/chat/completions`)
   - Get your API key from your provider's dashboard
   - Note: Some local/self-hosted providers don't require an API key

2. **Add to Rhythm Chamber**
   - Open Rhythm Chamber
   - Click the Settings (gear) icon
   - Select "OpenAI Compatible" from the LLM Provider dropdown
   - Enter your Base URL (full endpoint including `/chat/completions`)
   - Enter your API Key (optional for some providers)
   - Enter your Model Name (e.g., `meta-llama/Llama-3-8b-chat-hf`)
   - Click "Save Settings"

### Examples

**Self-hosted (vLLM):**
- Base URL: `http://localhost:8000/v1/chat/completions`
- Model: `meta-llama/Llama-3-8b-chat-hf`
- API Key: (optional)

**Cloud (Together AI):**
- Base URL: `https://api.together.xyz/v1/chat/completions`
- Model: `meta-llama/Llama-3-8b-chat-hf`
- API Key: (required)

**Cloud (Anyscale):**
- Base URL: `https://api.endpoints.anyscale.com/v1/chat/completions`
- Model: `meta-llama/Llama-3-8b-chat-hf`
- API Key: (required)

---

## Troubleshooting

### "Invalid API Key" Error

- **Gemini**: Make sure you copied the entire key starting with `AIzaSy...`
- **OpenRouter**: Make sure you copied the entire key starting with `sk-or-v1-...`
- Check for extra spaces before or after the key

### "Connection Timeout" Error

- Check your internet connection
- Try switching to a different provider
- For local AI (Ollama/LM Studio), make sure the application is running

### "Rate Limit Exceeded" Error

- **Free tier**: You've hit the daily limit. Try again tomorrow, or consider a different provider.
- **Gemini**: 500 requests/day is usually enough for most users
- **OpenRouter**: Free tier has lower limits; paid plans start at $5/month

---

## Privacy & Security

- **API keys are stored locally** in your browser's IndexedDB
- **Your data is never sent to our servers** - only directly to the AI provider
- **We don't track your conversations** or analyze your music data on our servers
- **You can delete your API key** at any time from Settings

### API Key Safety Tips

- Never share your API key publicly
- Don't commit API keys to version control
- Each application should have its own key
- You can revoke keys from your provider's dashboard if needed

---

## Need Help?

If you run into issues:

1. Check the browser console for error messages (F12 → Console)
2. Try refreshing the page and re-entering your API key
3. Check that your provider's service is operational
4. For local AI, verify the server is running with `curl http://localhost:11434/api/tags` (Ollama)

---

## Recommended Choice for New Users

**Start with Gemini (Google AI Studio)** - it's free, fast, and has excellent function calling support for data queries. The free tier is generous enough for most users to explore all features without paying anything.
