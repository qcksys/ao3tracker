import { SAVE_SEARCH_LABEL } from "./extract";

export const SAVED_SEARCH_LABEL = "Saved search";

export function normalizeHiddenTags(tags: string[]): string[] {
  const unique = new Map<string, string>();
  for (const tag of tags.flatMap((value) => value.split(/[,\n]/))) {
    const trimmed = tag.trim();
    if (trimmed && !unique.has(trimmed.toLowerCase())) unique.set(trimmed.toLowerCase(), trimmed);
  }
  return [...unique.values()];
}

function searchNamespace(url: URL): string | null {
  if (
    url.protocol !== "https:" ||
    !["archiveofourown.org", "www.archiveofourown.org"].includes(url.hostname)
  )
    return null;
  const match = url.pathname.match(/\/(works|bookmarks)(?:\/search)?\/?$/);
  return match?.[1] === "works"
    ? "work_search"
    : match?.[1] === "bookmarks"
      ? "bookmark_search"
      : null;
}

export function withDefaultHiddenTags(href: string, hiddenTags: string[]): string {
  const url = new URL(href);
  const namespace = searchNamespace(url);
  if (!namespace || hiddenTags.length === 0) return href;
  // An empty advanced-search form should remain a form until submitted.
  if (url.pathname.endsWith("/search") && !url.search) return href;
  const key = `${namespace}[excluded_tag_names]`;
  const existing = normalizeHiddenTags(url.searchParams.getAll(key));
  const merged = normalizeHiddenTags([...existing, ...hiddenTags]);
  if (merged.length === existing.length) return href;
  url.searchParams.set(key, merged.join(", "));
  return url.href;
}

export function withSearchLanguage(href: string, language: string | null = null): string {
  if (!language) return href;
  const url = new URL(href);
  const namespace = searchNamespace(url);
  if (!namespace || (url.pathname.endsWith("/search") && !url.search)) return href;
  const key = `${namespace}[language_id]`;
  const existing = url.searchParams.getAll(key);
  if (existing.length === 1 && existing[0] === language) return href;
  url.searchParams.set(key, language);
  return url.href;
}

export function savedSearchKey(
  href: string,
  hiddenTags: string[] = [],
  language: string | null = null,
  maxFandoms: number | null = null,
): string | null {
  let url: URL;
  try {
    url = new URL(
      withCrossoverLimit(
        withSearchLanguage(withDefaultHiddenTags(href, hiddenTags), language),
        maxFandoms,
      ),
    );
  } catch {
    return null;
  }
  if (!searchNamespace(url)) return null;
  const ignored = new Set(["page", "work_search[page]", "bookmark_search[page]", "utf8", "commit"]);
  const entries = [...url.searchParams.entries()]
    .filter(([key, value]) => !ignored.has(key) && value !== "")
    .map(([key, value]) => [
      key,
      key.endsWith("[excluded_tag_names]")
        ? normalizeHiddenTags([value])
            .map((tag) => tag.toLowerCase())
            .sort()
            .join(",")
        : value,
    ]);
  entries.sort(
    ([ak, av], [bk, bv]) =>
      (ak ?? "").localeCompare(bk ?? "") || (av ?? "").localeCompare(bv ?? ""),
  );
  return JSON.stringify([url.pathname.replace(/\/$/, ""), entries]);
}

export function updateSavedSearchButton(
  doc: Document,
  href: string,
  savedUrls: string[],
  hiddenTags: string[] = [],
  language: string | null = null,
  maxFandoms: number | null = null,
): void {
  const button = doc.querySelector<HTMLButtonElement>(".ao3-tracker-save-search");
  if (!button) return;
  const key = savedSearchKey(href, hiddenTags, language, maxFandoms);
  const saved =
    key !== null &&
    savedUrls.some((url) => savedSearchKey(url, hiddenTags, language, maxFandoms) === key);
  button.textContent = saved ? SAVED_SEARCH_LABEL : SAVE_SEARCH_LABEL;
  button.disabled = saved;
}

