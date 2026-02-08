/**
 * Malicious File Fixtures
 *
 * Collection of malicious file fixtures for security testing.
 * These are used to test that the application properly handles
 * various attack vectors.
 *
 * @module tests/fixtures/malicious-files
 */

// ==========================================
// ZIP Bomb Files
// ==========================================

/**
 * ZIP bomb with excessive compression ratio
 * 1MB file that expands to 1GB when decompressed
 */
export const ZIP_BOMB_10MB = {
    description: '1MB ZIP file that expands to 10GB (10000:1 compression ratio)',
    filename: 'bomb10MB.zip',
    mimeType: 'application/zip',
    size: 10 * 1024 * 1024, // 10MB
    expandedSize: 10 * 1024 * 1024 * 1024, // 10GB
    compressionRatio: 1000,
    // Mock structure mimicking JSZip
    structure: {
        'large_file.txt': {
            compressedSize: 10 * 1024 * 1024,
            uncompressedSize: 10 * 1024 * 1024 * 1024,
            // Note: Can't actually create 10GB string in memory, using placeholder
            content: null, // Would be 10GB of 'A's in real scenario
            isMock: true,
        },
    },
};

/**
 * Nested ZIP archive bomb
 * ZIP file containing another ZIP file, repeated 10 levels deep
 */
export const NESTED_ZIP_BOMB = {
    description: 'ZIP file containing nested ZIP archives (10 levels deep)',
    filename: 'nested.zip',
    mimeType: 'application/zip',
    depth: 10,
    structure: (() => {
        let current = { 'file.txt': { content: 'Hello' } };
        for (let i = 0; i < 10; i++) {
            current = { [`level${i}.zip`]: { content: current } };
        }
        return current;
    })(),
};

/**
 * ZIP bomb with thousands of files
 * Creates a ZIP with 100,000 tiny files (ZIP bomb via file count)
 */
export const FILE_COUNT_ZIP_BOMB = {
    description: 'ZIP file with 100,000 tiny files (file count bomb)',
    filename: 'manyfiles.zip',
    mimeType: 'application/zip',
    fileCount: 100000,
    structure: Array.from({ length: 100000 }, (_, i) => ({
        name: `file${i}.txt`,
        content: `${i}`,
    })),
};

// ==========================================
// Path Traversal Files
// ==========================================

/**
 * Basic path traversal attempt
 */
export const PATH_TRAVERSAL_BASIC = {
    description: 'JSON file with ../ path traversal',
    filename: 'data.json',
    mimeType: 'application/json',
    content: {
        '../../../etc/passwd': 'malicious',
        '../config.json': { evil: 'payload' },
    },
};

/**
 * Absolute path traversal
 */
export const PATH_TRAVERSAL_ABSOLUTE = {
    description: 'JSON file with absolute path traversal',
    filename: 'data.json',
    mimeType: 'application/json',
    content: {
        '/etc/passwd': 'malicious',
        '/proc/self/environ': 'evil',
        'C:\\Windows\\System32\\config': 'windows',
    },
};

/**
 * Unicode path traversal (normalized paths)
 */
export const PATH_TRAVERSAL_UNICODE = {
    description: 'Unicode normalization path traversal',
    filename: 'data.json',
    mimeType: 'application/json',
    content: {
        '..\\u002fetc/passwd': 'malicious',
        '..%c0%afetc/passwd': 'evil',
    },
};

// ==========================================
// MIME Type Spoofing Files
// ==========================================

/**
 * JSON file with ZIP extension (extension spoofing)
 */
export const FAKE_ZIP_JSON = {
    description: 'JSON file with .zip extension',
    filename: 'notreally.zip',
    mimeType: 'application/json',
    declaredMimeType: 'application/zip',
    content: { not: 'a zip file' },
    magicBytes: {
        expected: [0x50, 0x4b, 0x03, 0x04], // ZIP magic bytes
        actual: [0x7b, 0x22, 0x6e, 0x6f, 0x74], // {"not" (JSON)
    },
};

