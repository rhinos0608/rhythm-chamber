# Build Process Documentation

## Overview

Rhythm Chamber uses a minimal build pipeline to optimize production assets. The build process:

1. **Minifies JavaScript** with esbuild (removes whitespace, renames variables, removes console.log)
2. **Minifies CSS** (removes comments and unnecessary whitespace)
3. **Copies static files** to a `dist/` directory ready for deployment

## Quick Start

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Test the build locally
npm run dev:dist
```

The built files will be in the `dist/` directory.

## Build Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build production assets to `dist/` |
| `npm run build:dev` | Alias for `npm run build` |
| `npm run dev:dist` | Serve the `dist/` directory locally on port 8080 |
| `npm run dev` | Serve source files (development mode) |
| `npm run dev:coop-coep` | Serve with COOP/COEP headers (SharedArrayBuffer support) |

## Build Output

After running `npm run build`:

```
dist/
├── index.html          # Landing page
├── app.html            # Main application
├── css/
│   └── styles.css      # Minified CSS
├── js/
│   ├── main.js         # Minified entry point
│   └── workers/        # Minified worker files
├── netlify.toml        # Netlify config
├── vercel.json         # Vercel config
└── .htaccess           # Apache config
```

## Deployment

### Vercel

```bash
npm run build
vercel --prod
```

### Netlify

```bash
npm run build
netlify deploy --prod
```

### Manual Deployment

1. Run `npm run build`
2. Upload contents of `dist/` to your web server
3. Ensure COOP/COEP headers are configured (see `docs/DEPLOYMENT.md`)

## Performance Improvements

The build process provides approximately:

- **JavaScript**: 55-80% size reduction via minification
- **CSS**: 20-25% size reduction via minification
- **Console removal**: 5-10% additional savings

### Before vs After

| Asset | Original | Minified | Reduction |
|-------|----------|----------|-----------|
| main.js | 20.3 KB | 5.8 KB | 71.7% |
| pattern-worker-pool.js | 27.3 KB | 6.4 KB | 76.7% |
| styles.css | 96.4 KB | 73.5 KB | 23.8% |

## Advanced Configuration

The build script (`scripts/build.mjs`) can be customized:

### Enabling Source Maps

Edit `scripts/build.mjs`:
```javascript
sourcemap: true,  // Change from false
```

### Keeping Console Logs

Edit `scripts/build.mjs`:
```javascript
drop: [],  // Remove 'console', 'debugger' from drop array
```

### Adjusting Target Browsers

Edit `scripts/build.mjs`:
```javascript
target: 'es2020',  // Change to 'es2015', 'esnext', etc.
```

## Troubleshooting

### Build Fails

1. Ensure esbuild is installed: `npm install`
2. Check Node.js version (requires Node 18+)
3. Check file permissions on `scripts/build.mjs`

### dist/ Directory Not Created

1. Check for write permissions in project directory
2. Ensure no file named `dist` exists (remove it if it's a file, not directory)
3. Run `rm -rf dist && npm run build`

### COOP/COEP Headers Not Working

The build doesn't add headers - they must be configured on your server. See `docs/DEPLOYMENT.md` for platform-specific instructions.

## Future Enhancements

Potential improvements to the build process:

1. **Code Splitting** - Separate bundles for different features
2. **Tree Shaking** - Remove unused code (already enabled via esbuild)
3. **Critical CSS Extraction** - Inline above-the-fold styles
4. **Service Worker** - Cache assets for offline use
5. **Bundle Analysis** - Track bundle size over time
6. **Environment Variables** - Build-time configuration

See `.planning/reports/agent-20-build-deploy.md` for detailed recommendations.
