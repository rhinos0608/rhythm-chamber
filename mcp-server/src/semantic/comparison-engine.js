/**
 * Embedding Comparison Engine
 *
 * Analyzes and compares embeddings across multiple models.
 * Generates metrics, reports, and insights.
 *
 * Features:
 * - Cosine similarity comparison
 * - Ranking overlap analysis
 * - Anomaly detection across models
 * - Statistical analysis
 *
 * @module semantic/comparison-engine
 */

/**
 * Comparison Engine
 *
 * Performs comparative analysis on embeddings from different models.
 */
export class ComparisonEngine {
  constructor(multiModelCache) {
    this.multiModelCache = multiModelCache;
  }

  /**
   * Compare embeddings across all models for specific chunks
   * @param {Array<string>} chunkIds - Chunk IDs to compare
   * @returns {Promise<Object>} Comparison results
   */
  async compareChunks(chunkIds) {
    const results = [];

    for (const chunkId of chunkIds) {
      const comparison = this.multiModelCache.compareChunk(chunkId);
      if (comparison.models >= 2) {
        results.push(comparison);
      }
    }

    return this._aggregateComparisons(results);
  }

  /**
   * Compare search results across models
   * @param {string} query - Search query
   * @param {Array<Object>} modelResults - Results from each model
   * @returns {Promise<Object>} Comparison metrics
   */
  compareSearchResults(query, modelResults) {
    const models = Object.keys(modelResults);

    if (models.length < 2) {
      return {
        query,
        models: models.length,
        message: 'Need at least 2 models for comparison',
      };
    }

    return {
      query,
      models,
      rankingOverlap: this._calculateRankingOverlap(modelResults),
      topKOverlap: this._calculateTopKOverlap(modelResults, 5),
      scoreCorrelation: this._calculateScoreCorrelation(modelResults),
    };
  }

