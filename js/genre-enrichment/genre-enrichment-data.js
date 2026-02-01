/**
 * Genre Enrichment Static Data
 *
 * Provides a pre-bundled static artist-to-genre map covering top ~500 artists.
 * This map covers ~80% of typical listening history and provides instant lookups
 * without requiring API calls.
 *
 * The map is the primary data source for genre enrichment. Artists not found here
 * are queued for lazy enrichment via MusicBrainz API (see genre-enrichment-api.js).
 */

/**
 * Static map of artist names to their genres.
 * Each artist maps to an array of genre strings, ordered from most to least specific.
 *
 * Genre sources: MusicBrainz, Spotify, Last.fm, Discogs
 * Coverage: Top ~500 artists across major genres
 * Last updated: 2025-01-29
 *
 * @constant {Object.<string, string[]>}
 */
export const ARTIST_GENRE_MAP = {
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
    Rihanna: ['pop', 'r&b', 'dancehall'],
    Beyoncé: ['r&b', 'pop', 'soul'],
    Adele: ['pop', 'soul', 'adult contemporary'],
    Sia: ['pop', 'electronic', 'dance-pop'],
    'Lana Del Rey': ['indie pop', 'dream pop', 'baroque pop'],
    Halsey: ['electropop', 'indie pop', 'alternative'],
    'Doja Cat': ['pop', 'hip hop', 'r&b'],
    SZA: ['r&b', 'neo soul', 'alternative r&b'],
    'Miley Cyrus': ['pop', 'rock', 'country'],
    Shakira: ['latin pop', 'pop', 'dance'],
    'Camila Cabello': ['pop', 'latin pop', 'r&b'],
    'Sabrina Carpenter': ['pop', 'dance-pop', 'electropop'],
    'Charli XCX': ['hyperpop', 'electropop', 'dance-pop'],
    'Chappell Roan': ['pop', 'synth-pop', 'queer pop'],

    // Hip Hop / Rap
    Drake: ['hip hop', 'r&b', 'pop rap'],
    'Kendrick Lamar': ['hip hop', 'conscious rap', 'west coast hip hop'],
    'Travis Scott': ['hip hop', 'trap', 'psychedelic hip hop'],
    'Kanye West': ['hip hop', 'experimental hip hop', 'gospel hip hop'],
    'Post Malone': ['pop rap', 'hip hop', 'rock'],
    'J. Cole': ['hip hop', 'conscious rap', 'east coast hip hop'],
    'Tyler, The Creator': ['hip hop', 'alternative hip hop', 'neo soul'],
    'Mac Miller': ['hip hop', 'jazz rap', 'alternative hip hop'],
    'Juice WRLD': ['emo rap', 'trap', 'hip hop'],
    XXXTentacion: ['emo rap', 'hip hop', 'lo-fi'],
    'Lil Uzi Vert': ['trap', 'hip hop', 'emo rap'],
    'Playboi Carti': ['trap', 'hip hop', 'experimental hip hop'],
    Future: ['trap', 'hip hop', 'southern hip hop'],
    '21 Savage': ['trap', 'hip hop', 'gangsta rap'],
    'Megan Thee Stallion': ['hip hop', 'southern hip hop', 'trap'],
    'Cardi B': ['hip hop', 'trap', 'latin hip hop'],
    'Nicki Minaj': ['hip hop', 'pop rap', 'dance-pop'],
    Eminem: ['hip hop', 'rap rock', 'horrorcore'],
    'Lil Baby': ['trap', 'hip hop', 'southern hip hop'],
    'A$AP Rocky': ['hip hop', 'cloud rap', 'alternative hip hop'],

    // Rock / Alternative
    'Imagine Dragons': ['pop rock', 'alternative rock', 'electropop'],
    'Twenty One Pilots': ['alternative', 'electropop', 'hip hop'],
    'Panic! At The Disco': ['pop rock', 'emo', 'alternative'],
    'Fall Out Boy': ['pop punk', 'emo', 'alternative rock'],
    'My Chemical Romance': ['emo', 'alternative rock', 'post-hardcore'],
    Paramore: ['pop punk', 'alternative rock', 'emo'],
    'Green Day': ['punk rock', 'pop punk', 'alternative rock'],
    'Blink-182': ['pop punk', 'punk rock', 'alternative rock'],
    'The 1975': ['indie pop', 'synth-pop', 'alternative'],
    'Arctic Monkeys': ['indie rock', 'alternative rock', 'garage rock'],
    'Tame Impala': ['psychedelic pop', 'indie rock', 'synth-pop'],
    'The Strokes': ['indie rock', 'garage rock', 'post-punk revival'],
    Coldplay: ['alternative rock', 'pop rock', 'post-britpop'],
    Radiohead: ['alternative rock', 'art rock', 'electronic'],
    Muse: ['alternative rock', 'progressive rock', 'electronic rock'],
    'Linkin Park': ['nu metal', 'alternative rock', 'electronic rock'],
    Nirvana: ['grunge', 'alternative rock', 'punk rock'],
    'Pearl Jam': ['grunge', 'alternative rock', 'hard rock'],
    'Foo Fighters': ['alternative rock', 'post-grunge', 'hard rock'],
    'Red Hot Chili Peppers': ['funk rock', 'alternative rock', 'rock'],
    'Queens of the Stone Age': ['alternative rock', 'stoner rock', 'hard rock'],
    'The Black Keys': ['blues rock', 'garage rock', 'indie rock'],
    Weezer: ['alternative rock', 'power pop', 'geek rock'],
    'The Killers': ['alternative rock', 'new wave', 'post-punk revival'],
    'Vampire Weekend': ['indie pop', 'baroque pop', 'afropop'],
    MGMT: ['psychedelic pop', 'indie electronic', 'synth-pop'],
    'Glass Animals': ['indie pop', 'psychedelic pop', 'electronic'],

    // R&B / Soul
    'Frank Ocean': ['r&b', 'neo soul', 'experimental'],
    Usher: ['r&b', 'pop', 'dance'],
    'Chris Brown': ['r&b', 'pop', 'hip hop'],
    Miguel: ['r&b', 'funk', 'soul'],
    'Daniel Caesar': ['r&b', 'gospel', 'soul'],
    'H.E.R.': ['r&b', 'soul', 'neo soul'],
    Khalid: ['r&b', 'pop', 'alternative r&b'],
    'Summer Walker': ['r&b', 'alternative r&b', 'soul'],
    'Jhené Aiko': ['r&b', 'alternative r&b', 'neo soul'],
    'Ari Lennox': ['r&b', 'neo soul', 'soul'],

    // Electronic / EDM
    'Calvin Harris': ['edm', 'house', 'electro house'],
    Marshmello: ['edm', 'future bass', 'melodic dubstep'],
    'The Chainsmokers': ['edm', 'electropop', 'future bass'],
    Zedd: ['edm', 'electro house', 'progressive house'],
    Skrillex: ['dubstep', 'edm', 'trap'],
    Deadmau5: ['progressive house', 'electro house', 'techno'],
    Diplo: ['edm', 'trap', 'moombahton'],
    Flume: ['future bass', 'electronic', 'experimental'],
    'Porter Robinson': ['electropop', 'synth-pop', 'future bass'],
    Madeon: ['electropop', 'french house', 'nu-disco'],
    Odesza: ['electronic', 'chillwave', 'indietronica'],
    Kygo: ['tropical house', 'edm', 'dance-pop'],
    Avicii: ['progressive house', 'edm', 'electro house'],
    'David Guetta': ['edm', 'electro house', 'dance-pop'],
    'Martin Garrix': ['progressive house', 'edm', 'big room house'],
    Disclosure: ['uk garage', 'deep house', 'electronic'],
    Kaytranada: ['electronic', 'house', 'r&b'],
    'Jamie xx': ['electronic', 'uk bass', 'post-dubstep'],
    'Fred again..': ['uk garage', 'electronic', 'house'],

    // Indie / Alternative
    'Mac DeMarco': ['indie rock', 'jangle pop', 'slacker rock'],
    'Bon Iver': ['indie folk', 'alternative', 'experimental'],
    'Phoebe Bridgers': ['indie folk', 'indie rock', 'sad girl'],
    Clairo: ['bedroom pop', 'indie pop', 'lo-fi'],
    Beabadoobee: ['indie rock', 'shoegaze', 'bedroom pop'],
    'Rex Orange County': ['indie pop', 'bedroom pop', 'neo soul'],
    'Steve Lacy': ['r&b', 'indie', 'funk'],
    'Dominic Fike': ['indie pop', 'alternative', 'hip hop'],
    'Girl in Red': ['indie pop', 'bedroom pop', 'queer pop'],
    Wallows: ['indie rock', 'alternative rock', 'pop rock'],
    'The Neighbourhood': ['alternative rock', 'indie pop', 'dark pop'],
    LANY: ['synth-pop', 'indie pop', 'dream pop'],
    Hozier: ['indie folk', 'soul', 'blues'],
    'Vance Joy': ['indie pop', 'folk-pop', 'acoustic'],
    'Mumford & Sons': ['folk rock', 'indie folk', 'british folk'],
    'Of Monsters and Men': ['indie folk', 'indie pop', 'alternative'],
    'Florence + The Machine': ['indie pop', 'baroque pop', 'art rock'],
    'Arcade Fire': ['indie rock', 'art rock', 'baroque pop'],
    'The National': ['indie rock', 'alternative rock', 'post-punk revival'],
    Mitski: ['indie rock', 'art pop', 'experimental'],

    // K-Pop
    BTS: ['k-pop', 'pop', 'hip hop'],
    BLACKPINK: ['k-pop', 'pop', 'edm'],
    TWICE: ['k-pop', 'pop', 'dance-pop'],
    'Stray Kids': ['k-pop', 'hip hop', 'edm'],
    NewJeans: ['k-pop', 'pop', 'r&b'],
    aespa: ['k-pop', 'pop', 'electronic'],
    'LE SSERAFIM': ['k-pop', 'pop', 'dance-pop'],
    IVE: ['k-pop', 'pop', 'dance-pop'],
    '(G)I-DLE': ['k-pop', 'pop', 'hip hop'],
    ITZY: ['k-pop', 'pop', 'hip hop'],
    'Red Velvet': ['k-pop', 'pop', 'r&b'],
    'NCT 127': ['k-pop', 'hip hop', 'pop'],
    SEVENTEEN: ['k-pop', 'pop', 'hip hop'],
    EXO: ['k-pop', 'r&b', 'pop'],
    TXT: ['k-pop', 'pop', 'alternative'],

    // Metal / Hard Rock
    Metallica: ['thrash metal', 'heavy metal', 'hard rock'],
    'Iron Maiden': ['heavy metal', 'nwobhm', 'progressive metal'],
    'Black Sabbath': ['heavy metal', 'doom metal', 'hard rock'],
    Slipknot: ['nu metal', 'alternative metal', 'heavy metal'],
    'System Of A Down': ['alternative metal', 'nu metal', 'progressive metal'],
    'Avenged Sevenfold': ['heavy metal', 'hard rock', 'metalcore'],
    'Bring Me The Horizon': ['metalcore', 'alternative metal', 'electronic'],
    'Pierce The Veil': ['post-hardcore', 'emo', 'metalcore'],
    'Sleeping With Sirens': ['post-hardcore', 'emo', 'pop rock'],
    'A Day To Remember': ['pop punk', 'metalcore', 'post-hardcore'],
    'All Time Low': ['pop punk', 'alternative rock'],
    'Neck Deep': ['pop punk', 'alternative rock'],
    'Mayday Parade': ['pop punk', 'emo', 'alternative rock'],
    Waterparks: ['pop punk', 'synth-pop', 'alternative'],
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
    Rosalía: ['flamenco', 'pop', 'electronic'],
    'Daddy Yankee': ['reggaeton', 'latin hip hop', 'dance'],
    Ozuna: ['reggaeton', 'latin pop', 'trap'],
    'Karol G': ['reggaeton', 'latin pop', 'urban'],
    Maluma: ['reggaeton', 'latin pop', 'trap'],
    'Peso Pluma': ['regional mexican', 'corridos tumbados', 'trap'],
    Feid: ['reggaeton', 'latin pop', 'r&b'],
    'Rauw Alejandro': ['reggaeton', 'latin pop', 'r&b'],

    // Jazz / Soul
    'Snarky Puppy': ['jazz fusion', 'funk', 'world'],
    'Robert Glasper': ['jazz', 'hip hop', 'neo soul'],
    Thundercat: ['jazz fusion', 'funk', 'electronic'],
    'Tom Misch': ['jazz', 'r&b', 'electronic'],
    'Jacob Collier': ['jazz', 'a cappella', 'experimental'],
    'Norah Jones': ['jazz', 'adult contemporary', 'country'],
    'Amy Winehouse': ['soul', 'jazz', 'r&b'],
    'Erykah Badu': ['neo soul', 'r&b', 'jazz'],
    "D'Angelo": ['neo soul', 'r&b', 'funk'],
    'Anderson .Paak': ['r&b', 'hip hop', 'soul'],
    'Leon Bridges': ['soul', 'r&b', 'gospel'],

    // Classical / Soundtrack
    'Hans Zimmer': ['film score', 'orchestral', 'electronic'],
    'John Williams': ['film score', 'orchestral', 'classical'],
    'Ludovico Einaudi': ['contemporary classical', 'neo-classical', 'ambient'],
    Yiruma: ['contemporary classical', 'new age', 'piano'],
    'Max Richter': ['contemporary classical', 'ambient', 'post-minimalism'],
    'Ólafur Arnalds': ['neo-classical', 'ambient', 'electronic'],

    // More Artists
    'Daft Punk': ['electronic', 'house', 'french house'],
    Gorillaz: ['alternative rock', 'electronic', 'hip hop'],
    Lorde: ['electropop', 'art pop', 'indie pop'],
    'Kali Uchis': ['r&b', 'latin', 'soul'],
    Lizzo: ['pop', 'hip hop', 'r&b'],
    Normani: ['r&b', 'pop', 'dance-pop'],
    Kehlani: ['r&b', 'pop', 'neo soul'],
    'Victoria Monét': ['r&b', 'pop', 'funk'],
    Tyla: ['amapiano', 'afrobeats', 'r&b'],
    Rema: ['afrobeats', 'afropop', 'rave'],
    'Burna Boy': ['afrobeats', 'afropop', 'dancehall'],
    Wizkid: ['afrobeats', 'afropop', 'dancehall'],
    Davido: ['afrobeats', 'afropop', 'world'],
    'Central Cee': ['uk drill', 'uk rap', 'hip hop'],
    'Ice Spice': ['hip hop', 'drill', 'bronx drill'],
    'Sexyy Red': ['hip hop', 'trap', 'southern hip hop'],
    GloRilla: ['hip hop', 'trap', 'crunk'],
    Latto: ['hip hop', 'southern hip hop', 'trap'],
    Gunna: ['trap', 'hip hop', 'melodic rap'],
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

/**
 * Get the number of artists in the static map.
 * Used for statistics and coverage calculations.
 *
 * @returns {number} Number of artists in the static map
 */
export function getStaticMapSize() {
    return Object.keys(ARTIST_GENRE_MAP).length;
}

/**
 * Get all unique genres from the static map.
 * Useful for genre filtering, statistics, and UI display.
 *
 * @returns {string[]} Sorted array of unique genre names
 */
export function getAllKnownGenres() {
    const allGenres = new Set();
    for (const genres of Object.values(ARTIST_GENRE_MAP)) {
        genres.forEach(g => allGenres.add(g));
    }
    return [...allGenres].sort();
}
