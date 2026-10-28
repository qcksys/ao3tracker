import type { FC } from "hono/jsx";
import type { AdminDashboard, CheckerOverview } from "~/lib/admin-dashboard";
import { AdminLayout, cardClass, formatAge, formatBytes, formatCount } from "~/views/admin-layout";

const Stat: FC<{ label: string; value: string; detail?: string; warn?: boolean }> = (props) => (
  <div class={cardClass}>
    <div class="text-xs uppercase tracking-wide text-zinc-400">{props.label}</div>
    <div class={`mt-1 text-2xl font-semibold ${props.warn ? "text-amber-300" : "text-white"}`}>
      {props.value}
    </div>
    {props.detail ? <div class="mt-1 text-sm text-zinc-400">{props.detail}</div> : null}
  </div>
);

const Section: FC<{ title: string; note?: string; columns?: 2 | 4; children?: unknown }> = (
  props,
) => (
  <section class="mb-8">
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">
      {props.title}
      {props.note ? (
        <span class="ml-2 font-normal normal-case tracking-normal text-zinc-400">{props.note}</span>
      ) : null}
    </h2>
    <div
      class={`grid grid-cols-1 gap-3 ${props.columns === 2 ? "lg:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}
    >
      {props.children}
    </div>
  </section>
);

const CheckerCard: FC<{ checker: CheckerOverview; now: Date }> = ({ checker, now }) => {
  const { status, reportedAt, silent } = checker;
  const poll = status.lastPoll;
  return (
    <div class={cardClass}>
      <div class="flex flex-wrap items-baseline gap-2">
        <span class="font-semibold">{checker.checkerId}</span>
        <span
          class={`rounded px-2 py-0.5 text-xs ${silent ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200"}`}
        >
          {silent ? "Not reporting" : "Reporting"}
        </span>
        <span class="text-sm text-zinc-400">
          last report {formatAge(reportedAt, now)} · version {status.version.slice(0, 7)} · running
          since {formatAge(new Date(status.startedAt), now)}
        </span>
      </div>
      {poll ? (
        <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <dt class="text-zinc-400">Last poll</dt>
          <dd>
            {formatAge(new Date(poll.at), now)} ({Math.round(poll.durationMs / 1000)} s)
          </dd>
          <dt class="text-zinc-400">Claimed</dt>
          <dd>{poll.enabled ? formatCount(poll.claimed) : "disabled"}</dd>
          <dt class="text-zinc-400">Pages read</dt>
          <dd>{formatCount(poll.outcomes.page)}</dd>
          <dt class="text-zinc-400">Deleted / restricted</dt>
          <dd>
            {formatCount(poll.outcomes.not_found)} / {formatCount(poll.outcomes.restricted)}
          </dd>
          <dt class="text-zinc-400">AO3 unavailable</dt>
          <dd class={poll.outcomes.unavailable > 0 ? "text-amber-300" : ""}>
            {formatCount(poll.outcomes.unavailable)}
            {poll.stoppedEarly ? " (poll stopped early)" : ""}
          </dd>
          <dt class="text-zinc-400">Failed</dt>
          <dd class={poll.outcomes.failed > 0 ? "text-amber-300" : ""}>
            {formatCount(poll.outcomes.failed)}
          </dd>
          <dt class="text-zinc-400">Backups</dt>
          <dd>
            {formatCount(poll.backupsUploaded)} uploaded
            {poll.backupsFailed > 0 ? `, ${formatCount(poll.backupsFailed)} failed` : ""}
          </dd>
        </dl>
      ) : (
        <p class="mt-3 text-sm text-zinc-400">No poll has finished since it started.</p>
      )}
      {status.lastError ? (
        <p class="mt-3 text-sm text-rose-200">
          Last error {formatAge(new Date(status.lastError.at), now)}: {status.lastError.message}
        </p>
      ) : null}
    </div>
  );
};

export const AdminDashboardPage: FC<{
  dashboard: AdminDashboard;
  email: string;
  environment: string;
}> = ({ dashboard, email, environment }) => {
  const { stats, settings, checkers, generatedAt: now } = dashboard;
  return (
    <AdminLayout title="Dashboard" active="dashboard" email={email} environment={environment}>
      <Section
        title="Work checker"
        columns={2}
        note={
          settings.enabled
            ? `AO3 fetching: browser checker, ${settings.maxWorksPerPoll} works every ${Math.round(settings.pollIntervalSeconds / 60)} min`
            : "AO3 fetching: Worker cron (the checker is disabled in Settings)"
        }
      >
        {checkers.length === 0 ? (
          <div class={`${cardClass} text-sm text-zinc-400`}>No checker has reported yet.</div>
        ) : (
          checkers.map((checker) => <CheckerCard checker={checker} now={now} />)
        )}
      </Section>
      <Section title="Works">
        <Stat
          label="Stored works"
          value={formatCount(stats.works.stored)}
          detail={`${formatCount(stats.works.deleted)} deleted`}
        />
        <Stat
          label="Due for refresh"
          value={formatCount(stats.works.stale)}
          detail="not refreshed in 6 hours"
          warn={stats.works.stored > 0 && stats.works.stale > stats.works.stored / 2}
        />
        <Stat
          label="Failing refreshes"
          value={formatCount(stats.works.failing)}
          detail="backing off after a failure"
          warn={stats.works.failing > 0}
        />
        <Stat
          label="Refreshed in the last hour"
          value={formatCount(stats.works.refreshedRecently)}
          detail={`latest ${formatAge(stats.works.lastRefreshedAt, now)}`}
        />
      </Section>
      <Section title="Users and tracking">
        <Stat
          label="Users"
          value={formatCount(stats.users.total)}
          detail={`${formatCount(stats.users.recent)} new in 7 days · ${formatCount(stats.users.admins)} admin`}
        />
        <Stat
          label="Tracked works"
          value={formatCount(stats.tracking.trackedWorks)}
          detail={`${formatCount(stats.tracking.trackingRows)} tracking records`}
        />
        <Stat label="Push devices" value={formatCount(stats.devices.pushTokens)} />
      </Section>
      <Section title="Notifications and backups">
        <Stat
          label="Notifications in 24 h"
          value={formatCount(stats.notifications.createdRecently)}
        />
        <Stat
          label="Waiting to send"
          value={formatCount(stats.notifications.pendingDispatch)}
          detail={`${formatCount(stats.notifications.failed)} failed in total`}
          warn={stats.notifications.pendingDispatch > 0}
        />
        <Stat
          label="Backups"
          value={formatCount(stats.backups.count)}
          detail={`${formatBytes(stats.backups.totalBytes)} · latest ${formatAge(stats.backups.lastBackupAt, now)}`}
        />
      </Section>
      <p class="text-xs text-zinc-500">Generated {now.toISOString()}</p>
    </AdminLayout>
  );
};
