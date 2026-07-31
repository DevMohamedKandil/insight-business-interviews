/** Document 6 §3. In-memory-per-instance sliding window — the simpler of the two
 *  options Document 6 §3 names, sufficient at MVP scale (Document 17 doesn't list
 *  rate-limiting sophistication as a trigger until real abuse patterns are observed).
 *  Known limitation: resets on cold start and isn't shared across concurrent
 *  instances — acceptable per the same reasoning as Assumption A10 (a bound, not a
 *  perfect guarantee); the daily spend cap remains the authoritative backstop. */
export class InMemoryRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maxHits: number
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const existing = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (existing.length >= this.maxHits) {
      this.hits.set(key, existing);
      return false;
    }
    existing.push(now);
    this.hits.set(key, existing);
    return true;
  }
}
