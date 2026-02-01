/**
 * Cloudflare Worker for Lemon Squeezy License Validation
 *
 * Validates license keys against Lemon Squeezy API without exposing
 * the API key to the client. Acts as a secure proxy.
 *
 * Deployment:
 * 1. Install wrangler: npm install -g wrangler
 * 2. Create wrangler.jsonc with configuration
 * 3. Add LEMONSQUEEZY_API_KEY as secret: wrangler secret put LEMONSQUEEZY_API_KEY
 * 4. Deploy: wrangler deploy
 *
 * @license MIT
 * @author Rhythm Chamber
 */

export default {
  async fetch(request, env, ctx) {
    // SECURITY: Get origin from request and validate against whitelist
    const requestOrigin = request.headers.get('Origin');
    const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [];

    // Determine if origin is allowed (fallback to empty for same-origin requests)
    // Handle null origin from local file:// URLs, redirects, and certain privacy modes
    const allowedOrigin =
            requestOrigin === null || !allowedOrigins.includes(requestOrigin)
              ? allowedOrigins[0] || ''
              : requestOrigin;

    // CORS headers for all responses - use whitelisted origin only
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      // Vary header required for proper caching when origin is dynamic
      Vary: 'Origin',
    };

    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check endpoint
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          timestamp: Date.now(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // License validation endpoint
    if (url.pathname === '/validate' && request.method === 'POST') {
      return handleValidate(request, env, corsHeaders);
    }

    // License activation endpoint
    if (url.pathname === '/activate' && request.method === 'POST') {
      return handleActivate(request, env, corsHeaders);
    }

    // Webhook endpoint (for Lemon Squeezy webhooks)
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env, corsHeaders);
    }

    // 404 for unknown routes
    return new Response(
      JSON.stringify({
        error: 'Not found',
        available_routes: ['/validate', '/activate', '/webhook', '/health'],
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  },
};

/**
 * Handle license validation requests
 */
async function handleValidate(request, env, corsHeaders) {
  // SECURITY: Apply rate limiting before processing
  const clientId = getClientIdentifier(request);
  const rateLimitConfig = env.RATE_LIMIT_CONFIG
    ? JSON.parse(env.RATE_LIMIT_CONFIG)
    : { maxRequests: 10, windowMs: 60000 };

  const rateLimitCheck = checkRateLimit(
    clientId,
    rateLimitConfig.maxRequests || 10,
    rateLimitConfig.windowMs || 60000
  );

  if (!rateLimitCheck.allowed) {
    return jsonResponse(
      {
        valid: false,
        error: 'RATE_LIMITED',
        message: 'Too many validation requests. Please try again later.',
        retryAfter: rateLimitCheck.retryAfter,
      },
      429,
      {
        ...corsHeaders,
        'Retry-After': String(rateLimitCheck.retryAfter),
      }
    );
  }

  try {
    const body = await request.json();
    const { licenseKey, instanceId, action } = body;

    if (!licenseKey) {
      return jsonResponse(
        {
          valid: false,
          error: 'MISSING_KEY',
          message: 'License key is required',
        },
        400,
        corsHeaders
      );
    }

    // If instanceId is provided, validate existing instance
    // Otherwise, activate new instance
    const apiUrl = instanceId
      ? 'https://api.lemonsqueezy.com/v1/licenses/validate'
      : 'https://api.lemonsqueezy.com/v1/licenses/activate';

    const apiBody = instanceId
      ? { license_key: licenseKey, instance_id: instanceId }
      : { license_key: licenseKey, instance_name: 'rhythm-chamber' };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
      },
      body: JSON.stringify(apiBody),
    });

    if (!apiResponse.ok) {
      return jsonResponse(
        {
          valid: false,
          error: 'API_ERROR',
          message: `Lemon Squeezy API returned ${apiResponse.status}`,
        },
        502,
        corsHeaders
      );
    }

    const data = await apiResponse.json();

    // Check for Lemon Squeezy errors
    if (data.error) {
      return jsonResponse(
        {
          valid: false,
          error: 'INVALID_KEY',
          message: data.error,
        },
        200,
        corsHeaders
      );
    }

    const licenseKeyData = data.license_key;

    // Check license status
    if (licenseKeyData.status !== 'active') {
      return jsonResponse(
        {
          valid: false,
          error: 'INACTIVE',
          message: `License status: ${licenseKeyData.status}`,
        },
        200,
        corsHeaders
      );
    }

    // Check expiration
    let expiresAt = null;
    if (licenseKeyData.expires_at) {
      const expiryDate = new Date(licenseKeyData.expires_at);
      if (expiryDate < new Date()) {
        return jsonResponse(
          {
            valid: false,
            error: 'EXPIRED',
            message: 'License has expired',
            expiredAt: licenseKeyData.expires_at,
          },
          200,
          corsHeaders
        );
      }
      expiresAt = licenseKeyData.expires_at;
    }

    // Valid license - return data with 30-day cache recommendation
    return jsonResponse(
      {
        valid: true,
        tier: 'chamber',
        instanceId: data.instance?.id || instanceId,
        activatedAt: licenseKeyData.created_at,
        expiresAt: expiresAt,
        cacheFor: 30 * 24 * 60 * 60, // 30 days in seconds
      },
      200,
      corsHeaders
    );
  } catch (error) {
    return jsonResponse(
      {
        valid: false,
        error: 'INTERNAL_ERROR',
        message: error.message,
      },
      500,
      corsHeaders
    );
  }
}

