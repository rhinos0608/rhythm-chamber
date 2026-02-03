/**
 * MCP Tool: deep_code_search
 *
 * Orchestrates comprehensive code search using semantic search
 * with optional dependency graph analysis from the indexed data.
 */

/**
 * Tool schema definition
 */
export const schema = {
  name: 'deep_code_search',
  description:
    'Orchestrates comprehensive code search using semantic search with dependency graph analysis. Returns clustered, ranked results with full context.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query or code symbol to search for',
      },
      scope: {
        type: 'string',
        enum: ['code', 'docs', 'all'],
        description:
          'Search scope. "code" excludes docs/coverage, "docs" searches docs only, "all" searches everything.',
        default: 'code',
      },
      depth: {
        type: 'string',
        enum: ['quick', 'standard', 'thorough'],
        description: 'Analysis depth - affects search threshold and related chunk analysis',
        default: 'standard',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return',
        default: 10,
        minimum: 1,
        maximum: 50,
      },
      includeSnippets: {
        type: 'boolean',
        description: 'Include a short code snippet for each match',
        default: true,
      },
      maxChars: {
        type: 'number',
        description: 'Maximum characters per snippet',
        default: 160,
        minimum: 50,
        maximum: 500,
      },
    },
    required: ['query'],
  },
};

/**
 * Handle tool execution
 */
export const handler = async (args, projectRoot, indexer, server) => {
  const {
    query,
    depth = 'standard',
    limit = 10,
    scope = 'code',
    includeSnippets = true,
    maxChars = 160,
  } = args;

  console.error(`[deep_code_search] Starting ${depth} analysis for: ${query}`);

  const startTime = Date.now();
  const phases = [];

  // Phase 1: Semantic Search
  phases.push(
    await phase1SemanticSearch(query, limit, indexer, depth, { scope, includeSnippets, maxChars })
  );

  // Phase 2: Related Chunks Analysis (using dependency graph)
  if (depth !== 'quick' && phases[0].results.length > 0 && indexer) {
    phases.push(await phase2RelatedChunks(phases[0].results, indexer));
  }

  const elapsed = Date.now() - startTime;

  // Format results
  const summary = formatResults(phases, query, depth, elapsed);

  return {
    content: [
      {
        type: 'text',
        text: summary,
      },
    ],
    metadata: {
      query,
      depth,
      phasesCompleted: phases.length,
      elapsedMs: elapsed,
    },
  };
};

/**
 * Phase 1: Semantic Search
 */
async function phase1SemanticSearch(query, limit, indexer, depth, options = {}) {
  const startTime = Date.now();

  if (!indexer) {
    return {
      phase: 'semantic',
      status: 'skipped',
      reason: 'Indexer not available',
      results: [],
      elapsed: Date.now() - startTime,
    };
  }

  try {
    const threshold = depth === 'quick' ? 0.2 : depth === 'thorough' ? 0.4 : 0.3;
    const { scope = 'code', includeSnippets = true, maxChars = 160 } = options;

    // Code-first default: avoid docs dominating results for generic queries.
    const filters = {};
    if (scope !== 'all') {
      if (scope === 'docs') {
        filters.filePattern = '^docs/';
      } else if (scope === 'code') {
        filters.filePattern = '^(?!docs/)(?!coverage/).*';
      }
    }

    const results = await indexer.search(query, { limit, threshold, filters });

    return {
      phase: 'semantic',
      status: 'complete',
      results: results.map(r => ({
        chunkId: r.chunkId,
        similarity: r.similarity,
        rrfScore: r.rrfScore,
        file: r.metadata?.file,
        type: r.metadata?.type,
        name: r.metadata?.name,
        lines: `${r.metadata?.startLine}-${r.metadata?.endLine}`,
        exported: r.metadata?.exported,
        snippet: includeSnippets ? buildSnippet(r.metadata?.text || '', maxChars) : null,
      })),
      elapsed: Date.now() - startTime,
    };
  } catch (error) {
    return {
      phase: 'semantic',
      status: 'error',
      error: error.message,
      results: [],
      elapsed: Date.now() - startTime,
    };
  }
}

/**
 * Phase 2: Related Chunks Analysis
 */
async function phase2RelatedChunks(semanticResults, indexer) {
  const startTime = Date.now();

  const results = [];
  const processedChunks = new Set();

  for (const result of semanticResults.slice(0, 5)) {
    if (processedChunks.has(result.chunkId)) continue;

    try {
      const details = indexer.getChunkDetails(result.chunkId);

      if (details && details.related) {
        results.push({
          chunkId: result.chunkId,
          name: result.name,
          file: result.file,
          callers: details.related.callers?.length || 0,
          callees: details.related.callees?.length || 0,
          relatedCallers: (details.related.callers || []).slice(0, 3).map(c => ({
            chunkId: c.chunkId,
            symbol: c.symbol,
          })),
          relatedCallees: (details.related.callees || []).slice(0, 3).map(c => ({
            chunkId: c.chunkId,
            symbol: c.symbol,
          })),
        });

        processedChunks.add(result.chunkId);
      }
    } catch (error) {
      console.error(
        `[deep_code_search] Related analysis failed for ${result.chunkId}:`,
        error.message
      );
    }
  }

  return {
    phase: 'related',
    status: 'complete',
    results,
    elapsed: Date.now() - startTime,
  };
}

