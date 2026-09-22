import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/connectors/retry.js";
import { TokenBucketLimiter } from "../../src/connectors/rateLimiter.js";

describe("withRetry", () => {
  it("retries the given number of times then throws the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("boom");
        },
        { maxAttempts: 3, sleep: async () => {} }
      )
    ).rejects.toThrow("boom");
    expect(calls).toBe(3);
  });

  it("returns on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3, sleep: async () => {} });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("TokenBucketLimiter", () => {
  it("allows bursts up to capacity then blocks", () => {
    let now = 0;
    const limiter = new TokenBucketLimiter(2, 1, () => now);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false); // capacity exhausted
  });

  it("refills over time based on the configured rate", () => {
    let now = 0;
    const limiter = new TokenBucketLimiter(1, 1, () => now); // 1 token/sec
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    now += 1000;
    expect(limiter.tryAcquire()).toBe(true);
  });
});
