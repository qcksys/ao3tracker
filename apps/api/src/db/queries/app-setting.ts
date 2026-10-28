import { and, eq, isNull } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import { type TAppSettingS, tAppSetting } from "~/db/schema/app.setting";

/**
 * Get a setting's stored JSON value (unvalidated), or null when the key is unset or
 * soft-deleted
 */
export async function getAppSetting(
  db: TDatabase,
  key: TAppSettingS["key"],
): Promise<TAppSettingS["value"]> {
  const result = await db
    .select({ value: tAppSetting.value })
    .from(tAppSetting)
    .where(and(eq(tAppSetting.key, key), isNull(tAppSetting.rowDeletedAt)))
    .limit(1);
  return result[0]?.value ?? null;
}
