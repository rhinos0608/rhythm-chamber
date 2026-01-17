# Rhythm Chamber Deployment Guide

This guide covers deploying Rhythm Chamber with proper configuration for optimal performance, including SharedArrayBuffer support for enhanced vector search operations.

## Overview

Rhythm Chamber is a **100% client-side** application that can be deployed to any static hosting service. The app uses:

- **IndexedDB** for persistent storage
- **Web Workers** for parallel processing
- **WebAssembly (WASM)** for local embeddings and semantic search
- **SharedArrayBuffer** (optional) for zero-copy worker communication

## Performance Optimization: SharedArrayBuffer

### What is SharedArrayBuffer?

SharedArrayBuffer enables zero-copy data transfer between the main thread and Web Workers, significantly improving performance for:

- **Vector search operations**: Cosine similarity computations for semantic search
- **Pattern detection**: Parallel music analysis algorithms
- **Embedding generation**: Local text vectorization

**Performance Impact**:
- **Without SharedArrayBuffer**: Structured clone overhead (~50-200ms per operation)
- **With SharedArrayBuffer**: Zero-copy memory access (~5-20ms per operation)
- **Dataset size matters**: Benefits increase with larger datasets (500+ vectors)

### COOP/COEP Requirements

SharedArrayBuffer requires specific HTTP security headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Security Context**: These headers isolate your page from other cross-origin windows, preventing certain types of attacks but also restricting some cross-origin features.

## Platform-Specific Deployment

### Vercel

✅ **Fully Supported** - Configuration included in repository

**Deployment Steps**:

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Configuration**: The `vercel.json` file in the repository includes COOP/COEP headers

**Notes**:
- SharedArrayBuffer is automatically enabled
- No additional configuration required
- Works with custom domains

### Netlify

✅ **Fully Supported** - Configuration included in repository

**Deployment Steps**:

1. **Install Netlify CLI**:
   ```bash
   npm i -g netlify-cli
   ```

2. **Deploy**:
   ```bash
   netlify deploy --prod
   ```

3. **Configuration**: The `netlify.toml` file in the repository includes COOP/COEP headers

**Notes**:
- SharedArrayBuffer is automatically enabled
- No additional configuration required
- Works with custom domains

### GitHub Pages

❌ **SharedArrayBuffer NOT Supported**

GitHub Pages does not allow custom HTTP headers, so SharedArrayBuffer **cannot be enabled**.

**Workaround**:
- Rhythm Chamber will automatically fall back to structured clone mode
- All features work, but with reduced performance for vector operations
- Consider using Vercel, Netlify, or Cloudflare Pages instead

### Apache Server

✅ **Supported** - Configuration included in repository

**Deployment Steps**:

1. **Copy `.htaccess` file** to your web root
2. **Enable mod_headers**:
   ```bash
   sudo a2enmod headers
   sudo systemctl restart apache2
   ```

3. **Deploy files** to your web directory

**Notes**:
- The `.htaccess` file includes COOP/COEP headers
- Works with shared hosting
- Ensure `AllowOverride All` is set in your Apache config

### Nginx

✅ **Supported** - Manual configuration required

**Configuration**:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/rhythm-chamber;
    index index.html;

    # COOP/COEP headers for SharedArrayBuffer
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Deployment Steps**:

1. **Copy files** to your web root
2. **Add the configuration** to your nginx server block
3. **Reload nginx**:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

### Cloudflare Pages

✅ **Supported** - Configuration via dashboard

**Deployment Steps**:

1. **Connect repository** to Cloudflare Pages
2. **Build settings**:
   - Build command: (empty - static files only)
   - Build output directory: `/`
3. **Add headers** in dashboard:
   - Go to Settings → Headers
   - Add for `/*`:
     ```
     Cross-Origin-Embedder-Policy: require-corp
     Cross-Origin-Opener-Policy: same-origin
     ```

**Notes**:
- Headers must be configured via dashboard (not in repository)
- SharedArrayBuffer works once headers are added
- Excellent global CDN performance

## Local Development

### Standard Development Server

For basic development without SharedArrayBuffer:

```bash
npm run dev
```

This uses `http-server` without COOP/COEP headers.

### COOP/COEP Development Server

For testing SharedArrayBuffer features locally:

```bash
npm run dev:coop-coep
```

This starts a custom Node.js server with COOP/COEP headers enabled.

