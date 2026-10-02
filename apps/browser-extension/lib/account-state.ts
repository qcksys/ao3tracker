import { storage } from "@wxt-dev/storage";
import { z } from "zod";
import { withLocalState } from "./local-state";
import {
  apiBaseUrlItem,
  authTokenItem,
  chapterMetadataItem,
  favouriteTagsItem,
  lastSeenNotificationIdItem,
  lastSyncedAtItem,
  lastSyncErrorItem,
  notificationWorkIdsItem,
  resolveApiBaseUrl,
  savedSearchesItem,
  tagMetadataItem,
  trackedChaptersItem,
  trackedWorksItem,
  workMetadataItem,
} from "./storage";

export interface AccountContext {
  owner: string;
  baseUrl: string;
  userId: string | null;
  generation: string;
}

let authChange = 0;
let pendingAuth: { token: string | null; baseUrl: string; promise: Promise<void> } | null = null;

export const accountContextItem = storage.defineItem<AccountContext | null>(
  "local:accountContext",
  { fallback: null },
);

async function readData() {
  const [
    works,
    chapters,
    chapterMetadata,
    metadata,
    tags,
    favourites,
    searches,
    cursor,
    error,
    notificationId,
    notificationWorks,
  ] = await Promise.all([
    trackedWorksItem.getValue(),
    trackedChaptersItem.getValue(),
    chapterMetadataItem.getValue(),
    workMetadataItem.getValue(),
    tagMetadataItem.getValue(),
    favouriteTagsItem.getValue(),
    savedSearchesItem.getValue(),
    lastSyncedAtItem.getValue(),
    lastSyncErrorItem.getValue(),
    lastSeenNotificationIdItem.getValue(),
    notificationWorkIdsItem.getValue(),
  ]);
  return {
    works,
    chapters,
    chapterMetadata,
    metadata,
    tags,
    favourites,
    searches,
    cursor,
    error,
    notificationId,
    notificationWorks,
  };
}

type AccountData = Awaited<ReturnType<typeof readData>>;

export const accountArchivesItem = storage.defineItem<Record<string, AccountData>>(
  "local:accountArchives",
  { fallback: {} },
);

function emptyData(): AccountData {
  return {
    works: {},
    chapters: {},
    chapterMetadata: {},
    metadata: {},
    tags: [],
    favourites: [],
    searches: [],
    cursor: null,
    error: null,
    notificationId: null,
    notificationWorks: {},
  };
}

const ownerKey = (baseUrl: string, userId: string | null): string =>
  JSON.stringify([baseUrl, userId]);

export async function initializeAccount(): Promise<void> {
  await withLocalState(async () => {
    if (await accountContextItem.getValue()) return;
    const baseUrl = resolveApiBaseUrl(await apiBaseUrlItem.getValue());
    const token = await authTokenItem.getValue();
    await storage.setItems([
      {
        item: accountContextItem,
        value: {
          owner: token ? `legacy:${baseUrl}` : ownerKey(baseUrl, null),
          baseUrl,
          userId: null,
          generation: crypto.randomUUID(),
        },
      },
      // Old cursors used client reading timestamps; new cursors track server mutations.
      { item: lastSyncedAtItem, value: null },
    ]);
  });
}

const sessionSchema = z.object({ user: z.object({ id: z.string().min(1) }) });

async function sessionUserId(token: string, baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/get-session`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Unable to verify the signed-in account");
  return sessionSchema.parse(await response.json()).user.id;
}

async function selectAccount(
  current: AccountContext,
  baseUrl: string,
  userId: string | null,
  token: string | null,
): Promise<void> {
  const owner = ownerKey(baseUrl, userId);
  const currentToken = await authTokenItem.getValue();
  const verifiedLegacy =
    current.owner === `legacy:${baseUrl}` && token !== null && token === currentToken;
  if (current.owner === owner && currentToken === token) return;

  const archives = await accountArchivesItem.getValue();
  const currentData = await readData();
  const sameOwner = current.owner === owner || verifiedLegacy;
  if (!sameOwner) archives[current.owner] = currentData;
  const next = sameOwner ? currentData : (archives[owner] ?? emptyData());
  delete archives[owner];
  await storage.setItems([
    { item: accountArchivesItem, value: archives },
    {
      item: accountContextItem,
      value: { owner, baseUrl, userId, generation: crypto.randomUUID() },
    },
    { item: apiBaseUrlItem, value: baseUrl },
    { item: authTokenItem, value: token },
    { item: trackedWorksItem, value: next.works },
    { item: trackedChaptersItem, value: next.chapters },
    { item: chapterMetadataItem, value: next.chapterMetadata ?? {} },
    { item: workMetadataItem, value: next.metadata },
    { item: tagMetadataItem, value: next.tags },
    { item: favouriteTagsItem, value: next.favourites },
    { item: savedSearchesItem, value: next.searches },
    { item: lastSyncedAtItem, value: next.cursor },
    { item: lastSyncErrorItem, value: next.error },
    { item: lastSeenNotificationIdItem, value: next.notificationId },
    { item: notificationWorkIdsItem, value: next.notificationWorks },
  ]);
}

async function updateAuthSession(token: string | null, baseUrl: string): Promise<void> {
  await initializeAccount();
  if (baseUrl !== resolveApiBaseUrl(await apiBaseUrlItem.getValue())) {
    throw new Error("The API endpoint changed during sign-in");
  }
  const context = await accountContextItem.getValue();
  if (token && context?.userId && token === (await authTokenItem.getValue())) return;
  const change = ++authChange;
  const userId = token ? await sessionUserId(token, baseUrl) : null;
  await withLocalState(async () => {
    const current = await accountContextItem.getValue();
    if (change !== authChange || !current || current.baseUrl !== baseUrl) {
      throw new Error("The account or API endpoint changed during sign-in");
    }
    await selectAccount(current, baseUrl, userId, token);
  });
}

export function setAuthSession(token: string | null, baseUrl: string): Promise<void> {
  if (pendingAuth?.token === token && pendingAuth.baseUrl === baseUrl) return pendingAuth.promise;
  const promise = updateAuthSession(token, baseUrl).finally(() => {
    if (pendingAuth?.promise === promise) pendingAuth = null;
  });
  pendingAuth = { token, baseUrl, promise };
  return promise;
}

export async function setApiEndpoint(baseUrl: string): Promise<void> {
  authChange++;
  await initializeAccount();
  await withLocalState(async () => {
    const current = await accountContextItem.getValue();
    if (!current) return;
    const next = resolveApiBaseUrl(baseUrl);
    if (current.baseUrl !== next) await selectAccount(current, next, null, null);
  });
}

export interface SyncSession extends AccountContext {
  token: string;
}

export async function captureSyncSession(): Promise<SyncSession | null> {
  await initializeAccount();
  const current = await accountContextItem.getValue();
  const token = await authTokenItem.getValue();
  if (!token || !current) return null;
  if (current.userId === null) await setAuthSession(token, current.baseUrl);
  return withLocalState(async () => {
    const context = await accountContextItem.getValue();
    const activeToken = await authTokenItem.getValue();
    return context?.userId && activeToken ? { ...context, token: activeToken } : null;
  });
}

export async function isCurrentSession(session: SyncSession): Promise<boolean> {
  return (await accountContextItem.getValue())?.generation === session.generation;
}
