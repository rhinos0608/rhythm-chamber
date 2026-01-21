# Agent 5: Performance Profiler Report

**Date:** 2026-01-22
**Agent:** Performance Profiler Agent (5 of 20)
**Working Directory:** /Users/rhinesharar/rhythm-chamber

---

## Executive Summary

This report identifies performance bottlenecks and optimization opportunities in Rhythm Chamber, a client-side music analytics SPA built with vanilla JavaScript and ES Modules. The application has a clean architecture with no build step and zero runtime npm dependencies, which inherently provides good baseline performance. However, several optimization opportunities exist that could improve perceived responsiveness, reduce memory footprint, and enhance user experience.

### Key Findings

| Category | Finding | Priority | Impact |
|----------|---------|----------|--------|
| Bundle Size | jszip.min.js is 96KB (largest single dependency) | Medium | High |
| Code Splitting | settings.js is 84KB but loaded eagerly | High | High |
| Event Handling | No throttling on drag-over events (fires rapidly) | High | Medium |
| Memory Leaks | Event listeners have inconsistent cleanup patterns | High | High |
| DOM Operations | No DocumentFragment usage for batch insertions | Medium | Medium |
| Caching | Limited in-memory caching for frequently accessed data | Medium | Medium |

---

## 1. Bundle Size Analysis

### 1.1 Current State

```
jszip.min.js              96KB   (ZIP parsing - largest dependency)
settings.js               84KB   (Settings modal)
rag.js                    44KB   (RAG/vector search)
app.js                    44KB   (Main app logic)
spotify.js                36KB   (Spotify integration)
patterns.js               36KB   (Pattern detection)
parser-worker.js          28KB   (Parser worker)
local-vector-store.js     28KB   (Vector store)
main.js                   24KB   (Entry point)
storage.js                24KB   (Storage facade)
```

**Total JavaScript:** ~550KB (uncompressed, non-minified)

### 1.2 Analysis

**Positive:**
- No npm runtime dependencies (all dependencies are dev-only)
- ES Module architecture allows for code splitting
- Heavy modules (Ollama, RAG, LocalVectorStore) already use ModuleRegistry for lazy loading
- External dependencies minimal: only marked.js via CDN (for markdown)

**Concerns:**
- `jszip.min.js` (96KB) is loaded upfront but only used for file uploads
- `settings.js` (84KB) is loaded eagerly but accessed infrequently
- marked.js dependency is external CDN (privacy/SPOF concern)

### 1.3 Recommendations

1. **Lazy load JSZip:** Move jszip loading to when file upload is initiated
   - Current: Loaded via `<script>` tag in HTML
   - Proposed: Dynamic import inside file upload handler

2. **Code split settings.js:** Dynamic import on settings button click
   - Estimated savings: ~84KB initial bundle reduction
   - Settings modal opens infrequently (admin/configuration)

3. **Vendor marked.js:** Download and serve locally
   - Current: `https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js`
   - Rationale: Privacy (no CDN tracking), SPOF elimination, offline support

---

## 2. Lazy Loading Opportunities

### 2.1 Current Implementation (Good)

The application already implements lazy loading for heavy modules:

```javascript
// main.js - ModuleRegistry for lazy loading
ModuleRegistry.register('Ollama', () => import('./ollama.js'));
ModuleRegistry.register('RAG', () => import('./rag.js'));
ModuleRegistry.register('LocalVectorStore', () => import('./local-vector-store.js'));

// Loaded on user intent
async function loadHeavyModulesOnIntent() {
    await ModuleRegistry.preloadModules([
        'Ollama', 'OllamaProvider', 'RAG',
        'LocalVectorStore', 'LocalEmbeddings'
    ]);
}
```

### 2.2 Additional Opportunities

| Module | Current | Proposed | Savings |
|--------|---------|----------|---------|
| settings.js | Eager import | Dynamic on button click | ~84KB |
| jszip | Script tag | Dynamic on file upload | ~96KB |
| storage-breakdown-ui.js | Unknown | Check usage | Potentially ~24KB |

---

## 3. Memory Leak Potential

### 3.1 Event Listener Analysis

**Total addEventListener calls found:** 100+ across the codebase

#### Proper Cleanup (Good Examples):

```javascript
// js/controllers/sidebar-controller.js
window.removeEventListener('resize', resizeHandler);
sidebarToggleBtn.removeEventListener('click', toggleSidebar);
// ... proper removal in cleanup methods

// js/controllers/observability-controller.js
_removeEventListeners() {
    document.removeEventListener('observability:show', this._onShowDashboard);
    document.removeEventListener('observability:hide', this._onHideDashboard);
    // ... comprehensive cleanup
}
```

#### Concern Areas:

1. **Global window listeners without cleanup:**
   ```javascript
   // js/app.js - potential leak if setupEventListeners() called multiple times
   window.addEventListener('load', () => { ... });
   ```

2. **EventBus subscriptions:**
   - EventBus returns unsubscribe function, but not all callers save it
   - Pattern: `EventBus.on('event', handler)` returns cleanup function
   - Risk: If component destroyed without calling cleanup, handler leaks

3. **Visibility change listeners:**
   ```javascript
   // Multiple files add visibilitychange listeners
   document.addEventListener('visibilitychange', handler);
   // Need to verify cleanup on navigation/module unload
   ```

### 3.2 Recommendations

1. **Adopt AbortController pattern for event listeners:**
   ```javascript
   // Proposed pattern
   class Component {
       #abortController = new AbortController();

       init() {
           document.addEventListener('event', handler, {
               signal: this.#abortController.signal
           });
       }

       destroy() {
           this.#abortController.abort();
       }
   }
   ```

2. **Audit EventBus subscriptions:**
   - Ensure all subscriptions are cleaned up
   - Consider WeakMap for component-to-handler tracking

3. **Verify singleton behavior:**
   - Ensure controllers aren't instantiated multiple times
   - Add assertions for singleton initialization

---

## 4. Inefficient DOM Operations

### 4.1 Current State

**No DocumentFragment usage detected** - all DOM insertions are direct

```javascript
// js/controllers/chat-ui-controller.js - typical pattern
function addMessage(text, role, isError = false) {
    const messages = document.getElementById('chat-messages');
    const messageEl = createMessageElement(text, role, isError);
    messages.appendChild(messageEl);  // Direct insertion - causes reflow
    // ... more direct DOM manipulation
}
```

### 4.2 Impact

- Each `appendChild()` triggers potential reflow/repaint
- For chat messages with 50+ items, this causes cumulative layout thrashing
- No `content-visibility: auto` for off-screen optimization

### 4.3 Recommendations

1. **Use DocumentFragment for batch insertions:**
   ```javascript
   // Proposed optimization
   function addMultipleMessages(messages) {
       const fragment = document.createDocumentFragment();
       messages.forEach(msg => {
           fragment.appendChild(createMessageElement(msg));
       });
       container.appendChild(fragment);  // Single reflow
   }
   ```

2. **Add CSS containment:**
   ```css
   .message {
       content-visibility: auto;
       contain-intrinsic-size: 0 200px;
   }
   ```

3. **Virtual scrolling for chat history (if > 500 messages):**
   - Consider library like `lit-virtualizer` or custom implementation
   - Only render visible + buffer messages

---

## 5. Debouncing/Throttling Needs

### 5.1 Current State

**Debounce utility exists** (`js/utils.js:198`) but usage is limited:

```javascript
function debounce(func, waitMs) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, waitMs);
    };
}
```

**Confirmed usage:** Session save operations (debounced)

### 5.2 Missing Throttle Implementation

**Critical gap:** No throttle utility, but needed for:

1. **Drag-over events** (`js/app.js:708`):
   ```javascript
   // Current - no throttling
   uploadZone.addEventListener('dragover', handleDragOver);

   // Problem: dragover fires ~60fps during drag
   // Impact: Unnecessary class toggling, potential stutter
   ```

2. **Resize events** (`js/controllers/sidebar-controller.js:139`):
   ```javascript
   // Current - no throttling
   window.addEventListener('resize', resizeHandler);
   ```

3. **Input events** (if implementing auto-save or validation):
   - Chat input (for "typing" indicators)
   - Settings sliders (for preview generation)

### 5.3 Recommendations

1. **Add throttle utility to utils.js:**
   ```javascript
   function throttle(func, limitMs) {
       let inThrottle;
       return function(...args) {
           if (!inThrottle) {
               func.apply(this, args);
               inThrottle = true;
               setTimeout(() => inThrottle = false, limitMs);
           }
       };
   }
   ```

2. **Apply to drag-over events:**
   ```javascript
   const throttledDragOver = throttle(handleDragOver, 50);
   uploadZone.addEventListener('dragover', throttledDragOver);
   ```

---

## 6. Cache Optimization

### 6.1 Current State

**Limited caching detected:**

- Settings caching exists: `_cachedSettings` in `js/settings.js:65`
- ModuleRegistry caches loaded modules in `_modules` Map
- No clear pattern for data caching (personality, patterns)

### 6.2 Recommendations