**Note**: Local development (localhost) automatically allows SharedArrayBuffer without COOP/COEP headers, but the custom server ensures production parity.

## Deployment Verification

### Checking SharedArrayBuffer Availability

After deployment, verify SharedArrayBuffer is working:

1. **Open browser DevTools** (F12)
2. **Go to Console**
3. **Run**:
   ```javascript
   typeof SharedArrayBuffer !== 'undefined'
   ```

**Expected Results**:
- `true` with proper COOP/COEP headers
- `false` without headers (graceful fallback)

### Performance Testing

Test vector search performance with and without SharedArrayBuffer:

```javascript
// In browser console
import { LocalVectorStore } from './js/local-vector-store.js';
await LocalVectorStore.init();
const stats = LocalVectorStore.getStats();
console.log('SharedArrayBuffer enabled:', stats.sharedMemoryEnabled);
```

## Troubleshooting

### SharedArrayBuffer Undefined

**Symptoms**: `typeof SharedArrayBuffer` returns `undefined`

**Solutions**:
1. **Check COOP/COEP headers** are present:
   ```bash
   curl -I https://your-domain.com | grep -i "cross-origin"
   ```
2. **Verify HTTPS** is enabled (required for SharedArrayBuffer)
3. **Check browser compatibility** (see below)
4. **Review platform-specific configuration** above

### Browser Compatibility

**SharedArrayBuffer Support**:
- ✅ Chrome 92+ (Desktop)
- ✅ Edge 92+ (Desktop)
- ✅ Firefox 89+ (Desktop)
- ❌ Safari (All versions)
- ❌ Mobile browsers (Limited support)

**Graceful Fallback**: Rhythm Chamber automatically detects SharedArrayBuffer availability and falls back to structured clone mode if unavailable.

### Cross-Origin Resource Issues

If you see errors like:

```
Cross-origin embedder policy requires 'corp'
```

**Solution**: Ensure all external resources (scripts, styles, images) are loaded from the same origin or have `crossorigin="anonymous"` attribute.

### Mixed Content Errors

**Symptoms**: Browser blocks resources with "Mixed Content" error

**Solution**: Ensure all resources are loaded via HTTPS when deployed to HTTPS.

## Performance Monitoring

### Production Monitoring

Monitor SharedArrayBuffer usage in production:

```javascript
// Check if SharedArrayBuffer is available
const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

// Track performance difference
if (hasSharedArrayBuffer) {
  console.log('✓ SharedArrayBuffer enabled - Optimal performance');
} else {
  console.log('⚠ SharedArrayBuffer disabled - Using fallback mode');
}
```

### Expected Performance Metrics

**With SharedArrayBuffer** (500 vectors):
- Search latency: ~20-50ms
- Memory overhead: Minimal (zero-copy)

**Without SharedArrayBuffer** (500 vectors):
- Search latency: ~100-300ms
- Memory overhead: Moderate (structured clone)

## Security Considerations

### COOP/COEP Impact

**Enabled** (SharedArrayBuffer working):
- ✅ Enhanced isolation from cross-origin attacks
- ❌ Cannot embed in cross-origin iframes
- ❌ Cannot open cross-origin windows with `window.open()`

**Disabled** (SharedArrayBuffer not working):
- ✅ Full cross-origin capabilities
- ❌ Reduced isolation guarantees

### Recommendation

For a music analytics app like Rhythm Chamber:
- **COOP/COEP recommended** - The app doesn't need cross-origin iframes or windows
- **Performance benefits** outweigh the restrictions
- **Security improvement** is valuable for user data

## Continuous Deployment

### Automated Deployment

**GitHub Actions** (example for Vercel):

```yaml
name: Deploy to Vercel
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

**Netlify** (automatic):
- Connect repository to Netlify
- Auto-deploys on push to main branch
- No configuration needed

## Support

For deployment issues:
1. Check browser console for errors
2. Verify COOP/COEP headers are present
3. Ensure HTTPS is enabled
4. Review platform-specific configuration above
5. Open an issue on GitHub with deployment details

## Additional Resources

- [MDN: SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [COOP and COEP Explained](https://web.dev/coop-coep/)
- [Vercel Headers Documentation](https://vercel.com/docs/configuration#project/headers)
- [Netlify Headers Documentation](https://docs.netlify.com/routing/headers/)
