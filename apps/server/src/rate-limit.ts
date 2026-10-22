/** Token bucket: `perSecond` refill, at most `burst` tokens. One token per event. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
    private readonly clock: () => number,
  ) {
    this.tokens = burst;
    this.last = clock();
  }

  take(): boolean {
    const now = this.clock();
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    this.tokens = Math.min(this.burst, this.tokens + (elapsed * this.perSecond) / 1000);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
