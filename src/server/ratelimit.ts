/**
 * Thin port over the Workers Rate Limiting binding so services can be tested without it.
 * The binding is per-colo and eventually consistent — it is abuse mitigation, not accounting.
 */

export interface RateLimiter {
  /** Returns true when the request is allowed. */
  allow(key: string): Promise<boolean>;
}

export const allowAll: RateLimiter = { allow: async () => true };

export function fromBinding(binding: RateLimit | undefined): RateLimiter {
  if (!binding) return allowAll;
  return {
    async allow(key) {
      try {
        const { success } = await binding.limit({ key });
        return success;
      } catch {
        // Never block real customers because the limiter itself is unavailable.
        return true;
      }
    },
  };
}

/** Deterministic limiter for tests: allows `limit` calls per key. */
export function createCountingLimiter(limit: number): RateLimiter & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    async allow(key) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next <= limit;
    },
  };
}
