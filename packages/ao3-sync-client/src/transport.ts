import { z } from "zod";
import { SyncApiError, type SyncClientConfig } from "./config";

export async function request<T>(
  cfg: SyncClientConfig,
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = cfg.baseUrl.replace(/\/$/, "") + path;
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  if (cfg.getBearerToken) {
    const token = await cfg.getBearerToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const fetchImpl = cfg.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    ...init,
    headers,
    credentials: cfg.includeCredentials ? "include" : init.credentials,
  });

  const text = await res.text();
  const body = text.length > 0 ? safeJson(text) : null;
  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : res.statusText;
    throw new SyncApiError(res.status, url, message, body);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new SyncApiError(res.status, url, "Response failed schema validation", parsed.error);
  }
  return parsed.data;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
