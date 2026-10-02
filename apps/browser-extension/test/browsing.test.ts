import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const persisted = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@wxt-dev/storage", () => ({
  storage: {
    defineItem: (key: string, options: { fallback: unknown }) => ({
      getValue: async () =>
        structuredClone(persisted.has(key) ? persisted.get(key) : options.fallback),
      setValue: async (value: unknown) => {
        persisted.set(key, structuredClone(value));
      },
    }),
  },
}));

import { getBrowsingState, setHiddenTags, setWorkHidden } from "../lib/browsing-repo";
import { contentToBackgroundSchema, popupToBackgroundSchema } from "../lib/messaging";
import { browsingPreferencesItem, savedSearchesItem } from "../lib/storage";
import { withLocalState } from "../lib/local-state";

beforeEach(() => persisted.clear());

describe("browsing preferences", () => {
  it("starts empty and preserves work and tag changes made together", async () => {
    expect(await getBrowsingState()).toEqual({
      hiddenTags: [],
      hiddenWorkIds: [],
      savedSearchUrls: [],
    });
    await Promise.all([
      withLocalState(() => setWorkHidden(123, true)),
      withLocalState(() => setHiddenTags([" Angst \nFluff, angst "])),
      withLocalState(() => setWorkHidden(456, true)),
    ]);
    await setWorkHidden(123, true);
    expect(await browsingPreferencesItem.getValue()).toEqual({
      hiddenTags: ["Angst", "Fluff"],
      hiddenWorkIds: [123, 456],
    });
    await setWorkHidden(123, false);
    await setHiddenTags([]);
    expect(await getBrowsingState()).toEqual({
      hiddenTags: [],
      hiddenWorkIds: [456],
      savedSearchUrls: [],
    });
  });

  it("only sends live saved searches to the page", async () => {
    await savedSearchesItem.setValue([
      {
        id: "1",
        name: "Live",
        url: "https://archiveofourown.org/works",
        deleted: false,
        updatedAt: "2026-10-02T00:00:00Z",
      },
      {
        id: "2",
        name: "Deleted",
        url: "https://archiveofourown.org/bookmarks",
        deleted: true,
        updatedAt: "2026-10-02T00:00:00Z",
      },
    ]);
    expect((await getBrowsingState()).savedSearchUrls).toEqual([
      "https://archiveofourown.org/works",
    ]);
  });

  it("validates IDs and preference shapes at the messaging boundary", () => {
    expect(
      contentToBackgroundSchema.safeParse({ kind: "setWorkHidden", workId: 123, hidden: true })
        .success,
    ).toBe(true);
    expect(
      contentToBackgroundSchema.safeParse({ kind: "setWorkHidden", workId: -1, hidden: true })
        .success,
    ).toBe(false);
    expect(
      popupToBackgroundSchema.safeParse({ kind: "setHiddenTags", hiddenTags: [" "] }).success,
    ).toBe(false);
    expect(
      popupToBackgroundSchema.safeParse({ kind: "setHiddenTags", hiddenTags: [] }).success,
    ).toBe(true);
  });
});
