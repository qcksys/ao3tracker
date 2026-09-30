export interface SyncClientConfig {
  /** Base URL of the api worker, e.g. `https://ao3tracker.com`. */
  baseUrl: string;
  /**
   * Returns the session token sent as `Authorization: Bearer ...`. The Better
   * Auth setup also supports cookie auth, so callers that rely on cookies can
   * leave this undefined and pass `credentials: "include"` via `fetchImpl`.
   */
  getBearerToken?: () => Promise<string | null> | string | null;
  /** Optional fetch override (useful in tests and service workers). */
  fetchImpl?: typeof fetch;
  /**
   * If true, sends `credentials: "include"` on every request so cookies set by
   * Better Auth at `<baseUrl>/auth/...` are sent back automatically.
   */
  includeCredentials?: boolean;
}

export class SyncApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message: string,
    public readonly body?: unknown,
  ) {
    super(`${status} ${url}: ${message}`);
    this.name = "SyncApiError";
  }
}
