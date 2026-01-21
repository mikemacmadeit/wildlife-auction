/**
 * Rate Limiting with Redis (Upstash) or In-Memory Fallback
 * Uses Upstash Redis for production, falls back to in-memory for development
 */

import { Redis } from '@upstash/redis';

// Redis client (initialized lazily)
let redisClient: Redis | null = null;
let redisInitialized = false;
let redisAvailable = false;

// In-memory fallback store
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const inMemoryStore: RateLimitStore = {};

/**
 * Initialize Redis client if credentials are available
 */
function initializeRedis(): Redis | null {
  if (redisInitialized) {
    return redisClient;
  }

  redisInitialized = true;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      redisClient = new Redis({
        url: redisUrl,
        token: redisToken,
      });
      redisAvailable = true;
      console.log('[rate-limit] Redis initialized successfully');
      return redisClient;
    } catch (error) {
      console.error('[rate-limit] Failed to initialize Redis:', error);
      console.warn('[rate-limit] Falling back to in-memory rate limiting');
      redisAvailable = false;
      return null;
    }
  } else {
    console.warn('[rate-limit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set, using in-memory rate limiting');
    redisAvailable = false;
    return null;
  }
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  /**
   * If true, and running in the Netlify runtime, rate limiting must use Redis.
   * This avoids the ineffective in-memory fallback in serverless environments.
   *
   * Behavior:
   * - Local/dev (NETLIFY not set): fallback to in-memory is allowed.
   * - Netlify runtime (NETLIFY set): returns 503 if Redis env vars are missing/unavailable.
   */
  requireRedisInProd?: boolean;
}

/**
 * Default rate limits
 */
export const RATE_LIMITS = {
  // General API routes
  default: { windowMs: 60 * 1000, maxRequests: 60 }, // 60 requests per minute
  // Stripe operations (more restrictive)
  stripe: { windowMs: 60 * 1000, maxRequests: 20, requireRedisInProd: true }, // 20 requests per minute
  // Admin operations (very restrictive)
  admin: { windowMs: 60 * 1000, maxRequests: 10, requireRedisInProd: true }, // 10 requests per minute
  // Checkout (very restrictive - prevent abuse)
  checkout: { windowMs: 60 * 1000, maxRequests: 5, requireRedisInProd: true }, // 5 requests per minute
  // Messaging (restrict writes/abuse)
  messages: { windowMs: 60 * 1000, maxRequests: 20, requireRedisInProd: true }, // 20 requests per minute
  // Support/contact form (restrict spam/abuse)
  support: { windowMs: 60 * 1000, maxRequests: 5, requireRedisInProd: true }, // 5 requests per minute
  // Bidding (high frequency; keyed per user+listing in /api/bids/place)
  bidsPlace: { windowMs: 10 * 1000, maxRequests: 30, requireRedisInProd: true }, // 30 requests per 10s per user+listing
  // Coarse pre-auth bidding guard (keyed by IP); very generous to avoid blocking real bidders behind shared IPs.
  bidsIp: { windowMs: 10 * 1000, maxRequests: 200, requireRedisInProd: true }, // 200 requests per 10s per IP
} as const;

export async function checkRateLimitByKey(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: true } | { allowed: false; retryAfter: number; status?: number; error?: string }> {
  const now = Date.now();

  // Try Redis first
  const redis = initializeRedis();

  // In serverless production (Netlify), in-memory rate limiting is not durable.
  // For sensitive endpoints, fail closed if Redis isn't configured.
  const isNetlifyRuntime = String(process.env.NETLIFY || '').toLowerCase() === 'true' || !!process.env.NETLIFY;
  if (!redis && config.requireRedisInProd && isNetlifyRuntime) {
    return {
      allowed: false,
      status: 503,
      error: 'Rate limiting is not configured on this environment.',
      retryAfter: Math.ceil(config.windowMs / 1000),
    };
  }

  if (redis) {
    try {
      const redisKey = `rate_limit:${key}`;
      const currentCount = (await redis.get<number>(redisKey)) || 0;

      if (currentCount >= config.maxRequests) {
        const ttl = await redis.ttl(redisKey);
        const retryAfter = ttl > 0 ? ttl : Math.ceil(config.windowMs / 1000);
        return { allowed: false, retryAfter };
      }

      const newCount = currentCount + 1;
      if (currentCount === 0) {
        await redis.set(redisKey, newCount, { ex: Math.ceil(config.windowMs / 1000) });
      } else {
        await redis.incr(redisKey);
      }

      return { allowed: true };
    } catch (error) {
      console.error('[rate-limit] Redis error, falling back to in-memory:', error);
      // Fall through to in-memory
    }
  }

  // Fallback to in-memory
  if (inMemoryStore[key] && inMemoryStore[key].resetTime < now) {
    delete inMemoryStore[key];
  }
  if (!inMemoryStore[key]) {
    inMemoryStore[key] = { count: 1, resetTime: now + config.windowMs };
    return { allowed: true };
  }
  if (inMemoryStore[key].count < config.maxRequests) {
    inMemoryStore[key].count++;
    return { allowed: true };
  }
  const retryAfter = Math.ceil((inMemoryStore[key].resetTime - now) / 1000);
  return { allowed: false, retryAfter };
}

/**
 * Get rate limit key from request
 */
function getRateLimitKey(request: Request, userId?: string): string {
  // Use IP address as fallback
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown';
  
  // If user ID is available, use it (more accurate)
  if (userId) {
    return `user:${userId}`;
  }
  
  return `ip:${ip}`;
}

/**
 * Check if request is within rate limit
 */
export async function checkRateLimit(
  request: Request,
  config: RateLimitConfig,
  userId?: string
): Promise<{ allowed: true } | { allowed: false; retryAfter: number; status?: number; error?: string }> {
  const key = getRateLimitKey(request, userId);
  return checkRateLimitByKey(key, config);
}

/**
 * Rate limit middleware for Next.js API routes
 */
export function rateLimitMiddleware(
  config: RateLimitConfig = RATE_LIMITS.default,
  userId?: string
) {
  return async (request: Request): Promise<{ allowed: true } | { allowed: false; status: number; body: { error: string; retryAfter: number } }> => {
    const result = await checkRateLimit(request, config, userId);
    
    if (result.allowed) {
      return { allowed: true };
    }
    
    return {
      allowed: false,
      status: result.status ?? 429,
      body: {
        error: result.error || 'Too many requests. Please try again later.',
        retryAfter: result.retryAfter,
      },
    };
  };
}

/**
 * Clean up old rate limit entries (in-memory only, Redis uses TTL)
 */
export function cleanupRateLimitStore() {
  const now = Date.now();
  Object.keys(inMemoryStore).forEach(key => {
    if (inMemoryStore[key].resetTime < now) {
      delete inMemoryStore[key];
    }
  });
}

// Clean up every 5 minutes (in-memory only)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
}
