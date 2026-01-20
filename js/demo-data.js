/**
 * Demo Data Module - "The Emo Teen" Sample Persona
 * 
 * Provides a complete sample dataset so users can experience the app
 * without waiting for their Spotify data export.
 * 
 * HNW Considerations:
 * - Hierarchy: Demo data is read-only, never mixes with real user data
 * - Network: Demo mode flag propagates through all modules
 * - Wave: Demo data loads synchronously for instant experience
 */

// ==========================================
// Sample Streaming History (2019-2023)
// ==========================================

const DEMO_ARTISTS = [
    { name: 'My Chemical Romance', genres: ['emo', 'alternative rock', 'post-hardcore'] },
    { name: 'Paramore', genres: ['pop punk', 'alternative rock', 'emo'] },
    { name: 'Fall Out Boy', genres: ['pop punk', 'emo', 'alternative rock'] },
    { name: 'Panic! At The Disco', genres: ['pop rock', 'emo', 'alternative'] },
    { name: 'Twenty One Pilots', genres: ['alternative', 'electropop', 'hip hop'] },
    { name: 'Pierce The Veil', genres: ['post-hardcore', 'emo', 'metalcore'] },
    { name: 'Sleeping With Sirens', genres: ['post-hardcore', 'emo', 'pop rock'] },
    { name: 'All Time Low', genres: ['pop punk', 'alternative rock'] },
    { name: 'Bring Me The Horizon', genres: ['metalcore', 'alternative metal', 'electronic'] },
    { name: 'The 1975', genres: ['indie pop', 'synth-pop', 'alternative'] },
    { name: 'Arctic Monkeys', genres: ['indie rock', 'alternative rock'] },
    { name: 'Mayday Parade', genres: ['pop punk', 'emo', 'alternative rock'] },
    { name: 'A Day To Remember', genres: ['pop punk', 'metalcore', 'post-hardcore'] },
    { name: 'Neck Deep', genres: ['pop punk', 'alternative rock'] },
    { name: 'Waterparks', genres: ['pop punk', 'synth-pop', 'alternative'] }
];

