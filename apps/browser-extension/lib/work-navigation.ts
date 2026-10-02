import type { SyncChapterMetadata } from "@qcksys/ao3tracker-core/schemas";
import type { TrackedChapter } from "./storage";

export function workReadingUrl(
  workId: number,
  chapters: TrackedChapter[],
  metadata: SyncChapterMetadata[],
): string {
  const current = chapters
    .filter((chapter) => !chapter.deleted)
    .reduce<TrackedChapter | undefined>(
      (latest, chapter) =>
        !latest || Date.parse(chapter.lastReadAt) > Date.parse(latest.lastReadAt)
          ? chapter
          : latest,
      undefined,
    );
  const workUrl = `https://archiveofourown.org/works/${workId}`;
  if (!current) return workUrl;
  const number = metadata.find((chapter) => chapter.id === current.chapterId)?.number;
  const next =
    (current.markedCompleteAt !== null || current.readProgress >= 0.95) && number != null
      ? metadata.find(
          (chapter) =>
            chapter.number === number + 1 &&
            chapter.id > 0 &&
            !chapters.some((tracked) => tracked.chapterId === chapter.id && tracked.deleted),
        )
      : undefined;
  const chapterId = next?.id ?? current.chapterId;
  const url = chapterId > 0 ? `${workUrl}/chapters/${chapterId}` : workUrl;
  const progress = next ? 0 : Math.round(current.readProgress * 100);
  return `${url}?scrollTo=${progress}#chapters`;
}