/**
 * Format results
 */
function formatResults(phases, query, depth, elapsed) {
  const lines = [];

  lines.push(`# Deep Code Search: "${query}"`);
  lines.push('');
  lines.push(`**Analysis Depth:** ${depth}`);
  lines.push(
    `**Phases Completed:** ${phases.filter(p => p.status === 'complete').length}/${phases.length}`
  );
  lines.push(`**Total Time:** ${(elapsed / 1000).toFixed(2)}s`);
  lines.push('');

  // Phase 1: Semantic Results
  const semantic = phases.find(p => p.phase === 'semantic');
  if (semantic && semantic.results.length > 0) {
    lines.push('## 🎯 Semantic Matches');
    lines.push('');

    // Cluster by file
    const byFile = clusterByFile(semantic.results);

    for (const [file, matches] of Object.entries(byFile)) {
      lines.push(`### ${file}`);
      lines.push('');

      for (const match of matches) {
        const { badge, label } = formatMatchScore(match);
        lines.push(`- ${badge} **${match.name}** (L${match.lines}) - ${label}`);

        if (match.exported) {
          lines.push('  - Exported ✓');
        }

        if (match.snippet) {
          lines.push(`  - Snippet: \`${sanitizeInlineCode(match.snippet)}\``);
        }
      }

      lines.push('');
    }
  } else if (semantic?.status === 'skipped') {
    lines.push('## ⚠️ Semantic Search Unavailable');
    lines.push('');
    lines.push(semantic.reason || 'The semantic search indexer is not available.');
    lines.push('');
    lines.push('**Suggestion:** Use `search_architecture` for pattern-based searching.');
    lines.push('');
  }

  // Phase 2: Related Chunks
  const related = phases.find(p => p.phase === 'related');
  if (related && related.results.length > 0) {
    lines.push('## 🔗 Related Code');
    lines.push('');
    lines.push('Symbol relationships for top results:');
    lines.push('');

    for (const {
      chunkId,
      name,
      callers,
      callees,
      relatedCallers,
      relatedCallees,
    } of related.results) {
      lines.push(`### **${name}** (\`${chunkId}\`)`);
      lines.push('');

      if (callers > 0) {
        lines.push(`**Called by:** ${callers} locations`);
        if (relatedCallers.length > 0) {
          for (const caller of relatedCallers) {
            lines.push(`  - Uses: \`${caller.symbol}\` from \`${caller.chunkId}\``);
          }
        }
      } else {
        lines.push('**Called by:** None detected');
      }

      lines.push('');

      if (callees > 0) {
        lines.push(`**Calls:** ${callees} symbols`);
        if (relatedCallees.length > 0) {
          for (const callee of relatedCallees) {
            lines.push(`  - \`${callee.symbol}\` (defined in \`${callee.chunkId}\`)`);
          }
        }
      } else {
        lines.push('**Calls:** No external calls detected');
      }

      lines.push('');
    }
  }

  // Summary
  lines.push('## 📊 Summary');
  lines.push('');

  const totalResults = phases.reduce((sum, p) => sum + (p.results?.length || 0), 0);
  lines.push(`- **Semantic Matches:** ${semantic?.results?.length || 0}`);
  lines.push(`- **Related Chunks Analyzed:** ${related?.results?.length || 0}`);
  lines.push(
    `- **Files in Results:** ${new Set(phases.flatMap(p => p.results?.map(r => r.file) || [])).size}`
  );

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('💡 **Follow-up Tools:');
  lines.push('- `get_chunk_details` - Get full source and metadata for a chunk');
  lines.push('- `list_indexed_files` - Browse all indexed files');
  lines.push('- `find_dependencies` - Trace dependency relationships');
  lines.push('- `validate_hnw_compliance` - Check HNW architecture compliance');

  return lines.join('\n');
}

function formatMatchScore(match) {
  if (typeof match?.rrfScore === 'number' && match.similarity === 0) {
    return { badge: '🟣', label: 'lexical match' };
  }

  const score = Math.round((match?.similarity || 0) * 100);
  const badge = score >= 80 ? '🟢' : score >= 60 ? '🟡' : score >= 40 ? '🟠' : '🔴';
  return { badge, label: `${score}% similar` };
}

function buildSnippet(text, maxChars) {
  const trimmed = String(text || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars) + '…';
}

function sanitizeInlineCode(text) {
  // Avoid breaking markdown inline-code fences.
  return String(text || '').replace(/`/g, "'");
}

/**
 * Cluster results by file
 */
function clusterByFile(results) {
  const clustered = {};

  for (const result of results) {
    const file = result.file || 'unknown';
    if (!clustered[file]) {
      clustered[file] = [];
    }
    clustered[file].push(result);
  }

  // Sort within each file by similarity
  for (const file in clustered) {
    clustered[file].sort((a, b) => b.similarity - a.similarity);
  }

  return clustered;
}

export default { schema, handler };