/**
 * Handle license activation (alias for validate without instance)
 */
async function handleActivate(request, env, corsHeaders) {
  return handleValidate(request, env, corsHeaders);
}

/**
 * Handle Lemon Squeezy webhooks
 */
async function handleWebhook(request, env, corsHeaders) {
  try {
    // Verify webhook signature
    const signature = request.headers.get('X-Signature');
    if (!signature) {
      return jsonResponse(
        {
          error: 'Missing signature',
        },
        401,
        corsHeaders
      );
    }

    const rawBody = await request.text();
    const expectedSig = await createHmac(
      rawBody,
      env.WEBHOOK_SECRET || env.LEMONSQUEEZY_API_KEY
    );

    if (!signature || !timingSafeEqual(signature, expectedSig)) {
      return jsonResponse(
        {
          error: 'Invalid signature',
        },
        401,
        corsHeaders
      );
    }

    const data = JSON.parse(rawBody);
    const eventName = data.meta?.event_name;

    logger.info(`Webhook received: ${eventName}`);

    // Handle specific events
    switch (eventName) {
      case 'order_created':
      case 'license_key_created':
        // Could trigger license activation flow
        break;

      case 'subscription_created':
        // New subscription
        break;

      case 'subscription_updated':
        // Subscription changed
        break;

      case 'subscription_cancelled':
        // Could trigger license deactivation
        break;
    }

    // Return 200 to acknowledge webhook
    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    return jsonResponse(
      {
        error: error.message,
      },
      500,
      corsHeaders
    );
  }
}

/**
 * Helper: Create HMAC signature
 */
async function createHmac(data, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Helper: Timing-safe string comparison
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }

  return result === 0;
}

// ==========================================
// Rate Limiting (In-memory for single instance)
// ==========================================

/**
 * Rate limit store using a Map
 * For production with multiple worker instances, use KV or Durable Objects
 */
const rateLimitStore = new Map();

/**
 * Check if request should be rate limited
 * @param {string} identifier - IP address or identifier
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {{allowed: boolean, retryAfter?: number}}
 */
function checkRateLimit(identifier, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || record.resetAt < now) {
    // First request or window expired
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }

  if (record.count >= maxRequests) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment counter
  record.count++;
  rateLimitStore.set(identifier, record);
  return { allowed: true };
}

/**
 * Get client IP from request headers
 * @param {Request} request
 * @returns {string}
 */
function getClientIdentifier(request) {
  // Check various headers for real IP (behind proxy)
  const headers = [
    'CF-Connecting-IP', // Cloudflare
    'X-Forwarded-For', // General proxy
    'X-Real-IP', // Nginx
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      // X-Forwarded-For may contain multiple IPs, take the first
      return value.split(',')[0].trim();
    }
  }

  // Fallback to a hash of the request (less ideal but works)
  return 'unknown';
}

// ==========================================
// Response Helpers
// ==========================================

/**
 * Helper: JSON response with headers
 */
function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Simple logger (Cloudflare Workers don't have console)
 */
const logger = {
  info: (message, data) => {
    // In production, you might want to send this to a logging service
    // For now, silent in worker
  },
};