/**
 * ZIP file with JSON extension
 */
export const FAKE_JSON_ZIP = {
    description: 'ZIP file with .json extension',
    filename: 'actuallyis.json',
    mimeType: 'application/zip',
    declaredMimeType: 'application/json',
    content: 'PK\x03\x04', // ZIP magic bytes
    magicBytes: {
        expected: [0x7b, 0x22], // {" (JSON)
        actual: [0x50, 0x4b, 0x03, 0x04], // ZIP magic bytes
    },
};

/**
 * Executable disguised as JSON
 */
export const EXECUTABLE_AS_JSON = {
    description: 'Windows executable with .json extension',
    filename: 'suspicious.json',
    mimeType: 'application/x-msdownload',
    declaredMimeType: 'application/json',
    content: 'MZ\x90\x00', // PE executable magic bytes
    magicBytes: {
        expected: [0x7b, 0x22], // {" (JSON)
        actual: [0x4d, 0x5a, 0x90, 0x00], // MZ\x90\x00 (PE executable)
    },
};

// ==========================================
// Prototype Pollution Files
// ==========================================

/**
 * Direct __proto__ pollution
 */
export const PROTO_POLLUTION_DIRECT = {
    description: 'Direct __proto__ pollution attempt',
    filename: 'polluted.json',
    mimeType: 'application/json',
    content: {
        __proto__: {
            polluted: true,
            evil: 'payload',
        },
    },
};

/**
 * Constructor.prototype pollution
 */
export const CONSTRUCTOR_POLLUTION = {
    description: 'Constructor.prototype pollution attempt',
    filename: 'polluted.json',
    mimeType: 'application/json',
    content: {
        constructor: {
            prototype: {
                polluted: true,
            },
        },
    },
};

/**
 * Deeply nested prototype pollution
 */
export const DEEP_PROTO_POLLUTION = {
    description: 'Deeply nested prototype pollution',
    filename: 'polluted.json',
    mimeType: 'application/json',
    content: {
        level1: {
            level2: {
                level3: {
                    level4: {
                        level5: {
                            __proto__: { polluted: true },
                        },
                    },
                },
            },
        },
    },
};

/**
 * JSON.parse pollution via array
 */
export const ARRAY_PROTO_POLLUTION = {
    description: 'Prototype pollution via JSON.parse array',
    filename: 'polluted.json',
    mimeType: 'application/json',
    contentString: '{"__proto__":{"polluted":"yes"}}',
};

// ==========================================
// Oversized Files
// ==========================================

/**
 * File exceeding size limit
 */
export const OVERSIZED_FILE = {
    description: 'File exceeding 500MB limit',
    filename: 'huge.json',
    mimeType: 'application/json',
    size: 600 * 1024 * 1024, // 600MB
    maxSize: 500 * 1024 * 1024, // 500MB limit
    content: { huge: 'data' },
};

/**
    * File that's exactly at the limit
 */
export const MAX_SIZE_FILE = {
    description: 'File exactly at 500MB limit',
    filename: 'maxsize.json',
    mimeType: 'application/json',
    size: 500 * 1024 * 1024, // Exactly 500MB
    maxSize: 500 * 1024 * 1024,
    content: { max: 'data' },
};

// ==========================================
// Malformed JSON Files
// ==========================================

/**
 * JSON with syntax errors
 */
export const MALFORMED_JSON_SYNTAX = {
    description: 'JSON with syntax errors',
    filename: 'broken.json',
    mimeType: 'application/json',
    content: '{"unclosed": true, "missing": value}',
};

/**
 * JSON with trailing commas
 */
export const MALFORMED_JSON_TRAILING_COMMA = {
    description: 'JSON with trailing commas',
    filename: 'trailing.json',
    mimeType: 'application/json',
    content: '{"trailing": "comma",}',
};

