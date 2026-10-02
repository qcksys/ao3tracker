export const WORK_SUMMARY_SELECTOR = "#workskin > .preface .summary > blockquote";
export const WORK_SUMMARY_BLOCK_ELEMENTS = "p, br, div, li, blockquote, h1, h2, h3, h4, h5, h6, hr";

export function normalizeWorkSummary(text: string | null | undefined): string | null {
  const summary = text?.replace(/\s+/g, " ").trim();
  return summary ? Array.from(summary).slice(0, 2048).join("") : null;
}
