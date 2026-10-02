import { normalizeHiddenTags } from "@qcksys/ao3tracker-core/dom";
import type { BrowsingState } from "@qcksys/ao3tracker-core/schemas";
import { browsingPreferencesItem, savedSearchesItem } from "./storage";

export async function getBrowsingState(): Promise<BrowsingState> {
  const [preferences, searches] = await Promise.all([
    browsingPreferencesItem.getValue(),
    savedSearchesItem.getValue(),
  ]);
  return {
    ...preferences,
    savedSearchUrls: searches.filter((search) => !search.deleted).map((search) => search.url),
  };
}

export async function setWorkHidden(workId: number, hidden: boolean): Promise<void> {
  const preferences = await browsingPreferencesItem.getValue();
  const ids = new Set(preferences.hiddenWorkIds);
  if (hidden) ids.add(workId);
  else ids.delete(workId);
  await browsingPreferencesItem.setValue({ ...preferences, hiddenWorkIds: [...ids] });
}

export async function setHiddenTags(tags: string[]): Promise<void> {
  const preferences = await browsingPreferencesItem.getValue();
  await browsingPreferencesItem.setValue({ ...preferences, hiddenTags: normalizeHiddenTags(tags) });
}
