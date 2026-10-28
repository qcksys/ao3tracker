import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, inject, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { tAppSetting } from "~/db/schema/app.setting";
import { DISABLED_WORK_CHECKER_SETTINGS, workCheckerSettings } from "~/lib/work-checker";

const db = createDbConnection(inject("databaseUrl"));
const enabled = {
  enabled: true,
  pollIntervalSeconds: 300,
  maxWorksPerPoll: 12,
  delayBetweenRequestsMs: 2000,
};

/** The statement an operator runs to change the settings, with no deployment */
function writeSettings(value: string) {
  return db.execute(
    sql`INSERT INTO ao3track__app_setting (\`key\`, value) VALUES ('work_checker', ${value})
      ON DUPLICATE KEY UPDATE value = VALUES(value), rowDeletedAt = NULL`,
  );
}

beforeEach(async () => {
  await db.delete(tAppSetting);
});

describe("work checker settings in MySQL", () => {
  it("reads settings written with SQL, and picks up a later change", async () => {
    await writeSettings(JSON.stringify(enabled));
    expect(await workCheckerSettings(db)).toEqual(enabled);

    await writeSettings(JSON.stringify({ ...enabled, enabled: false, maxWorksPerPoll: 5 }));
    expect(await workCheckerSettings(db)).toEqual({
      ...enabled,
      enabled: false,
      maxWorksPerPoll: 5,
    });
  });

  it("treats a missing or soft-deleted setting as disabled", async () => {
    expect(await workCheckerSettings(db)).toEqual(DISABLED_WORK_CHECKER_SETTINGS);

    await writeSettings(JSON.stringify(enabled));
    await db
      .update(tAppSetting)
      .set({ rowDeletedAt: new Date() })
      .where(eq(tAppSetting.key, "work_checker"));
    expect(await workCheckerSettings(db)).toEqual(DISABLED_WORK_CHECKER_SETTINGS);
  });

  it("treats a value outside the schema as disabled and reports it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await writeSettings(JSON.stringify({ enabled: "yes" }));

    expect(await workCheckerSettings(db)).toEqual(DISABLED_WORK_CHECKER_SETTINGS);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
