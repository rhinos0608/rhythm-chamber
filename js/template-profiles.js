/**
 * Template Profile Store
 *
 * Manages curated template profiles that users can browse and explore.
 * Templates are real listening patterns (anonymized) from consenting users.
 *
 * HNW Considerations:
 * - Hierarchy: TemplateProfileStore is the single source of truth for templates
 * - Network: Templates are read-only - never modified by app logic
 * - Wave: Templates load synchronously (bundled with app)
 *
 * @module template-profiles
 */

import { DemoData } from './demo-data.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('TemplateProfiles');

// ==========================================
// Template Schema & Validation
// ==========================================

/**
 * Validate template structure
 * @param {object} template - Template to validate
 * @returns {boolean} True if valid
 */
function validateTemplate(template) {
    const required = ['id', 'name', 'description', 'emoji', 'metadata'];
    return required.every(key => key in template);
}

// ==========================================
// Placeholder Templates (Data TBD)
// ==========================================

/**
 * Template profiles with placeholder stream data.
 * Stream data will be filled with real anonymized data from consenting users.
 */
const TEMPLATES = [
    {
        id: 'emo_teen',
        name: 'The Emo Teen',
        emoji: '🖤',
        description: 'A journey through emo, pop punk, and indie rock',

        // Data - Using existing DemoData as foundation (will be replaced)
        streams: null, // Lazily loaded from DemoData
        patterns: null,
        personality: null,

        metadata: {
            genres: ['emo', 'pop punk', 'post-hardcore', 'alternative rock'],
            personalityType: 'emotional_archaeologist',
            patternSignals: ['eras', 'ghosted_artists', 'discovery_explosions'],
            ageRange: '16-22',
            collectionPeriod: '2019-2023',
            sourceId: 'demo_data' // Links to DemoData module
        }
    },
    {
        id: 'gym_rat',
        name: 'The Gym Rat',
        emoji: '💪',
        description: 'High-energy focus with morning workout peaks',

        streams: null,
        patterns: null,
        personality: null,

        metadata: {
            genres: ['edm', 'hip hop', 'electronic', 'trap'],
            personalityType: 'comfort_curator',
            patternSignals: ['high_repeat', 'time_patterns'],
            ageRange: '22-35',
            collectionPeriod: '2020-2024',
            sourceId: 'placeholder'
        },

        // Placeholder personality for UI rendering
        placeholderPersonality: {
            type: 'Comfort Curator',
            name: 'Comfort Curator',
            emoji: '🛋️',
            tagline: 'You know what you love.',
            description: 'Same high-energy tracks on repeat. You\'ve built the perfect pump-up playlist and you\'re sticking with it.',
            evidence: [
                'Top 15 tracks account for 73% of listening time',
                'Peak listening: 5-7 AM (pre-workout ritual)',
                'Average 127 plays per favorite artist',
                'Skip rate under 5% - you know what you want'
            ],
            isDemoData: true,
            isPlaceholder: true
        }
    },
    {
        id: 'college_dj',
        name: 'The College DJ',
        emoji: '🎧',
        description: 'Eclectic discoveries with late-night listening sessions',

        streams: null,
        patterns: null,
        personality: null,

        metadata: {
            genres: ['indie', 'electronic', 'alternative', 'house'],
            personalityType: 'discovery_junkie',
            patternSignals: ['discovery_explosions', 'high_diversity', 'late_night'],
            ageRange: '18-24',
            collectionPeriod: '2021-2024',
            sourceId: 'placeholder'
        },

        placeholderPersonality: {
            type: 'Discovery Junkie',
            name: 'Discovery Junkie',
            emoji: '🔭',
            tagline: 'Always hunting for the next sound.',
            description: 'Your library is a graveyard of one-play wonders. You\'re always chasing that feeling of discovering something new.',
            evidence: [
                '342 new artists discovered in one year',
                'Average plays per artist: 4.2 (always moving on)',
                'Peak discovery month: October (new semester energy)',
                '67% of streams after 10 PM'
            ],
            isDemoData: true,
            isPlaceholder: true
        }
    },
    {
        id: 'new_parent',
        name: 'The New Parent',
        emoji: '👶',
        description: 'Life transition - from indie to lullabies and back',

        streams: null,
        patterns: null,
        personality: null,

        metadata: {
            genres: ['indie folk', 'acoustic', 'lullaby', 'ambient'],
            personalityType: 'emotional_archaeologist',
            patternSignals: ['era_transition', 'time_shift', 'genre_pivot'],
            ageRange: '28-40',
            collectionPeriod: '2018-2023',
            sourceId: 'placeholder'
        },

        placeholderPersonality: {
            type: 'Emotional Archaeologist',
            name: 'Emotional Archaeologist',
            emoji: '🏛️',
            tagline: 'You mark time through sound.',
            description: 'Your library is a timeline. There\'s a clear before and after - the music you discovered with your kids is now woven into your identity.',
            evidence: [
                'Distinct era boundary: March 2021 (life change)',
                'New genre cluster: children\'s music + ambient',
                'Sleep-friendly listening increased 340%',
                '5 artists ghosted completely post-transition'
            ],
            isDemoData: true,
            isPlaceholder: true
        }
    },
    {
        id: 'jazz_convert',
        name: 'The Late Bloomer',
        emoji: '🎷',
        description: 'Recent jazz/classical discovery after years of pop',

        streams: null,
        patterns: null,
        personality: null,

        metadata: {
            genres: ['jazz', 'classical', 'piano', 'instrumental'],
            personalityType: 'discovery_junkie',
            patternSignals: ['recent_discovery', 'genre_shift', 'deep_listening'],
            ageRange: '30-50',
            collectionPeriod: '2019-2024',
            sourceId: 'placeholder'
        },

        placeholderPersonality: {
            type: 'Discovery Junkie',
            name: 'Discovery Junkie',
            emoji: '🔭',
            tagline: 'Always hunting for the next sound.',
            description: 'You just discovered a whole new world of music. Jazz opened a door you didn\'t know existed.',
            evidence: [
                'Major genre shift in 2022 - jazz went from 2% to 45%',
                '89 new jazz artists in 18 months',
                'Average session length tripled (deep listening)',
                'Instrumental music now dominates evenings'
            ],
            isDemoData: true,
            isPlaceholder: true
        }
    },
    {
        id: 'party_host',
        name: 'The Party Host',
        emoji: '🎉',
        description: 'Weekend-heavy party playlists with social listening',

        streams: null,
        patterns: null,
        personality: null,

        metadata: {
            genres: ['pop', 'dance', 'r&b', 'party'],
            personalityType: 'social_chameleon',
            patternSignals: ['weekend_heavy', 'social_listening', 'crowd_pleasers'],
            ageRange: '21-35',
            collectionPeriod: '2020-2024',
            sourceId: 'placeholder'
        },

        placeholderPersonality: {
            type: 'Social Chameleon',
            name: 'Social Chameleon',
            emoji: '🎭',
            tagline: 'Your music shifts by context.',
            description: 'Weekday you listens to indie. Weekend you plays crowd-pleasers. Your music adapts to the social situation.',
            evidence: [
                'Weekend listening is 3x higher than weekdays',
                'Only 23% overlap between solo and social tracks',
                'Party playlist plays spike Friday-Sunday',
                'Shared listening sessions detected'
            ],
            isDemoData: true,
            isPlaceholder: true
        }
    },
    {
        id: 'road_tripper',
        name: 'The Road Tripper',
        emoji: '🚗',
        description: 'Long driving sessions with mood-specific playlists',

        streams: null,
        patterns: null,
        personality: null,

        metadata: {
            genres: ['rock', 'country', 'folk', 'podcast'],
            personalityType: 'mood_engineer',
            patternSignals: ['long_sessions', 'time_patterns', 'mood_playlists'],
            ageRange: '25-45',
            collectionPeriod: '2019-2024',
            sourceId: 'placeholder'
        },

        placeholderPersonality: {
            type: 'Mood Engineer',
            name: 'Mood Engineer',
            emoji: '🎚️',
            tagline: 'You use music to create a feeling.',
            description: 'You don\'t just listen - you curate. Your playlists match your drives. Road trip music hits different.',
            evidence: [
                'Average session length: 2.3 hours (driving patterns)',
                'Morning music vs evening music: 15% overlap only',
                'Long-form content (podcasts) during commutes',
                'Summer listening peaks (road trip season)'
            ],
            isDemoData: true,
            isPlaceholder: true
        }
    },
    {
        id: 'nostalgic_millennial',
        name: 'The Nostalgic',
        emoji: '📼',
        description: '2000s throwbacks with comfort listening patterns',

        streams: null,
        patterns: null,
        personality: null,

        metadata: {
            genres: ['2000s pop', 'r&b', 'hip hop', 'rock'],
            personalityType: 'comfort_curator',
            patternSignals: ['high_repeat', 'old_favorites', 'nostalgia_listening'],
            ageRange: '28-40',
            collectionPeriod: '2018-2024',
            sourceId: 'placeholder'
        },

        placeholderPersonality: {
            type: 'Comfort Curator',
            name: 'Comfort Curator',
            emoji: '🛋️',
            tagline: 'You know what you love.',
            description: 'Your top artists haven\'t changed in 15 years. You\'re loyal, and there\'s nothing wrong with that.',
            evidence: [
                'Top 20 artists are all from 2000-2010',
                'New music discovery < 5% of total listening',
                'Comfort playlists get 400+ replays each',
                'Release date average: 2007'
            ],
            isDemoData: true,
            isPlaceholder: true
        }
    }
];

