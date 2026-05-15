import { useState } from "react";

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
import { apiBaseUrlPresets } from "@/lib/storage";
import { authClient } from "~popup/lib/auth-client";
import { usePopupState } from "~popup/lib/state";

export default function Settings() {
  const { state, dispatch } = usePopupState();
  const { data: session } = authClient.useSession();
  const activePreset = state
    ? apiBaseUrlPresets.find((p) => p.url === state.apiBaseUrl)
    : undefined;
  const [draftId, setDraftId] = useState<string | null>(null);

  if (!state) return <div className="text-muted-foreground text-sm">Loading…</div>;

  const selectedId = draftId ?? activePreset?.id ?? null;
  const selectedPreset = apiBaseUrlPresets.find((p) => p.id === selectedId);
  const canSave =
    selectedPreset !== undefined && selectedPreset.url !== state.apiBaseUrl;

  const onSignOut = async (): Promise<void> => {
    await authClient.signOut();
    await setAuthToken(null);
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
    <div className="flex h-full flex-col gap-3">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {session?.user ? (
            <>
              <div>
                Signed in as{" "}
                <span className="font-medium">
                  {session.user.name || session.user.email}
                </span>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <div>Push notifications</div>
              <p className="text-muted-foreground text-xs">
                Show alerts for new chapters and completed works on your
                tracked subscriptions.
              </p>
            </div>
            <Button
              size="sm"
              variant={state.notificationsEnabled ? "default" : "outline"}
              onClick={() =>
                void dispatch({
                  kind: "setNotificationsEnabled",
                  enabled: !state.notificationsEnabled,
                })
              }
            >
              {state.notificationsEnabled ? "On" : "Off"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API endpoint</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="apiBaseUrl">Environment</Label>
          <Select
            value={selectedId ?? undefined}
            onValueChange={(value) => setDraftId(value as string)}
          >
            <SelectTrigger id="apiBaseUrl" className="w-full">
              <SelectValue placeholder="Pick an environment" />
            </SelectTrigger>
            <SelectContent>
              {apiBaseUrlPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {selectedPreset && selectedPreset.url !== state.apiBaseUrl ? (
              <>
                Active: <span className="font-mono">{state.apiBaseUrl}</span>
                <br />
                After save:{" "}
                <span className="font-mono">{selectedPreset.url}</span>
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
        </CardContent>
      </Card>
    </div>
  );
}