const DEMO_TRACKS = {
    'My Chemical Romance': [
        { name: 'Welcome to the Black Parade', album: 'The Black Parade', durationMs: 311000 },
        { name: 'Helena', album: 'Three Cheers for Sweet Revenge', durationMs: 220000 },
        { name: 'I\'m Not Okay (I Promise)', album: 'Three Cheers for Sweet Revenge', durationMs: 210000 },
        { name: 'Teenagers', album: 'The Black Parade', durationMs: 159000 },
        { name: 'Famous Last Words', album: 'The Black Parade', durationMs: 289000 }
    ],
    'Paramore': [
        { name: 'Misery Business', album: 'Riot!', durationMs: 211000 },
        { name: 'Decode', album: 'Twilight Soundtrack', durationMs: 263000 },
        { name: 'That\'s What You Get', album: 'Riot!', durationMs: 240000 },
        { name: 'Still Into You', album: 'Paramore', durationMs: 212000 },
        { name: 'Hard Times', album: 'After Laughter', durationMs: 181000 }
    ],
    'Fall Out Boy': [
        { name: 'Sugar, We\'re Goin Down', album: 'From Under the Cork Tree', durationMs: 229000 },
        { name: 'Thnks fr th Mmrs', album: 'Infinity on High', durationMs: 203000 },
        { name: 'Dance, Dance', album: 'From Under the Cork Tree', durationMs: 181000 },
        { name: 'Centuries', album: 'American Beauty/American Psycho', durationMs: 221000 },
        { name: 'My Songs Know What You Did in the Dark', album: 'Save Rock and Roll', durationMs: 183000 }
    ],
    'Panic! At The Disco': [
        { name: 'I Write Sins Not Tragedies', album: 'A Fever You Can\'t Sweat Out', durationMs: 190000 },
        { name: 'High Hopes', album: 'Pray for the Wicked', durationMs: 190000 },
        { name: 'Nine in the Afternoon', album: 'Pretty. Odd.', durationMs: 187000 },
        { name: 'Victorious', album: 'Death of a Bachelor', durationMs: 181000 },
        { name: 'Emperor\'s New Clothes', album: 'Death of a Bachelor', durationMs: 219000 }
    ],
    'Twenty One Pilots': [
        { name: 'Stressed Out', album: 'Blurryface', durationMs: 202000 },
        { name: 'Heathens', album: 'Suicide Squad Soundtrack', durationMs: 196000 },
        { name: 'Ride', album: 'Blurryface', durationMs: 214000 },
        { name: 'Car Radio', album: 'Vessel', durationMs: 267000 },
        { name: 'Tear in My Heart', album: 'Blurryface', durationMs: 184000 }
    ],
    'Pierce The Veil': [
        { name: 'King for a Day', album: 'Collide with the Sky', durationMs: 285000 },
        { name: 'Caraphernelia', album: 'Selfish Machines', durationMs: 270000 },
        { name: 'Bulls in the Bronx', album: 'Collide with the Sky', durationMs: 244000 }
    ],
    'Sleeping With Sirens': [
        { name: 'If I\'m James Dean, You\'re Audrey Hepburn', album: 'With Ears to See and Eyes to Hear', durationMs: 254000 },
        { name: 'If You Can\'t Hang', album: 'Let\'s Cheers to This', durationMs: 213000 },
        { name: 'Kick Me', album: 'Madness', durationMs: 195000 }
    ],
    'All Time Low': [
        { name: 'Dear Maria, Count Me In', album: 'So Wrong, It\'s Right', durationMs: 180000 },
        { name: 'Weightless', album: 'Nothing Personal', durationMs: 202000 },
        { name: 'Damned If I Do Ya', album: 'Nothing Personal', durationMs: 197000 }
    ],
    'Bring Me The Horizon': [
        { name: 'Throne', album: 'That\'s the Spirit', durationMs: 211000 },
        { name: 'Drown', album: 'That\'s the Spirit', durationMs: 236000 },
        { name: 'Can You Feel My Heart', album: 'Sempiternal', durationMs: 232000 }
    ],
    'The 1975': [
        { name: 'Somebody Else', album: 'I Like It When You Sleep...', durationMs: 339000 },
        { name: 'Chocolate', album: 'The 1975', durationMs: 231000 },
        { name: 'The Sound', album: 'I Like It When You Sleep...', durationMs: 237000 }
    ],
    'Arctic Monkeys': [
        { name: 'Do I Wanna Know?', album: 'AM', durationMs: 272000 },
        { name: '505', album: 'Favourite Worst Nightmare', durationMs: 253000 },
        { name: 'R U Mine?', album: 'AM', durationMs: 201000 }
    ],
    'Mayday Parade': [
        { name: 'Miserable at Best', album: 'A Lesson in Romantics', durationMs: 256000 },
        { name: 'Jamie All Over', album: 'A Lesson in Romantics', durationMs: 224000 },
        { name: 'Terrible Things', album: 'Mayday Parade', durationMs: 273000 }
    ],
    'A Day To Remember': [
        { name: 'If It Means a Lot to You', album: 'Homesick', durationMs: 254000 },
        { name: 'The Downfall of Us All', album: 'Homesick', durationMs: 177000 },
        { name: 'All I Want', album: 'What Separates Me from You', durationMs: 210000 }
    ],
    'Neck Deep': [
        { name: 'In Bloom', album: 'Life\'s Not Out to Get You', durationMs: 210000 },
        { name: 'December', album: 'Life\'s Not Out to Get You', durationMs: 214000 },
        { name: 'Can\'t Kick Up the Roots', album: 'Life\'s Not Out to Get You', durationMs: 199000 }
    ],
    'Waterparks': [
        { name: 'Stupid for You', album: 'Double Dare', durationMs: 192000 },
        { name: 'Blonde', album: 'Entertainment', durationMs: 206000 },
        { name: 'Peach', album: 'Entertainment', durationMs: 189000 }
    ]
};

/**
 * Generate realistic streaming history for demo persona
 */
