import {
  type WorkCheckerSettings,
  workCheckerSettingsSchema,
} from "@qcksys/ao3tracker-core/work-checker";
import { Hono } from "hono";
import { loadAdminDashboard } from "~/lib/admin-dashboard";
import { saveWorkCheckerSettings, workCheckerSettings } from "~/lib/work-checker";
import type { TRouterEnvAuth } from "~/middleware/authMw";
import { ADMIN_ROLE, adminReturnPath, requireAdminMw } from "~/middleware/requireAdminMw";
import { AdminDashboardPage } from "~/views/admin-dashboard-page";
import { AdminSettingsPage, type WorkCheckerSettingsForm } from "~/views/admin-settings-page";
import { AdminSignInPage } from "~/views/admin-sign-in-page";

const settingLabels: Record<keyof WorkCheckerSettings, string> = {
  enabled: "Enabled",
  pollIntervalSeconds: "Poll interval",
  maxWorksPerPoll: "Works per poll",
  delayBetweenRequestsMs: "Delay between AO3 requests",
};

function formFromSettings(settings: WorkCheckerSettings): WorkCheckerSettingsForm {
  return {
    enabled: settings.enabled,
    pollIntervalSeconds: String(settings.pollIntervalSeconds),
    maxWorksPerPoll: String(settings.maxWorksPerPoll),
    delayBetweenRequestsMs: String(settings.delayBetweenRequestsMs),
  };
}

/**
 * Server-rendered admin site. Every page except sign-in requires an admin session; see
 * `requireAdminMw`.
 */
export const adminRouter = new Hono<TRouterEnvAuth>();

adminRouter.get("/sign-in", (c) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  const next = adminReturnPath(c.req.query("next"));
  if (c.var.user?.role === ADMIN_ROLE) return c.redirect(next);
  return c.html(<AdminSignInPage next={next} />);
});

adminRouter.get("/", requireAdminMw, async (c) => {
  const dashboard = await loadAdminDashboard(c.var.db, new Date());
  return c.html(
    <AdminDashboardPage
      dashboard={dashboard}
      email={c.var.user?.email ?? ""}
      environment={c.var.env.ENVIRONMENT}
    />,
  );
});

adminRouter.get("/settings", requireAdminMw, async (c) => {
  const settings = await workCheckerSettings(c.var.db);
  return c.html(
    <AdminSettingsPage
      form={formFromSettings(settings)}
      saved={c.req.query("saved") === "1"}
      email={c.var.user?.email ?? ""}
      environment={c.var.env.ENVIRONMENT}
    />,
  );
});

adminRouter.post("/settings", requireAdminMw, async (c) => {
  const body = await c.req.parseBody();
  // Form fields can also be file uploads; only text counts.
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const form: WorkCheckerSettingsForm = {
    enabled: body.enabled === "on",
    pollIntervalSeconds: text(body.pollIntervalSeconds),
    maxWorksPerPoll: text(body.maxWorksPerPoll),
    delayBetweenRequestsMs: text(body.delayBetweenRequestsMs),
  };
  const parsed = workCheckerSettingsSchema.safeParse({
    enabled: form.enabled,
    pollIntervalSeconds: Number(form.pollIntervalSeconds),
    maxWorksPerPoll: Number(form.maxWorksPerPoll),
    delayBetweenRequestsMs: Number(form.delayBetweenRequestsMs),
  });
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => {
      const field = issue.path[0] as keyof WorkCheckerSettings | undefined;
      return `${field ? settingLabels[field] : "Settings"}: ${issue.message}`;
    });
    return c.html(
      <AdminSettingsPage
        form={form}
        errors={errors}
        email={c.var.user?.email ?? ""}
        environment={c.var.env.ENVIRONMENT}
      />,
      400,
    );
  }
  await saveWorkCheckerSettings(c.var.db, parsed.data);
  console.log({ message: "Work checker settings saved", userId: c.var.user?.id, ...parsed.data });
  return c.redirect("/admin/settings?saved=1", 303);
});