export function installDefaultSearchTags(
  doc: Document,
  location: Location,
  getHiddenTags: () => string[],
): () => void {
  const onSubmit = (event: Event): void => {
    const form = event.target as HTMLFormElement;
    if (form.tagName !== "FORM" || form.method.toLowerCase() !== "get") return;
    const namespace = searchNamespace(
      new URL(form.getAttribute("action") || location.href, location.href),
    );
    const tags = getHiddenTags();
    if (!namespace || tags.length === 0) return;
    const name = `${namespace}[excluded_tag_names]`;
    let input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) {
      input = doc.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = normalizeHiddenTags([input.value, ...tags]).join(", ");
  };
  doc.addEventListener("submit", onSubmit, true);
  return () => doc.removeEventListener("submit", onSubmit, true);
}

export function installSearchLanguage(
  doc: Document,
  location: Location,
  getLanguage: () => string | null,
): () => void {
  return installSearchDefault(
    doc,
    location,
    (namespace) => `${namespace}[language_id]`,
    getLanguage,
  );
}

export function withCrossoverLimit(href: string, maxFandoms: number | null = null): string {
  if (maxFandoms !== 1) return href;
  const url = new URL(href);
  if (searchNamespace(url) !== "work_search" || (url.pathname.endsWith("/search") && !url.search))
    return href;
  const key = "work_search[crossover]";
  const existing = url.searchParams.getAll(key);
  if (existing.length === 1 && existing[0] === "F") return href;
  url.searchParams.set(key, "F");
  return url.href;
}

export function installCrossoverLimit(
  doc: Document,
  location: Location,
  getMaxFandoms: () => number | null,
): () => void {
  return installSearchDefault(
    doc,
    location,
    (namespace) => (namespace === "work_search" ? "work_search[crossover]" : null),
    () => (getMaxFandoms() === 1 ? "F" : null),
  );
}

function installSearchDefault(
  doc: Document,
  location: Location,
  getName: (namespace: string) => string | null,
  getValue: () => string | null,
): () => void {
  const restorations = new Map<HTMLFormElement, () => void>();
  const onSubmit = (event: Event): void => {
    const form = event.target as HTMLFormElement;
    if (form.tagName !== "FORM" || form.method.toLowerCase() !== "get") return;
    restorations.get(form)?.();
    restorations.delete(form);
    const namespace = searchNamespace(
      new URL(form.getAttribute("action") || location.href, location.href),
    );
    const value = getValue();
    const name = namespace && getName(namespace);
    if (!name || !value) return;
    const fields = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        `input[name="${name}"], select[name="${name}"]`,
      ),
    );
    // Submit exactly one value even when the page already has selectors or radio buttons.
    fields.forEach((field) => {
      field.removeAttribute("name");
    });
    const input = doc.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
    restorations.set(form, () => {
      input.remove();
      fields.forEach((field) => {
        field.name = name;
      });
    });
  };
  doc.addEventListener("submit", onSubmit, true);
  return () => {
    doc.removeEventListener("submit", onSubmit, true);
    restorations.forEach((restore) => restore());
  };
}

export function exceedsFandomLimit(blurb: Element, maxFandoms: number | null = null): boolean {
  return maxFandoms !== null && blurb.querySelectorAll(".fandoms a.tag").length > maxFandoms;
}

export function applyFandomLimit(doc: Document, maxFandoms: number | null = null): void {
  if (!doc.getElementById("ao3-tracker-fandom-limit-style")) {
    const style = doc.createElement("style");
    style.id = "ao3-tracker-fandom-limit-style";
    style.textContent = ".ao3-tracker-fandom-limit-hidden { display: none !important; }";
    doc.head.appendChild(style);
  }
  for (const blurb of doc.querySelectorAll('li[id^="work_"], li[id^="bookmark_"]')) {
    const hidden = exceedsFandomLimit(blurb, maxFandoms);
    blurb.classList.toggle("ao3-tracker-fandom-limit-hidden", hidden);
    const placeholder = blurb.nextElementSibling;
    if (placeholder?.classList.contains("ao3-tracker-hidden-work")) {
      placeholder.classList.toggle("ao3-tracker-fandom-limit-hidden", hidden);
    }
  }
}