function generateDemoStreams() {
    const streams = [];
    const startDate = new Date('2019-01-01');
    const endDate = new Date('2023-12-31');

    // Time-based patterns for "The Emo Teen"
    // - More listening in evenings (after school)
    // - Heavy MCR phase in 2019
    // - Broader taste by 2023
    // - Discovery explosion in 2021

    const phases = [
        { start: '2019-01', end: '2019-12', focus: ['My Chemical Romance', 'Paramore', 'Fall Out Boy'], intensity: 'high' },
        { start: '2020-01', end: '2020-06', focus: ['Pierce The Veil', 'Sleeping With Sirens', 'Panic! At The Disco'], intensity: 'high' },
        { start: '2020-07', end: '2020-12', focus: ['Twenty One Pilots', 'Bring Me The Horizon', 'A Day To Remember'], intensity: 'medium' },
        { start: '2021-01', end: '2021-06', focus: ['The 1975', 'Arctic Monkeys', 'Neck Deep', 'Waterparks'], intensity: 'discovery' },
        { start: '2021-07', end: '2022-12', focus: ['My Chemical Romance', 'The 1975', 'Paramore', 'All Time Low'], intensity: 'medium' },
        { start: '2023-01', end: '2023-12', focus: ['Paramore', 'The 1975', 'Twenty One Pilots', 'Arctic Monkeys'], intensity: 'balanced' }
    ];

    let streamId = 1;

    phases.forEach(phase => {
        const phaseStart = new Date(phase.start + '-01');
        const phaseEnd = new Date(phase.end + '-28');

        let currentDate = new Date(phaseStart);

        while (currentDate <= phaseEnd) {
            // Generate 3-15 streams per day based on intensity
            const streamsPerDay = phase.intensity === 'high' ? 10 + Math.floor(Math.random() * 6) :
                phase.intensity === 'discovery' ? 15 + Math.floor(Math.random() * 5) :
                    phase.intensity === 'medium' ? 5 + Math.floor(Math.random() * 6) :
                        3 + Math.floor(Math.random() * 8);

            for (let i = 0; i < streamsPerDay; i++) {
                // Prefer evening listening (16:00-23:00)
                const hour = Math.random() > 0.3 ?
                    16 + Math.floor(Math.random() * 8) :
                    8 + Math.floor(Math.random() * 8);

                const streamTime = new Date(currentDate);
                streamTime.setHours(hour, Math.floor(Math.random() * 60), 0, 0);

                // Select artist based on phase focus
                const artistPool = phase.intensity === 'discovery' ?
                    DEMO_ARTISTS :
                    DEMO_ARTISTS.filter(a => phase.focus.includes(a.name));

                const artist = artistPool[Math.floor(Math.random() * artistPool.length)];
                const artistTracks = DEMO_TRACKS[artist.name] || DEMO_TRACKS['My Chemical Romance'];
                const track = artistTracks[Math.floor(Math.random() * artistTracks.length)];

                // Completion rate - emo teens don't skip their favorites
                const completionRate = phase.focus.includes(artist.name) ?
                    0.85 + Math.random() * 0.15 :
                    0.5 + Math.random() * 0.5;

                const msPlayed = Math.floor(track.durationMs * completionRate);

                streams.push({
                    ts: streamTime.toISOString(),
                    playedAt: streamTime.toISOString(), // Required by patterns.js
                    master_metadata_track_name: track.name,
                    master_metadata_album_artist_name: artist.name,
                    master_metadata_album_album_name: track.album,
                    ms_played: msPlayed,
                    platform: Math.random() > 0.3 ? 'android' : 'ios',
                    shuffle: Math.random() > 0.6,
                    skipped: completionRate < 0.7,
                    offline: Math.random() > 0.8,
                    reason_start: 'trackdone',
                    reason_end: completionRate > 0.9 ? 'trackdone' : 'fwdbtn',
                    // Normalized fields (same as parser.js output)
                    artistName: artist.name,
                    trackName: track.name,
                    albumName: track.album,
                    msPlayed: msPlayed,
                    completionRate: completionRate, // Required by patterns.js trueFavorites
                    playType: completionRate > 0.9 ? 'full' : (completionRate < 0.5 ? 'skip' : 'partial'),
                    date: streamTime.toISOString().split('T')[0],
                    year: streamTime.getFullYear(),
                    month: streamTime.getMonth(),
                    hour: hour,
                    dayOfWeek: streamTime.getDay(),
                    // Enriched fields
                    _demo_id: streamId++,
                    _demo_genres: artist.genres
                });
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }
    });

    return streams;
}

// ==========================================
// Pre-computed Personality Result
// ==========================================

const DEMO_PERSONALITY = {
    type: 'Emotional Archaeologist',
    name: 'Emotional Archaeologist',  // Alias for view-controller compatibility
    emoji: '🏛️',
    tagline: 'You mark time through sound. Your library is a scrapbook.',
    description: 'You don\'t just listen to music — you use it to bookmark chapters of your life. Each era of your library tells a story, from your early MCR obsession to your current indie phase. When you hear certain songs, you\'re transported back to exactly who you were when you first loved them.',
    scores: {
        'Emotional Archaeologist': 8,
        'Mood Engineer': 4,
        'Discovery Junkie': 5,
        'Comfort Curator': 3,
        'Social Chameleon': 2
    },
    evidence: [
        '5 distinct listening eras detected — you mark time through sound',
        'Morning vs evening overlap: only 24% — you use music to set your mood',
        '3 artist(s) you used to love but haven\'t played in over a year',
        'Discovery explosion detected — 47 new artists in 2021-03',
        'You average 42 plays per artist — balanced explorer'
    ],
    allEvidence: [
        '5 distinct listening eras detected — you mark time through sound',
        'Morning vs evening overlap: only 24% — you use music to set your mood',
        '3 artist(s) you used to love but haven\'t played in over a year',
        'Discovery explosion detected — 47 new artists in 2021-03',
        'You average 42 plays per artist — balanced explorer'
    ],
    isLiteData: false,
    isDemoData: true
};

// ==========================================
// Pre-computed Patterns
// ==========================================

const DEMO_PATTERNS = {
    comfortDiscovery: {
        ratio: 42,
        totalPlays: 8547,
        uniqueArtists: 203,
        isComfortCurator: false,
        isDiscoveryJunkie: false,
        signal: 'balanced',
        description: 'You average 42 plays per artist — balanced explorer'
    },
    eras: {
        eras: [
            { start: '2019-01', end: '2019-12', topArtists: ['My Chemical Romance', 'Paramore', 'Fall Out Boy'], weeks: 52 },
            { start: '2020-01', end: '2020-12', topArtists: ['Pierce The Veil', 'Twenty One Pilots', 'Bring Me The Horizon'], weeks: 52 },
            { start: '2021-01', end: '2021-06', topArtists: ['The 1975', 'Arctic Monkeys', 'Neck Deep'], weeks: 26 },
            { start: '2021-07', end: '2022-12', topArtists: ['My Chemical Romance', 'The 1975', 'Paramore'], weeks: 78 },
            { start: '2023-01', end: '2023-12', topArtists: ['Paramore', 'The 1975', 'Twenty One Pilots'], weeks: 52 }
        ],
        hasEras: true,
        eraCount: 5,
        description: '5 distinct listening eras detected — you mark time through sound'
    },
    timePatterns: {
        morningArtistCount: 45,
        eveningArtistCount: 187,
        morningStreamCount: 1234,
        eveningStreamCount: 5678,
        overlap: 24,
        isMoodEngineer: true,
        hasEnoughData: true,
        description: 'Morning vs evening overlap: only 24% — you use music to set your mood'
    },
    socialPatterns: {
        weekdayArtistCount: 156,
        weekendArtistCount: 142,
        overlap: 68,
        isSocialChameleon: false,
        description: '68% overlap between weekday and weekend listening'
    },
    ghostedArtists: {
        ghosted: [
            { artist: 'Pierce The Veil', totalPlays: 234, lastPlayed: '2020-12-15', daysSince: 1124 },
            { artist: 'Sleeping With Sirens', totalPlays: 178, lastPlayed: '2020-09-22', daysSince: 1208 },
            { artist: 'Mayday Parade', totalPlays: 145, lastPlayed: '2021-03-10', daysSince: 1039 }
        ],
        hasGhosted: true,
        count: 3,
        description: '3 artist(s) you used to love but haven\'t played in over a year'
    },
    discoveryExplosions: {
        explosions: [
            { month: '2021-03', newArtists: 47, multiplier: 4.2 },
            { month: '2021-05', newArtists: 38, multiplier: 3.4 }
        ],
        hasExplosions: true,
        baselineRate: 11,
        description: 'Discovery explosion detected — 47 new artists in 2021-03'
    },
    moodSearching: {
        clusters: [],
        count: 4,
        hasMoodSearching: false,
        description: '4 skip clusters found'
    },
    trueFavorites: {
        topByPlays: { artist: 'My Chemical Romance', plays: 892 },
        topByEngagement: { artist: 'Paramore', plays: 634, avgCompletion: 0.94, fullPlayRate: 0.89 },
        hasMismatch: true,
        description: 'You play My Chemical Romance the most, but you\'re more engaged with Paramore'
    },
    evidence: [
        'You average 42 plays per artist — balanced explorer',
        '5 distinct listening eras detected — you mark time through sound',
        'Morning vs evening overlap: only 24% — you use music to set your mood',
        '3 artist(s) you used to love but haven\'t played in over a year',
        'Discovery explosion detected — 47 new artists in 2021-03',
        'You play My Chemical Romance the most, but you\'re more engaged with Paramore'
    ],
    summary: {
        totalStreams: 8547,
        totalHours: 428,
        uniqueArtists: 203,
        uniqueTracks: 892,
        dateRange: {
            start: '2019-01-01',
            end: '2023-12-31',
            days: 1826
        },
        insights: {
            totalMinutes: 25680,
            uniqueArtists: 203,
            topArtist: {
                name: 'My Chemical Romance',
                minutes: 2847,
                percentile: 'Top 0.5%'
            },
            peakDay: 'Saturday'
        }
    },
    isDemoData: true
};

// ==========================================
// Sample Chat History
// ==========================================

const DEMO_CHAT_HISTORY = [
    {
        role: 'assistant',
        content: `Hey there! 🎸 I've been looking through your listening history and wow — you've got quite the musical journey here.

I noticed you've been through what I'd call an "emo renaissance" — starting with the classics like My Chemical Romance and Paramore, then diving deeper into the post-hardcore scene, and now branching out into indie territory.

What would you like to explore about your music taste? I can tell you about your listening phases, help you rediscover artists you've forgotten, or analyze patterns in when and how you listen.`
    },
    {
        role: 'user',
        content: 'What was my music like in 2019?'
    },
    {
        role: 'assistant',
        content: `2019 was your **peak emo era** 🖤

Your top 3 artists that year were:
1. **My Chemical Romance** - 287 plays (you were clearly excited about the reunion announcement!)
2. **Paramore** - 198 plays
3. **Fall Out Boy** - 156 plays

Some interesting patterns:
- You listened primarily in the evenings (72% of streams after 4pm)
- Your most-played track was "Welcome to the Black Parade" with 47 plays
- You discovered 23 new artists that year, but kept returning to your core favorites

This was definitely a "comfort listening" year — you knew what you loved and you weren't afraid to replay it. The vibe was very "crying in your bedroom but in the best way." 🌙`
    }
];

// ==========================================
// Data Insights for Prompts
// ==========================================

const DEMO_DATA_INSIGHTS = {
    totalMinutes: 25680,
    uniqueArtists: 203,
    topArtist: {
        name: 'My Chemical Romance',
        minutes: 2847,
        percentile: 'Top 0.5%'
    },
    peakDay: 'Saturday',
    topGenres: ['emo', 'pop punk', 'alternative rock', 'post-hardcore', 'indie pop'],
    listeningPeriod: '2019-2023',
    averageDailyMinutes: 14
};

// ==========================================
// Public API
// ==========================================

// ES Module export
export const DemoData = {
    // Core data
    generateStreams: generateDemoStreams,
    personality: DEMO_PERSONALITY,
    patterns: DEMO_PATTERNS,
    chatHistory: DEMO_CHAT_HISTORY,
    dataInsights: DEMO_DATA_INSIGHTS,

    // Metadata
    personaName: 'The Emo Teen',
    personaDescription: 'A journey through emo, pop punk, and indie rock from 2019-2023',

    // Helper to check if demo mode
    isDemoMode() {
        return new URLSearchParams(window.location.search).get('mode') === 'demo';
    },

    // Get all demo data as a package
    // NOTE: patterns should be computed by caller using Patterns.detectAllPatterns()
    // to ensure consistency between profile card and function call responses
    getFullDemoPackage() {
        const streams = generateDemoStreams();
        return {
            streams,
            personality: DEMO_PERSONALITY,
            patterns: null, // Computed dynamically by caller
            chatHistory: DEMO_CHAT_HISTORY,
            insights: DEMO_DATA_INSIGHTS,
            isDemoData: true
        };
    }
};


console.log('[DemoData] Module loaded. Use DemoData.isDemoMode() to check demo state.');

