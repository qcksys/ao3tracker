import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePopupState } from "~popup/lib/state";

export default function Settings() {
  const { state, dispatch } = usePopupState();
  const [baseUrlDraft, setBaseUrlDraft] = useState<string>("");

  if (!state) return <div className="text-muted-foreground text-sm">Loading…</div>;

  const currentBaseUrl = baseUrlDraft || state.apiBaseUrl;

  return (
    <div className="flex h-full flex-col gap-3">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {state.authenticated ? (
            <>
              <div>
                Signed in as{" "}
                <span className="font-medium">
                  {state.user?.name ?? state.user?.email ?? "unknown"}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void dispatch({ kind: "signOut" });
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">Not signed in.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API endpoint</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="apiBaseUrl">Base URL</Label>
          <Input
            id="apiBaseUrl"
            value={currentBaseUrl}
            onChange={(e) => setBaseUrlDraft(e.target.value)}
          />
          <Button
            size="sm"
            disabled={baseUrlDraft.length === 0 || baseUrlDraft === state.apiBaseUrl}
            onClick={() => {
              void dispatch({ kind: "setApiBaseUrl", baseUrl: baseUrlDraft });
            }}
          >
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
