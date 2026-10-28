import { describe, expect, it } from "vite-plus/test";
import { IMAGE, imageEnv, isUnpublished, repoDigest } from "../deploy/update.ts";

describe("hub updater", () => {
  it("pins deployed environments and the one being deployed", () => {
    const state = { prod: { image: `${IMAGE}@sha256:prod`, previousImage: null, deployedAt: 1 } };
    expect(imageEnv(state, "dev", `${IMAGE}@sha256:dev`)).toEqual({
      PROD_IMAGE: `${IMAGE}@sha256:prod`,
      DEV_IMAGE: `${IMAGE}@sha256:dev`,
    });
  });

  it("leaves undeployed environments to the Compose default", () => {
    expect(imageEnv({})).toEqual({});
  });

  it("treats a missing tag as unpublished and other pull failures as errors", () => {
    expect(isUnpublished("Error response from daemon: manifest unknown")).toBe(true);
    expect(isUnpublished("dial tcp: connection refused")).toBe(false);
  });

  it("selects the work checker digest from an image's repo digests", () => {
    expect(repoDigest(["other/image@sha256:1", `${IMAGE}@sha256:2`])).toBe(`${IMAGE}@sha256:2`);
    expect(() => repoDigest(["other/image@sha256:1"])).toThrow();
  });
});
