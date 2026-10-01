import { defineRelations } from "drizzle-orm";
import { schema } from "~/db/schema";

export const relations = defineRelations(schema, (r) => ({
  tAuthAccount: {
    user: r.one.tAuthUser({ from: r.tAuthAccount.userId, to: r.tAuthUser.id }),
  },
  tAuthPasskey: {
    user: r.one.tAuthUser({ from: r.tAuthPasskey.userId, to: r.tAuthUser.id }),
  },
  tAuthSession: {
    user: r.one.tAuthUser({ from: r.tAuthSession.userId, to: r.tAuthUser.id }),
  },
  tAuthTwoFactor: {
    user: r.one.tAuthUser({ from: r.tAuthTwoFactor.userId, to: r.tAuthUser.id }),
  },
  tAuthUser: {
    sessions: r.many.tAuthSession(),
    accounts: r.many.tAuthAccount(),
    twoFactors: r.many.tAuthTwoFactor(),
    passkeys: r.many.tAuthPasskey(),
  },
  tNotification: {
    user: r.one.tAuthUser({ from: r.tNotification.userId, to: r.tAuthUser.id }),
    work: r.one.tWork({ from: r.tNotification.workId, to: r.tWork.id }),
  },
  tPushToken: {
    user: r.one.tAuthUser({ from: r.tPushToken.userId, to: r.tAuthUser.id }),
  },
  tTrackChapter: {
    work: r.one.tWork({ from: r.tTrackChapter.workId, to: r.tWork.id }),
  },
  tTrackWork: {
    work: r.one.tWork({ from: r.tTrackWork.workId, to: r.tWork.id }),
  },
  tWorkBackup: {
    work: r.one.tWork({ from: r.tWorkBackup.workId, to: r.tWork.id }),
  },
  tWorkChapter: {
    work: r.one.tWork({ from: r.tWorkChapter.workId, to: r.tWork.id }),
  },
  tWorkTagLink: {
    workRecord: r.one.tWork({ from: r.tWorkTagLink.work, to: r.tWork.id }),
    tagRecord: r.one.tWorkTag({ from: r.tWorkTagLink.tag, to: r.tWorkTag.id }),
  },
  tWorkTag: {
    tagLink: r.many.tWorkTagLink(),
  },
  tWork: {
    backups: r.many.tWorkBackup(),
    chapters: r.many.tWorkChapter(),
    tags: r.many.tWorkTagLink(),
    trackWorks: r.many.tTrackWork(),
    trackChapters: r.many.tTrackChapter(),
  },
}));
