import { eq } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import { type TAuthUserS, tAuthUser } from "~/db/schema/auth.user";
import { ADMIN_ROLE } from "~/middleware/requireAdminMw";

/**
 * Email addresses of every admin account, for operational alerts
 */
export async function listAdminEmails(db: TDatabase): Promise<TAuthUserS["email"][]> {
  const admins = await db
    .select({ email: tAuthUser.email })
    .from(tAuthUser)
    .where(eq(tAuthUser.role, ADMIN_ROLE));
  return admins.map(({ email }) => email);
}
