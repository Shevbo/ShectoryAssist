export type RateLimiter = {
  hit(userId: string): boolean;
};

type Bucket = { count: number; resetAt: number };

export class TokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxPerWindow: number;
  private readonly windowMs: number;

  constructor(maxPerWindow: number, windowMs: number) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
  }

  hit(userId: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(userId);
    if (!b || now > b.resetAt) {
      this.buckets.set(userId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (b.count >= this.maxPerWindow) {
      return false;
    }
    b.count += 1;
    return true;
  }
}
