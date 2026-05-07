/**
 * In-memory rate limiter (per-instance).
 * Not perfect for serverless, but provides basic protection.
 * For production-grade limiting, use Vercel KV or Upstash.
 */

const buckets = new Map<string, { count: number; resetAt: number }>()

interface RateLimitOptions {
  windowMs: number
  max: number
}

/**
 * Check if request is within rate limit.
 * Returns { allowed: true } if within limit, { allowed: false, retryAfter } otherwise.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = { windowMs: 60_000, max: 60 }
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs })
    return { allowed: true }
  }

  if (bucket.count >= options.max) {
    return {
      allowed: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    }
  }

  bucket.count++
  return { allowed: true }
}

/**
 * Get client identifier from request (IP address)
 */
export function getClientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  const realIp = request.headers.get("x-real-ip")
  return forwarded?.split(",")[0]?.trim() || realIp || "unknown"
}

// Periodically clean up expired buckets to prevent memory leak
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets.entries()) {
      if (now > bucket.resetAt) buckets.delete(key)
    }
  }, 60_000)
}