export function applyHiddenWorks(
  doc: Document,
  hiddenWorkIds: number[],
  onChange: (workId: number, hidden: boolean, title?: string) => void,
  options: {
    hideCaughtUp?: boolean;
    hideTracked?: boolean;
    badges?: import("../badges").WorkBadgeData[];
  } = {},
): void {
  const hidden = new Set(hiddenWorkIds);
  const badges = new Map(options.badges?.map((badge) => [badge.id, badge]));
  if (!doc.getElementById("ao3-tracker-hidden-style")) {
    const style = doc.createElement("style");
    style.id = "ao3-tracker-hidden-style";
    style.textContent = ".ao3-tracker-work-hidden { display: none !important; }";
    doc.head.appendChild(style);
  }
  for (const blurb of doc.querySelectorAll<HTMLLIElement>('li[id^="work_"], li[id^="bookmark_"]')) {
    const workId = Number(
      blurb.id.match(/^work_(\d+)$/)?.[1] ??
        blurb
          .querySelector<HTMLAnchorElement>('h4.heading a[href*="/works/"]')
          ?.getAttribute("href")
          ?.match(/\/works\/(\d+)(?:[/?#]|$)/)?.[1],
    );
    if (!Number.isSafeInteger(workId) || workId <= 0) continue;
    let button = blurb.querySelector<HTMLButtonElement>(".ao3-tracker-hide-work");
    if (!button) {
      button = doc.createElement("button");
      button.type = "button";
      button.className = "ao3-tracker-hide-work";
      button.textContent = "Hide work";
      const actions = blurb.querySelector("ul.actions");
      if (actions) {
        const item = doc.createElement("li");
        item.appendChild(button);
        actions.appendChild(item);
      } else {
        blurb.appendChild(button);
      }
    }
    const title =
      blurb.querySelector('h4.heading a[href*="/works/"]')?.textContent?.trim() || `Work ${workId}`;
    button.onclick = () => onChange(workId, true, title);
    const badge = badges.get(workId);
    const published = Number(blurb.querySelector("dd.chapters")?.textContent?.trim().split("/")[0]);
    const hasNewChapters = badge?.currentChapters != null && published > badge.currentChapters;
    const reason =
      options.hideTracked && badge
        ? "tracked"
        : options.hideCaughtUp &&
            !hasNewChapters &&
            (badge?.status === "caught-up" || badge?.status === "finished")
          ? badge.status
          : null;
    const automaticallyHidden =
      reason !== null && blurb.dataset.ao3TrackerRevealedStatus !== reason;
    const isHidden = hidden.has(workId) || automaticallyHidden;
    const next = blurb.nextElementSibling;
    let placeholder = next?.classList.contains("ao3-tracker-hidden-work") ? next : null;
    blurb.classList.toggle("ao3-tracker-work-hidden", isHidden);
    if (!isHidden) {
      placeholder?.remove();
      continue;
    }
    if (!placeholder) {
      placeholder = doc.createElement("li");
      placeholder.className = "ao3-tracker-hidden-work";
      blurb.after(placeholder);
    }
    const restore = doc.createElement("button");
    restore.type = "button";
    const manuallyHidden = hidden.has(workId);
    restore.textContent = manuallyHidden ? "Unhide" : "Show";
    restore.setAttribute("aria-label", `${restore.textContent} ${title}`);
    restore.onclick = () => {
      if (manuallyHidden) onChange(workId, false);
      else {
        blurb.dataset.ao3TrackerRevealedStatus = reason!;
        blurb.classList.remove("ao3-tracker-work-hidden");
        placeholder?.remove();
      }
    };
    const link = doc.createElement("a");
    link.href = `https://archiveofourown.org/works/${workId}`;
    link.textContent = title;
    const label = manuallyHidden
      ? "Hidden"
      : reason === "tracked"
        ? "Hidden - tracked"
        : reason === "finished"
          ? "Hidden - finished"
          : "Hidden - caught up";
    placeholder.replaceChildren(link, doc.createTextNode(` · ${label} · `), restore);
  }
}
