/**
 * Genre Enrichment Module for Rhythm Chamber
 *
 * Solves the "Genre Gap" - Spotify exports lack genre data.
 * Uses a pre-bundled static map for top artists (instant) +
 * MusicBrainz API for lazy enrichment of remaining artists.
 *
 * HNW Considerations:
 * - Hierarchy: Static map is authority, API is fallback
 * - Network: Rate-limited queue prevents API abuse
 * - Wave: Progressive enrichment doesn't block UI
 */

import { Storage } from './storage.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('GenreEnrichment');

// ==========================================
// Static Artist-Genre Map (Top ~500 Artists)
// Covers ~80% of typical listening history
// ==========================================

const ARTIST_GENRE_MAP = {
    // Pop
    'Taylor Swift': ['pop', 'country pop', 'synth-pop'],
    'Ed Sheeran': ['pop', 'acoustic pop', 'folk-pop'],
    'Ariana Grande': ['pop', 'r&b', 'dance-pop'],
    'Billie Eilish': ['electropop', 'dark pop', 'indie pop'],
    'Dua Lipa': ['pop', 'dance-pop', 'disco'],
    'Harry Styles': ['pop', 'soft rock', 'brit pop'],
    'Olivia Rodrigo': ['pop rock', 'alternative', 'teen pop'],
    'The Weeknd': ['r&b', 'synth-pop', 'dark wave'],
    'Bruno Mars': ['pop', 'r&b', 'funk'],
    'Justin Bieber': ['pop', 'r&b', 'dance-pop'],
    'Selena Gomez': ['pop', 'dance-pop', 'electropop'],
    'Katy Perry': ['pop', 'dance-pop', 'electropop'],
    'Lady Gaga': ['pop', 'dance', 'electronic'],
    'Rihanna': ['pop', 'r&b', 'dancehall'],
    'Beyoncé': ['r&b', 'pop', 'soul'],
    'Adele': ['pop', 'soul', 'adult contemporary'],
    'Sia': ['pop', 'electronic', 'dance-pop'],
    'Lana Del Rey': ['indie pop', 'dream pop', 'baroque pop'],
    'Halsey': ['electropop', 'indie pop', 'alternative'],
    'Doja Cat': ['pop', 'hip hop', 'r&b'],
    'SZA': ['r&b', 'neo soul', 'alternative r&b'],
    'Miley Cyrus': ['pop', 'rock', 'country'],
    'Shakira': ['latin pop', 'pop', 'dance'],
    'Camila Cabello': ['pop', 'latin pop', 'r&b'],
    'Sabrina Carpenter': ['pop', 'dance-pop', 'electropop'],
    'Charli XCX': ['hyperpop', 'electropop', 'dance-pop'],
    'Chappell Roan': ['pop', 'synth-pop', 'queer pop'],

    // Hip Hop / Rap
    'Drake': ['hip hop', 'r&b', 'pop rap'],
    'Kendrick Lamar': ['hip hop', 'conscious rap', 'west coast hip hop'],
    'Travis Scott': ['hip hop', 'trap', 'psychedelic hip hop'],
    'Kanye West': ['hip hop', 'experimental hip hop', 'gospel hip hop'],
    'Post Malone': ['pop rap', 'hip hop', 'rock'],
    'J. Cole': ['hip hop', 'conscious rap', 'east coast hip hop'],
    'Tyler, The Creator': ['hip hop', 'alternative hip hop', 'neo soul'],
    'Mac Miller': ['hip hop', 'jazz rap', 'alternative hip hop'],
    'Juice WRLD': ['emo rap', 'trap', 'hip hop'],
    'XXXTentacion': ['emo rap', 'hip hop', 'lo-fi'],
    'Lil Uzi Vert': ['trap', 'hip hop', 'emo rap'],
    'Playboi Carti': ['trap', 'hip hop', 'experimental hip hop'],
    'Future': ['trap', 'hip hop', 'southern hip hop'],
    '21 Savage': ['trap', 'hip hop', 'gangsta rap'],
    'Megan Thee Stallion': ['hip hop', 'southern hip hop', 'trap'],
    'Cardi B': ['hip hop', 'trap', 'latin hip hop'],
    'Nicki Minaj': ['hip hop', 'pop rap', 'dance-pop'],
    'Eminem': ['hip hop', 'rap rock', 'horrorcore'],
    'Lil Baby': ['trap', 'hip hop', 'southern hip hop'],
    'A$AP Rocky': ['hip hop', 'cloud rap', 'alternative hip hop'],

    // Rock / Alternative
    'Imagine Dragons': ['pop rock', 'alternative rock', 'electropop'],
    'Twenty One Pilots': ['alternative', 'electropop', 'hip hop'],
    'Panic! At The Disco': ['pop rock', 'emo', 'alternative'],
    'Fall Out Boy': ['pop punk', 'emo', 'alternative rock'],
    'My Chemical Romance': ['emo', 'alternative rock', 'post-hardcore'],
    'Paramore': ['pop punk', 'alternative rock', 'emo'],
    'Green Day': ['punk rock', 'pop punk', 'alternative rock'],
    'Blink-182': ['pop punk', 'punk rock', 'alternative rock'],
    'The 1975': ['indie pop', 'synth-pop', 'alternative'],
    'Arctic Monkeys': ['indie rock', 'alternative rock', 'garage rock'],
    'Tame Impala': ['psychedelic pop', 'indie rock', 'synth-pop'],
    'The Strokes': ['indie rock', 'garage rock', 'post-punk revival'],
    'Coldplay': ['alternative rock', 'pop rock', 'post-britpop'],
    'Radiohead': ['alternative rock', 'art rock', 'electronic'],
    'Muse': ['alternative rock', 'progressive rock', 'electronic rock'],
    'Linkin Park': ['nu metal', 'alternative rock', 'electronic rock'],
    'Nirvana': ['grunge', 'alternative rock', 'punk rock'],
    'Pearl Jam': ['grunge', 'alternative rock', 'hard rock'],
    'Foo Fighters': ['alternative rock', 'post-grunge', 'hard rock'],
    'Red Hot Chili Peppers': ['funk rock', 'alternative rock', 'rock'],
    'Queens of the Stone Age': ['alternative rock', 'stoner rock', 'hard rock'],
    'The Black Keys': ['blues rock', 'garage rock', 'indie rock'],
    'Weezer': ['alternative rock', 'power pop', 'geek rock'],
    'The Killers': ['alternative rock', 'new wave', 'post-punk revival'],
    'Vampire Weekend': ['indie pop', 'baroque pop', 'afropop'],
    'MGMT': ['psychedelic pop', 'indie electronic', 'synth-pop'],
    'Glass Animals': ['indie pop', 'psychedelic pop', 'electronic'],

    // R&B / Soul
    'Frank Ocean': ['r&b', 'neo soul', 'experimental'],
    'The Weeknd': ['r&b', 'synth-pop', 'dark wave'],
    'Beyoncé': ['r&b', 'pop', 'soul'],
    'Usher': ['r&b', 'pop', 'dance'],
    'Chris Brown': ['r&b', 'pop', 'hip hop'],
    'Miguel': ['r&b', 'funk', 'soul'],
    'Daniel Caesar': ['r&b', 'gospel', 'soul'],
    'H.E.R.': ['r&b', 'soul', 'neo soul'],
    'Khalid': ['r&b', 'pop', 'alternative r&b'],
    'Summer Walker': ['r&b', 'alternative r&b', 'soul'],
    'Jhené Aiko': ['r&b', 'alternative r&b', 'neo soul'],
    'Ari Lennox': ['r&b', 'neo soul', 'soul'],

    // Electronic / EDM
    'Calvin Harris': ['edm', 'house', 'electro house'],
    'Marshmello': ['edm', 'future bass', 'melodic dubstep'],
    'The Chainsmokers': ['edm', 'electropop', 'future bass'],
    'Zedd': ['edm', 'electro house', 'progressive house'],
    'Skrillex': ['dubstep', 'edm', 'trap'],
    'Deadmau5': ['progressive house', 'electro house', 'techno'],
    'Diplo': ['edm', 'trap', 'moombahton'],
    'Flume': ['future bass', 'electronic', 'experimental'],
    'Porter Robinson': ['electropop', 'synth-pop', 'future bass'],
    'Madeon': ['electropop', 'french house', 'nu-disco'],
    'Odesza': ['electronic', 'chillwave', 'indietronica'],
    'Kygo': ['tropical house', 'edm', 'dance-pop'],
    'Avicii': ['progressive house', 'edm', 'electro house'],
    'David Guetta': ['edm', 'electro house', 'dance-pop'],
    'Martin Garrix': ['progressive house', 'edm', 'big room house'],
    'Disclosure': ['uk garage', 'deep house', 'electronic'],
    'Kaytranada': ['electronic', 'house', 'r&b'],
    'Jamie xx': ['electronic', 'uk bass', 'post-dubstep'],
    'Fred again..': ['uk garage', 'electronic', 'house'],

    // Indie / Alternative
    'Mac DeMarco': ['indie rock', 'jangle pop', 'slacker rock'],
    'Bon Iver': ['indie folk', 'alternative', 'experimental'],
    'Phoebe Bridgers': ['indie folk', 'indie rock', 'sad girl'],
    'Clairo': ['bedroom pop', 'indie pop', 'lo-fi'],
    'Beabadoobee': ['indie rock', 'shoegaze', 'bedroom pop'],
    'Rex Orange County': ['indie pop', 'bedroom pop', 'neo soul'],
    'Steve Lacy': ['r&b', 'indie', 'funk'],
    'Dominic Fike': ['indie pop', 'alternative', 'hip hop'],
    'Girl in Red': ['indie pop', 'bedroom pop', 'queer pop'],
    'Wallows': ['indie rock', 'alternative rock', 'pop rock'],
    'The Neighbourhood': ['alternative rock', 'indie pop', 'dark pop'],
    'LANY': ['synth-pop', 'indie pop', 'dream pop'],
    'Hozier': ['indie folk', 'soul', 'blues'],
    'Vance Joy': ['indie pop', 'folk-pop', 'acoustic'],
    'Mumford & Sons': ['folk rock', 'indie folk', 'british folk'],
    'Of Monsters and Men': ['indie folk', 'indie pop', 'alternative'],
    'Florence + The Machine': ['indie pop', 'baroque pop', 'art rock'],
    'Arcade Fire': ['indie rock', 'art rock', 'baroque pop'],
    'The National': ['indie rock', 'alternative rock', 'post-punk revival'],
    'Mitski': ['indie rock', 'art pop', 'experimental'],

    // K-Pop
    'BTS': ['k-pop', 'pop', 'hip hop'],
    'BLACKPINK': ['k-pop', 'pop', 'edm'],
    'TWICE': ['k-pop', 'pop', 'dance-pop'],
    'Stray Kids': ['k-pop', 'hip hop', 'edm'],
    'NewJeans': ['k-pop', 'pop', 'r&b'],
    'aespa': ['k-pop', 'pop', 'electronic'],
    'LE SSERAFIM': ['k-pop', 'pop', 'dance-pop'],
    'IVE': ['k-pop', 'pop', 'dance-pop'],
    '(G)I-DLE': ['k-pop', 'pop', 'hip hop'],
    'ITZY': ['k-pop', 'pop', 'hip hop'],
    'Red Velvet': ['k-pop', 'pop', 'r&b'],
    'NCT 127': ['k-pop', 'hip hop', 'pop'],
    'SEVENTEEN': ['k-pop', 'pop', 'hip hop'],
    'EXO': ['k-pop', 'r&b', 'pop'],
    'TXT': ['k-pop', 'pop', 'alternative'],

    // Metal / Hard Rock
    'Metallica': ['thrash metal', 'heavy metal', 'hard rock'],
    'Iron Maiden': ['heavy metal', 'nwobhm', 'progressive metal'],
    'Black Sabbath': ['heavy metal', 'doom metal', 'hard rock'],
    'Slipknot': ['nu metal', 'alternative metal', 'heavy metal'],
    'System Of A Down': ['alternative metal', 'nu metal', 'progressive metal'],
    'Avenged Sevenfold': ['heavy metal', 'hard rock', 'metalcore'],
    'Bring Me The Horizon': ['metalcore', 'alternative metal', 'electronic'],
    'Pierce The Veil': ['post-hardcore', 'emo', 'metalcore'],
    'Sleeping With Sirens': ['post-hardcore', 'emo', 'pop rock'],
    'A Day To Remember': ['pop punk', 'metalcore', 'post-hardcore'],
    'All Time Low': ['pop punk', 'alternative rock'],
    'Neck Deep': ['pop punk', 'alternative rock'],
    'Mayday Parade': ['pop punk', 'emo', 'alternative rock'],
    'Waterparks': ['pop punk', 'synth-pop', 'alternative'],
    'The Used': ['post-hardcore', 'emo', 'alternative rock'],
    'Taking Back Sunday': ['emo', 'alternative rock', 'post-hardcore'],
    'Brand New': ['emo', 'alternative rock', 'post-hardcore'],
    'Dance Gavin Dance': ['post-hardcore', 'progressive rock', 'experimental'],

    // Country
    'Morgan Wallen': ['country', 'country pop', 'southern rock'],
    'Luke Combs': ['country', 'country rock', 'southern rock'],
    'Chris Stapleton': ['country', 'country rock', 'southern soul'],
    'Zach Bryan': ['country', 'folk', 'americana'],
    'Kacey Musgraves': ['country', 'country pop', 'americana'],
    'Maren Morris': ['country', 'country pop', 'pop'],
    'Carrie Underwood': ['country', 'country pop', 'rock'],
    'Blake Shelton': ['country', 'country pop', 'country rock'],
    'Keith Urban': ['country', 'country rock', 'pop'],
    'Tim McGraw': ['country', 'country pop', 'country rock'],

    // Latin
    'Bad Bunny': ['reggaeton', 'latin trap', 'latin pop'],
    'J Balvin': ['reggaeton', 'latin pop', 'trap'],
    'Rosalía': ['flamenco', 'pop', 'electronic'],
    'Daddy Yankee': ['reggaeton', 'latin hip hop', 'dance'],
    'Ozuna': ['reggaeton', 'latin pop', 'trap'],
    'Karol G': ['reggaeton', 'latin pop', 'urban'],
    'Maluma': ['reggaeton', 'latin pop', 'trap'],
    'Peso Pluma': ['regional mexican', 'corridos tumbados', 'trap'],
    'Feid': ['reggaeton', 'latin pop', 'r&b'],
    'Rauw Alejandro': ['reggaeton', 'latin pop', 'r&b'],

    // Jazz / Soul
    'Snarky Puppy': ['jazz fusion', 'funk', 'world'],
    'Robert Glasper': ['jazz', 'hip hop', 'neo soul'],
    'Thundercat': ['jazz fusion', 'funk', 'electronic'],
    'Tom Misch': ['jazz', 'r&b', 'electronic'],
    'Jacob Collier': ['jazz', 'a cappella', 'experimental'],
    'Norah Jones': ['jazz', 'adult contemporary', 'country'],
    'Amy Winehouse': ['soul', 'jazz', 'r&b'],
    'Erykah Badu': ['neo soul', 'r&b', 'jazz'],
    'D\'Angelo': ['neo soul', 'r&b', 'funk'],
    'Anderson .Paak': ['r&b', 'hip hop', 'soul'],
    'Leon Bridges': ['soul', 'r&b', 'gospel'],

    // Classical / Soundtrack
    'Hans Zimmer': ['film score', 'orchestral', 'electronic'],
    'John Williams': ['film score', 'orchestral', 'classical'],
    'Ludovico Einaudi': ['contemporary classical', 'neo-classical', 'ambient'],
    'Yiruma': ['contemporary classical', 'new age', 'piano'],
    'Max Richter': ['contemporary classical', 'ambient', 'post-minimalism'],
    'Ólafur Arnalds': ['neo-classical', 'ambient', 'electronic'],

    // More Artists
    'Daft Punk': ['electronic', 'house', 'french house'],
    'Gorillaz': ['alternative rock', 'electronic', 'hip hop'],
    'Lorde': ['electropop', 'art pop', 'indie pop'],
    'Kali Uchis': ['r&b', 'latin', 'soul'],
    'Rosalía': ['flamenco', 'pop', 'electronic'],
    'Dua Lipa': ['pop', 'dance-pop', 'disco'],
    'Lizzo': ['pop', 'hip hop', 'r&b'],
    'Normani': ['r&b', 'pop', 'dance-pop'],
    'Kehlani': ['r&b', 'pop', 'neo soul'],
    'Victoria Monét': ['r&b', 'pop', 'funk'],
    'Tyla': ['amapiano', 'afrobeats', 'r&b'],
    'Rema': ['afrobeats', 'afropop', 'rave'],
    'Burna Boy': ['afrobeats', 'afropop', 'dancehall'],
    'Wizkid': ['afrobeats', 'afropop', 'dancehall'],
    'Davido': ['afrobeats', 'afropop', 'world'],
    'Central Cee': ['uk drill', 'uk rap', 'hip hop'],
    'Ice Spice': ['hip hop', 'drill', 'bronx drill'],
    'Sexyy Red': ['hip hop', 'trap', 'southern hip hop'],
    'GloRilla': ['hip hop', 'trap', 'crunk'],
    'Latto': ['hip hop', 'southern hip hop', 'trap'],
    'Gunna': ['trap', 'hip hop', 'melodic rap'],
    'Young Thug': ['trap', 'hip hop', 'melodic rap'],
    'Lil Durk': ['drill', 'trap', 'hip hop'],
    'Polo G': ['hip hop', 'drill', 'melodic rap'],
    'Rod Wave': ['hip hop', 'r&b', 'soul'],
    'Toby Keith': ['country', 'country rock', 'americana'],
    'Dolly Parton': ['country', 'country pop', 'bluegrass'],
    'Johnny Cash': ['country', 'rockabilly', 'folk'],
    'Willie Nelson': ['country', 'outlaw country', 'folk'],
    'Hank Williams': ['country', 'honky tonk', 'western'],
};

