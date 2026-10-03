import type { OfflinePage, OfflineStyle } from "../schemas/offline";

export function renderOfflinePage(
  page: OfflinePage,
  siteStyles: OfflineStyle[] = page.siteStyles,
): string {
  const doc = new DOMParser().parseFromString(page.html, "text/html");
  const policy = doc.createElement("meta");
  policy.setAttribute("http-equiv", "Content-Security-Policy");
  policy.setAttribute(
    "content",
    "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'",
  );
  doc.head.prepend(policy);
  for (const sheet of siteStyles) {
    const style = doc.createElement("style");
    style.setAttribute("media", sheet.disabled ? "not all" : sheet.media);
    style.textContent = sheet.css;
    doc.head.append(style);
  }
  for (const style of doc.querySelectorAll("style")) {
    // CSS is raw text in HTML: a string containing an end tag must stay inside the style element.
    style.textContent = (style.textContent ?? "").replace(/<\/style/gi, "\\3c /style");
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
