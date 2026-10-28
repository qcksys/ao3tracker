import { describe, expect, it } from "vite-plus/test";
import { isHealthy } from "../src/health.ts";

describe("healthcheck", () => {
  const status = { polledAt: 0, pollIntervalSeconds: 300 };

  it("stays healthy for two poll intervals plus a grace period", () => {
    expect(isHealthy(status, 19 * 60_000)).toBe(true);
  });

  it("turns unhealthy once polls stop reaching the Worker", () => {
    expect(isHealthy(status, 21 * 60_000)).toBe(false);
  });
});
