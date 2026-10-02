import { useState } from "react";
import { Accordion } from "@base-ui/react/accordion";
import { BellIcon, CodeIcon } from "lucide-react";
import type { NotificationPreferences } from "@qcksys/ao3tracker-core/schemas";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setAuthToken } from "@/lib/auth-token-cache";
import { apiBaseUrlPresets, availableApiBaseUrlPresets } from "@/lib/storage";
import { authClient } from "~popup/lib/auth-client";
import { SettingsSection } from "~popup/components/SettingsSection";
import { usePopupState } from "~popup/lib/state";
import { BrowsingSettings } from "./BrowsingSettings";

const notificationOptions: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: "enabled",
    label: "Enable notifications",
    description: "Show alerts in this browser only.",
  },
  {
    key: "new_chapters",
    label: "New chapters",
    description: "A subscribed work has new chapters.",
  },
  {
    key: "work_completed",
    label: "Completed works",
    description: "A subscribed work is marked complete.",
  },
  {
    key: "work_restricted",
    label: "Restricted works",
    description: "A subscribed work now requires an AO3 sign-in.",
  },
  {
    key: "work_deleted",
    label: "Deleted works",
    description: "A subscribed work is no longer available on AO3.",
  },
];

export default function Settings() {
  const { state, dispatch } = usePopupState();
  const { data: session } = authClient.useSession();
  const activePreset = state
    ? apiBaseUrlPresets.find((p) => p.url === state.apiBaseUrl)
    : undefined;
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);

  if (!state) return <div className="text-muted-foreground text-sm">Loading…</div>;

  const selectedId = draftId ?? activePreset?.id ?? null;
  const selectedPreset = availableApiBaseUrlPresets.find((p) => p.id === selectedId);
  const canSave = selectedPreset !== undefined && selectedPreset.url !== state.apiBaseUrl;

  const onSignOut = async (): Promise<void> => {
    await authClient.signOut();
    await setAuthToken(null);
  };

  const onNotificationChange = async (key: keyof NotificationPreferences, enabled: boolean) => {
    setSavingNotifications(true);
    setNotificationError(null);
    try {
      const result = await dispatch({ kind: "setNotificationPreference", key, enabled });
      if (!result.ok) setNotificationError(result.error);
    } catch {
      setNotificationError("Could not save notification settings. Please try again.");
    } finally {
      setSavingNotifications(false);
    }
  };

  const onAddPasskey = async (): Promise<void> => {
    await authClient.passkey.addPasskey();
  };

  const onSaveApiUrl = async (): Promise<void> => {
    if (!selectedPreset) return;
    const res = await dispatch({
      kind: "setApiBaseUrl",
      baseUrl: selectedPreset.url,
    });
    if (res.ok) {
      // Better Auth captures `baseURL` at construction time, so we reload the
      // popup to rebuild the auth client against the new endpoint.
      window.location.reload();
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-2">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h2>Account</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {session?.user ? (
            <>
              <div>
                Signed in as{" "}
                <span className="font-medium">{session.user.name || session.user.email}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={onSignOut}>
                  Sign out
                </Button>
                <Button size="sm" variant="outline" onClick={onAddPasskey}>
                  Add passkey
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Not signed in.</p>
          )}
        </CardContent>
      </Card>

      <Accordion.Root multiple className="flex flex-col gap-3">
        <BrowsingSettings />
        <SettingsSection
          id="notifications"
          title="Notifications"
          summary={
            savingNotifications
              ? "Saving notification settings…"
              : state.notificationPreferences.enabled
                ? "On in this browser · Choose alert types"
                : "Off in this browser"
          }
          icon={BellIcon}
        >
          <p className="text-muted-foreground text-xs">
            These settings apply only to this browser. Other devices keep their own settings.
          </p>
          {notificationOptions.map(({ key, label, description }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
            >
              <div className="flex-1">
                <Label htmlFor={`notification-${key}`}>{label}</Label>
                <p id={`notification-${key}-description`} className="text-muted-foreground text-xs">
                  {description}
                </p>
              </div>
              <Button
                id={`notification-${key}`}
                role="switch"
                aria-checked={state.notificationPreferences[key]}
                aria-label={label}
                aria-describedby={`notification-${key}-description`}
                size="sm"
                disabled={
                  savingNotifications ||
                  (key !== "enabled" && !state.notificationPreferences.enabled)
                }
                variant={state.notificationPreferences[key] ? "default" : "outline"}
                onClick={() => void onNotificationChange(key, !state.notificationPreferences[key])}
              >
                {state.notificationPreferences[key] ? "On" : "Off"}
              </Button>
            </div>
          ))}
          {!session?.user && (
            <p className="text-muted-foreground text-xs">
              Sign in to receive notifications for subscribed works.
            </p>
          )}
          {notificationError && (
            <p role="alert" className="text-destructive text-xs">
              {notificationError}
            </p>
          )}
        </SettingsSection>

        <SettingsSection
          id="advanced"
          title="Advanced"
          summary={`${activePreset?.label ?? "Custom environment"} · API endpoint`}
          icon={CodeIcon}
        >
          <Label htmlFor="apiBaseUrl">Environment</Label>
          <Select
            value={selectedId ?? undefined}
            onValueChange={(value) => setDraftId(value as string)}
          >
            <SelectTrigger id="apiBaseUrl" className="w-full">
              <SelectValue placeholder="Pick an environment" />
            </SelectTrigger>
            <SelectContent>
              {availableApiBaseUrlPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs break-all">
            {selectedPreset && selectedPreset.url !== state.apiBaseUrl ? (
              <>
                Active: <span className="font-mono">{state.apiBaseUrl}</span>
                <br />
                After save: <span className="font-mono">{selectedPreset.url}</span>
              </>
            ) : (
              <>
                Active: <span className="font-mono">{state.apiBaseUrl}</span>
              </>
            )}
          </p>
          <Button size="sm" disabled={!canSave} onClick={onSaveApiUrl}>
            Save
          </Button>
        </SettingsSection>
      </Accordion.Root>
    </div>
  );
}
