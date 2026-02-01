/**
 * Query Expander
 *
 * Expands search queries using multiple strategies:
 * - Synonym expansion (auth -> authentication, authenticate, etc.)
 * - Dependency graph traversal (related symbols)
 * - CamelCase splitting (getSessionManager -> get, Session, Manager)
 * - Stop word removal
 *
 * Improves semantic search recall by generating alternative query formulations.
 */

/**
 * Common stop words to filter out
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'for',
  'nor',
  'so',
  'yet',
  'at',
  'by',
  'from',
  'in',
  'into',
  'of',
  'on',
  'to',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'should',
  'could',
  'may',
  'might',
  'can',
  'shall',
  'must',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
]);

/**
 * Minimum term length after filtering
 */
const MIN_TERM_LENGTH = 2;

/**
 * Maximum number of expanded queries to return
 */
const MAX_EXPANSIONS = 20;

/**
 * Query Expander class
 */
export class QueryExpander {
  /**
   * @param {DependencyGraph} dependencyGraph - The dependency graph for finding related symbols
   */
  constructor(dependencyGraph) {
    this.dependencyGraph = dependencyGraph;

    // Domain-specific synonym mappings for code search
    this.synonyms = {
      auth: ['authentication', 'authenticate', 'authorize', 'authorization'],
      session: ['sessions', 'sessionstate'],
      message: ['messages', 'msg', 'chatmessage'],
      user: ['users', 'userdata', 'userinfo', 'account'],
      config: ['configuration', 'settings', 'options', 'cfg'],
      token: ['tokens', 'jwt', 'accesstoken'],
      error: ['errors', 'exception', 'err'],
      data: ['datum', 'info'],
      create: ['make', 'build', 'construct', 'new'],
      get: ['fetch', 'retrieve', 'load', 'read'],
      delete: ['remove', 'destroy', 'clear'],
      // Additional domain-specific terms
      stream: ['streams', 'streaming'],
      chunk: ['chunks', 'segment'],
      vector: ['vectors', 'embedding'],
      embed: ['embeddings', 'embedded', 'embedding'],
      search: ['find', 'query', 'lookup'],
      index: ['indexes', 'indices', 'indexed'],
      storage: ['store', 'database', 'db'],
      cache: ['caching', 'cached'],
      provider: ['providers', 'service'],
      controller: ['controllers', 'handler'],
      service: ['services', 'business'],
      utility: ['utilities', 'utils', 'helper'],
      function: ['functions', 'func', 'fn', 'method'],
      class: ['classes', 'type'],
      variable: ['variables', 'var', 'let', 'const'],
      module: ['modules', 'file'],
      import: ['imports', 'require', 'include'],
      export: ['exports', 'expose'],
      async: ['promise', 'await', 'future'],
      event: ['events', 'emitter', 'listener', 'handler'],
      listener: ['listeners', 'handler', 'callback'],
      callback: ['callbacks', 'handler', 'cb'],
      request: ['requests', 'req', 'query'],
      response: ['responses', 'res', 'result'],
      client: ['clients', 'customer', 'frontend'],
      server: ['backend', 'api', 'endpoint'],
      api: ['interface', 'endpoint', 'rest'],
      http: ['request', 'response', 'fetch'],
      file: ['files', 'document', 'path'],
      path: ['paths', 'route', 'url'],
      route: ['routes', 'router', 'routing'],
      url: ['urls', 'uri', 'link', 'href'],
      json: ['data', 'object', 'parse'],
      string: ['strings', 'text', 'str'],
      number: ['numbers', 'int', 'float', 'numeric'],
      boolean: ['bool', 'true', 'false'],
      array: ['arrays', 'list', 'collection'],
      object: ['objects', 'dict', 'hash', 'map'],
      map: ['maps', 'dictionary', 'hash'],
      set: ['sets', 'collection'],
      list: ['lists', 'array', 'collection'],
      queue: ['queues', 'fifo'],
      stack: ['stacks', 'lifo'],
      tree: ['trees', 'hierarchy', 'node'],
      graph: ['graphs', 'network', 'node', 'edge'],
      node: ['nodes', 'vertex', 'element'],
    };
  }

