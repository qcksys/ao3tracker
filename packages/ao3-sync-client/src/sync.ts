import {
  getSyncResponseSchema,
  postSyncRequestSchema,
  postSyncResponseSchema,
  type GetSyncResponse,
  type PostSyncRequest,
  type PostSyncResponse,
  type SyncFilter,
} from "@qcksys/ao3tracker-core";
import type { SyncClientConfig } from "./config";
import { request } from "./transport";

export interface GetSyncQuery {
  lastSyncedAt?: string;
  workCursor?: number;
  limit?: number;
  filter?: SyncFilter;
}

function buildQuery(q: GetSyncQuery): string {
  const params = new URLSearchParams();
  if (q.lastSyncedAt) params.set("lastSyncedAt", q.lastSyncedAt);
  if (q.workCursor !== undefined) params.set("workCursor", String(q.workCursor));
  if (q.limit !== undefined) params.set("limit", String(q.limit));
  if (q.filter) params.set("filter", JSON.stringify(q.filter));
  const s = params.toString();
  return s.length > 0 ? `?${s}` : "";
}

export async function getSync(
  cfg: SyncClientConfig,
  query: GetSyncQuery = {},
): Promise<GetSyncResponse> {
  return request(
    cfg,
    `/api/track/sync${buildQuery(query)}`,
    { method: "GET" },
    getSyncResponseSchema,
  );
}

export async function postSync(
  cfg: SyncClientConfig,
  body: PostSyncRequest,
): Promise<PostSyncResponse> {
  const parsed = postSyncRequestSchema.parse(body);
  return request(
    cfg,
    "/api/track/sync",
    { method: "POST", body: JSON.stringify(parsed) },
    postSyncResponseSchema,
  );
}

/**
 * Convenience helper that walks all pages of GET /sync, concatenating works,
 * chapters and metadata. `favouriteTags` is only returned on the first page
 * and is preserved here. Note: large libraries may want to consume page-by-page
 * rather than collect everything.
 */
export async function getFullSync(
  cfg: SyncClientConfig,
  initial: Omit<GetSyncQuery, "workCursor"> = {},
): Promise<GetSyncResponse> {
  const first = await getSync(cfg, initial);
  const merged: GetSyncResponse = { ...first };
  let cursor = first.nextWorkCursor;
  while (cursor !== null && merged.hasMore) {
    const page = await getSync(cfg, { ...initial, workCursor: cursor });
    merged.works = merged.works.concat(page.works);
    merged.chapters = merged.chapters.concat(page.chapters);
    merged.workMetadata = merged.workMetadata.concat(page.workMetadata);
    merged.chapterMetadata = merged.chapterMetadata.concat(page.chapterMetadata);
    merged.tagMetadata = merged.tagMetadata.concat(page.tagMetadata);
    merged.hasMore = page.hasMore;
    merged.nextWorkCursor = page.nextWorkCursor;
    merged.latestWorkLastReadAt = page.latestWorkLastReadAt;
    cursor = page.nextWorkCursor;
  }
  return merged;
}
