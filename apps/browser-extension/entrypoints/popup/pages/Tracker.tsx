import { RefreshCwIcon } from "lucide-react";
import { Link } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { authClient } from "~popup/lib/auth-client";
import { usePopupState } from "~popup/lib/state";

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffMs = Date.now() - ts;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Tracker() {
  const { state, loading, dispatch } = usePopupState();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  if (loading || sessionPending || !state) {
    return <div className="text-muted-foreground text-sm">Loading…</div>;
  }

  if (!session?.user) {
    return (
      <div className="flex h-full flex-col items-start gap-3">
        <h1 className="text-lg font-semibold">Welcome</h1>
        <p className="text-muted-foreground text-sm">
          Sign in to sync your reading position across devices.
        </p>
        <div className="flex gap-2">
          <Link to="/login" className={cn(buttonVariants({ variant: "default" }))}>
            Sign in
          </Link>
          <Link to="/register" className={cn(buttonVariants({ variant: "outline" }))}>
            Register
          </Link>
        </div>
      </div>
    );
  }

  const handleSync = async (): Promise<void> => {
    await dispatch({ kind: "syncNow" });
  };

  const work = state.currentWork;

  return (
    <div className="flex h-full flex-col gap-3">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Tracker</h1>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSync}
          disabled={state.syncing}
          title="Sync now"
        >
          <RefreshCwIcon className={state.syncing ? "animate-spin" : ""} />
          {state.syncing ? "Syncing" : "Sync"}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current work</CardTitle>
        </CardHeader>
        <CardContent>
          {work ? (
            <div className="flex flex-col gap-1">
              <div className="font-medium leading-tight">{work.title ?? `Work ${work.workId}`}</div>
              {work.author ? (
                <div className="text-muted-foreground text-sm">by {work.author}</div>
              ) : null}
              <div className="text-muted-foreground text-sm">
                Progress: {work.progressPercent}% · last read {formatRelative(work.lastReadAt)}
              </div>
              <a
                href={
                  work.chapterId
                    ? `https://archiveofourown.org/works/${work.workId}/chapters/${work.chapterId}`
                    : `https://archiveofourown.org/works/${work.workId}`
                }
                className="text-primary text-sm underline-offset-4 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open on AO3 ↗
              </a>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Open a work on AO3 and we'll start tracking your progress.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="text-muted-foreground text-xs">
        Tracking {state.trackedCount} {state.trackedCount === 1 ? "work" : "works"} ·
        last sync {formatRelative(state.lastSyncedAt)}
        {state.lastSyncError ? (
          <span className="text-destructive block">{state.lastSyncError}</span>
        ) : null}
      </div>
    </div>
  );
}