  /**
   * Expand a query using multiple strategies
   *
   * @param {string} query - The original query
   * @returns {string[]} Array of expanded queries (includes original)
   */
  expand(query) {
    if (!query || typeof query !== 'string') {
      return [query || ''];
    }

    const expansions = new Set([query.trim()]);
    const terms = this._extractTerms(query);

    if (terms.length === 0) {
      return [query.trim()];
    }

    // Strategy 1: Synonym expansion for each term
    for (const term of terms) {
      const synonyms = this._getSynonyms(term);
      for (const synonym of synonyms) {
        // Create query with this term replaced by synonym
        const expanded = this._replaceTermInQuery(query, term, synonym);
        if (expanded !== query) {
          expansions.add(expanded);
        }

        // Create query with synonym added
        expansions.add(`${query} ${synonym}`);
      }
    }

    // Strategy 2: Add related symbols from dependency graph
    if (this.dependencyGraph) {
      const relatedSymbols = this._findRelatedSymbols(terms);
      for (const symbol of relatedSymbols.slice(0, 5)) {
        // Limit to top 5
        expansions.add(`${query} ${symbol}`);
      }
    }

    // Strategy 3: Create compound queries from multiple term expansions
    if (terms.length >= 2) {
      const primarySynonyms = terms
        .slice(0, 2)
        .flatMap(term => this._getSynonyms(term).slice(0, 2));

      for (const syn1 of primarySynonyms) {
        for (const syn2 of primarySynonyms) {
          if (syn1 !== syn2) {
            expansions.add(`${syn1} ${syn2}`);
          }
        }
      }
    }

    // Strategy 4: Query with camelCase terms expanded
    const camelCaseExpanded = terms.join(' ');
    if (camelCaseExpanded !== query.toLowerCase()) {
      expansions.add(camelCaseExpanded);
    }

    // Convert to array and limit
    const result = Array.from(expansions)
      .filter(q => q.length > 0)
      .slice(0, MAX_EXPANSIONS);

    return result;
  }

  /**
   * Extract search terms from a query
   *
   * - Splits camelCase identifiers (getSessionManager -> get, Session, Manager)
   * - Removes stop words (the, a, an, etc.)
   * - Filters to terms with length > 2
   *
   * @param {string} query - The query text
   * @returns {string[]} Array of extracted terms (lowercase)
   */
  _extractTerms(query) {
    if (!query) return [];

    const terms = new Set();

    // Extract identifiers (camelCase, snake_case, PascalCase)
    const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const identifiers = query.match(identifierRegex) || [];

    for (const id of identifiers) {
      // FIX #14: Improved camelCase/PascalCase splitting with number handling
      // Handles edge cases like: OAuth2Token, XML2JSON, Base64Encoder
      const words = id
        // Insert space before capital letters (including consecutive caps)
        .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase: camelCase -> camel Case
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // PascalCase: HTTPRequest -> HTTP Request
        // Insert space between letters and numbers
        .replace(/([a-zA-Z])(\d)/g, '$1 $2') // get2 -> get 2
        .replace(/(\d)([a-zA-Z])/g, '$1 $2') // 2get -> 2 get
        .replace(/[_-]+/g, ' ') // snake_case or kebab-case
        .toLowerCase()
        .split(/\s+/);

      for (const word of words) {
        if (word.length > MIN_TERM_LENGTH && !STOP_WORDS.has(word)) {
          terms.add(word);
        }
      }
    }

    // Extract quoted strings
    const quotedRegex = /['"]([^'"]+)['"]/g;
    let match;
    while ((match = quotedRegex.exec(query)) !== null) {
      const quoted = match[1].toLowerCase();
      if (quoted.length > MIN_TERM_LENGTH && !STOP_WORDS.has(quoted)) {
        terms.add(quoted);
      }
    }

    // Extract remaining words (non-identifier)
    const remainingText = query
      .replace(identifierRegex, ' ')
      .replace(/['"][^'"]*['"]/g, ' ')
      .toLowerCase()
      .split(/\s+/);

    for (const word of remainingText) {
      if (word.length > MIN_TERM_LENGTH && !STOP_WORDS.has(word)) {
        terms.add(word);
      }
    }

    return Array.from(terms);
  }

