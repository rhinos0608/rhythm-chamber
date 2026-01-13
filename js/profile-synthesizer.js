/**
 * Profile Synthesizer
 * 
 * AI-driven profile synthesis from template profiles.
 * Combines patterns from multiple templates to create custom profiles.
 * 
 * HNW Considerations:
 * - Hierarchy: Synthesizer only combines, never creates raw patterns
 * - Network: Derives from TemplateProfileStore, passes through Personality for classification
 * - Wave: Synthesis is async with progress feedback
 * 
 * @module profile-synthesizer
 */

// ==========================================
// Configuration
// ==========================================

const SYNTHESIS_CONFIG = {
    MIN_STREAMS: 500,           // Minimum synthetic streams to generate
    MAX_STREAMS: 5000,          // Maximum for performance
    DEFAULT_TIME_RANGE_YEARS: 2, // Default synthetic listening period
    DEFAULT_STREAMS_PER_DAY: 8   // Average plays per day
};

// ==========================================
// Profile Synthesizer Class
// ==========================================

class ProfileSynthesizer {
    constructor() {
        this._templateStore = null;
    }

    /**
     * Initialize with template store reference
     */
    init() {
        this._templateStore = window.TemplateProfileStore;
        if (!this._templateStore) {
            console.warn('[ProfileSynthesizer] TemplateProfileStore not available');
        }
    }

    /**
     * Synthesize a new profile from natural language description
     * Uses AI function calling to select and combine templates
     * 
     * @param {string} description - Natural language profile description
     * @param {Function} onProgress - Progress callback (0-100)
     * @returns {Promise<object>} Synthesized profile
     */
    async synthesizeFromDescription(description, onProgress = null) {
        this._ensureInitialized();

        if (onProgress) onProgress(10, 'Analyzing description...');

        // Step 1: Determine which templates to use
        const templateSelection = await this._selectTemplatesForDescription(description);

        if (onProgress) onProgress(30, 'Combining patterns...');

        // Step 2: Combine patterns from selected templates
        const combinedPatterns = this._combinePatterns(templateSelection);

        if (onProgress) onProgress(50, 'Generating listening history...');

        // Step 3: Generate synthetic stream data
        const syntheticStreams = this._createSyntheticStreams(combinedPatterns, templateSelection);

        if (onProgress) onProgress(70, 'Detecting personality...');

        // Step 4: Run through personality detection
        const patterns = window.Patterns?.detect(syntheticStreams) || combinedPatterns;
        const personality = window.Personality?.classifyPersonality(patterns) || null;

        if (onProgress) onProgress(90, 'Finalizing profile...');

        // Step 5: Create final profile object
        const profile = {
            id: this._generateProfileId(),
            type: 'synthetic',
            name: this._generateProfileName(description),
            description: description,

            // Source information
            sourceTemplates: templateSelection.map(t => ({
                id: t.template.id,
                name: t.template.name,
                weight: t.weight
            })),

            // Data
            streams: syntheticStreams,
            patterns: patterns,
            personality: personality,

            // Metadata
            metadata: {
                createdAt: new Date().toISOString(),
                streamCount: syntheticStreams.length,
                isSynthetic: true,
                synthesizedFrom: description
            }
        };

        if (onProgress) onProgress(100, 'Complete');

        console.log(`[ProfileSynthesizer] Created profile with ${syntheticStreams.length} streams`);
        return profile;
    }

    /**
     * Synthesize from explicit template selection
     * 
     * @param {Array<{templateId: string, weight: number}>} selection - Templates with weights
     * @returns {Promise<object>} Synthesized profile
     */
    async synthesizeFromTemplates(selection) {
        this._ensureInitialized();

        const templateSelection = selection.map(s => ({
            template: this._templateStore.get(s.templateId),
            weight: s.weight || 1.0
        })).filter(s => s.template !== null);

        if (templateSelection.length === 0) {
            throw new Error('No valid templates selected');
        }

        const combinedPatterns = this._combinePatterns(templateSelection);
        const syntheticStreams = this._createSyntheticStreams(combinedPatterns, templateSelection);

        const patterns = window.Patterns?.detect(syntheticStreams) || combinedPatterns;
        const personality = window.Personality?.classifyPersonality(patterns) || null;

        return {
            id: this._generateProfileId(),
            type: 'synthetic',
            name: `Mix: ${templateSelection.map(t => t.template.name).join(' + ')}`,
            description: `Combined from ${templateSelection.length} templates`,
            sourceTemplates: templateSelection.map(t => ({
                id: t.template.id,
                name: t.template.name,
                weight: t.weight
            })),
            streams: syntheticStreams,
            patterns: patterns,
            personality: personality,
            metadata: {
                createdAt: new Date().toISOString(),
                streamCount: syntheticStreams.length,
                isSynthetic: true
            }
        };
    }

