/**
 * Limitador simple en memoria para los intentos de PIN. En serverless cada instancia tiene su
 * propio contador, así que frena a un humano probando PINs pero no es una defensa fuerte.
 */
export function createLimiter(opts: { max: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const fails = new Map<string, { count: number; first: number }>();

  function live(key: string) {
    const e = fails.get(key);
    if (e && now() - e.first >= opts.windowMs) {
      fails.delete(key);
      return undefined;
    }
    return e;
  }

  return {
    check(key: string): { allowed: boolean; retryAfterSec: number } {
      const e = live(key);
      if (!e || e.count < opts.max) return { allowed: true, retryAfterSec: 0 };
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((e.first + opts.windowMs - now()) / 1000)) };
    },
    fail(key: string): void {
      const e = live(key);
      if (e) e.count += 1;
      else fails.set(key, { count: 1, first: now() });
    },
    reset(key: string): void {
      fails.delete(key);
    },
  };
}
