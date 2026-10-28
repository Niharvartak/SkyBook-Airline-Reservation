/**
 * Small in-memory rate limiter for authentication endpoints.
 * Suitable for a single-process deployment; swap for a shared store
 * (Redis) when running multiple backend replicas.
 */
function createRateLimiter({ windowMs = 60_000, max = 20, message } = {}) {
  const buckets = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(windowMs, 30_000));
  if (typeof cleanup.unref === "function") cleanup.unref();

  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const key = `${req.method}:${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({
        ok: false,
        message: message || "Too many attempts. Please wait a moment and try again.",
      });
    }
    next();
  };
}

module.exports = { createRateLimiter };
