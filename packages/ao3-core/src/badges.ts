/**
 * Pure render/format helpers for AO3 list-page tracker badges.
 *
 * No zod imports here so this module stays tiny when bundled into the native
 * WebView IIFE. The zod schemas live in `./schemas/badges` for consumers that
 * want runtime validation (e.g. the browser extension's message bus).
 */
export type WorkBadgeStatus =
  | "not-started"
  | "in-progress"
  | "caught-up"
  | "finished"
  | "has-new-chapters"
  | "private";

export interface WorkBadgeData {
  id: number;
  status: WorkBadgeStatus;
  progressPercent: number;
  favourite: boolean;
  currentChapters?: number | null;
}

export function formatBadge(data: WorkBadgeData): { label: string; color: string } {
  const star = data.favourite ? "★ " : "";
  switch (data.status) {
    case "finished":
      return { label: `${star}✓ Finished`, color: "#2e7d32" };
    case "caught-up":
      return { label: `${star}Caught up`, color: "#1565c0" };
    case "has-new-chapters":
      return { label: `${star}New chapters`, color: "#ef6c00" };
    case "in-progress":
      return { label: `${star}${data.progressPercent}%`, color: "#6a1b9a" };
    case "private":
      return { label: `${star}Private`, color: "#616161" };
    case "not-started":
      return { label: `${star}Tracked`, color: "#455a64" };
  }
}

/**
 * Render badge elements onto AO3 list-page blurbs. Removes any existing
 * `.ao3-tracker-badge` first so re-renders are idempotent.
 */
export function applyListBadges(doc: Document, win: Window, entries: WorkBadgeData[]): void {
  for (const data of entries) {
    const blurb = doc.getElementById(`work_${data.id}`);
    if (!blurb) continue;

    blurb.querySelector(".ao3-tracker-badge")?.remove();

    const { label, color } = formatBadge(data);
    const badge = doc.createElement("div");
    badge.className = "ao3-tracker-badge";
    badge.textContent = label;
    badge.style.cssText = [
      "position: absolute",
      "top: 4px",
      "right: 4px",
      `background: ${color}`,
      "color: #fff",
      "padding: 2px 6px",
      "border-radius: 4px",
      "font-size: 11px",
      "font-weight: 600",
      "z-index: 5",
      "pointer-events: none",
    ].join("; ");

    if (win.getComputedStyle(blurb).position === "static") {
      blurb.style.position = "relative";
    }
    blurb.appendChild(badge);
  }
}
