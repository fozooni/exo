/**
 * @fozooni/exo - Middleware
 *
 * Built-in middleware for common tasks like rate limiting.
 */

import type { ExoMiddleware } from "../types/index.js";

// ============================================================================
// Rate Limiter
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Configuration for the rate limiter.
 */
export interface RateLimiterOptions {
  /**
   * The time window in milliseconds.
   * @default 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * The maximum number of requests allowed per window.
   * @default 10
   */
  limit?: number;

  /**
   * Optional function to generate a unique key for the request.
   * Defaults to tool name and user ID (if available).
   */
  keyGenerator?: (context: unknown) => string | undefined;
}

/**
 * Creates a rate limiting middleware.
 *
 * Uses a simple in-memory storage. For distributed systems,
 * consider implementing a custom middleware with Redis.
 *
 * @param options - Configuration options.
 * @returns An ExoMiddleware function.
 *
 * @example
 * ```typescript
 * const limiter = createRateLimiter({ windowMs: 1000, limit: 5 });
 * const tool = createExoTool({
 *   config: { middleware: [limiter] }
 * });
 * ```
 */
export function createRateLimiter(
  options: RateLimiterOptions = {},
): ExoMiddleware {
  const windowMs = options.windowMs ?? 60000;
  const limit = options.limit ?? 10;
  const storage = new Map<string, RateLimitEntry>();

  // Cleanup interval to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of storage.entries()) {
      if (now > entry.resetTime) {
        storage.delete(key);
      }
    }
  }, windowMs).unref(); // unref so it doesn't keep process alive

  return async ({ toolName, context, next }) => {
    // Generate key
    let key: string;
    if (options.keyGenerator) {
      key = options.keyGenerator(context) ?? `${toolName}:global`;
    } else {
      // Default key: toolName + userId (if present)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userId = (context as any)?.user?.id || (context as any)?.userId;
      key = userId ? `${toolName}:${userId}` : `${toolName}:global`;
    }

    const now = Date.now();
    const entry = storage.get(key);

    if (entry && now < entry.resetTime) {
      if (entry.count >= limit) {
        // Rate limit exceeded
        return {
          success: false,
          error: `Rate limit exceeded. Try again in ${Math.ceil(
            (entry.resetTime - now) / 1000,
          )} seconds.`,
          metadata: { rateLimited: true },
        };
      }
      entry.count++;
    } else {
      // New window or expired
      storage.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
    }

    return next();
  };
}
