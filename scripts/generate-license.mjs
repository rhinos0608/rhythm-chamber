#!/usr/bin/env node
/**
 * License Generation Utility (Server-Side)
 *
 * This script generates ECDSA-signed JWT licenses for Rhythm Chamber.
 * It MUST be run server-side only - the private key never leaves the server.
 *
 * Usage:
 *   node scripts/generate-license.mjs --tier chamber --expires-in 365
 *   node scripts/generate-license.mjs --help
 *
 * Security Notes:
 * - This uses asymmetric cryptography (ECDSA with P-256 curve)
 * - Private key is kept secure on the server
 * - Public key is embedded in client code for verification only
 * - Even with full access to client code, licenses cannot be forged
 *
 * @module scripts/generate-license
 */

import crypto from 'crypto';

// ==========================================
// Configuration
// ==========================================

// License key storage path (in production, use a secure HSM or KMS)
const KEY_STORAGE_PATH = process.env.LICENSE_KEY_PATH || '.license-keys';

// Valid license tiers
const VALID_TIERS = ['sovereign', 'chamber', 'curator'];

// Default expiration (days)
const DEFAULT_EXPIRATION_DAYS = 365;

// ==========================================
// License Key Management
// ==========================================

import fs from 'fs';
import path from 'path';

/**
 * Ensure the key storage directory exists
 */
function ensureKeyStorage() {
  if (!fs.existsSync(KEY_STORAGE_PATH)) {
    fs.mkdirSync(KEY_STORAGE_PATH, { mode: 0o700 });
    console.log(`Created key storage directory: ${KEY_STORAGE_PATH}`);
  }
}

/**
 * Get the private key path
 */
function getPrivateKeyPath() {
  return path.join(KEY_STORAGE_PATH, 'private.pem');
}

/**
 * Get the public key path
 */
function getPublicKeyPath() {
  return path.join(KEY_STORAGE_PATH, 'public.pem');
}

/**
 * Load or generate the ECDSA key pair
 * @returns {Object} { privateKey, publicKey }
 */
function loadOrGenerateKeyPair() {
  ensureKeyStorage();

  const privateKeyPath = getPrivateKeyPath();
  const publicKeyPath = getPublicKeyPath();

  // Check if keys already exist
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    console.log('Loading existing ECDSA key pair...');
    return {
      privateKey: fs.readFileSync(privateKeyPath, 'utf-8'),
      publicKey: fs.readFileSync(publicKeyPath, 'utf-8'),
    };
  }

  // Generate new key pair
  console.log('Generating new ECDSA P-256 key pair...');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  });

  // Save keys with restricted permissions
  fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });

  console.log(`Private key saved to: ${privateKeyPath}`);
  console.log(`Public key saved to: ${publicKeyPath}`);

  return { privateKey, publicKey };
}

/**
 * Export public key in base64URL format for client embedding
 * @param {string} publicKey - PEM formatted public key
 * @returns {string} Base64URL encoded SPKI
 */
function exportPublicKeyForClient(publicKey) {
  // Extract the base64 part from PEM
  const pemContents = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\n/g, '')
    .trim();

  // Convert to base64URL
  return pemContents.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ==========================================
// JWT Utilities
// ==========================================

/**
 * Base64URL encode a string
 * @param {string} str - String to encode
 * @returns {string} Base64URL encoded string
 */
