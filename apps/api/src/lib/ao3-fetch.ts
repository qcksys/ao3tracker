import ky, { HTTPError } from "ky";
import { AO3_BASE_URL, AO3_USER_AGENT } from "~/const";

/**
 * Error thrown when a work requires AO3 login to access (restricted work)
 */
export class RestrictedWorkError extends Error {
  constructor(public workId: number) {
    super(`Work ${workId} requires AO3 login to access`);
    this.name = "RestrictedWorkError";
  }
}

/**
 * Error thrown when a work is not found (404 - deleted from AO3)
 */
export class NotFoundError extends Error {
  constructor(public workId: number) {
    super(`Work ${workId} not found (deleted from AO3)`);
    this.name = "NotFoundError";
  }
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ky instance configured for AO3 requests with retry logic
 */
const ao3Client = ky.create({
  prefix: AO3_BASE_URL,
  headers: {
    "User-Agent": AO3_USER_AGENT,
  },
  retry: {
    limit: 3,
    methods: ["get"],
    statusCodes: [429, 500, 502, 503, 504, 525],
    backoffLimit: 30000,
    delay: (attemptCount) => 5000 * 2 ** (attemptCount - 1), // 5s, 10s, 20s
  },
  timeout: 30000,
});

/**
 * Check if the response URL indicates a login redirect
 */
function isLoginRedirect(responseUrl: string): boolean {
  return responseUrl.includes("/users/login");
}

/**
 * Fetch work HTML from AO3
 * @throws {RestrictedWorkError} if the work requires login
 * @throws {NotFoundError} if the work is not found (404)
 */
export async function fetchWorkHtml(workId: number): Promise<string> {
  const startTime = performance.now();
  try {
    const response = await ao3Client.get(`works/${workId}`, {
      searchParams: {
        view_adult: "true",
        view_full_work: "true",
      },
    });

    if (isLoginRedirect(response.url)) {
      throw new RestrictedWorkError(workId);
    }

    const text = await response.text();
    console.log({
      message: "Fetched work HTML",
      workId,
      requestTimeMs: Math.round(performance.now() - startTime),
    });
    return text;
  } catch (error) {
    const requestTimeMs = Math.round(performance.now() - startTime);
    if (error instanceof HTTPError && error.response.status === 404) {
      if (!error.response.bodyUsed) await error.response.body?.cancel();
      console.log({
        message: "Work not found (404)",
        workId,
        requestTimeMs,
      });
      throw new NotFoundError(workId);
    }
    console.error({
      message: "Failed to fetch work HTML",
      workId,
      requestTimeMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Fetch chapter index HTML from AO3
 * @throws {RestrictedWorkError} if the work requires login
 * @throws {NotFoundError} if the work is not found (404)
 */
export async function fetchChapterIndexHtml(workId: number): Promise<string> {
  const startTime = performance.now();
  try {
    const response = await ao3Client.get(`works/${workId}/navigate`, {
      searchParams: {
        view_adult: "true",
      },
    });

    if (isLoginRedirect(response.url)) {
      throw new RestrictedWorkError(workId);
    }

    const text = await response.text();
    console.log({
      message: "Fetched chapter index",
      workId,
      requestTimeMs: Math.round(performance.now() - startTime),
    });
    return text;
  } catch (error) {
    const requestTimeMs = Math.round(performance.now() - startTime);
    if (error instanceof HTTPError && error.response.status === 404) {
      if (!error.response.bodyUsed) await error.response.body?.cancel();
      console.log({
        message: "Work not found (404)",
        workId,
        requestTimeMs,
      });
      throw new NotFoundError(workId);
    }
    console.error({
      message: "Failed to fetch chapter index",
      workId,
      requestTimeMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Fetch a specific chapter HTML from AO3
 * @throws {RestrictedWorkError} if the work requires login
 * @throws {NotFoundError} if the work is not found (404)
 */
export async function fetchChapterHtml(workId: number, chapterId: number): Promise<string> {
  const startTime = performance.now();
  try {
    const response = await ao3Client.get(`works/${workId}/chapters/${chapterId}`, {
      searchParams: {
        view_adult: "true",
      },
    });

    if (isLoginRedirect(response.url)) {
      throw new RestrictedWorkError(workId);
    }

    const text = await response.text();
    console.log({
      message: "Fetched chapter HTML",
      workId,
      chapterId,
      requestTimeMs: Math.round(performance.now() - startTime),
    });
    return text;
  } catch (error) {
    const requestTimeMs = Math.round(performance.now() - startTime);
    if (error instanceof HTTPError && error.response.status === 404) {
      if (!error.response.bodyUsed) await error.response.body?.cancel();
      console.log({
        message: "Work not found (404)",
        workId,
        chapterId,
        requestTimeMs,
      });
      throw new NotFoundError(workId);
    }
    console.error({
      message: "Failed to fetch chapter HTML",
      workId,
      chapterId,
      requestTimeMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