  /**
   * Get synonyms for a term
   *
   * @param {string} term - The term to find synonyms for
   * @returns {string[]} Array of synonyms
   */
  _getSynonyms(term) {
    const termLower = term.toLowerCase();

    // Direct lookup
    if (this.synonyms[termLower]) {
      return this.synonyms[termLower];
    }

    // Reverse lookup (term might be a synonym of another)
    for (const [key, values] of Object.entries(this.synonyms)) {
      if (values.includes(termLower)) {
        return [key, ...values.filter(v => v !== termLower)];
      }
    }

    // Partial match (term starts with a key)
    for (const [key, values] of Object.entries(this.synonyms)) {
      if (termLower.startsWith(key) && key.length >= 3) {
        return values;
      }
    }

    return [];
  }

  /**
   * Replace a term in the original query with a synonym
   *
   * @param {string} query - Original query
   * @param {string} term - Term to replace
   * @param {string} synonym - Replacement term
   * @returns {string} Modified query
   */
  _replaceTermInQuery(query, term, synonym) {
    // FIX #9: Sanitize term to prevent regex injection
    // Escape special regex characters to prevent ReDoS attacks
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Case-insensitive replacement preserving word boundaries
    const regex = new RegExp(`\\b${escapedTerm}\\b`, 'gi');

    // FIX #8: Use function replacement to avoid $backreference injection in synonym
    // If synonym contains $&, $1, $`, etc., they would be interpreted as regex replacements
    return query.replace(regex, () => synonym);
  }

  /**
   * Find related symbols from the dependency graph
   *
   * FIX #4: Added depth/cost limits to prevent O(n³) performance issues
   *
   * @param {string[]} terms - Extracted query terms
   * @returns {string[]} Array of related symbol names
   */
  _findRelatedSymbols(terms) {
    if (!this.dependencyGraph || terms.length === 0) {
      return [];
    }

    const related = new Set();
    // Performance limits to prevent O(n³) traversal
    const MAX_SYMBOLS_TO_SCAN = 500; // Limit symbols scanned per term
    const MAX_USAGES_PER_SYMBOL = 10; // Limit usage lookups
    const MAX_RELATED_RESULTS = 50; // Limit total results

    for (const term of terms) {
      let symbolsScanned = 0;

      // Find symbols that match or contain the term
      for (const [symbol, definitions] of this.dependencyGraph.definitions.entries()) {
        if (symbolsScanned++ >= MAX_SYMBOLS_TO_SCAN) break;

        const symbolLower = symbol.toLowerCase();

        // Exact match or symbol contains term
        if (symbolLower === term || symbolLower.includes(term)) {
          if (related.size >= MAX_RELATED_RESULTS) break;
          related.add(symbol);

          // Add symbols that use this symbol (with limit)
          const usages = this.dependencyGraph.findUsages(symbol);
          for (const usage of usages.slice(0, MAX_USAGES_PER_SYMBOL)) {
            const chunkSyms = this.dependencyGraph.getSymbolsForChunk(usage.chunkId);
            for (const definedSymbol of chunkSyms.defines) {
              if (definedSymbol.toLowerCase() !== term) {
                related.add(definedSymbol);
              }
            }
          }
        }
      }

      // Early exit if we've hit the limit
      if (related.size >= MAX_RELATED_RESULTS) break;

      // Find symbols where term is a substring (with limit)
      let substringScanned = 0;
      for (const symbol of this.dependencyGraph.definitions.keys()) {
        if (substringScanned++ >= MAX_SYMBOLS_TO_SCAN) break;
        if (related.size >= MAX_RELATED_RESULTS) break;

        if (term.includes(symbol.toLowerCase()) && symbol.length >= 3) {
          related.add(symbol);
        }
      }
    }

    return Array.from(related);
  }

  /**
   * Add custom synonym mapping
   *
   * @param {string} term - The term to add synonyms for
   * @param {string[]} synonyms - Array of synonym strings
   */
  addSynonyms(term, synonyms) {
    const termLower = term.toLowerCase();
    if (!this.synonyms[termLower]) {
      this.synonyms[termLower] = [];
    }
    this.synonyms[termLower].push(...synonyms.map(s => s.toLowerCase()));
  }

  /**
   * Get current synonym mappings
   *
   * @returns {Object} Copy of synonyms object
   */
  getSynonyms() {
    return { ...this.synonyms };
  }

  /**
   * Get stop words set
   *
   * @returns {Set<string>} Copy of stop words
   */
  getStopWords() {
    return new Set(STOP_WORDS);
  }
}

/**
 * Default export
 */
export default QueryExpander;