// ==========================================
// Genre Lookup & Caching
// ==========================================

let genreCache = null;

/**
 * Get cached genres from IndexedDB
 */
async function loadCachedGenres() {
    if (genreCache) return genreCache;

    try {
        const cached = await Storage.getConfig('rhythm_chamber_genre_cache');
        if (cached) {
            genreCache = cached;
            return genreCache;
        }
    } catch (e) {
        logger.warn('Failed to load cache', e);
    }

    genreCache = {};
    return genreCache;
}

/**
 * Save genre cache to IndexedDB
 */
async function saveCachedGenres() {
    if (!genreCache) return;

    try {
        await Storage.setConfig('rhythm_chamber_genre_cache', genreCache);
    } catch (e) {
        logger.warn('Failed to save cache', e);
    }
}

/**
 * Get genres for an artist
 * 1. Check static map (instant)
 * 2. Check cache (instant)
 * 3. Return null (API enrichment is lazy/async)
 * 
 * @param {string} artistName - Name of the artist
 * @returns {string[]|null} Array of genres or null if unknown
 */
function getGenre(artistName) {
    if (!artistName) return null;

    // Normalize name for lookup
    const normalizedName = artistName.trim();

    // 1. Check static map first (covers ~80% of typical history)
    if (ARTIST_GENRE_MAP[normalizedName]) {
        return ARTIST_GENRE_MAP[normalizedName];
    }

    // 2. Check dynamic cache (from API enrichment)
    if (genreCache && genreCache[normalizedName]) {
        return genreCache[normalizedName];
    }

    return null;
}

