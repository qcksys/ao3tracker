import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAdminDashboard } from "~/lib/admin-dashboard";
import { saveWorkCheckerSettings, workCheckerSettings } from "~/lib/work-checker";
import type { TRouterEnvAuth } from "~/middleware/authMw";
import { adminReturnPath } from "~/middleware/requireAdminMw";
import { adminRouter } from "~/routes/admin";

vi.mock("~/lib/admin-dashboard", () => ({ loadAdminDashboard: vi.fn() }));
vi.mock("~/lib/work-checker", () => ({
  saveWorkCheckerSettings: vi.fn(),
  workCheckerSettings: vi.fn(),
}));

const ORIGIN = "https://dev.ao3tracker.com";
const settings = {
  enabled: true,
  pollIntervalSeconds: 300,
  maxWorksPerPoll: 12,
  delayBetweenRequestsMs: 2000,
};
type User = NonNullable<TRouterEnvAuth["Variables"]["user"]>;
const admin = { id: "admin-1", email: "admin@example.test", role: "admin" } as User;
const reader = { id: "reader-1", email: "reader@example.test", role: "user" } as User;

/** The admin router behind the variables startupMw and authMw would set */
function app(user: User | null) {
  const router = new Hono<TRouterEnvAuth>();
  router.use(async (c, next) => {
    c.set("db", {} as TRouterEnvAuth["Variables"]["db"]);
    c.set("env", { BETTER_AUTH_URL: ORIGIN, ENVIRONMENT: "dev" } as CloudflareBindings);
    c.set("user", user);
    c.set("session", (user ? { id: "session" } : null) as TRouterEnvAuth["Variables"]["session"]);
    await next();
  });
  router.route("/admin", adminRouter);
  return router;
}

function postSettings(user: User | null, fields: Record<string, string>, origin = ORIGIN) {
  return app(user).request("/admin/settings", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

const validFields = {
  enabled: "on",
  pollIntervalSeconds: "600",
  maxWorksPerPoll: "8",
  delayBetweenRequestsMs: "3000",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(workCheckerSettings).mockResolvedValue(settings);
});
afterEach(() => vi.restoreAllMocks());

describe("admin access", () => {
  it("sends a visitor without a session to sign-in, keeping the page", async () => {
    const response = await app(null).request("/admin/settings");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/sign-in?next=%2Fadmin%2Fsettings");
  });

  it("refuses a signed-in account that is not an admin", async () => {
    const response = await app(reader).request("/admin");

    expect(response.status).toBe(403);
    expect(loadAdminDashboard).not.toHaveBeenCalled();
  });

  it("serves the sign-in page without a session and never caches admin pages", async () => {
    const response = await app(null).request("/admin/sign-in?next=/admin/settings");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toContain('data-next="/admin/settings"');
  });

  it("sends an admin who opens sign-in straight on", async () => {
    const response = await app(admin).request("/admin/sign-in?next=/admin/settings");

    expect(response.headers.get("Location")).toBe("/admin/settings");
  });

  it.each([
    ["https://evil.example/admin", "/admin"],
    ["//evil.example/admin", "/admin"],
    ["/api/track/sync", "/admin"],
    ["/admin/settings?saved=1", "/admin/settings?saved=1"],
  ])("only returns to admin pages after sign-in (%s)", (next, expected) => {
    expect(adminReturnPath(next)).toBe(expected);
  });
});

describe("admin dashboard", () => {
  it("renders the stats and checker status", async () => {
    const now = new Date("2026-10-28T08:00:00Z");
    vi.mocked(loadAdminDashboard).mockResolvedValue({
      generatedAt: now,
      settings,
      stats: {
        users: { total: 1234, recent: 5, admins: 1 },
        tracking: { trackedWorks: 800, trackingRows: 2000 },
        works: {
          stored: 790,
          deleted: 10,
          stale: 20,
          failing: 3,
          refreshedRecently: 40,
          lastRefreshedAt: now,
        },
        notifications: { pendingDispatch: 0, createdRecently: 12, failed: 1 },
        devices: { pushTokens: 50 },
        backups: { count: 300, totalBytes: 5 * 1024 * 1024, lastBackupAt: now },
      },
      checkers: [
        {
          checkerId: "hub-dev",
          reportedAt: new Date("2026-10-28T07:59:00Z"),
          silent: false,
          status: {
            checkerId: "hub-dev",
            version: "3a8453f0000000000000000000000000000000000",
            startedAt: "2026-10-28T07:00:00.000Z",
            lastPoll: {
              at: "2026-10-28T07:58:00.000Z",
              durationMs: 30_000,
              enabled: true,
              claimed: 12,
              outcomes: { page: 11, not_found: 1, restricted: 0, unavailable: 0, failed: 0 },
              backupsUploaded: 2,
              backupsFailed: 0,
              stoppedEarly: false,
            },
            lastError: null,
          },
        },
      ],
    });

    const response = await app(admin).request("/admin");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("1,234");
    expect(html).toContain("hub-dev");
    expect(html).toContain("version 3a8453f");
    expect(html).toContain("5.0 MB");
  });
});

describe("admin settings", () => {
  it("shows the current settings", async () => {
    const html = await (await app(admin).request("/admin/settings")).text();

    expect(html).toContain('name="maxWorksPerPoll"');
    expect(html).toContain('value="12"');
  });

  it("saves valid settings and redirects to a confirmation", async () => {
    const response = await postSettings(admin, validFields);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/admin/settings?saved=1");
    expect(saveWorkCheckerSettings).toHaveBeenCalledWith(
      {},
      { enabled: true, pollIntervalSeconds: 600, maxWorksPerPoll: 8, delayBetweenRequestsMs: 3000 },
    );
  });

  it("treats an unchecked box as disabling the checker", async () => {
    const { enabled: _, ...fields } = validFields;

    await postSettings(admin, fields);

    expect(vi.mocked(saveWorkCheckerSettings).mock.calls[0][1].enabled).toBe(false);
  });

  it("rejects values outside the limits and keeps what was typed", async () => {
    const response = await postSettings(admin, { ...validFields, maxWorksPerPoll: "500" });
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain("Works per poll");
    expect(html).toContain('value="500"');
    expect(saveWorkCheckerSettings).not.toHaveBeenCalled();
  });

  it("rejects a post from another site", async () => {
    const response = await postSettings(admin, validFields, "https://evil.example");

    expect(response.status).toBe(403);
    expect(saveWorkCheckerSettings).not.toHaveBeenCalled();
  });

  it("rejects a post from an account that is not an admin", async () => {
    const response = await postSettings(reader, validFields);

    expect(response.status).toBe(403);
    expect(saveWorkCheckerSettings).not.toHaveBeenCalled();
  });
});
