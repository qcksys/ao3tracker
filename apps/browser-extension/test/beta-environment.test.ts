import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@wxt-dev/storage", () => ({
  storage: {
    defineItem: (_key: string, options: { fallback: unknown }) => ({
      getValue: async () => options.fallback,
    }),
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("store build API environments", () => {
  it("uses only the dev API for a fresh beta install and invalid stored endpoints", async () => {
    vi.stubEnv("MODE", "beta");
    const storage = await import("../lib/storage");
    expect(await storage.apiBaseUrlItem.getValue()).toBe("https://dev.ao3tracker.com");
    expect(storage.availableApiBaseUrlPresets.map((preset) => preset.id)).toEqual(["dev"]);
    for (const endpoint of [null, "https://ao3tracker.com", "https://attacker.test"]) {
      expect(storage.resolveApiBaseUrl(endpoint)).toBe("https://dev.ao3tracker.com");
    }
  });

  it("keeps the production default and its existing allowed endpoints", async () => {
    vi.stubEnv("MODE", "production");
    const storage = await import("../lib/storage");
    expect(await storage.apiBaseUrlItem.getValue()).toBe("https://ao3tracker.com");
    expect(storage.availableApiBaseUrlPresets.map((preset) => preset.id)).toEqual(["prod", "dev"]);
    expect(storage.resolveApiBaseUrl("https://dev.ao3tracker.com")).toBe(
      "https://dev.ao3tracker.com",
    );
  });
});
