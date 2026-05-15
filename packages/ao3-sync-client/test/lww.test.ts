import type { FavouriteTagItem, TagTypeId } from "@qcksys/ao3tracker-core";
import { describe, expect, it } from "vitest";
import { liveFavouriteTagSet, mergeFavouriteTags } from "~/lww";

const fav = (
  tag: string,
  favourited: boolean,
  when: string,
  tagType: TagTypeId = 7,
): FavouriteTagItem => ({
  tagType,
  tag,
  favourited,
  updatedAt: when,
});

describe("mergeFavouriteTags", () => {
  it("remote wins when its timestamp is newer", () => {
    const local = [fav("Fluff", true, "2025-01-01T00:00:00.000Z")];
    const remote = [fav("Fluff", false, "2025-02-01T00:00:00.000Z")];
    expect(mergeFavouriteTags(local, remote)).toEqual([
      fav("Fluff", false, "2025-02-01T00:00:00.000Z"),
    ]);
  });

  it("remote wins on tie", () => {
    const local = [fav("Fluff", true, "2025-01-01T00:00:00.000Z")];
    const remote = [fav("Fluff", false, "2025-01-01T00:00:00.000Z")];
    expect(mergeFavouriteTags(local, remote)[0].favourited).toBe(false);
  });

  it("local wins when its timestamp is newer", () => {
    const local = [fav("Fluff", true, "2025-03-01T00:00:00.000Z")];
    const remote = [fav("Fluff", false, "2025-02-01T00:00:00.000Z")];
    expect(mergeFavouriteTags(local, remote)[0].favourited).toBe(true);
  });

  it("keys rows by (tagType, tag) so duplicates across types stay separate", () => {
    const local = [fav("Fluff", true, "2025-01-01T00:00:00.000Z", 7)];
    const remote = [fav("Fluff", true, "2025-01-01T00:00:00.000Z", 6)];
    expect(mergeFavouriteTags(local, remote)).toHaveLength(2);
  });
});

describe("liveFavouriteTagSet", () => {
  it("only includes favourited rows", () => {
    const set = liveFavouriteTagSet([
      fav("Fluff", true, "2025-01-01T00:00:00.000Z"),
      fav("Angst", false, "2025-01-02T00:00:00.000Z"),
    ]);
    expect(set.has("7\tFluff")).toBe(true);
    expect(set.has("7\tAngst")).toBe(false);
  });
});
