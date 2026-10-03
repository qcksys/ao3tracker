import createDOMPurify from "dompurify";
import type { OfflineChapter, OfflinePage, OfflineStyle } from "../schemas/offline";
import { readingLocation, resourceUrl, trustedAo3Url } from "./urls";
import { ao3Identity } from "./observation";

export interface OfflineCapture {
  page: OfflinePage;
  stylesheets: { index: number; url: string; scope: "site" | "page" }[];
}

function chapterManifest(
  doc: Document,
  url: string,
  workId: string,
  chapterId: string,
): OfflineChapter[] {
  const chapters: OfflineChapter[] = [];
  for (const option of doc.querySelectorAll<HTMLOptionElement>("#selected_id option")) {
    if (!/^\d+$/.test(option.value)) continue;
    chapters.push({
      id: option.value,
      number: chapters.length + 1,
      title: option.textContent?.trim() ?? "",
      url: `https://archiveofourown.org/works/${workId}/chapters/${option.value}`,
    });
  }
  return chapters.length ? chapters : [{ id: chapterId, number: 1, title: "", url }];
}

export function captureOfflinePage(doc: Document, sourceUrl: string): OfflineCapture {
  const location = readingLocation(sourceUrl);
  const identity = ao3Identity(doc, sourceUrl);
  const title = doc.querySelector("#workskin h2.title.heading")?.textContent?.trim();
  const body = doc.querySelector("#chapters .userstuff");
  if (!location || !identity || !title || !body || !doc.querySelector("#workskin #chapters")) {
    throw new Error("Open an accessible AO3 chapter before saving it.");
  }
  const selected = doc.querySelector<HTMLSelectElement>("#selected_id")?.value;
  const firstChapter = doc
    .querySelector<HTMLAnchorElement>("#chapters .chapter h3.title a[href]")
    ?.getAttribute("href");
  const chapterId =
    location.chapterId ??
    (selected && /^\d+$/.test(selected) ? selected : null) ??
    (firstChapter
      ? trustedAo3Url(firstChapter, sourceUrl)?.pathname.match(/\/chapters\/(\d+)/)?.[1]
      : null) ??
    "0";
  if (selected && location.chapterId && selected !== location.chapterId) {
    throw new Error("The loaded chapter does not match its address.");
  }
  if (
    location.representation === "chapter" &&
    doc.querySelectorAll("#chapters > .chapter").length > 1
  ) {
    throw new Error("The loaded page contains more than one chapter.");
  }

  const clone = doc.documentElement.cloneNode(true);
  if (!(clone instanceof Element)) throw new Error("Unable to copy the chapter.");
  for (const element of [clone, ...clone.querySelectorAll("*")]) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("data-ao3-offline")) element.removeAttribute(attribute.name);
    }
  }
  const siteStyles: OfflineStyle[] = [];
  const stylesheets: OfflineCapture["stylesheets"] = [];
  let pageStyleIndex = 0;
  const originalStyles = Array.from(
    doc.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel~="stylesheet"]'),
  );
  for (const [position, style] of Array.from(
    clone.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel~="stylesheet"]'),
  ).entries()) {
    if (style.id.startsWith("ao3-tracker") || style.hasAttribute("data-ao3-tracker")) {
      style.remove();
      continue;
    }
    const site = style.closest("head") !== null;
    const index = site ? siteStyles.length : pageStyleIndex++;
    const href = style.getAttribute("href");
    const url = href ? resourceUrl(href, sourceUrl) : sourceUrl;
    if (!url) throw new Error("A stylesheet uses an unsupported address.");
    const data: OfflineStyle = {
      css: href ? "" : (style.textContent ?? ""),
      sourceUrl: url,
      media: style.getAttribute("media") ?? "all",
      disabled:
        style.hasAttribute("disabled") || originalStyles[position]?.sheet?.disabled === true,
    };
    if (site) {
      siteStyles.push(data);
      style.remove();
    } else {
      const replacement = doc.createElement("style");
      replacement.textContent = data.css;
      replacement.setAttribute("media", data.media);
      replacement.setAttribute("data-ao3-offline-style", String(index));
      replacement.setAttribute("data-ao3-offline-source", url);
      if (data.disabled) replacement.setAttribute("media", "not all");
      style.replaceWith(replacement);
    }
    if (href) stylesheets.push({ index, url, scope: site ? "site" : "page" });
  }

  for (const element of clone.querySelectorAll(
    "script, iframe, object, embed, base, meta[http-equiv], meta[name^='csrf'], input[type='hidden'], input[name='authenticity_token'], noscript",
  ))
    element.remove();
  for (const form of clone.querySelectorAll("form")) {
    for (const attribute of ["action", "method", "target", "data-remote"])
      form.removeAttribute(attribute);
  }
  for (const control of clone.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | HTMLSelectElement
  >("input, textarea, button, select")) {
    control.removeAttribute("formaction");
    if (control instanceof HTMLSelectElement && control.id === "selected_id") continue;
    control.setAttribute("disabled", "");
    if (control.tagName === "TEXTAREA") control.textContent = "";
    if (
      control.tagName === "INPUT" &&
      !["button", "submit", "reset"].includes(control.getAttribute("type") ?? "text")
    ) {
      control.removeAttribute("value");
      control.removeAttribute("checked");
    }
  }
  for (const anchor of clone.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    const target = resourceUrl(href, sourceUrl);
    if (target) anchor.setAttribute("href", target);
    else anchor.removeAttribute("href");
    for (const attribute of [
      "ping",
      "download",
      "target",
      "data-method",
      "data-remote",
      "data-confirm",
    ])
      anchor.removeAttribute(attribute);
  }
  for (const image of clone.querySelectorAll<HTMLImageElement>("img")) {
    const src = resourceUrl(image.getAttribute("src") ?? "", sourceUrl);
    if (src) image.setAttribute("src", src);
    else image.removeAttribute("src");
    image.removeAttribute("srcset");
    image.removeAttribute("loading");
  }
  for (const element of clone.querySelectorAll("audio, video, source, track, link"))
    element.remove();

  const purifier = createDOMPurify();
  const html = purifier.sanitize(clone.outerHTML, {
    WHOLE_DOCUMENT: true,
    USE_PROFILES: { html: true },
    ADD_TAGS: ["style", "meta"],
    ADD_ATTR: ["content"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "base"],
    FORBID_ATTR: ["srcdoc", "nonce", "integrity", "http-equiv", "contenteditable", "autofocus"],
  });
  if (html.length > 8 * 1024 * 1024) throw new Error("This chapter is too large to save.");

  return {
    page: {
      version: 1,
      url: location.url,
      workId: location.workId,
      chapterId,
      representation: location.representation,
      title,
      ao3Identity: identity,
      canSelectSkin: !new URL(sourceUrl).searchParams.has("site_skin"),
      html,
      siteStyles,
      chapters: chapterManifest(doc, location.url, location.workId, chapterId),
    },
    stylesheets,
  };
}
