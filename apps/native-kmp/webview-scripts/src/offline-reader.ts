import { computeChapterScrollPercentage } from "@qcksys/ao3tracker-core/dom";
import type { OfflineReaderMessage, OfflineReaderOptions } from "@qcksys/ao3tracker-core/schemas";

export function installOfflineReader(
  doc: Document,
  win: Window & typeof globalThis,
  options: OfflineReaderOptions,
  post: (message: OfflineReaderMessage) => void,
): () => void {
  let stopped = false;
  let ready = false;
  let interacting = false;
  let lastProgress = Math.floor(options.scrollPercentage);
  let readingPercentage = options.scrollPercentage;
  let layoutVersion = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const postProgress = () => {
    if (!ready || !interacting || stopped) return;
    const value = computeChapterScrollPercentage(doc, win);
    if (value === null || !Number.isFinite(value)) return;
    const percentage = Math.max(0, Math.min(100, Math.floor(value)));
    readingPercentage = value;
    if (percentage === lastProgress) return;
    lastProgress = percentage;
    post({ type: "offlineProgress", token: options.token, scrollPercentage: percentage });
  };
  const scroll = () => {
    if (!ready || !interacting || stopped) return;
    const value = computeChapterScrollPercentage(doc, win);
    if (value !== null && Number.isFinite(value)) readingPercentage = value;
    clearTimeout(timer);
    timer = setTimeout(postProgress, 100);
  };
  const interact = () => {
    if (ready) {
      layoutVersion++;
      interacting = true;
    }
  };
  const afterLayout = async () => {
    if (doc.fonts) await doc.fonts.ready;
    await new Promise<void>((resolve) =>
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())),
    );
  };
  const restorePercentage = () => {
    const chapters = doc.getElementById("chapters");
    if (!chapters) return;
    const rect = chapters.getBoundingClientRect();
    const top = rect.top + win.scrollY;
    win.scrollTo(
      0,
      readingPercentage === 0
        ? top
        : Math.max(0, top + (rect.height * readingPercentage) / 100 - win.innerHeight),
    );
  };
  const resize = async () => {
    interacting = false;
    clearTimeout(timer);
    const version = ++layoutVersion;
    if (!ready) return;
    await afterLayout();
    if (!stopped && version === layoutVersion) restorePercentage();
  };
  const appearance = win.matchMedia("(prefers-color-scheme: dark)");
  const fragment = (hash: string): boolean => {
    try {
      const element = doc.getElementById(decodeURIComponent(hash.replace(/^#/, "")));
      if (!element) return false;
      element.scrollIntoView();
      return true;
    } catch {
      return false;
    }
  };
  const navigate = (address: string) => {
    let url: URL;
    try {
      url = new URL(address, options.canonicalUrl);
    } catch {
      return;
    }
    if (url.protocol !== "https:" || url.username || url.password) return;
    const current = new URL(options.canonicalUrl);
    if (
      url.origin === current.origin &&
      url.pathname === current.pathname &&
      url.search === current.search &&
      url.hash &&
      fragment(url.hash)
    )
      return;
    post({ type: "offlineNavigate", token: options.token, url: url.href });
  };
  const click = (event: MouseEvent) => {
    const element = event.target;
    if (!(element instanceof win.Element)) return;
    const anchor = element.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    event.preventDefault();
    navigate(anchor.getAttribute("href") ?? "");
  };
  const change = (event: Event) => {
    const element = event.target;
    if (
      !(element instanceof win.HTMLSelectElement) ||
      element.id !== "selected_id" ||
      !/^\d+$/.test(element.value)
    )
      return;
    navigate(`https://archiveofourown.org/works/${options.workId}/chapters/${element.value}`);
  };
  doc.addEventListener("click", click);
  doc.addEventListener("change", change);
  for (const type of ["touchstart", "wheel", "keydown", "pointerdown"])
    doc.addEventListener(type, interact, { passive: true });
  win.addEventListener("scroll", scroll, { passive: true });
  win.addEventListener("resize", resize);
  appearance.addEventListener("change", resize);

  const restore = async () => {
    await afterLayout();
    if (stopped) return;
    if (!options.fragment || !fragment(options.fragment)) {
      restorePercentage();
    } else {
      const value = computeChapterScrollPercentage(doc, win);
      if (value !== null && Number.isFinite(value)) readingPercentage = value;
    }
    ready = true;
    post({ type: "offlineReady", token: options.token });
  };
  void restore();
  return () => {
    stopped = true;
    clearTimeout(timer);
    doc.removeEventListener("click", click);
    doc.removeEventListener("change", change);
    for (const type of ["touchstart", "wheel", "keydown", "pointerdown"])
      doc.removeEventListener(type, interact);
    win.removeEventListener("scroll", scroll);
    win.removeEventListener("resize", resize);
    appearance.removeEventListener("change", resize);
  };
}
