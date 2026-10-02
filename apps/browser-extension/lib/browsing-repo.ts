import { normalizeHiddenTags } from "@qcksys/ao3tracker-core/dom";
import {
  browsingPreferencesSchema,
  type BrowsingPreferences,
  type BrowsingState,
} from "@qcksys/ao3tracker-core/schemas";
import { browsingPreferencesItem, savedSearchesItem, workMetadataItem } from "./storage";

export async function getBrowsingState(): Promise<BrowsingState> {
  const [preferences, searches, metadata] = await Promise.all([
    browsingPreferencesItem.getValue(),
    savedSearchesItem.getValue(),
    workMetadataItem.getValue(),
  ]);
  return {
    ...browsingPreferencesSchema.parse(preferences),
    hiddenWorkTitles: Object.fromEntries(
      preferences.hiddenWorkIds.flatMap((id) => {
        const title = preferences.hiddenWorkTitles?.[id] || metadata[id]?.title;
        return title ? [[id, title]] : [];
      }),
    ),
    savedSearchUrls: searches.filter((search) => !search.deleted).map((search) => search.url),
  };
}

export async function setWorkHidden(
  workId: number,
  hidden: boolean,
  title?: string,
): Promise<void> {
  const preferences = await browsingPreferencesItem.getValue();
  const ids = new Set(preferences.hiddenWorkIds);
  if (hidden) ids.add(workId);
  else ids.delete(workId);
  const titles = { ...preferences.hiddenWorkTitles };
  if (hidden) {
    const knownTitle = title?.trim() || (await workMetadataItem.getValue())[workId]?.title;
    if (knownTitle) titles[workId] = knownTitle;
  } else delete titles[workId];
  await browsingPreferencesItem.setValue(
    browsingPreferencesSchema.parse({
      ...preferences,
      hiddenWorkIds: [...ids],
      hiddenWorkTitles: titles,
    }),
  );
}

export async function setHideCaughtUp(hideCaughtUp: boolean): Promise<void> {
  const preferences = await browsingPreferencesItem.getValue();
  await browsingPreferencesItem.setValue(
    browsingPreferencesSchema.parse({ ...preferences, hideCaughtUp }),
  );
}

export async function setHiddenTags(tags: string[]): Promise<void> {
  const preferences = await browsingPreferencesItem.getValue();
  await browsingPreferencesItem.setValue({ ...preferences, hiddenTags: normalizeHiddenTags(tags) });
}

export async function setMaxFandoms(maxFandoms: BrowsingPreferences["maxFandoms"]): Promise<void> {
  const preferences = await browsingPreferencesItem.getValue();
  await browsingPreferencesItem.setValue(
    browsingPreferencesSchema.parse({ ...preferences, maxFandoms }),
  );
}

export async function setSearchLanguage(
  settings: Pick<BrowsingPreferences, "languageFilterEnabled" | "searchLanguage">,
): Promise<void> {
  const preferences = await browsingPreferencesItem.getValue();
  await browsingPreferencesItem.setValue(
    browsingPreferencesSchema.parse({ ...preferences, ...settings }),
  );
}
