import type { FavouriteTagItem, SavedSearchItem, TagTypeId } from "@qcksys/ao3tracker-core";
import { describe, expect, it } from "vite-plus/test";
import { liveFavouriteTagSet, mergeFavouriteTags, mergeSavedSearches } from "~/lww";

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

const search = (
  id: string,
  name: string,
  when: string,
  deleted = false,
  url = "https://archiveofourown.org/tags/Foo/works",
): SavedSearchItem => ({ id, name, url, updatedAt: when, deleted });

describe("mergeSavedSearches", () => {
  it("remote wins when its timestamp is newer", () => {
    const local = [search("a", "Old name", "2025-01-01T00:00:00.000Z")];
    const remote = [search("a", "New name", "2025-02-01T00:00:00.000Z")];
    expect(mergeSavedSearches(local, remote)[0].name).toBe("New name");
  });

  it("remote wins on tie", () => {
    const local = [search("a", "Local", "2025-01-01T00:00:00.000Z")];
    const remote = [search("a", "Remote", "2025-01-01T00:00:00.000Z", true)];
    const merged = mergeSavedSearches(local, remote);
    expect(merged[0].name).toBe("Remote");
    expect(merged[0].deleted).toBe(true);
  });

  it("local wins when its timestamp is newer", () => {
    const local = [search("a", "Local newer", "2025-03-01T00:00:00.000Z")];
    const remote = [search("a", "Remote", "2025-02-01T00:00:00.000Z")];
    expect(mergeSavedSearches(local, remote)[0].name).toBe("Local newer");
  });

  it("keeps rows with distinct ids separate", () => {
    const local = [search("a", "First", "2025-01-01T00:00:00.000Z")];
    const remote = [search("b", "Second", "2025-01-01T00:00:00.000Z")];
    expect(mergeSavedSearches(local, remote)).toHaveLength(2);
  });

  it("propagates a remote tombstone over an older local row", () => {
    const local = [search("a", "Live", "2025-01-01T00:00:00.000Z")];
    const remote = [search("a", "Live", "2025-02-01T00:00:00.000Z", true)];
    expect(mergeSavedSearches(local, remote)[0].deleted).toBe(true);
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
