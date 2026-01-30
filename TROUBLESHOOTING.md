# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with Rhythm Chamber.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [BYOI Configuration Issues](#byoi-configuration-issues)
- [Security & Access Problems](#security--access-problems)
- [Data & Storage Issues](#data--storage-issues)
- [Performance Problems](#performance-problems)
- [Browser Compatibility](#browser-compatibility)
- [Error Messages Reference](#error-messages-reference)

---

## Quick Diagnostics

### Check Browser Console

Most issues show error messages in the browser console:

1. Open Developer Tools (F12 or Cmd+Option+I)
2. Go to the **Console** tab
3. Look for red error messages
4. Copy error text for troubleshooting

### Check Application Status

```javascript
// In browser console, run:
Storage.getDataSummary()
// Returns: data status, sizes, session mode

EventBus.getHealthStatus()
// Returns: event system health

// Check Safe Mode status
SafeMode.getSafeModeStatus()
```

---

## BYOI Configuration Issues

### Issue: "API key is required" Error

**Symptoms:**
- configuration model shows errors
- Provider selection fails
- Chat responses don't work

**Causes:**
- No API key configured
- Key was cleared or revoked
- Key format incorrect

**Solutions:**

1. **Verify API key is set:**
   - Open Settings (gear icon)
   - Go to "Providers" section
   - Select your provider (OpenRouter, Anthropic, etc.)
   - Enter your API key
   - Click "Save"

2. **Validate key format:**
   - OpenRouter: `sk-or-v1-...` (starts with `sk-or-v1-`)
   - Anthropic: `sk-ant-...` (starts with `sk-ant-`)
   - OpenAI: `sk-...` (starts with `sk-`)

3. **Test key directly:**
   ```bash
   # Test OpenRouter key
   curl -H "Authorization: Bearer YOUR_KEY" \
     https://openrouter.ai/api/v1/models

   # Test Anthropic key
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: YOUR_KEY" \
     -H "anthropic-version: 2023-06-01"
   ```

---

### Issue: "Model not compatible" Error

**Symptoms:**
- Error: `Model X is not compatible with YProvider`
- Model selection dropdown is empty

**Causes:**
- Model name not supported by provider
- Typo in model name
- Using wrong provider for the model

**Solutions:**

1. **Check compatible models for each provider:**

| Provider | Compatible Models |
|----------|-------------------|
| OpenRouter | `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`, etc. |
| Anthropic | `claude-3-5-sonnet-20241022`, `claude-3-haiku-20240307` |
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo` |
| Gemini | `gemini-2.0-flash-exp`, `gemini-1.5-pro` |

2. **For OpenRouter, use full model paths:**
   ```
   Good: openai/gpt-4o
   Bad: gpt-4o
   ```

3. **Check provider status:**
   - Some models may be temporarily unavailable
   - See provider dashboard for outages

---

### Issue: Custom Base URL / Proxy Not Working

**Symptoms:**
- Network errors when calling API
- CORS errors in console
- Timeouts on requests

**Causes:**
- Proxy server misconfigured
- CORS not enabled on proxy
- Wrong URL format

**Solutions:**

1. **Verify proxy server is running:**
   ```bash
   curl https://your-proxy.com/status
   ```

2. **Check CORS headers on proxy:**
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Headers: Authorization, Content-Type
   ```

3. **Use correct URL format:**
   - Include `https://`
   - No trailing slash
   - Example: `https://api.example.com`

4. **Test proxy directly:**
   ```bash
   curl -H "Authorization: Bearer YOUR_KEY" \
     https://your-proxy.com/v1/models
   ```

---

## Security & Access Problems

### Issue: "Secure context required" Error

**Symptoms:**
- Error: `This feature requires a secure context`
- Application doesn't load
- Security warnings

**Causes:**
- Not using HTTPS
- Using `file://` protocol
- Using insecure HTTP (unless localhost)

**Solutions:**

1. **Use HTTPS in production:**
   - Deploy with valid SSL certificate
   - Use services like Vercel, Netlify (auto HTTPS)

2. **Local development is okay:**
   - `http://localhost:8080` works
   - `http://127.0.0.1:8080` works
   - `http://192.168.x.x:8080` may NOT work

3. **For file:// access:**
   - Not recommended for security reasons
   - Use local server instead: `npm run dev`

---

### Issue: Geographic Lockout / Travel Detection

**Symptoms:**
- Error: `Too many location changes detected`
- Account temporarily locked
- Reduced rate limits

**Causes:**
- Using VPN/proxy that changes location
- Traveling between regions
- Multiple browser sessions from different locations

**Solutions:**

1. **Wait out cooldown period:**
   - Usually 60 minutes
   - Cooldown shown in error message

2. **Disable VPN while using app:**
   - Or use consistent VPN endpoint

3. **Clear location tracking:**
   ```javascript
   // In console (advanced)
   localStorage.clear()
   location.reload()
   ```

---

### Issue: Safe Mode Active

**Symptoms:**
- Orange banner at top of screen
- Cannot save new data
- Error: `Safe Mode active. Write blocked`

**Causes:**
- Security modules failed to load
- Encryption unavailable
- Critical security initialization failed

**Solutions:**

1. **Check which modules failed:**
   ```javascript
   SafeMode.getSafeModeStatus()
   // Returns: { isSafeMode, failedModules, ... }
   ```

2. **Try page reload:**
   - Simple reload may fix transient issues
   - `Ctrl+R` or `Cmd+R`

3. **Clear browser cache:**
   - Sometimes old cached JS causes issues
   - Clear site data in browser settings

4. **Check browser compatibility:**
   - Ensure using modern browser (Chrome 90+, Firefox 88+, Safari 14+)
   - Web Crypto API must be available

---

## Data & Storage Issues

### Issue: Data Not Persisting

**Symptoms:**
- Data disappears after refresh
- Upload progress but no results
- "Session only mode" warnings

**Causes:**
- Incognito/Private browsing mode
- Browser storage cleared
- Storage quota exceeded

**Solutions:**

1. **Exit incognito mode:**
   - Use normal browser window
   - Or explicitly enable session persistence

2. **Check storage quota:**
   ```javascript
   // Check usage
   navigator.storage.estimate().then(console.log)
   ```

3. **Clear old data to free space:**
   - Go to Settings
   - "Data Management" section
   - "Archive old streams" or "Clear sensitive data"

4. **Check browser storage settings:**
   - Ensure site has storage permission
   - Check "Block third-party cookies" isn't preventing storage

---

### Issue: "Database upgrade blocked by other tabs"

**Symptoms:**
- Error about database version
- Multiple tabs open causing conflict

**Causes:**
- Multiple Rhythm Chamber tabs open
- Background tab with old version

**Solutions:**

1. **Close all other Rhythm Chamber tabs:**
   - Keep only one tab open
   - Refresh the remaining tab

2. **Restart browser:**
   - Closes all background tabs
   - Clears any stuck connections

---

### Issue: Corrupted Data / Parse Errors

**Symptoms:**
- `Error loading state: ...`
- `Unexpected token in JSON`
- App loads but data missing

**Causes:**
- Manual editing of localStorage
- Incomplete write (tab closed during save)
- Browser data corruption

**Solutions:**

1. **Validate data consistency:**
   ```javascript
   Storage.validateConsistency()
   ```

2. **Export data before clearing:**
   - Go to Settings
   - "Export Profile" to save current data

3. **Clear corrupted data:**
   ```javascript
   // CAUTION: This deletes all data
   Storage.clearAllData()
   ```

4. **Re-upload from original Spotify export:**
   - Keep your original `endsong_*.json` files safe

---

## Performance Problems

### Issue: Slow Embedding Generation

**Symptoms:**
- "Generating embeddings" takes long time
- Browser becomes unresponsive
- Progress bar moves slowly

**Causes:**
- Large streaming history (>100K tracks)
- Low-end device
- Battery saver mode active

**Solutions:**

1. **Enable battery-aware mode (automatic):**
   - App uses simpler models on low battery
   - Charge device for faster processing

2. **Close other tabs:**
   - Frees up memory and CPU

3. **Break into smaller batches:**
   - Upload smaller chunks if possible
   - Use multiple profiles for different time periods

4. **Check available memory:**
   ```javascript
   // Check heap size
   console.log(performance.memory)
   ```

---

### Issue: Chat Responses Slow

**Symptoms:**
- Long wait for AI responses
- Streaming stalls

**Causes:**
- Slow API provider
- Network issues
- Large context being processed

**Solutions:**

1. **Check provider status:**
   - Visit provider dashboard (OpenRouter status page, etc.)
   - Check for outages

2. **Try different provider:**
   - Switch from one provider to another in Settings
   - Some providers may be faster

3. **Reduce context size:**
   - Start new chat session
   - Be more specific in questions (reduces search scope)

4. **Check network:**
   ```javascript
   // Test connectivity
   fetch('https://openrouter.ai/api/v1/models').then(r => r.json()).then(console.log)
   ```

---

## Browser Compatibility

### Supported Browsers

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome/Edge | 90+ | Recommended |
| Firefox | 88+ | Good support |
| Safari | 14+ | Some limitations |
| Opera | 76+ | Chromium-based |

### Known Issues

**Safari < 15:**
- IndexedDB may have size limits
- Web Crypto API slower

**Firefox Private Mode:**
- Storage cleared on close
- Consider using normal mode

**Mobile Browsers:**
- Virtual keyboard may hide chat input
- Use landscape mode for better experience

---

## Error Messages Reference

### Security Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Secure context required` | HTTP instead of HTTPS | Use HTTPS or localhost |
| `Token binding verification failed` | Session changed | Reload page |
| `Geographic lockout detected` | Location changes | Wait for cooldown |

### Storage Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `IndexedDB database blocked` | Multiple tabs open | Close other tabs |
| `Quota exceeded` | Too much data | Archive old streams |
| `Invalid state` | Corrupted data | Clear and re-upload |

### Provider Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid API key | Check API key |
| `Model not compatible` | Wrong model name | Use compatible model |
| `Network error` | Connection failed | Check proxy/network |

---

## Getting Additional Help

### Debug Information

When reporting issues, include:

1. Browser name and version
2. Console error messages
3. Steps to reproduce
4. Debug output:
   ```javascript
   console.log({
       browser: navigator.userAgent,
       storage: await Storage.getDataSummary(),
       health: EventBus.getHealthStatus(),
       safeMode: SafeMode.getSafeModeStatus()
   })
   ```

### Support Channels

- **GitHub Issues:** Report bugs at github.com/your-repo/issues
- **Security Issues:** See SECURITY.md for disclosure
- **Documentation:** Check docs/INDEX.md for more guides

---

## Advanced: Manual Recovery

### Export All Data Before Reset

```javascript
// Run in console to export everything
const data = {
    streams: await Storage.getStreams(),
    personality: await Storage.getPersonality(),
    chunks: await Storage.getChunks(),
    sessions: await Storage.getAllSessions(),
    settings: {...localStorage}
}

// Download as file
const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `rhythm-chamber-backup-${new Date().toISOString().slice(0,10)}.json`
a.click()
```

### Reset Everything

```javascript
// DANGER: This deletes ALL data
await Storage.clearAllData()
location.reload()
```

---

**Last Updated:** 2026-01-22
