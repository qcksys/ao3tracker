import type { WorkCheckerStatus } from "@qcksys/ao3tracker-core/work-checker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TDatabase } from "~/db/db.client";
import { listAdminEmails } from "~/db/queries/auth-user";
import {
  listWorkCheckerStatuses,
  setWorkCheckerDownAlertSentAt,
} from "~/db/queries/work-checker-status";
import { alertDownWorkCheckers } from "~/lib/work-checker-alerts";

vi.mock("~/db/queries/auth-user", () => ({ listAdminEmails: vi.fn() }));
vi.mock("~/db/queries/work-checker-status", () => ({
  listWorkCheckerStatuses: vi.fn(),
  setWorkCheckerDownAlertSentAt: vi.fn(),
}));

const db = {} as TDatabase;
const send = vi.fn();
const env = {
  EMAIL: { send },
  SYSTEM_EMAIL_ADDRESS: "hello@ao3tracker.com",
  BETTER_AUTH_URL: "https://ao3tracker.com",
  ENVIRONMENT: "prod",
} as unknown as CloudflareBindings;
/** Two 300-second poll intervals plus five minutes: 15 minutes of silence */
const settings = {
  enabled: true,
  pollIntervalSeconds: 300,
  maxWorksPerPoll: 12,
  delayBetweenRequestsMs: 2000,
};
const now = new Date("2026-11-25T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

/** hub-prod's row: when it last reported, when its last successful poll started, and its alert */
function checker({
  reported = 1,
  polled = 1 as number | null,
  downAlertSentAt = null as Date | null,
  lastError = null as WorkCheckerStatus["lastError"],
} = {}) {
  const status: WorkCheckerStatus = {
    checkerId: "hub-prod",
    version: "abc1234",
    startedAt: minutesAgo(120).toISOString(),
    lastPoll:
      polled === null
        ? null
        : {
            at: minutesAgo(polled).toISOString(),
            durationMs: 30_000,
            enabled: true,
            claimed: 12,
            outcomes: { page: 12, not_found: 0, restricted: 0, unavailable: 0, failed: 0 },
            backupsUploaded: 0,
            backupsFailed: 0,
            stoppedEarly: false,
          },
    lastError,
  };
  return { checkerId: "hub-prod", status, reportedAt: minutesAgo(reported), downAlertSentAt };
}

let errorLog: ReturnType<typeof vi.spyOn>;

function sentEmail() {
  expect(send).toHaveBeenCalledOnce();
  return send.mock.calls[0]?.[0];
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(listAdminEmails).mockResolvedValue(["admin@example.test", "ops@example.test"]);
});
afterEach(() => vi.restoreAllMocks());

describe("work checker down alerts", () => {
  it("leaves a checker alone while it reports and polls within the limit", async () => {
    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([checker({ reported: 14, polled: 14 })]);

    await alertDownWorkCheckers(db, env, settings, now);

    expect(send).not.toHaveBeenCalled();
    expect(setWorkCheckerDownAlertSentAt).not.toHaveBeenCalled();
  });

  it("emails every admin once when the checker stops reporting", async () => {
    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([checker({ reported: 16, polled: 16 })]);

    await alertDownWorkCheckers(db, env, settings, now);

    const email = sentEmail();
    expect(email).toMatchObject({
      from: { name: "QckSys AO3 Tracker", email: "hello@ao3tracker.com" },
      to: ["admin@example.test", "ops@example.test"],
      subject: "Work checker hub-prod is down",
    });
    expect(email.text).toContain(
      "The prod work checker hub-prod has not completed a poll since 2026-11-25T11:44:00.000Z.",
    );
    expect(email.text).toContain("https://ao3tracker.com/admin/settings");
    expect(setWorkCheckerDownAlertSentAt).toHaveBeenCalledWith(db, "hub-prod", now);
  });

  it("alerts when reports still arrive but no poll has succeeded within the limit", async () => {
    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([
      checker({
        reported: 1,
        polled: 30,
        lastError: { at: minutesAgo(1).toISOString(), message: "Browser closed" },
      }),
    ]);

    await alertDownWorkCheckers(db, env, settings, now);

    expect(sentEmail().text).toContain("Last error: Browser closed (2026-11-25T11:59:00.000Z)");
    expect(setWorkCheckerDownAlertSentAt).toHaveBeenCalledWith(db, "hub-prod", now);
  });

  it("counts a checker that has not completed a poll since it started", async () => {
    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([checker({ polled: null })]);

    await alertDownWorkCheckers(db, env, settings, now);

    expect(sentEmail().subject).toBe("Work checker hub-prod is down");
  });

  it("does not email again while its down alert is outstanding", async () => {
    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([
      checker({ reported: 30, polled: 30, downAlertSentAt: minutesAgo(10) }),
    ]);

    await alertDownWorkCheckers(db, env, settings, now);

    expect(send).not.toHaveBeenCalled();
    expect(setWorkCheckerDownAlertSentAt).not.toHaveBeenCalled();
  });

  it("emails once when a down checker recovers, and clears the alert", async () => {
    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([
      checker({ downAlertSentAt: minutesAgo(40) }),
    ]);

    await alertDownWorkCheckers(db, env, settings, now);

    const email = sentEmail();
    expect(email.subject).toBe("Work checker hub-prod is working again");
    expect(email.text).toContain("It was reported down at 2026-11-25T11:20:00.000Z.");
    expect(setWorkCheckerDownAlertSentAt).toHaveBeenCalledWith(db, "hub-prod", null);
  });

  it("sends no down alert while the checker is disabled, but still reports a recovery", async () => {
    const disabled = { ...settings, enabled: false };
    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([checker({ reported: 30, polled: 30 })]);

    await alertDownWorkCheckers(db, env, disabled, now);
    expect(send).not.toHaveBeenCalled();

    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([
      checker({ downAlertSentAt: minutesAgo(40) }),
    ]);
    await alertDownWorkCheckers(db, env, disabled, now);
    expect(sentEmail().subject).toBe("Work checker hub-prod is working again");
  });

  it("leaves the alert unrecorded when the email fails, so the next run sends it", async () => {
    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([checker({ reported: 30, polled: 30 })]);
    send.mockRejectedValue(new Error("E_SENDER_NOT_VERIFIED"));

    await alertDownWorkCheckers(db, env, settings, now);

    expect(setWorkCheckerDownAlertSentAt).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ checkerId: "hub-prod", error: "E_SENDER_NOT_VERIFIED" }),
    );
  });

  it("sends nothing and records nothing without an admin account", async () => {
    vi.mocked(listWorkCheckerStatuses).mockResolvedValue([checker({ reported: 30, polled: 30 })]);
    vi.mocked(listAdminEmails).mockResolvedValue([]);

    await alertDownWorkCheckers(db, env, settings, now);

    expect(send).not.toHaveBeenCalled();
    expect(setWorkCheckerDownAlertSentAt).not.toHaveBeenCalled();
  });

  it("logs a failed status read instead of rejecting", async () => {
    vi.mocked(listWorkCheckerStatuses).mockRejectedValue(new Error("connection reset"));

    await expect(alertDownWorkCheckers(db, env, settings, now)).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ error: "connection reset" }));
  });
});