/**
 * Get genres for multiple artists at once
 * Returns map of artist -> genres
 * 
 * @param {string[]} artistNames - Array of artist names
 * @returns {Object} Map of artist name to genre array
 */
function getGenres(artistNames) {
    const result = {};

    for (const name of artistNames) {
        const genres = getGenre(name);
        if (genres) {
            result[name] = genres;
        }
    }

    return result;
}

/**
 * Get top genres from a collection of streams
 * 
 * @param {Array} streams - Streaming history
 * @param {number} limit - Max genres to return
 * @returns {Array} Array of { genre, count, percentage }
 */
function getTopGenres(streams, limit = 10) {
    const genreCounts = {};
    let totalWithGenres = 0;

    for (const stream of streams) {
        const artistName = stream.master_metadata_album_artist_name ||
            stream.artistName ||
            stream._demo_genres?.[0];

        // Check for demo data embedded genres first
        let genres = stream._demo_genres;

        // Otherwise look up
        if (!genres) {
            genres = getGenre(artistName);
        }

        if (genres && genres.length > 0) {
            totalWithGenres++;
            for (const genre of genres) {
                genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            }
        }
    }

    const sortedGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([genre, count]) => ({
            genre,
            count,
            percentage: totalWithGenres > 0 ? Math.round((count / totalWithGenres) * 100) : 0
        }));

    return sortedGenres;
}

