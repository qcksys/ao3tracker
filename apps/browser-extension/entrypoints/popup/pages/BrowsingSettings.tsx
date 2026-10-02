import { useState } from "react";
import { Link } from "react-router";
import type { PopupToBackground } from "@/lib/messaging";
import { normalizeHiddenTags } from "@qcksys/ao3tracker-core/dom";
import languages from "@qcksys/ao3tracker-core/languages";
import { browsingPreferencesSchema } from "@qcksys/ao3tracker-core/schemas";
import { Button } from "@/components/ui/button";
import { EyeOffIcon } from "lucide-react";
import { SettingsSection } from "~popup/components/SettingsSection";
import { Label } from "@/components/ui/label";
import { usePopupState } from "~popup/lib/state";

export function BrowsingSettings() {
  const { state, dispatch } = usePopupState();
  const [draft, setDraft] = useState("");
  const [fandomDraft, setFandomDraft] = useState<string | null>(null);
  const [languageDraft, setLanguageDraft] = useState<{
    searchLanguage: string;
    languageFilterEnabled: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  const preferences = state.browsingPreferences;
  const languageSettings = languageDraft ?? preferences;
  const fandomInput = fandomDraft ?? String(preferences.maxFandoms ?? "");
  const fandomLimit = browsingPreferencesSchema.shape.maxFandoms.safeParse(
    fandomInput.trim() === "" ? null : Number(fandomInput),
  );
  const languageLabel =
    languages.find(({ code }) => code === preferences.searchLanguage)?.label ?? "English";

  const saveFandomLimit = async (): Promise<void> => {
    if (!fandomLimit.success) return;
    setSaving(true);
    setError(null);
    try {
      const result = await dispatch({ kind: "setMaxFandoms", maxFandoms: fandomLimit.data });
      if (!result.ok) setError(result.error);
      else setFandomDraft(null);
    } catch {
      setError("Could not save search preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveLanguage = async (): Promise<void> => {
    if (!languageDraft) return;
    setSaving(true);
    setError(null);
    try {
      const result = await dispatch({ kind: "setSearchLanguage", ...languageDraft });
      if (!result.ok) setError(result.error);
      else setLanguageDraft(null);
    } catch {
      setError("Could not save search preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const save = async (message: PopupToBackground, clearDraft = false): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const result = await dispatch(message);
      if (!result.ok) setError(result.error);
      else if (clearDraft) setDraft("");
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
      summary={`${preferences.languageFilterEnabled ? languageLabel : "All languages"} · ${preferences.maxFandoms ? `Max ${preferences.maxFandoms} fandoms` : "No fandom limit"} · ${preferences.hiddenTags.length} hidden tags · ${preferences.hiddenWorkIds.length} hidden works`}
      icon={EyeOffIcon}
    >
      <p className="text-muted-foreground text-xs">
        Applies to AO3 searches in this browser. Other devices keep their own preferences.
      </p>
      <Label htmlFor="search-language">Search language</Label>
      <select
        id="search-language"
        className="border-input w-full rounded-md border p-2"
        value={languageSettings.searchLanguage}
        disabled={saving}
        onChange={(event) =>
          setLanguageDraft({
            searchLanguage: event.target.value,
            languageFilterEnabled: languageSettings.languageFilterEnabled,
          })
        }
        aria-describedby="search-language-help"
      >
        {languages.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="language-filter-enabled">Filter searches by language</Label>
        <Button
          id="language-filter-enabled"
          variant={languageSettings.languageFilterEnabled ? "default" : "outline"}
          role="switch"
          aria-label="Filter searches by language"
          aria-describedby="search-language-help"
          aria-checked={languageSettings.languageFilterEnabled}
          disabled={saving}
          onClick={() =>
            setLanguageDraft({
              searchLanguage: languageSettings.searchLanguage,
              languageFilterEnabled: !languageSettings.languageFilterEnabled,
            })
          }
        >
          {languageSettings.languageFilterEnabled ? "On" : "Off"}
        </Button>
      </div>
      <p id="search-language-help" className="text-muted-foreground text-xs">
        When enabled, every AO3 work and bookmark search uses this language, replacing any language
        already selected.
      </p>
      <Button
        size="sm"
        disabled={saving || languageDraft === null}
        onClick={() => void saveLanguage()}
      >
        Save language filter
      </Button>
      <Label htmlFor="max-fandoms">Maximum fandoms per work</Label>
      <input
        id="max-fandoms"
        type="number"
        min={1}
        max={2147483647}
        step={1}
        placeholder="No limit"
        className="border-input w-full rounded-md border p-2"
        value={fandomInput}
        disabled={saving}
        onChange={(event) => setFandomDraft(event.target.value)}
        aria-describedby="max-fandoms-help"
        aria-invalid={!fandomLimit.success}
      />
      <p id="max-fandoms-help" className="text-muted-foreground text-xs">
        Leave blank for no limit. Hide works with more fandoms than this in work and bookmark lists.
        Set to 1 to also apply “Exclude crossovers” to work searches. AO3’s result counts stay
        unchanged when works are hidden locally.
      </p>
      {!fandomLimit.success && (
        <p className="text-destructive text-xs">Enter a positive whole number or leave blank.</p>
      )}
      <Button
        size="sm"
        disabled={saving || fandomDraft === null || !fandomLimit.success}
        onClick={() => void saveFandomLimit()}
      >
        Save fandom limit
      </Button>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="hide-caught-up">Hide caught-up and finished works</Label>
        <Button
          id="hide-caught-up"
          role="switch"
          aria-checked={preferences.hideCaughtUp}
          disabled={saving}
          variant={preferences.hideCaughtUp ? "default" : "outline"}
          onClick={() =>
            void save({ kind: "setHideCaughtUp", hideCaughtUp: !preferences.hideCaughtUp })
          }
        >
          {preferences.hideCaughtUp ? "On" : "Off"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Collapse these works in AO3 lists. Works with new chapters stay visible.
      </p>
      <p className="font-medium">Excluded tags</p>
      <div className="flex flex-wrap gap-2">
        {preferences.hiddenTags.map((tag) => (
          <span
            key={tag}
            className="bg-secondary flex max-w-full items-center gap-1 rounded-full px-3 py-1 text-xs"
          >
            <span className="break-words">{tag}</span>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              disabled={saving}
              className="px-1"
              onClick={() =>
                void save({
                  kind: "setHiddenTags",
                  hiddenTags: preferences.hiddenTags.filter((value) => value !== tag),
                })
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving && draft.trim())
            void save(
              {
                kind: "setHiddenTags",
                hiddenTags: normalizeHiddenTags([...preferences.hiddenTags, draft]),
              },
              true,
            );
        }}
      >
        <input
          id="hidden-tags"
          aria-label="Add excluded tags"
          placeholder="Add excluded tags"
          className="border-input min-w-0 flex-1 rounded-md border p-2"
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          aria-describedby="hidden-tags-help"
        />
        <Button size="sm" type="submit" disabled={saving || !draft.trim()}>
          Add tags
        </Button>
      </form>
      <p id="hidden-tags-help" className="text-muted-foreground text-xs">
        Excluded from every work and bookmark search. Add one tag or paste comma-separated tags.
      </p>
      <Link className="text-primary font-medium underline" to="/settings/hidden-works">
        Hidden works ({preferences.hiddenWorkIds.length})
      </Link>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