// ==========================================
// Template Profile Store Class
// ==========================================

class TemplateProfileStore {
    constructor() {
        this.templates = new Map();
        this._initialized = false;
    }

    /**
     * Initialize the template store
     * Loads templates and connects to DemoData where applicable
     */
    init() {
        if (this._initialized) return;

        TEMPLATES.forEach(template => {
            if (!validateTemplate(template)) {
                logger.warn(`Invalid template: ${template.id}`);
                return;
            }

            // Load actual data for templates with sourceId = 'demo_data'
            if (template.metadata.sourceId === 'demo_data' && DemoData) {
                const demoPackage = DemoData.getFullDemoPackage();
                template.streams = demoPackage.streams;
                template.patterns = demoPackage.patterns;
                template.personality = demoPackage.personality;
            }

            this.templates.set(template.id, template);
        });

        this._initialized = true;
        logger.debug(`Loaded ${this.templates.size} templates`);
    }

    /**
     * Get all templates
     * @returns {Array} All template objects
     */
    list() {
        this._ensureInitialized();
        return Array.from(this.templates.values());
    }

    /**
     * Get single template by ID
     * @param {string} id - Template ID
     * @returns {object|null} Template or null
     */
    get(id) {
        this._ensureInitialized();
        return this.templates.get(id) || null;
    }