/**
 * JSON with duplicate keys
 */
export const MALFORMED_JSON_DUPLICATE_KEYS = {
    description: 'JSON with duplicate keys',
    filename: 'duplicate.json',
    mimeType: 'application/json',
    content: '{"key": "value1", "key": "value2"}',
};

// ==========================================
// Injection Attack Files
// ==========================================

/**
 * XSS in JSON values
 */
export const XSS_IN_JSON = {
    description: 'XSS payload in JSON values',
    filename: 'xss.json',
    mimeType: 'application/json',
    content: {
        artist: '<script>alert("XSS")</script>',
        track: '<img src=x onerror="alert(1)">',
        album: '"><script>alert(String.fromCharCode(88,83,83))</script>',
    },
};

/**
 * SQL injection in JSON
 */
export const SQL_INJECTION_IN_JSON = {
    description: 'SQL injection in JSON values',
    filename: 'sqli.json',
    mimeType: 'application/json',
    content: {
        query: "'; DROP TABLE users; --",
        search: "admin' OR '1'='1",
    },
};

/**
 * NoSQL injection in JSON
 */
export const NOSQL_INJECTION_IN_JSON = {
    description: 'NoSQL injection in JSON values',
    filename: 'nosqli.json',
    mimeType: 'application/json',
    content: {
        user: { $ne: null },
        password: { $regex: '.*' },
    },
};

// ==========================================
// Special Character Files
// ==========================================

/**
 * JSON with null bytes
 */
export const NULL_BYTE_JSON = {
    description: 'JSON with null bytes',
    filename: 'nullbyte.json',
    mimeType: 'application/json',
    content: {
        'null\x00byte': 'attack',
        field: 'value\x00with\x00nulls',
    },
};

/**
 * JSON with control characters
 */
export const CONTROL_CHARS_JSON = {
    description: 'JSON with control characters',
    filename: 'control.json',
    mimeType: 'application/json',
    content: {
        'tab\tseparator': 'value',
        'newline\nseparator': 'value',
        'carriage\rreturn': 'value',
    },
};

/**
 * JSON with emoji and unicode
 */
export const UNICODE_EXTREME_JSON = {
    description: 'JSON with extreme unicode characters',
    filename: 'unicode.json',
    mimeType: 'application/json',
    content: {
        emoji: '😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗☺😚😙🥲😋😛😜🤪😝🤑🤗🤭🤫🤔',
        rtl: 'שלום עולם',
        combining: 'cafe\u0301', // cafe with combining acute accent
        surrogate: '\uD83D\uDE00', // 😀 as surrogate pair
    },
};

// ==========================================
// Spotify Streaming History Attacks
// ==========================================

/**
 * Malicious streaming history with extreme values
 */
export const MALICIOUS_STREAMING_HISTORY = {
    description: 'Streaming history with extreme/malicious values',
    filename: 'StreamingHistory0.json',
    mimeType: 'application/json',
    content: [
        {
            msPlayed: -999999, // Negative play time
            endTime: '9999-12-31 23:59:59', // Far future date
            artistName: '<script>alert("XSS")</script>',
            trackName: '../../../etc/passwd',
            albumName: null,
        },
        {
            msPlayed: Number.MAX_SAFE_INTEGER, // Extreme value
            endTime: 'invalid-date',
            artistName: '',
            trackName: '',
            albumName: '',
        },
    ],
};

/**
 * Streaming history with prototype pollution
 */
export const STREAMING_HISTORY_PROTO_POLLUTION = {
    description: 'Streaming history with prototype pollution',
    filename: 'StreamingHistory1.json',
    mimeType: 'application/json',
    content: [
        {
            msPlayed: 180000,
            endTime: '2023-01-01 12:00:00',
            artistName: 'Artist',
            trackName: 'Track',
            albumName: 'Album',
            __proto__: { admin: true },
        },
    ],
};

// ==========================================
// Helper Functions
// ==========================================