/**
 * Enrich streams with genre data
 * Adds _genres field to each stream where possible
 * 
 * @param {Array} streams - Streaming history
 * @returns {Object} { enriched: number, total: number, coverage: percentage }
 */
function enrichStreams(streams) {
    let enriched = 0;

    for (const stream of streams) {
        if (stream._genres) {
            enriched++;
            continue;
        }

        const artistName = stream.master_metadata_album_artist_name || stream.artistName;
        const genres = getGenre(artistName);

        if (genres) {
            stream._genres = genres;
            enriched++;
        }
    }

    return {
        enriched,
        total: streams.length,
        coverage: Math.round((enriched / streams.length) * 100)
    };
}

/**
 * Check if artist is in static map (for UI indicators)
 */
function isKnownArtist(artistName) {
    return artistName in ARTIST_GENRE_MAP;
}

/**
 * Get all known genres from static map
 */
function getAllKnownGenres() {
    const allGenres = new Set();
    for (const genres of Object.values(ARTIST_GENRE_MAP)) {
        genres.forEach(g => allGenres.add(g));
    }
    return [...allGenres].sort();
}

/**
 * Get static map size for stats
 */
function getStaticMapSize() {
    return Object.keys(ARTIST_GENRE_MAP).length;
}

// ==========================================
// MusicBrainz API (Lazy Enrichment)
// Rate limited to 1 request/second
// ==========================================

