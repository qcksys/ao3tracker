import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const persisted = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@wxt-dev/storage", () => ({
  storage: {
    defineItem: (key: string, options: { fallback: unknown }) => ({
      getValue: async () => structuredClone(persisted.get(key) ?? options.fallback),
      setValue: async (value: unknown) => {
        persisted.set(key, structuredClone(value));
      },
    }),
  },
}));

import { savedSearchesItem } from "../lib/storage";
import {
  applyRemoteSavedSearches,
  savedSearchesToPush,
  updateSavedSearchUrl,
} from "../lib/saved-searches-repo";
import { contentToBackgroundSchema } from "../lib/messaging";
import { getBrowsingState } from "../lib/browsing-repo";

const search = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "My saved search",
  url: "https://archiveofourown.org/works?work_search%5Bquery%5D=old",
  updatedAt: "2099-01-01T00:00:00.000Z",
  deleted: false,
  pendingSync: false,
};
const url =
  "https://archiveofourown.org/works?work_search%5Bquery%5D=new&work_search%5Blanguage_id%5D=en";

beforeEach(() => persisted.clear());

describe("update saved search to match", () => {
  it("replaces only the selected URL and advances its sync timestamp", async () => {
    const other = { ...search, id: "123e4567-e89b-42d3-a456-426614174001" };
    await savedSearchesItem.setValue([search, other]);
    const updated = await updateSavedSearchUrl(search.id, url);
    expect(updated).toMatchObject({
      ...search,
      url,
      pendingSync: true,
      updatedAt: "2099-01-01T00:00:00.001Z",
    });
    expect(await savedSearchesItem.getValue()).toEqual([updated, other]);
    expect(await savedSearchesToPush()).toEqual([updated]);
    expect((await getBrowsingState()).savedSearchUrls).toEqual([url, other.url]);
    await applyRemoteSavedSearches([search]);
    expect((await savedSearchesItem.getValue())[0]).toEqual(updated);
  });

  it("does not create missing searches or restore deleted searches", async () => {
    const deleted = { ...search, deleted: true };
    await savedSearchesItem.setValue([deleted]);
    await expect(updateSavedSearchUrl(search.id, url)).rejects.toThrow("no longer exists");
    await expect(updateSavedSearchUrl("missing", url)).rejects.toThrow("no longer exists");
    expect(await savedSearchesItem.getValue()).toEqual([deleted]);
  });

  it("validates update messages using saved-search field limits", () => {
    const message = { kind: "updateSavedSearch", id: search.id, url };
    expect(contentToBackgroundSchema.parse(message)).toEqual(message);
    for (const invalid of [
      { id: "" },
      { id: "not-a-uuid" },
      { url: "not-a-url" },
      { url: `${url}${"x".repeat(8192)}` },
    ]) {
      expect(contentToBackgroundSchema.safeParse({ ...message, ...invalid }).success).toBe(false);
    }
  });
});