  /**
   * Calculate ranking overlap between models
   * Measures how similarly models rank the same results
   * @private
   */
  _calculateRankingOverlap(modelResults) {
    const models = Object.keys(modelResults);
    const overlaps = {};

    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const modelA = models[i];
        const modelB = models[j];
        const resultsA = modelResults[modelA] || [];
        const resultsB = modelResults[modelB] || [];

        const key = `${modelA} <-> ${modelB}`;
        overlaps[key] = this._kendallTau(resultsA, resultsB);
      }
    }

    return overlaps;
  }

  /**
   * Calculate top-K overlap between models
   * Measures how many results appear in top-K of both models
   * @private
   */
  _calculateTopKOverlap(modelResults, k = 5) {
    const models = Object.keys(modelResults);
    const overlaps = {};

    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const modelA = models[i];
        const modelB = models[j];
        const resultsA = (modelResults[modelA] || []).slice(0, k);
        const resultsB = (modelResults[modelB] || []).slice(0, k);

        const setA = new Set(resultsA.map(r => r.chunkId));
        const setB = new Set(resultsB.map(r => r.chunkId));

        const intersection = new Set([...setA].filter(x => setB.has(x)));

        const key = `${modelA} <-> ${modelB}`;
        overlaps[key] = {
          k,
          overlap: intersection.size,
          percentage: (intersection.size / k) * 100,
          sharedChunkIds: Array.from(intersection),
        };
      }
    }

    return overlaps;
  }

  /**
   * Calculate score correlation between models
   * @private
   */
  _calculateScoreCorrelation(modelResults) {
    const models = Object.keys(modelResults);
    const correlations = {};

    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const modelA = models[i];
        const modelB = models[j];
        const resultsA = modelResults[modelA] || [];
        const resultsB = modelResults[modelB] || [];

        // Find common results
        const mapA = new Map(resultsA.map(r => [r.chunkId, r.score || r.similarity]));
        const mapB = new Map(resultsB.map(r => [r.chunkId, r.score || r.similarity]));

        const commonIds = [...mapA.keys()].filter(id => mapB.has(id));

        if (commonIds.length < 2) {
          correlations[`${modelA} <-> ${modelB}`] = {
            correlation: null,
            message: 'Not enough common results',
          };
          continue;
        }

        // Calculate Pearson correlation
        const scoresA = commonIds.map(id => mapA.get(id));
        const scoresB = commonIds.map(id => mapB.get(id));

        const correlation = this._pearsonCorrelation(scoresA, scoresB);
        correlations[`${modelA} <-> ${modelB}`] = {
          correlation,
          commonResults: commonIds.length,
        };
      }
    }

    return correlations;
  }

  /**
   * Calculate Kendall's Tau (ranking correlation)
   * @private
   */
  _kendallTau(resultsA, resultsB) {
    const mapA = new Map(resultsA.map((r, i) => [r.chunkId, i]));
    const mapB = new Map(resultsB.map((r, i) => [r.chunkId, i]));

    const commonIds = [...mapA.keys()].filter(id => mapB.has(id));

    if (commonIds.length < 2) {
      return { tau: null, message: 'Not enough common results' };
    }

    let concordant = 0;
    let discordant = 0;

    for (let i = 0; i < commonIds.length; i++) {
      for (let j = i + 1; j < commonIds.length; j++) {
        const id1 = commonIds[i];
        const id2 = commonIds[j];

        const rankA1 = mapA.get(id1);
        const rankA2 = mapA.get(id2);
        const rankB1 = mapB.get(id1);
        const rankB2 = mapB.get(id2);

        const diffA = rankA1 - rankA2;
        const diffB = rankB1 - rankB2;

        if (diffA * diffB > 0) {
          concordant++;
        } else if (diffA * diffB < 0) {
          discordant++;
        }
      }
    }

    const total = concordant + discordant;
    const tau = total === 0 ? 0 : (concordant - discordant) / total;

    return {
      tau,
      concordant,
      discordant,
      total,
      interpretation: this._interpretTau(tau),
    };
  }

  /**
   * Interpret Kendall's Tau value
   * @private
   */
  _interpretTau(tau) {
    const absTau = Math.abs(tau);
    if (absTau >= 0.8) return 'Very strong agreement';
    if (absTau >= 0.6) return 'Strong agreement';
    if (absTau >= 0.4) return 'Moderate agreement';
    if (absTau >= 0.2) return 'Weak agreement';
    return 'No agreement';
  }

  /**
   * Calculate Pearson correlation coefficient
   * @private
   */
  _pearsonCorrelation(x, y) {
    const n = x.length;

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sumSqX = 0;
    let sumSqY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      sumSqX += dx * dx;
      sumSqY += dy * dy;
    }

    const denominator = Math.sqrt(sumSqX * sumSqY);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Aggregate comparison results
   * @private
   */
  _aggregateComparisons(comparisons) {
    if (comparisons.length === 0) {
      return {
        count: 0,
        message: 'No comparisons available',
      };
    }

    const similarities = {};

    // Collect all similarities
    for (const comp of comparisons) {
      if (comp.similarities) {
        for (const [pair, similarity] of Object.entries(comp.similarities)) {
          if (!similarities[pair]) {
            similarities[pair] = [];
          }
          similarities[pair].push(similarity);
        }
      }
    }

    // Calculate statistics per pair
    const stats = {};
    for (const [pair, values] of Object.entries(similarities)) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      // Calculate standard deviation
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      const stdDev = Math.sqrt(variance);

      stats[pair] = {
        mean,
        min,
        max,
        stdDev,
        count: values.length,
      };
    }

    return {
      count: comparisons.length,
      similarities: stats,
    };
  }

  /**
   * Detect anomalies in embeddings across models
   * Finds chunks where models disagree significantly
   * @param {Array<string>} chunkIds - Chunk IDs to analyze
   * @param {number} threshold - Similarity threshold for anomaly (default: 0.5)
   * @returns {Promise<Object>} Anomalies found
   */
  async detectAnomalies(chunkIds, threshold = 0.5) {
    const anomalies = [];
    const missingData = [];

    for (const chunkId of chunkIds) {
      const comparison = this.multiModelCache.compareChunk(chunkId);

      // Track chunks with insufficient model data
      if (comparison.models < 2) {
        missingData.push({
          chunkId,
          models: comparison.models,
          modelNames: comparison.modelNames || [],
          message: 'Insufficient models for comparison (need at least 2)',
        });
        continue;
      }

      // Check for dimension mismatches
      if (comparison.dimensionMismatches && Object.keys(comparison.dimensionMismatches).length > 0) {
        for (const [pair, mismatch] of Object.entries(comparison.dimensionMismatches)) {
          missingData.push({
            chunkId,
            pair,
            type: 'dimension_mismatch',
            ...mismatch,
          });
        }
        continue;
      }

      // Detect similarity anomalies
      if (comparison.similarities) {
        for (const [pair, similarity] of Object.entries(comparison.similarities)) {
          if (similarity < threshold) {
            anomalies.push({
              chunkId,
              pair,
              similarity,
              threshold,
            });
          }
        }
      }
    }

    return {
      total: chunkIds.length,
      anomaliesFound: anomalies.length,
      missingChunks: missingData.length,
      anomalyRate: (anomalies.length / (chunkIds.length || 1)).toFixed(3),
      anomalies,
      missingData,
    };
  }

  /**
   * Count number of model pairs
   * @private
   */
  _countPairs() {
    const models = this.multiModelCache.getModelNames();
    return (models.length * (models.length - 1)) / 2;
  }

  /**
   * Generate comprehensive comparison report
   * @returns {Promise<Object>} Full comparison report
   */
  async generateFullReport() {
    const report = this.multiModelCache.generateComparisonReport();

    // Add comparison engine analysis
    const models = this.multiModelCache.getModelNames();
    report.comparison = {
      modelCount: models.length,
      modelPairs: this._getModelPairs(models),
    };

    // Get all chunk IDs from first model
    const firstModel = models[0];
    const firstCache = this.multiModelCache.getCache(firstModel);

    if (firstCache) {
      const allChunks = [];
      for (const file of firstCache.getCachedFiles()) {
        const chunks = firstCache.getFileChunks(file);
        allChunks.push(...chunks);
      }

      // Sample chunks for comparison (limit to 100 for performance)
      const sampleSize = Math.min(100, allChunks.length);
      const sampledChunks = allChunks.slice(0, sampleSize);

      report.comparison.chunkSample = await this.compareChunks(sampledChunks);

      // Detect anomalies
      report.comparison.anomalies = await this.detectAnomalies(sampledChunks);
    }

    return report;
  }

  /**
   * Get all model pairs
   * @private
   */
  _getModelPairs(models) {
    const pairs = [];
    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        pairs.push([models[i], models[j]]);
      }
    }
    return pairs;
  }
}

export default ComparisonEngine;
