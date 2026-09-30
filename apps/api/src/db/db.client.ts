import { Client } from "@planetscale/database";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { rAuthAccount, tAuthAccount } from "~/db/schema/auth.account";
import { rAuthPasskey, tAuthPasskey } from "~/db/schema/auth.passkey";
import { rAuthSession, tAuthSession } from "~/db/schema/auth.session";
import { rAuthTwoFactor, tAuthTwoFactor } from "~/db/schema/auth.twoFactor";
import { rAuthUser, tAuthUser } from "~/db/schema/auth.user";
import { tAuthVerification } from "~/db/schema/auth.verification";
import { rTrackChapter, tTrackChapter } from "~/db/schema/track.chapter";
import { rTrackWork, tTrackWork } from "~/db/schema/track.work";
import { rWork, tWork } from "~/db/schema/work";
import { rWorkBackup, tWorkBackup } from "~/db/schema/work.backup";
import { rWorkChapter, tWorkChapter } from "~/db/schema/work.chapter";
import { rWorkTag, tWorkTag } from "~/db/schema/work.tag";

export type TDatabase = ReturnType<typeof createDbConnection>;
export const createDbConnection = (url: string) => {
  const client = new Client({
    url,
    fetch: (url, init) => {
      if (init) {
        delete init.cache;
      }
      return fetch(url, init);
    },
  });
  return drizzle(client, {
    schema: {
      tAuthAccount,
      rAuthAccount,
      tAuthPasskey,
      rAuthPasskey,
      tAuthSession,
      rAuthSession,
      tAuthTwoFactor,
      rAuthTwoFactor,
      tAuthUser,
      rAuthUser,
      tAuthVerification,
      tTrackChapter,
      rTrackChapter,
      tTrackWork,
      rTrackWork,
      tWork,
      rWork,
      tWorkBackup,
      rWorkBackup,
      tWorkChapter,
      rWorkChapter,
      tWorkTag,
      rWorkTag,
    },
  });
};