    /**
     * Check if template has real data (vs placeholder)
     * @param {string} id - Template ID
     * @returns {boolean}
     */
    hasData(id) {
        const template = this.get(id);
        return template?.streams !== null && template?.streams?.length > 0;
    }

    /**
     * Get template personality (real or placeholder)
     * @param {string} id - Template ID
     * @returns {object} Personality object
     */
    getPersonality(id) {
        const template = this.get(id);
        if (!template) return null;

        // Return real personality if available, otherwise placeholder
        return template.personality || template.placeholderPersonality || null;
    }

    /**
     * Get template patterns (real or null)
     * @param {string} id - Template ID
     * @returns {object|null}
     */
    getPatterns(id) {
        const template = this.get(id);
        return template?.patterns || null;
    }

    /**
     * Get template streams (for function calling / data queries)
     * @param {string} id - Template ID
     * @returns {Array|null}
     */
    getStreams(id) {
        const template = this.get(id);
        return template?.streams || null;
    }

    // ==========================================
    // Search Methods
    // ==========================================

    /**
     * Search templates by genre
     * @param {string} genre - Genre to search (case-insensitive)
     * @param {number} limit - Max results
     * @returns {Array} Matching templates
     */
    searchByGenre(genre, limit = 10) {
        this._ensureInitialized();
        const genreLower = genre.toLowerCase();

        return this.list()
            .filter(t =>
                t.metadata.genres.some(g =>
                    g.toLowerCase().includes(genreLower)
                )
            )
            .slice(0, limit);
    }

    /**
     * Search templates by pattern signal
     * @param {string} patternType - Pattern to search for
     * @returns {Array} Matching templates
     */
    searchByPattern(patternType) {
        this._ensureInitialized();
        const patternLower = patternType.toLowerCase().replace(/_/g, ' ');

        return this.list()
            .filter(t =>
                t.metadata.patternSignals.some(p =>
                    p.toLowerCase().replace(/_/g, ' ').includes(patternLower) ||
                    patternLower.includes(p.toLowerCase().replace(/_/g, ' '))
                )
            );
    }

    /**
     * Search templates by personality type
     * @param {string} personalityType - Personality type (e.g., 'emotional_archaeologist')
     * @returns {Array} Matching templates
     */
    searchByPersonality(personalityType) {
        this._ensureInitialized();
        const typeLower = personalityType.toLowerCase().replace(/\s+/g, '_');

        return this.list()
            .filter(t =>
                t.metadata.personalityType.toLowerCase() === typeLower ||
                t.metadata.personalityType.toLowerCase().includes(typeLower.replace(/_/g, ' '))
            );
    }

    /**
     * Get templates with actual data (not just placeholders)
     * @returns {Array} Templates with stream data
     */
    getTemplatesWithData() {
        return this.list().filter(t => this.hasData(t.id));
    }

    /**
     * Get all unique genres across templates
     * @returns {Array<string>} Unique genres
     */
    getAllGenres() {
        const genres = new Set();
        this.list().forEach(t => {
            t.metadata.genres.forEach(g => genres.add(g));
        });
        return Array.from(genres).sort();
    }

    /**
     * Get all unique pattern signals
     * @returns {Array<string>} Unique patterns
     */
    getAllPatterns() {
        const patterns = new Set();
        this.list().forEach(t => {
            t.metadata.patternSignals.forEach(p => patterns.add(p));
        });
        return Array.from(patterns).sort();
    }

    // ==========================================
    // Private Helpers
    // ==========================================

    _ensureInitialized() {
        if (!this._initialized) {
            this.init();
        }
    }
}

// ==========================================
// Singleton Instance
// ==========================================

const templateStore = new TemplateProfileStore();

// ==========================================
// Public API
// ==========================================

// ES Module exports
export { templateStore as TemplateProfileStore, TemplateProfileStore as TemplateProfileStoreClass };

logger.info('Module loaded');

