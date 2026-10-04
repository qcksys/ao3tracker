import type {
  OfflineBundle,
  OfflineResource,
  OfflineResourceData,
  OfflineStyle,
} from "../schemas/offline";
import type { OfflineCapture } from "./capture";
import { rewriteOfflineCss } from "./css";
import { resourceUrl } from "./urls";

export interface OfflineFetchResult {
  url: string;
  mimeType: string;
  bytes: Uint8Array;
}

export type OfflineFetch = (url: string) => Promise<OfflineFetchResult>;
export type OfflineDigest = (bytes: Uint8Array) => Promise<string>;

class OfflineLimitError extends Error {}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64(bytes: Uint8Array): string {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(result);
}

export async function prepareOfflinePage(
  capture: OfflineCapture,
  fetchResource: OfflineFetch,
  digest: OfflineDigest = sha256,
  persistResource?: (resource: OfflineResourceData) => Promise<void>,
): Promise<OfflineBundle> {
  const resources = new Map<string, OfflineResource>();
  const resolved = new Map<string, string>();
  const missing = new Set<string>();
  const encoder = new TextEncoder();
  let fetchedBytes = 0;
  let fetches = 0;

  async function store(bytes: Uint8Array, mimeType: string): Promise<string> {
    const mime = encoder.encode(`${mimeType}\0`);
    const identity = new Uint8Array(mime.length + bytes.length);
    identity.set(mime);
    identity.set(bytes, mime.length);
    const hash = await digest(identity);
    const resource = { hash, mimeType, bytes: bytes.length };
    if (!resources.has(hash)) await persistResource?.({ ...resource, base64: base64(bytes) });
    resources.set(hash, resource);
    return `/resources/${hash}`;
  }

  async function fetch(url: string, stylesheet: boolean, ancestors: Set<string>): Promise<string> {
    const address = new URL(url);
    const fragment = address.hash;
    address.hash = "";
    const source = address.href;
    const key = `${stylesheet ? "css" : "asset"}:${source}`;
    const previous = resolved.get(key);
    if (previous) return previous + fragment;
    if (ancestors.has(source)) throw new Error("A stylesheet has a circular import.");
    if (++fetches > 1000 || fetchedBytes >= 64 * 1024 * 1024)
      throw new OfflineLimitError("This chapter contains too many resources.");
    let bytes: Uint8Array;
    let mimeType: string;
    try {
      const result = await fetchResource(source);
      mimeType = result.mimeType.split(";")[0].trim().toLowerCase();
      if (!resourceUrl(result.url, source))
        throw new Error("A resource redirected to an unsupported address.");
      fetchedBytes += result.bytes.byteLength;
      if (result.bytes.byteLength > 16 * 1024 * 1024 || fetchedBytes > 64 * 1024 * 1024) {
        throw new OfflineLimitError("The chapter's resources exceed the download limit.");
      }
      bytes = result.bytes;
      if (stylesheet) {
        if (mimeType !== "text/css") throw new Error("The stylesheet could not be downloaded.");
        bytes = encoder.encode(
          await css(new TextDecoder().decode(bytes), result.url, new Set([...ancestors, source])),
        );
      } else if (
        !/^(image\/|font\/|application\/(?:font-woff|vnd\.ms-fontobject|x-font-))/.test(mimeType)
      ) {
        throw new Error("The resource is not an image or font.");
      }
    } catch (error) {
      if (
        stylesheet ||
        error instanceof OfflineLimitError ||
        (typeof error === "object" &&
          error !== null &&
          "name" in error &&
          error.name === "AbortError")
      )
        throw error;
      missing.add(source);
      resolved.set(key, "about:blank");
      return "about:blank";
    }
    const path = await store(bytes, mimeType);
    resolved.set(key, path);
    return path + fragment;
  }

  async function css(
    text: string,
    source: string,
    ancestors = new Set<string>(),
    inline = false,
  ): Promise<string> {
    const dependencies = new Map<string, { url: string; stylesheet: boolean }>();
    rewriteOfflineCss(
      text,
      source,
      (resource) => {
        dependencies.set(`${resource.stylesheet}:${resource.url}`, resource);
        return resource.url;
      },
      inline,
    );
    const paths = new Map<string, string>();
    for (const [key, resource] of dependencies) {
      paths.set(key, await fetch(resource.url, resource.stylesheet, ancestors));
    }
    return rewriteOfflineCss(
      text,
      source,
      (resource) => {
        const path = paths.get(`${resource.stylesheet}:${resource.url}`);
        if (!path) throw new Error("A stylesheet resource was not resolved.");
        return path;
      },
      inline,
    );
  }

  const doc = new DOMParser().parseFromString(capture.page.html, "text/html");
  const siteStyles: OfflineStyle[] = [];
  for (const [index, style] of capture.page.siteStyles.entries()) {
    const linked = capture.stylesheets.find(
      (entry) => entry.scope === "site" && entry.index === index,
    );
    if (linked) {
      const path = await fetch(linked.url, true, new Set());
      siteStyles.push({ ...style, css: `@import url("${path}");` });
    } else {
      siteStyles.push({ ...style, css: await css(style.css, style.sourceUrl) });
    }
  }
  for (const style of doc.querySelectorAll<HTMLStyleElement>("style[data-ao3-offline-style]")) {
    const index = Number(style.getAttribute("data-ao3-offline-style"));
    const linked = capture.stylesheets.find(
      (entry) => entry.scope === "page" && entry.index === index,
    );
    const source = style.getAttribute("data-ao3-offline-source") ?? capture.page.url;
    style.textContent = linked
      ? `@import url("${await fetch(linked.url, true, new Set())}");`
      : await css(style.textContent ?? "", source);
    style.removeAttribute("data-ao3-offline-source");
  }
  for (const element of doc.querySelectorAll<HTMLElement>("[style]")) {
    element.setAttribute(
      "style",
      await css(element.getAttribute("style") ?? "", capture.page.url, new Set(), true),
    );
  }
  for (const image of doc.querySelectorAll<HTMLImageElement>("img[src]")) {
    const url = resourceUrl(image.getAttribute("src") ?? "", capture.page.url);
    const path = url ? await fetch(url, false, new Set()) : "about:blank";
    if (path === "about:blank") {
      image.removeAttribute("src");
      image.setAttribute("alt", image.getAttribute("alt") || "Image unavailable offline");
    } else image.setAttribute("src", path);
  }
  const skinHash = await digest(
    encoder.encode(
      JSON.stringify(siteStyles.map(({ css: text, media, disabled }) => [text, media, disabled])),
    ),
  );
  for (const style of doc.querySelectorAll("style")) {
    style.textContent = (style.textContent ?? "").replace(/<\/style/gi, "\\3c /style");
  }
  return {
    page: { ...capture.page, html: doc.documentElement.outerHTML, siteStyles },
    skinHash,
    resources: Array.from(resources.values()),
    missingResources: Array.from(missing),
  };
}
