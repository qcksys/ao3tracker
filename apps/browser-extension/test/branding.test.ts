import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { extensionBranding } from "../lib/branding";

describe("store build branding", () => {
  it("gives beta builds their own name and icon artwork at every required size", () => {
    const production = extensionBranding("production");
    const beta = extensionBranding("beta");
    expect(production.name).toBe("AO3 Tracker");
    expect(beta.name).toBe("AO3 Tracker Beta");
    for (const size of [16, 32, 48, 96, 128] as const) {
      const icon = (path: string) => readFileSync(new URL(`../public/${path}`, import.meta.url));
      const regular = icon(production.icons[size]);
      const badged = icon(beta.icons[size]);
      expect(regular.equals(badged)).toBe(false);
      for (const png of [regular, badged]) {
        expect(png.subarray(1, 4).toString()).toBe("PNG");
        expect(png.readUInt32BE(16)).toBe(size);
        expect(png.readUInt32BE(20)).toBe(size);
      }
    }
  });

  it("keeps local development on the regular branding", () => {
    expect(extensionBranding("development")).toEqual(extensionBranding("production"));
  });
});
