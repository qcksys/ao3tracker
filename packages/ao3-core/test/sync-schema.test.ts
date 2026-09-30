import { expect, it } from "vitest";
import { postSyncRequestSchema, type PostSyncRequest } from "../src/schemas/sync";

it("accepts old chapter uploads and retains explicit chapter tombstones", () => {
  const chapter = {
    workId: 1,
    chapterId: 11,
    lastReadAt: "2026-01-01T00:00:00.000Z",
    markedCompleteAt: null,
    readProgress: 0,
  };
  const legacy: PostSyncRequest = { chapters: [chapter] };
  expect(postSyncRequestSchema.parse(legacy).chapters?.[0].deleted).toBe(false);
  expect(
    postSyncRequestSchema.parse({ chapters: [{ ...chapter, deleted: true }] }).chapters?.[0]
      .deleted,
  ).toBe(true);
});
