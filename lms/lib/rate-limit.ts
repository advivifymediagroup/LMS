// Attempt counters per key, in memory: the portal runs as one process.
// ponytail: resets on restart and isn't shared across processes; move to the database or Redis if the app is ever scaled out.
const hits = new Map<string, number[]>();

/** Records one attempt for `key`; true if it's over `max` attempts in the last `windowMs`. */
export function limited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10000) for (const [k, ts] of hits) if (now - ts[ts.length - 1] > windowMs) hits.delete(k);
  return recent.length > max;
}

/** Clears a key's attempts, e.g. after a successful login. */
export const clearLimit = (key: string) => hits.delete(key);

export const TOO_MANY = "Too many attempts. Wait 15 minutes and try again.";
