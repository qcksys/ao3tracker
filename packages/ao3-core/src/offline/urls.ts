export function trustedAo3Url(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    if (
      url.protocol !== "https:" ||
      !["archiveofourown.org", "www.archiveofourown.org"].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function readingLocation(value: string): {
  url: string;
  workId: string;
  chapterId: string | null;
  representation: "chapter" | "whole";
} | null {
  const url = trustedAo3Url(value);
  if (!url) return null;
  const match = url.pathname.match(
    /^(?:\/collections\/[^/]+)?\/works\/(\d+)(?:\/chapters\/(\d+))?\/?$/,
  );
  if (!match || match[1] === "0") return null;
  url.hostname = "archiveofourown.org";
  url.hash = "";
  for (const key of ["scroll", "scrollTo", "_t"]) url.searchParams.delete(key);
  return {
    url: url.href,
    workId: match[1],
    chapterId: match[2] ?? null,
    representation: url.searchParams.get("view_full_work") === "true" ? "whole" : "chapter",
  };
}

export function resourceUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
