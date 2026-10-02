import { sql } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import { tAuthSession } from "~/db/schema/auth.session";
import { tAuthUser } from "~/db/schema/auth.user";
import { tTrackChapter } from "~/db/schema/track.chapter";
import { tTrackWork } from "~/db/schema/track.work";
import { tUserFavouriteTag } from "~/db/schema/user.favouriteTag";
import { tUserSavedSearch } from "~/db/schema/user.savedSearch";
import { tWork } from "~/db/schema/work";
import { tWorkChapter } from "~/db/schema/work.chapter";
import { tWorkTag } from "~/db/schema/work.tag";
import { tWorkTagLink } from "~/db/schema/work.tag.link";

export const seededAt = new Date("2025-01-01T00:00:00.100Z");
export const editedAt = "2025-01-01T00:00:00.200Z";
export const newestAt = "2025-01-01T00:00:00.300Z";
export const searchId = "00000000-0000-4000-8000-000000000001";
export const deletedSearchId = "00000000-0000-4000-8000-000000000002";
export const searchUrl = "https://archiveofourown.org/works?work_search%5Bquery%5D=seeded";
export const sessionToken = (userId: string) => `e2e-${userId}-session`;

export async function seedSyncDatabase(db: TDatabase) {
  for (const table of [
    tAuthSession,
    tAuthUser,
    tTrackChapter,
    tTrackWork,
    tUserFavouriteTag,
    tUserSavedSearch,
    tWorkTagLink,
    tWorkTag,
    tWorkChapter,
    tWork,
  ]) {
    await db.delete(table);
  }

  const users = ["reader", "other"];
  const audit = { rowCreatedAt: seededAt, rowUpdatedAt: seededAt };
  await db
    .insert(tAuthUser)
    .values(
      users.map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: true,
      })),
    )
    .onDuplicateKeyUpdate({ set: { name: sql`${tAuthUser.name}` } });
  await db
    .insert(tAuthSession)
    .values(
      users.map((userId) => ({
        id: `${userId}-session`,
        userId,
        token: sessionToken(userId),
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    )
    .onDuplicateKeyUpdate({ set: { token: sql`${tAuthSession.token}` } });

  await db
    .insert(tWork)
    .values(
      [1, 2, 3, 4, 99].map((id) => ({
        id,
        title: `Seeded work ${id}`,
        author: "Seeded author",
        language: "English",
        wordCount: 1200,
        currentChapters: id === 1 ? 2 : 1,
        totalChapters: id === 1 ? 2 : 1,
        published: seededAt,
        lastUpdated: seededAt,
        ...audit,
      })),
    )
    .onDuplicateKeyUpdate({ set: { title: sql`${tWork.title}` } });
  await db
    .insert(tWorkChapter)
    .values([
      { workId: 1, id: 11, number: 1, title: "First chapter", ...audit },
      { workId: 1, id: 12, number: 2, title: "Second chapter", ...audit },
      { workId: 2, id: 21, number: 1, title: "Private chapter", ...audit },
      { workId: 4, id: 41, number: 1, title: "Single chapter", ...audit },
      { workId: 99, id: 991, number: 1, title: "Other reader chapter", ...audit },
    ])
    .onDuplicateKeyUpdate({ set: { title: sql`${tWorkChapter.title}` } });
  await db
    .insert(tWorkTag)
    .values({
      id: 1,
      tag: "Fluff",
      href: "/tags/Fluff/works",
      typeId: 7,
    })
    .onDuplicateKeyUpdate({ set: { href: sql`${tWorkTag.href}` } });
  await db
    .insert(tWorkTagLink)
    .values(
      [1, 2, 99].map((work) => ({
        work,
        tag: 1,
        rowCreatedAt: seededAt,
      })),
    )
    .onDuplicateKeyUpdate({ set: { tag: sql`${tWorkTagLink.tag}` } });

  await db
    .insert(tTrackWork)
    .values([
      { userId: "reader", workId: 1, lastReadAt: seededAt, ...audit },
      { userId: "reader", workId: 2, lastReadAt: seededAt, private: true, ...audit },
      { userId: "reader", workId: 3, lastReadAt: seededAt, rowDeletedAt: seededAt, ...audit },
      { userId: "reader", workId: 4, lastReadAt: seededAt, ...audit },
      { userId: "other", workId: 1, lastReadAt: seededAt, favourite: true, ...audit },
      { userId: "other", workId: 99, lastReadAt: seededAt, ...audit },
    ])
    .onDuplicateKeyUpdate({ set: { lastReadAt: sql`${tTrackWork.lastReadAt}` } });
  await db
    .insert(tTrackChapter)
    .values([
      {
        userId: "reader",
        workId: 1,
        chapterId: 11,
        lastReadAt: seededAt,
        readProgress: 0.75,
        markedCompleteAt: seededAt,
        ...audit,
      },
      {
        userId: "reader",
        workId: 1,
        chapterId: 12,
        lastReadAt: seededAt,
        rowDeletedAt: seededAt,
        ...audit,
      },
      {
        userId: "reader",
        workId: 3,
        chapterId: 0,
        lastReadAt: seededAt,
        rowDeletedAt: seededAt,
        ...audit,
      },
      {
        userId: "reader",
        workId: 4,
        chapterId: 0,
        lastReadAt: seededAt,
        readProgress: 0.5,
        ...audit,
      },
      {
        userId: "other",
        workId: 1,
        chapterId: 11,
        lastReadAt: seededAt,
        readProgress: 0.25,
        ...audit,
      },
      {
        userId: "other",
        workId: 99,
        chapterId: 991,
        lastReadAt: seededAt,
        readProgress: 1,
        ...audit,
      },
    ])
    .onDuplicateKeyUpdate({ set: { lastReadAt: sql`${tTrackChapter.lastReadAt}` } });
  await db
    .insert(tUserFavouriteTag)
    .values([
      {
        userId: "reader",
        tagType: 7,
        tag: "Fluff",
        favourited: true,
        updatedAt: seededAt,
        ...audit,
      },
      {
        userId: "reader",
        tagType: 7,
        tag: "Angst",
        favourited: false,
        updatedAt: seededAt,
        ...audit,
      },
      {
        userId: "other",
        tagType: 7,
        tag: "Fluff",
        favourited: true,
        updatedAt: seededAt,
        ...audit,
      },
    ])
    .onDuplicateKeyUpdate({ set: { favourited: sql`${tUserFavouriteTag.favourited}` } });
  await db
    .insert(tUserSavedSearch)
    .values([
      {
        userId: "reader",
        id: searchId,
        name: "Seeded search",
        url: searchUrl,
        updatedAt: seededAt,
        ...audit,
      },
      {
        userId: "reader",
        id: deletedSearchId,
        name: "Removed search",
        url: searchUrl,
        deleted: true,
        updatedAt: seededAt,
        ...audit,
      },
      {
        userId: "other",
        id: searchId,
        name: "Other reader search",
        url: searchUrl,
        updatedAt: seededAt,
        ...audit,
      },
    ])
    .onDuplicateKeyUpdate({ set: { name: sql`${tUserSavedSearch.name}` } });
}