1. **Implement multi-layer cache strategy:**

   ```javascript
   // Proposed cache hierarchy
   const CacheLayer = {
       MEMORY: new Map(),      // Fastest, session-scoped
       INDEXEDDB: Storage,     // Persistent, async

       async get(key) {
           // Check memory first
           if (this.MEMORY.has(key)) {
               return this.MEMORY.get(key);
           }
           // Fall back to IndexedDB
           const value = await Storage.get(key);
           if (value) {
               this.MEMORY.set(key, value);
           }
           return value;
       },

       async set(key, value) {
           this.MEMORY.set(key, value);
           await Storage.set(key, value);  // Async write-through
       }
   };
   ```

2. **Cache frequently accessed data:**
   - Personality detection results
   - Pattern detection results
   - Genre enrichment data
   - Session lists

3. **Implement cache invalidation:**
   - TTL-based expiration
   - Manual invalidation on data updates
   - Size-based eviction (LRU)

---

## 7. Implementation Guide

### 7.1 Quick Wins (Implementation Complexity: Low)

1. **Add throttle utility** (5 minutes)
   - File: `js/utils.js`
   - Export from utils
   - Apply to drag-over and resize events

2. **CSS content-visibility** (5 minutes)
   - File: `css/styles.css`
   - Add to `.message` class

3. **Vendor marked.js** (10 minutes)
   - Download to `lib/marked.min.js`
   - Update CSP and script tag

### 7.2 Medium Effort (Implementation Complexity: Medium)

1. **Lazy load settings.js** (1 hour)
   - Convert to dynamic import
   - Update settings button click handler
   - Test modal loading

2. **Add DocumentFragment to chat** (2 hours)
   - Refactor `addMessage` for batch operations
   - Test with large chat histories

3. **Improve event listener cleanup** (3 hours)
   - Audit all addEventListener calls
   - Implement AbortController pattern
   - Add teardown methods to all controllers

### 7.3 Complex Refactors (Implementation Complexity: High)

1. **Lazy load jszip** (4 hours)
   - Remove from HTML
   - Add dynamic import before file processing
   - Handle loading states
   - Fallback for offline scenarios

2. **Implement comprehensive caching layer** (8 hours)
   - Design cache API
   - Implement cache layer
   - Add invalidation logic
   - Update all data access points

3. **Virtual scrolling for chat** (12 hours)
   - Evaluate options (lit-virtualizer, custom)
   - Implement virtual list
   - Integrate with chat UI
   - Test performance with 1000+ messages

---

## 8. Monitoring & Metrics

### 8.1 Existing Observability

The application includes:
- `js/observability/core-web-vitals.js` - Web Vitals tracking
- `js/observability/init-observability.js` - Initialization
- `js/services/wave-telemetry.js` - LLM timing telemetry
- `js/services/performance-profiler.js` - Performance profiling

### 8.2 Recommended Metrics

Track additional performance metrics:

```javascript
// Performance markers to add
performance.mark('bundle-load-start');
// ... module loading
performance.mark('bundle-load-end');
performance.measure('bundle-load', 'bundle-load-start', 'bundle-load-end');

// Memory tracking
if (performance.memory) {
    console.log('Memory:', {
        usedJSHeapSize: performance.memory.usedJSHeapSize / 1024 / 1024 + ' MB',
        totalJSHeapSize: performance.memory.totalJSHeapSize / 1024 / 1024 + ' MB'
    });
}
```

---

## 9. Testing Recommendations

1. **Load testing:** Test with large Spotify exports (100K+ streams)
2. **Memory profiling:** Chrome DevTools Memory profiler during extended chat sessions
3. **Network throttling:** Test with slow 3G to verify lazy loading UX
4. **Event listener audit:** Use DevTools to detect orphaned listeners
5. **Bundle analysis:** Use `rollup-plugin-visualizer` or similar for dependency graph

---

## 10. Conclusion

Rhythm Chamber has a solid performance foundation due to its vanilla JS architecture and lack of runtime dependencies. The most impactful optimizations are:

1. **Lazy loading settings.js** - 84KB initial bundle reduction
2. **Throttling drag-over events** - Smoother drag-and-drop UX
3. **Event listener cleanup** - Prevent memory leaks
4. **CSS content-visibility** - Native browser optimization for chat

The EventBus, ModuleRegistry, and existing lazy loading for heavy modules demonstrate good architectural awareness for performance. Building on these patterns with the recommendations above will yield measurable improvements.

---

## Appendix A: File Reference

Key files for performance optimization:

| File | Size | Purpose | Priority |
|------|------|---------|----------|
| `js/settings.js` | 84KB | Settings modal | High |
| `js/vendor/jszip.min.js` | 96KB | ZIP parsing | High |
| `js/utils.js` | 16KB | Utilities (add throttle) | High |
| `js/app.js` | 44KB | Main app (drag events) | Medium |
| `js/controllers/chat-ui-controller.js` | - | Chat rendering | Medium |
| `css/styles.css` | - | Add content-visibility | Low |