    // ==========================================
    // Template Selection (AI-Driven)
    // ==========================================

    /**
     * Select templates based on natural language description
     * In full implementation, this calls AI with function calling.
     * For now, uses keyword matching as fallback.
     * 
     * @param {string} description - Profile description
     * @returns {Promise<Array>} Array of {template, weight}
     */
    async _selectTemplatesForDescription(description) {
        const descLower = description.toLowerCase();
        const matches = [];

        // Keyword-based template matching (fallback for when AI isn't available)
        const templates = this._templateStore.list();

        for (const template of templates) {
            let score = 0;

            // Check genre matches
            for (const genre of template.metadata.genres) {
                if (descLower.includes(genre.toLowerCase())) {
                    score += 2;
                }
            }

            // Check name/description matches
            if (descLower.includes(template.name.toLowerCase())) {
                score += 3;
            }
            if (template.description.toLowerCase().split(' ').some(w =>
                w.length > 3 && descLower.includes(w)
            )) {
                score += 1;
            }

            // Check pattern signal matches
            for (const pattern of template.metadata.patternSignals) {
                const patternWords = pattern.replace(/_/g, ' ');
                if (descLower.includes(patternWords)) {
                    score += 2;
                }
            }

            // Check personality type matches
            const personalityWords = template.metadata.personalityType.replace(/_/g, ' ');
            if (descLower.includes(personalityWords)) {
                score += 2;
            }

            if (score > 0) {
                matches.push({ template, weight: score });
            }
        }

        // Normalize weights
        if (matches.length > 0) {
            const totalScore = matches.reduce((sum, m) => sum + m.weight, 0);
            matches.forEach(m => {
                m.weight = m.weight / totalScore;
            });

            // Sort by weight and take top matches
            matches.sort((a, b) => b.weight - a.weight);
            return matches.slice(0, 3);
        }

        // Fallback: return first template with data
        const fallback = this._templateStore.getTemplatesWithData()[0];
        if (fallback) {
            return [{ template: fallback, weight: 1.0 }];
        }

        throw new Error('No templates available for synthesis');
    }

    // ==========================================
    // Pattern Combination
    // ==========================================

    /**
     * Combine patterns from multiple templates
     * 
     * @param {Array<{template, weight}>} selection - Templates with weights
     * @returns {object} Combined pattern object
     */
    _combinePatterns(selection) {
        const combined = {
            artists: [],
            genres: new Set(),
            timePatterns: { morning: 0, evening: 0 },
            diversity: 0,
            repeatRate: 0
        };

        for (const { template, weight } of selection) {
            // Add artists (weighted by template contribution)
            if (template.streams?.length > 0) {
                const artistCounts = new Map();
                template.streams.forEach(s => {
                    const artist = s.artistName || s.master_metadata_album_artist_name;
                    if (artist) {
                        artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
                    }
                });

                // Take top artists from this template
                const topArtists = Array.from(artistCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 20)
                    .map(([name, count]) => ({ name, count, weight }));

                combined.artists.push(...topArtists);
            }

            // Add genres
            template.metadata.genres.forEach(g => combined.genres.add(g));

            // Weighted pattern averages
            const templatePatterns = template.patterns;
            if (templatePatterns) {
                if (templatePatterns.timePatterns) {
                    combined.timePatterns.morning += (templatePatterns.timePatterns.morningStreamCount || 0) * weight;
                    combined.timePatterns.evening += (templatePatterns.timePatterns.eveningStreamCount || 0) * weight;
                }
                if (templatePatterns.comfortDiscovery) {
                    combined.diversity += (1 / (templatePatterns.comfortDiscovery.ratio || 50)) * weight;
                    combined.repeatRate += (templatePatterns.comfortDiscovery.ratio || 50) * weight;
                }
            }
        }

        // Normalize combined values
        const totalWeight = selection.reduce((sum, s) => sum + s.weight, 0);
        combined.diversity /= totalWeight || 1;
        combined.repeatRate /= totalWeight || 1;

        return combined;
    }

    // ==========================================
    // Synthetic Stream Generation
    // ==========================================

    /**
     * Generate realistic stream data from combined patterns
     * 
     * @param {object} combinedPatterns - Combined pattern object
     * @param {Array} templateSelection - Source templates
     * @returns {Array} Synthetic stream array
     */
    _createSyntheticStreams(combinedPatterns, templateSelection) {
        const streams = [];

        // Get artists pool from combined patterns
        const artistPool = this._buildArtistPool(combinedPatterns, templateSelection);
        if (artistPool.length === 0) {
            console.warn('[ProfileSynthesizer] No artists available for synthesis');
            return streams;
        }

        // Calculate stream count
        const daysToGenerate = SYNTHESIS_CONFIG.DEFAULT_TIME_RANGE_YEARS * 365;
        const targetStreams = Math.min(
            Math.max(
                daysToGenerate * SYNTHESIS_CONFIG.DEFAULT_STREAMS_PER_DAY,
                SYNTHESIS_CONFIG.MIN_STREAMS
            ),
            SYNTHESIS_CONFIG.MAX_STREAMS
        );

        // Generate streams
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - SYNTHESIS_CONFIG.DEFAULT_TIME_RANGE_YEARS);

