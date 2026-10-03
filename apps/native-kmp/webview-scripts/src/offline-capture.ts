import {
  captureOfflinePage,
  prepareOfflinePage,
  readingLocation,
} from "@qcksys/ao3tracker-core/offline";
import type { OfflineCaptureMessage, OfflineResourceData } from "@qcksys/ao3tracker-core/schemas";

type Response = {
  token: string;
  id: string;
  index: number;
  total: number;
  text: string;
};

type Pending = {
  chunks: string[];
  total: number | null;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function createOfflineCapture(
  token: string,
  post: (message: OfflineCaptureMessage) => void,
) {
  const pending = new Map<string, Pending>();
  let serial = 0;
  let stopped = false;

  function request(send: (id: string) => void): Promise<string> {
    if (stopped) return Promise.reject(new DOMException("Capture cancelled", "AbortError"));
    const id = String(++serial);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("The download timed out. Try again."));
      }, 30_000);
      pending.set(id, { chunks: [], total: null, resolve, reject, timer });
      try {
        send(id);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  async function transfer(kind: "bundle" | "resource", value: unknown): Promise<void> {
    const text = JSON.stringify(value);
    const total = Math.ceil(text.length / 16_384);
    if (total > 2048) throw new Error("This download is too large to transfer.");
    const response = await request((transferId) => {
      for (let index = 0; index < total; index++) {
        post({
          type: "offlineTransfer",
          token,
          transferId,
          kind,
          index,
          total,
          text: text.slice(index * 16_384, (index + 1) * 16_384),
        });
      }
    });
    const result = JSON.parse(response) as { error?: string };
    if (result.error) throw new Error(result.error);
  }

  return {
    receive(response: Response): void {
      if (response.token !== token) return;
      const entry = pending.get(response.id);
      if (!entry || stopped) return;
      if (
        !Number.isInteger(response.index) ||
        !Number.isInteger(response.total) ||
        response.total < 1 ||
        response.total > 2048 ||
        response.index !== entry.chunks.length ||
        response.text.length > 16_384 ||
        (entry.total !== null && entry.total !== response.total)
      ) {
        clearTimeout(entry.timer);
        pending.delete(response.id);
        entry.reject(new Error("The download response was incomplete."));
        return;
      }
      entry.total = response.total;
      entry.chunks.push(response.text);
      if (entry.chunks.length === response.total) {
        clearTimeout(entry.timer);
        pending.delete(response.id);
        entry.resolve(entry.chunks.join(""));
      }
    },
    cancel(): void {
      stopped = true;
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new DOMException("Capture cancelled", "AbortError"));
      }
      pending.clear();
    },
    async run(doc: Document, url: string, expectedUrl: string): Promise<void> {
      try {
        const current = readingLocation(url);
        const expected = readingLocation(expectedUrl);
        if (!current || !expected || current.url !== expected.url)
          throw new Error("Open the requested chapter before saving it.");
        const capture = captureOfflinePage(doc, url);
        const bundle = await prepareOfflinePage(
          capture,
          async (source) => {
            const body = await request((id) =>
              post({ type: "offlineFetch", token, id, url: source }),
            );
            const result = JSON.parse(body) as {
              error?: string;
              url: string;
              mimeType: string;
              base64: string;
            };
            if (result.error) throw new Error(result.error);
            const binary = atob(result.base64);
            return {
              url: result.url,
              mimeType: result.mimeType,
              bytes: Uint8Array.from(binary, (value) => value.charCodeAt(0)),
            };
          },
          undefined,
          (resource: OfflineResourceData) => transfer("resource", resource),
        );
        await transfer("bundle", bundle);
      } catch (error) {
        if (stopped) return;
        const message = error instanceof Error ? error.message : "Unable to save this chapter.";
        post({ type: "offlineFailure", token, message: message.slice(0, 256) });
      }
    },
  };
}