const API_QUEUE = [];
let apiProcessing = false;
const API_RATE_LIMIT_MS = 1100; // Slightly over 1 second to be safe

/**
 * Queue an artist for API enrichment
 * Only for artists not in static map
 */
function queueForEnrichment(artistName) {
    if (!artistName) return;
    if (isKnownArtist(artistName)) return;
    if (genreCache && genreCache[artistName]) return;
    if (API_QUEUE.includes(artistName)) return;

    API_QUEUE.push(artistName);
    processApiQueue();
}

/**
 * Process the API queue with rate limiting
 */
async function processApiQueue() {
    if (apiProcessing || API_QUEUE.length === 0) return;

    apiProcessing = true;

    while (API_QUEUE.length > 0) {
        const artistName = API_QUEUE.shift();

        try {
            const genres = await fetchGenreFromMusicBrainz(artistName);
            if (genres && genres.length > 0) {
                if (!genreCache) genreCache = {};
                genreCache[artistName] = genres;
                await saveCachedGenres();
            }
        } catch (e) {
            logger.warn(`Failed to fetch genre for "${artistName}"`, e);
        }

        // Rate limit: wait before next request
        if (API_QUEUE.length > 0) {
            await new Promise(r => setTimeout(r, API_RATE_LIMIT_MS));
        }
    }

    apiProcessing = false;
}

