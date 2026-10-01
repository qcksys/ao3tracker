import { describe, expect, it } from "vite-plus/test";
import { resolveSavedSearchMerge, type SavedSearchUpsert } from "~/db/queries/user-saved-search";

const baseTs = new Date("2024-01-01T12:00:00Z");
const olderTs = new Date("2024-01-01T10:00:00Z");
const newerTs = new Date("2024-01-01T14:00:00Z");

function makeItem(
  id: string,
  name: string,
  url: string,
  deleted: boolean,
  updatedAt: Date,
): SavedSearchUpsert {
  return { id, name, url, deleted, updatedAt };
}

const url = "https://archiveofourown.org/tags/Foo/works";

describe("resolveSavedSearchMerge", () => {
  it("accepts incoming row when no server row exists", () => {
    const items = [makeItem("a", "Foo", url, false, baseTs)];
    const { toUpsert, results } = resolveSavedSearchMerge(items, new Map());

    expect(results).toEqual([{ id: "a", status: "accepted" }]);
    expect(toUpsert).toEqual(items);
  });

  it("accepts incoming row when client timestamp is strictly newer", () => {
    const items = [makeItem("a", "Renamed", url, false, newerTs)];
    const existing = new Map([["a", baseTs]]);

    const { toUpsert, results } = resolveSavedSearchMerge(items, existing);

    expect(results).toEqual([{ id: "a", status: "accepted" }]);
    expect(toUpsert).toHaveLength(1);
    expect(toUpsert[0].name).toBe("Renamed");
    expect(toUpsert[0].updatedAt).toEqual(newerTs);
  });

  it("ignores incoming row when server is strictly newer", () => {
    const items = [makeItem("a", "Stale", url, false, olderTs)];
    const existing = new Map([["a", baseTs]]);

    const { toUpsert, results } = resolveSavedSearchMerge(items, existing);

    expect(results).toEqual([{ id: "a", status: "ignored" }]);
    expect(toUpsert).toEqual([]);
  });

  it("ignores on timestamp tie (server wins)", () => {
    const items = [makeItem("a", "Foo", url, false, baseTs)];
    const existing = new Map([["a", baseTs]]);

    const { toUpsert, results } = resolveSavedSearchMerge(items, existing);

    expect(results).toEqual([{ id: "a", status: "ignored" }]);
    expect(toUpsert).toEqual([]);
  });

  it("accepts a tombstone (deleted=true) like any other write", () => {
    // Deleting at a newer timestamp must win — that's how cross-device
    // deletes propagate.
    const items = [makeItem("a", "Foo", url, true, newerTs)];
    const existing = new Map([["a", baseTs]]);

    const { toUpsert, results } = resolveSavedSearchMerge(items, existing);

    expect(results[0].status).toBe("accepted");
    expect(toUpsert[0].deleted).toBe(true);
  });

  it("handles a mixed batch: keeps newer, drops older, accepts new", () => {
    const items = [
      makeItem("a", "Newer", url, false, newerTs), // accepted
      makeItem("b", "Older", url, false, olderTs), // ignored
      makeItem("c", "Brand new", url, false, baseTs), // accepted
    ];
    const existing = new Map<string, Date>([
      ["a", baseTs],
      ["b", baseTs],
    ]);

    const { toUpsert, results } = resolveSavedSearchMerge(items, existing);

    expect(results).toEqual([
      { id: "a", status: "accepted" },
      { id: "b", status: "ignored" },
      { id: "c", status: "accepted" },
    ]);
    expect(toUpsert.map((u) => u.id)).toEqual(["a", "c"]);
  });
});