function base64UrlEncode(str) {
  const base64 = Buffer.from(str).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Create a JWT license token
 * @param {Object} payload - License payload
 * @param {string|Buffer} privateKey - Private key for signing
 * @returns {string} JWT token
 */
function createJWT(payload, privateKey) {
  const header = {
    alg: 'ES256',
    typ: 'JWT',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  // Sign with ECDSA using SHA-256
  const signature = crypto.sign('sha256', Buffer.from(data), {
    key: privateKey,
    format: 'pem',
    type: 'pkcs8',
  });

  // Encode signature in base64URL
  const encodedSignature = Buffer.from(signature)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${data}.${encodedSignature}`;
}

// ==========================================
// License Generation
// ==========================================

/**
 * Generate a license token
 * @param {Object} options - License options
 * @returns {string} JWT license token
 */
function generateLicense(options = {}) {
  const {
    tier = 'sovereign',
    expiresInDays = DEFAULT_EXPIRATION_DAYS,
    instanceId = null,
    features = [],
    deviceBinding = null,
  } = options;

  // Validate tier
  if (!VALID_TIERS.includes(tier)) {
    throw new Error(`Invalid tier: ${tier}. Must be one of: ${VALID_TIERS.join(', ')}`);
  }

  // Calculate timestamps
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInDays * 24 * 60 * 60;

  // Build payload
  const payload = {
    tier,
    iat: now,
    exp,
    features,
  };

  if (instanceId) {
    payload.instanceId = instanceId;
  }

  if (deviceBinding) {
    payload.deviceBinding = deviceBinding;
  }

  // Load key pair and sign
  const { privateKey } = loadOrGenerateKeyPair();
  const token = createJWT(payload, privateKey);

  return token;
}

// ==========================================
// CLI Interface
// ==========================================

function printHelp() {
  console.log(`
License Generation Utility (Server-Side)

Usage:
  node scripts/generate-license.mjs [options]

Options:
  --tier <tier>           License tier: sovereign, chamber, curator (default: sovereign)
  --expires-in <days>     Days until expiration (default: 365)
  --instance-id <id>      Instance ID for binding (optional)
  --features <features>   Comma-separated feature list (optional)
  --device-binding <fp>   Device fingerprint hash for binding (optional)
  --export-public-key     Export public key for embedding in client code
  --help                  Show this help message

Examples:
  # Generate a 1-year chamber tier license
  node scripts/generate-license.mjs --tier chamber --expires-in 365

  # Generate a license with specific features
  node scripts/generate-license.mjs --tier curator --features advanced_analysis,api_access

  # Export the public key for client embedding
  node scripts/generate-license.mjs --export-public-key

Security Notes:
  - This script MUST be run server-side only
  - The private key is stored in: ${KEY_STORAGE_PATH}/private.pem
  - Never commit the private key to version control
  - Use --export-public-key to get the public key for client code
`);
}

function parseArgs(args) {
  const options = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--tier':
        options.tier = args[++i];
        break;
      case '--expires-in':
        options.expiresInDays = parseInt(args[++i], 10);
        break;
      case '--instance-id':
        options.instanceId = args[++i];
        break;
      case '--features':
        options.features = args[++i].split(',').map(f => f.trim());
        break;
      case '--device-binding':
        options.deviceBinding = args[++i];
        break;
      case '--export-public-key':
        options.exportPublicKey = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }

    i++;
  }

  return options;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.exportPublicKey) {
    const { publicKey } = loadOrGenerateKeyPair();
    const publicKeyB64Url = exportPublicKeyForClient(publicKey);

    console.log('\n=== Public Key for Client Code ===');
    console.log('\nJavaScript/TypeScript:');
    console.log(`const PUBLIC_KEY_SPKI = '${publicKeyB64Url.substring(0, 64)}';`);
    console.log(`const PUBLIC_KEY_SPKI += '${publicKeyB64Url.substring(64)}';`);
    console.log('\nFull string:');
    console.log(publicKeyB64Url);
    console.log('\nPEM format:');
    console.log(publicKey);
    return;
  }

  try {
    const token = generateLicense(args);

    console.log('\n=== Generated License Token ===');
    console.log('\nJWT Token:');
    console.log(token);

    // Decode for display
    const parts = token.split('.');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    console.log('\nHeader:');
    console.log(JSON.stringify(header, null, 2));

    console.log('\nPayload:');
    console.log(JSON.stringify(payload, null, 2));

    console.log('\nLicense valid until:', new Date(payload.exp * 1000).toISOString());
  } catch (error) {
    console.error('Error generating license:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateLicense, loadOrGenerateKeyPair, exportPublicKeyForClient };
