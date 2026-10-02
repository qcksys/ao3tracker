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

import {
  getBrowsingState,
  setHiddenTags,
  setSearchLanguage,
  setWorkHidden,
  setMaxFandoms,
  setHideCaughtUp,
} from "../lib/browsing-repo";
import { contentToBackgroundSchema, popupToBackgroundSchema } from "../lib/messaging";
import { browsingPreferencesItem, savedSearchesItem } from "../lib/storage";
import { withLocalState } from "../lib/local-state";

beforeEach(() => persisted.clear());

describe("browsing preferences", () => {
  it("persists titles and caught-up filtering across reads and removes titles when restored", async () => {
    persisted.set("local:browsingPreferences", { hiddenTags: ["Angst"], hiddenWorkIds: [] });
    await setWorkHidden(123, true, "A hidden story");
    await setHideCaughtUp(true);
    await setWorkHidden(123, true);
    expect(await getBrowsingState()).toMatchObject({
      hiddenWorkIds: [123],
      hiddenWorkTitles: { 123: "A hidden story" },
      hideCaughtUp: true,
      hiddenTags: ["Angst"],
    });
    await setWorkHidden(123, false);
    expect(await getBrowsingState()).toMatchObject({
      hiddenWorkIds: [],
      hiddenWorkTitles: {},
      hideCaughtUp: true,
    });
    await setHideCaughtUp(false);
    expect((await getBrowsingState()).hideCaughtUp).toBe(false);
    for (const hideCaughtUp of [true, false]) {
      expect(
        popupToBackgroundSchema.safeParse({ kind: "setHideCaughtUp", hideCaughtUp }).success,
      ).toBe(true);
    }
    expect(popupToBackgroundSchema.safeParse({ kind: "setHideCaughtUp" }).success).toBe(false);
  });

  it("starts empty and preserves work and tag changes made together", async () => {
    expect(await getBrowsingState()).toEqual({
      languageFilterEnabled: false,
      searchLanguage: "en",
      hiddenTags: [],
      hiddenWorkIds: [],
      savedSearchUrls: [],
      maxFandoms: null,
      hiddenWorkTitles: {},
      hideCaughtUp: false,
    });
    await Promise.all([
      withLocalState(() => setWorkHidden(123, true)),
      withLocalState(() => setHiddenTags([" Angst \nFluff, angst "])),
      withLocalState(() => setWorkHidden(456, true)),
    ]);
    await setWorkHidden(123, true);
    expect(await browsingPreferencesItem.getValue()).toEqual({
      languageFilterEnabled: false,
      searchLanguage: "en",
      hiddenTags: ["Angst", "Fluff"],
      hiddenWorkIds: [123, 456],
      maxFandoms: null,
      hiddenWorkTitles: {},
      hideCaughtUp: false,
    });
    await setWorkHidden(123, false);
    await setHiddenTags([]);
    expect(await getBrowsingState()).toEqual({
      languageFilterEnabled: false,
      searchLanguage: "en",
      hiddenTags: [],
      hiddenWorkIds: [456],
      savedSearchUrls: [],
      maxFandoms: null,
      hiddenWorkTitles: {},
      hideCaughtUp: false,
    });
  });

  it("persists and clears fandom limits without losing other preferences", async () => {
    persisted.set("local:browsingPreferences", { hiddenTags: ["Angst"], hiddenWorkIds: [123] });
    expect((await getBrowsingState()).maxFandoms).toBeNull();
    await withLocalState(() => setMaxFandoms(3));
    await withLocalState(() =>
      setSearchLanguage({ searchLanguage: "fr", languageFilterEnabled: true }),
    );
    expect(await getBrowsingState()).toMatchObject({
      maxFandoms: 3,
      hiddenTags: ["Angst"],
      hiddenWorkIds: [123],
      searchLanguage: "fr",
    });
    await setMaxFandoms(1);
    expect((await getBrowsingState()).maxFandoms).toBe(1);
    await expect(setMaxFandoms(0)).rejects.toThrow();
    expect((await getBrowsingState()).maxFandoms).toBe(1);
    await setMaxFandoms(null);
    expect((await getBrowsingState()).maxFandoms).toBeNull();
  });

  it("validates fandom limits at the message boundary", () => {
    for (const maxFandoms of [null, 1, 3])
      expect(popupToBackgroundSchema.safeParse({ kind: "setMaxFandoms", maxFandoms }).success).toBe(
        true,
      );
    for (const maxFandoms of [0, -1, 1.5, "3", undefined])
      expect(popupToBackgroundSchema.safeParse({ kind: "setMaxFandoms", maxFandoms }).success).toBe(
        false,
      );
  });

  it("persists language settings without losing existing preferences", async () => {
    persisted.set("local:browsingPreferences", { hiddenTags: ["Angst"], hiddenWorkIds: [123] });
    expect(await getBrowsingState()).toMatchObject({
      searchLanguage: "en",
      languageFilterEnabled: false,
    });
    await withLocalState(() =>
      setSearchLanguage({ searchLanguage: "ptBR", languageFilterEnabled: true }),
    );
    await withLocalState(() => setWorkHidden(456, true));
    expect(await getBrowsingState()).toMatchObject({
      hiddenTags: ["Angst"],
      hiddenWorkIds: [123, 456],
      searchLanguage: "ptBR",
      languageFilterEnabled: true,
    });
    await setSearchLanguage({ searchLanguage: "ptBR", languageFilterEnabled: false });
    expect(await getBrowsingState()).toMatchObject({
      searchLanguage: "ptBR",
      languageFilterEnabled: false,
    });
  });

  it("validates language preferences at the message boundary", () => {
    expect(
      popupToBackgroundSchema.safeParse({
        kind: "setSearchLanguage",
        searchLanguage: "fr",
        languageFilterEnabled: true,
      }).success,
    ).toBe(true);
    for (const value of [
      { searchLanguage: "unknown", languageFilterEnabled: true },
      { searchLanguage: "en", languageFilterEnabled: "yes" },
      { languageFilterEnabled: true },
    ]) {
      expect(
        popupToBackgroundSchema.safeParse({ kind: "setSearchLanguage", ...value }).success,
      ).toBe(false);
    }
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
