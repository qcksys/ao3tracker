import { tAuthAccount } from "./auth.account";
import { tEmailSendLog } from "./auth.emailSendLog";
import { tAuthPasskey } from "./auth.passkey";
import { tAuthRateLimit } from "./auth.rateLimit";
import { tAuthSession } from "./auth.session";
import { tAuthTwoFactor } from "./auth.twoFactor";
import { tAuthUser } from "./auth.user";
import { tAuthVerification } from "./auth.verification";
import { tNotification } from "./notification";
import { tPushToken } from "./push.token";
import { tTrackChapter } from "./track.chapter";
import { tTrackWork } from "./track.work";
import { tUserFavouriteTag } from "./user.favouriteTag";
import { tUserSavedSearch } from "./user.savedSearch";
import { tWork } from "./work";
import { tWorkBackup } from "./work.backup";
import { tWorkChapter } from "./work.chapter";
import { tWorkTag } from "./work.tag";
import { tWorkTagLink } from "./work.tag.link";

export const schema = {
  tAuthAccount,
  tEmailSendLog,
  tAuthPasskey,
  tAuthRateLimit,
  tAuthSession,
  tAuthTwoFactor,
  tAuthUser,
  tAuthVerification,
  tNotification,
  tPushToken,
  tTrackChapter,
  tTrackWork,
  tUserFavouriteTag,
  tUserSavedSearch,
  tWorkBackup,
  tWorkChapter,
  tWorkTagLink,
  tWorkTag,
  tWork,
};
