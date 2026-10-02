import { useState } from "react";
import { normalizeHiddenTags } from "@qcksys/ao3tracker-core/dom";
import { Button } from "@/components/ui/button";
import { EyeOffIcon } from "lucide-react";
import { SettingsSection } from "~popup/components/SettingsSection";
import { Label } from "@/components/ui/label";
import { usePopupState } from "~popup/lib/state";

export function BrowsingSettings() {
  const { state, dispatch } = usePopupState();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  const preferences = state.browsingPreferences;

  const save = async (workId?: number): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const result = await dispatch(
        workId === undefined
          ? {
              kind: "setHiddenTags",
              hiddenTags: normalizeHiddenTags([draft ?? preferences.hiddenTags.join("\n")]),
            }
          : { kind: "unhideWork", workId },
      );
      if (!result.ok) setError(result.error);
      else if (workId === undefined) setDraft(null);
    } catch {
      setError("Could not save search preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      id="search-preferences"
      title="Search preferences"
      summary={`${preferences.hiddenTags.length} hidden tags · ${preferences.hiddenWorkIds.length} hidden works`}
      icon={EyeOffIcon}
    >
      <p className="text-muted-foreground text-xs">
        Applies to AO3 searches in this browser. Other devices keep their own preferences.
      </p>
      <Label htmlFor="hidden-tags">Default hidden tags</Label>
      <textarea
        id="hidden-tags"
        className="border-input rounded-md border p-2"
        rows={4}
        value={draft ?? preferences.hiddenTags.join("\n")}
        onChange={(event) => setDraft(event.target.value)}
        aria-describedby="hidden-tags-help"
      />
      <p id="hidden-tags-help" className="text-muted-foreground text-xs">
        One tag per line, or separated by commas. Added to every work and bookmark search.
      </p>
      <Button size="sm" disabled={saving || draft === null} onClick={() => void save()}>
        Save hidden tags
      </Button>
      <p className="font-medium">Hidden works ({preferences.hiddenWorkIds.length})</p>
      {preferences.hiddenWorkIds.length === 0 && (
        <p className="text-muted-foreground text-xs">
          Use “Hide work” on an AO3 result to hide it from lists.
        </p>
      )}
      {preferences.hiddenWorkIds.map((workId) => (
        <div key={workId} className="flex items-center justify-between gap-2">
          <a href={`https://archiveofourown.org/works/${workId}`} target="_blank" rel="noreferrer">
            Work {workId}
          </a>
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void save(workId)}
            aria-label={`Unhide work ${workId}`}
          >
            Unhide
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
