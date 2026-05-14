export function normalizeWhitespace(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function classifyAo3Url(url: string | URL): {
  isWork: boolean;
  isChapterIndex: boolean;
  isList: boolean;
  workId: number | null;
} {
  const parsed = typeof url === "string" ? new URL(url) : url;
  const parts = parsed.pathname.split("/").filter(Boolean);

  const isWorkWithChapter =
    parts[0] === "works" &&
    !Number.isNaN(Number(parts[1])) &&
    parts[2] === "chapters" &&
    !Number.isNaN(Number(parts[3]));

  const isWorkRoot = parts[0] === "works" && !Number.isNaN(Number(parts[1])) && parts.length === 2;

  const isChapterIndex =
    parts.length === 3 &&
    parts[0] === "works" &&
    !Number.isNaN(Number(parts[1])) &&
    parts[2] === "navigate";

  const workId = parts[0] === "works" && !Number.isNaN(Number(parts[1])) ? Number(parts[1]) : null;

  return {
    isWork: isWorkWithChapter || isWorkRoot,
    isChapterIndex,
    isList: !isWorkWithChapter && !isWorkRoot && !isChapterIndex,
    workId,
  };
}