/**
 * Get all malicious file fixtures
 * @returns {Object} All fixtures indexed by name
 */
export function getAllMaliciousFiles() {
    return {
        zipBomb10MB: ZIP_BOMB_10MB,
        nestedZipBomb: NESTED_ZIP_BOMB,
        fileCountZipBomb: FILE_COUNT_ZIP_BOMB,
        pathTraversalBasic: PATH_TRAVERSAL_BASIC,
        pathTraversalAbsolute: PATH_TRAVERSAL_ABSOLUTE,
        pathTraversalUnicode: PATH_TRAVERSAL_UNICODE,
        fakeZipJson: FAKE_ZIP_JSON,
        fakeJsonZip: FAKE_JSON_ZIP,
        executableAsJson: EXECUTABLE_AS_JSON,
        protoPollutionDirect: PROTO_POLLUTION_DIRECT,
        constructorPollution: CONSTRUCTOR_POLLUTION,
        deepProtoPollution: DEEP_PROTO_POLLUTION,
        arrayProtoPollution: ARRAY_PROTO_POLLUTION,
        oversizedFile: OVERSIZED_FILE,
        maxSizeFile: MAX_SIZE_FILE,
        malformedJsonSyntax: MALFORMED_JSON_SYNTAX,
        malformedJsonTrailingComma: MALFORMED_JSON_TRAILING_COMMA,
        malformedJsonDuplicateKeys: MALFORMED_JSON_DUPLICATE_KEYS,
        xssInJson: XSS_IN_JSON,
        sqlInjectionInJson: SQL_INJECTION_IN_JSON,
        nosqlInjectionInJson: NOSQL_INJECTION_IN_JSON,
        nullByteJson: NULL_BYTE_JSON,
        controlCharsJson: CONTROL_CHARS_JSON,
        unicodeExtremeJson: UNICODE_EXTREME_JSON,
        maliciousStreamingHistory: MALICIOUS_STREAMING_HISTORY,
        streamingHistoryProtoPollution: STREAMING_HISTORY_PROTO_POLLUTION,
    };
}

/**
 * Get fixtures by category
 * @param {string} category - Category name
 * @returns {Array} Array of fixtures in category
 */
export function getFixturesByCategory(category) {
    const all = getAllMaliciousFiles();
    const categories = {
        zipBomb: ['zipBomb10MB', 'nestedZipBomb', 'fileCountZipBomb'],
        pathTraversal: ['pathTraversalBasic', 'pathTraversalAbsolute', 'pathTraversalUnicode'],
        mimeSpoofing: ['fakeZipJson', 'fakeJsonZip', 'executableAsJson'],
        protoPollution: ['protoPollutionDirect', 'constructorPollution', 'deepProtoPollution', 'arrayProtoPollution'],
        oversized: ['oversizedFile', 'maxSizeFile'],
        malformed: ['malformedJsonSyntax', 'malformedJsonTrailingComma', 'malformedJsonDuplicateKeys'],
        injection: ['xssInJson', 'sqlInjectionInJson', 'nosqlInjectionInJson'],
        specialChars: ['nullByteJson', 'controlCharsJson', 'unicodeExtremeJson'],
        streaming: ['maliciousStreamingHistory', 'streamingHistoryProtoPollution'],
    };

    return (categories[category] || []).map(name => all[name]);
}

/**
 * Create a File object from a fixture
 * @param {Object} fixture - Fixture object
 * @returns {File} File object
 */
export function createFileFromFixture(fixture) {
    let content;
    if (fixture.contentString) {
        content = fixture.contentString;
    } else if (typeof fixture.content === 'string') {
        content = fixture.content;
    } else {
        content = JSON.stringify(fixture.content, null, 2);
    }

    const blob = new Blob([content], { type: fixture.mimeType });
    return new File([blob], fixture.filename, { type: fixture.mimeType });
}

console.log('[Malicious Files] Malicious file fixtures loaded');
