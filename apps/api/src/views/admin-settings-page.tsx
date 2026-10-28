import type { FC } from "hono/jsx";
import { AdminLayout, buttonClass, cardClass, inputClass } from "~/views/admin-layout";

/** Form values as submitted, so a rejected form keeps what the admin typed */
export interface WorkCheckerSettingsForm {
  enabled: boolean;
  pollIntervalSeconds: string;
  maxWorksPerPoll: string;
  delayBetweenRequestsMs: string;
}

const NumberField: FC<{
  name: keyof WorkCheckerSettingsForm;
  label: string;
  hint: string;
  value: string;
  min: number;
  max: number;
}> = (props) => (
  <div>
    <label for={props.name} class="mb-1 block text-sm text-zinc-200">
      {props.label}
    </label>
    <input
      id={props.name}
      name={props.name}
      type="number"
      inputmode="numeric"
      min={props.min}
      max={props.max}
      step={1}
      required
      value={props.value}
      class={inputClass}
    />
    <p class="mt-1 text-xs text-zinc-400">{props.hint}</p>
  </div>
);

export const AdminSettingsPage: FC<{
  form: WorkCheckerSettingsForm;
  email: string;
  environment: string;
  saved?: boolean;
  errors?: string[];
}> = (props) => (
  <AdminLayout
    title="Settings"
    active="settings"
    email={props.email}
    environment={props.environment}
  >
    <form method="post" action="/admin/settings" class={`${cardClass} max-w-xl space-y-5`}>
      <div>
        <h2 class="text-lg font-semibold">Work checker</h2>
        <p class="mt-1 text-sm text-zinc-400">
          Saved changes apply on the next cron run and the checker's next poll. No deployment is
          needed.
        </p>
      </div>
      {props.saved ? (
        <p class="rounded-md bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          Settings saved.
        </p>
      ) : null}
      {props.errors?.length ? (
        <ul class="rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
          {props.errors.map((error) => (
            <li>{error}</li>
          ))}
        </ul>
      ) : null}
      <label class="flex items-start gap-3">
        <input
          name="enabled"
          type="checkbox"
          checked={props.form.enabled}
          class="mt-1 h-4 w-4 accent-[#9d4edd]"
        />
        <span>
          <span class="block text-sm text-zinc-200">Fetch AO3 through the browser checker</span>
          <span class="block text-xs text-zinc-400">
            Off: the Worker cron fetches from AO3 itself, and the checker idles.
          </span>
        </span>
      </label>
      <NumberField
        name="pollIntervalSeconds"
        label="Poll interval (seconds)"
        hint="How long the checker waits between polls. 30 to 86,400."
        value={props.form.pollIntervalSeconds}
        min={30}
        max={86_400}
      />
      <NumberField
        name="maxWorksPerPoll"
        label="Works per poll"
        hint="Keep a poll well inside the 30-minute refresh lease. 1 to 100."
        value={props.form.maxWorksPerPoll}
        min={1}
        max={100}
      />
      <NumberField
        name="delayBetweenRequestsMs"
        label="Delay between AO3 requests (ms)"
        hint="Spacing between page loads and downloads. 0 to 600,000."
        value={props.form.delayBetweenRequestsMs}
        min={0}
        max={600_000}
      />
      <button type="submit" class={buttonClass}>
        Save settings
      </button>
    </form>
  </AdminLayout>
);
