import type { OfflineObservation } from "../schemas/offline";
import { readingLocation, trustedAo3Url } from "./urls";

export function ao3Identity(doc: Document, pageUrl: string): string | null {
  const loggedIn = doc.body.classList.contains("logged-in");
  const loggedOut = doc.body.classList.contains("logged-out");
  if (loggedIn === loggedOut) return null;
  if (loggedOut) return "guest";
  const identities = new Set<string>();
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>("#greeting a[href]")) {
    const url = trustedAo3Url(anchor.getAttribute("href") ?? "", pageUrl);
    const match = url?.pathname.match(/^\/users\/([^/]+)\/?$/);
    if (match) {
      try {
        const name = decodeURIComponent(match[1]);
        if (!name || name.length > 191) return null;
        identities.add(`user:${name}`);
      } catch {
        return null;
      }
    }
  }
  return identities.size === 1 ? [...identities][0] : null;
}

export function observeOfflinePage(doc: Document, sourceUrl: string): OfflineObservation | null {
  if (!trustedAo3Url(sourceUrl)) return null;
  const identity = ao3Identity(doc, sourceUrl);
  const readable = Boolean(
    identity &&
    readingLocation(sourceUrl) &&
    doc.querySelector("#workskin h2.title.heading")?.textContent?.trim() &&
    doc.querySelector("#workskin #chapters .userstuff"),
  );
  return { url: sourceUrl, identity, readable };
}
