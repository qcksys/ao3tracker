import {
  type WorkCheckerBackupOutcome,
  type WorkCheckerBackupRequest,
  type WorkCheckerJob,
  type WorkCheckerResult,
  type WorkCheckerResultResponse,
  type WorkCheckerSettings,
  workCheckerBackupUploadResponseSchema,
  workCheckerClaimResponseSchema,
  workCheckerResultResponseSchema,
  workCheckerSettingsSchema,
} from "@qcksys/ao3tracker-core/work-checker";
import type { z } from "zod";

const REQUEST_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

/** The Worker endpoints the checker polls. The Worker never calls the checker. */
export interface CheckerApi {
  settings(): Promise<WorkCheckerSettings>;
  claim(): Promise<WorkCheckerJob[]>;
  postResult(result: WorkCheckerResult): Promise<WorkCheckerResultResponse>;
  uploadBackup(
    workId: number,
    backup: WorkCheckerBackupRequest,
    content: Uint8Array<ArrayBuffer>,
  ): Promise<WorkCheckerBackupOutcome>;
}

export class CheckerApiError extends Error {
  readonly path: string;
  readonly status: number;

  constructor(path: string, status: number) {
    super(`Worker request ${path} failed with status ${status}`);
    this.name = "CheckerApiError";
    this.path = path;
    this.status = status;
  }
}

export function createCheckerApi(
  apiUrl: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): CheckerApi {
  async function send(path: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetchFn(`${apiUrl}/checker${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  async function sendJson<T extends z.ZodType>(
    schema: T,
    path: string,
    init: RequestInit = {},
  ): Promise<z.infer<T>> {
    const response = await send(path, init);
    if (!response.ok) {
      await response.body?.cancel();
      throw new CheckerApiError(path, response.status);
    }
    return schema.parse(await response.json());
  }

  return {
    settings: () => sendJson(workCheckerSettingsSchema, "/settings"),
    claim: async () =>
      (await sendJson(workCheckerClaimResponseSchema, "/claim", { method: "POST" })).jobs,
    postResult: (result) =>
      sendJson(workCheckerResultResponseSchema, "/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      }),
    uploadBackup: async (workId, backup, content) => {
      const path = `/backups/${workId}/${backup.format}?downloadUpdatedAt=${backup.downloadUpdatedAt}`;
      const response = await send(
        path,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: content,
        },
        UPLOAD_TIMEOUT_MS,
      );
      // 409 is the Worker rejecting a revision AO3 has since replaced, not a failure.
      if (!response.ok && response.status !== 409) {
        await response.body?.cancel();
        throw new CheckerApiError(path, response.status);
      }
      return workCheckerBackupUploadResponseSchema.parse(await response.json()).outcome;
    },
  };
}