        let streamId = 1;

        for (let i = 0; i < targetStreams; i++) {
            // Random date within range
            const streamDate = new Date(
                startDate.getTime() +
                Math.random() * (Date.now() - startDate.getTime())
            );

            // Time distribution based on combined patterns
            const hour = this._selectHour(combinedPatterns);
            streamDate.setHours(hour, Math.floor(Math.random() * 60), 0, 0);

            // Select artist weighted by pool
            const artist = this._selectWeightedArtist(artistPool);

            // Generate stream record
            streams.push({
                ts: streamDate.toISOString(),
                master_metadata_track_name: `Track ${Math.floor(Math.random() * 10) + 1}`,
                master_metadata_album_artist_name: artist.name,
                master_metadata_album_album_name: `Album`,
                ms_played: 180000 + Math.floor(Math.random() * 60000),
                platform: Math.random() > 0.5 ? 'android' : 'ios',
                shuffle: Math.random() > 0.6,
                skipped: Math.random() > 0.85,

                // Normalized fields
                artistName: artist.name,
                trackName: `Track ${Math.floor(Math.random() * 10) + 1}`,
                albumName: 'Album',
                msPlayed: 180000 + Math.floor(Math.random() * 60000),
                date: streamDate.toISOString().split('T')[0],
                year: streamDate.getFullYear(),
                month: streamDate.getMonth(),
                hour: hour,
                dayOfWeek: streamDate.getDay(),

                // Synthesis markers
                _synthetic: true,
                _synth_id: streamId++
            });
        }

        // Sort by timestamp
        streams.sort((a, b) => new Date(a.ts) - new Date(b.ts));

        return streams;
    }

    /**
     * Build weighted artist pool from patterns and templates
     */
    _buildArtistPool(combinedPatterns, templateSelection) {
        const artistMap = new Map();

        // Add from combined patterns
        for (const artist of combinedPatterns.artists) {
            const existing = artistMap.get(artist.name) || { name: artist.name, weight: 0 };
            existing.weight += artist.count * artist.weight;
            artistMap.set(artist.name, existing);
        }

        // If no artists from patterns, sample from template streams
        if (artistMap.size === 0) {
            for (const { template, weight } of templateSelection) {
                if (template.streams?.length > 0) {
                    const sampled = template.streams.slice(0, 100);
                    for (const stream of sampled) {
                        const name = stream.artistName || stream.master_metadata_album_artist_name;
                        if (name) {
                            const existing = artistMap.get(name) || { name, weight: 0 };
                            existing.weight += weight;
                            artistMap.set(name, existing);
                        }
                    }
                }
            }
        }

        return Array.from(artistMap.values());
    }

    /**
     * Select hour based on time patterns
     */
    _selectHour(combinedPatterns) {
        const { morning, evening } = combinedPatterns.timePatterns;
        const total = morning + evening;

        if (total > 0 && Math.random() < evening / total) {
            // Evening: 17-23
            return 17 + Math.floor(Math.random() * 7);
        } else if (total > 0) {
            // Morning: 6-12
            return 6 + Math.floor(Math.random() * 7);
        } else {
            // Random distribution
            return Math.floor(Math.random() * 24);
        }
    }

    /**
     * Select artist using weighted random selection
     */
    _selectWeightedArtist(artistPool) {
        const totalWeight = artistPool.reduce((sum, a) => sum + a.weight, 0);
        let random = Math.random() * totalWeight;

        for (const artist of artistPool) {
            random -= artist.weight;
            if (random <= 0) {
                return artist;
            }
        }

        return artistPool[0];
    }

    // ==========================================
    // Helpers
    // ==========================================

    _generateProfileId() {
        return `synth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _generateProfileName(description) {
        // Take first few significant words from description
        const words = description
            .replace(/[^a-zA-Z\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3)
            .slice(0, 3);

        if (words.length > 0) {
            return `The ${words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`;
        }

        return 'Custom Profile';
    }

    _ensureInitialized() {
        if (!this._templateStore) {
            this.init();
        }
        if (!this._templateStore) {
            throw new Error('TemplateProfileStore not available');
        }
    }
}

// ==========================================
// Singleton Instance
// ==========================================

const profileSynthesizer = new ProfileSynthesizer();

// ==========================================
// Public API
// ==========================================

window.ProfileSynthesizer = profileSynthesizer;
window.ProfileSynthesizerClass = ProfileSynthesizer; // For testing

console.log('[ProfileSynthesizer] Module loaded');