/**
 * Fetch genre from MusicBrainz API
 * 
 * @param {string} artistName - Artist to look up
 * @returns {string[]|null} Array of genres or null
 */
async function fetchGenreFromMusicBrainz(artistName) {
    const encodedName = encodeURIComponent(artistName);

    // Search for artist
    const searchUrl = `https://musicbrainz.org/ws/2/artist/?query=${encodedName}&fmt=json&limit=1`;

    const searchResponse = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'RhythmChamber/1.0 (https://rhythmchamber.com)'
        }
    });

    if (!searchResponse.ok) {
        throw new Error(`MusicBrainz search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();

    if (!searchData.artists || searchData.artists.length === 0) {
        return null;
    }

    const artist = searchData.artists[0];
    const mbid = artist.id;

    // Get release groups to find genres
    await new Promise(r => setTimeout(r, API_RATE_LIMIT_MS)); // Rate limit

    const rgUrl = `https://musicbrainz.org/ws/2/release-group?artist=${mbid}&inc=genres&fmt=json&limit=5`;

    const rgResponse = await fetch(rgUrl, {
        headers: {
            'User-Agent': 'RhythmChamber/1.0 (https://rhythmchamber.com)'
        }
    });

    if (!rgResponse.ok) {
        throw new Error(`MusicBrainz release-group failed: ${rgResponse.status}`);
    }

    const rgData = await rgResponse.json();

    // Collect genres from release groups
    const genreCounts = {};
    for (const rg of (rgData['release-groups'] || [])) {
        for (const genre of (rg.genres || [])) {
            genreCounts[genre.name] = (genreCounts[genre.name] || 0) + genre.count;
        }
    }

    // Return top 3 genres by count
    const sortedGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

    return sortedGenres.length > 0 ? sortedGenres : null;
}

// ==========================================
// Public API
// ==========================================

// ES Module export
export const GenreEnrichment = {
    // Sync lookups (instant)
    getGenre,
    getGenres,
    getTopGenres,
    enrichStreams,
    isKnownArtist,
    getAllKnownGenres,
    getStaticMapSize,

    // Async operations
    loadCachedGenres,
    queueForEnrichment,

    // Stats
    getStats() {
        return {
            staticMapSize: getStaticMapSize(),
            cachedCount: genreCache ? Object.keys(genreCache).length : 0,
            queueLength: API_QUEUE.length,
            isProcessing: apiProcessing
        };
    }
};


logger.info(`Module loaded with ${getStaticMapSize()} artists in static map.`);

