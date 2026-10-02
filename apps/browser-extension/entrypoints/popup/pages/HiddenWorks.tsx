import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { usePopupState } from "~popup/lib/state";

export default function HiddenWorks() {
  const { state, dispatch } = usePopupState();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  const { hiddenWorkIds, hiddenWorkTitles } = state.browsingPreferences;
  const search = query.trim().toLocaleLowerCase();
  const works = hiddenWorkIds
    .map((id) => ({ id, title: hiddenWorkTitles[id] || `Work ${id}` }))
    .filter(
      ({ id, title }) => title.toLocaleLowerCase().includes(search) || String(id).includes(search),
    );

  const unhide = async (workId: number) => {
    setSaving(true);
    setError(null);
    try {
      const result = await dispatch({ kind: "unhideWork", workId });
      if (!result.ok) setError(result.error);
    } catch {
      setError("Could not unhide this work. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Link className="text-primary text-sm underline" to="/settings">
        Back to Settings
      </Link>
      <h1 className="text-lg font-semibold">Hidden works ({hiddenWorkIds.length})</h1>
      <input
        type="search"
        aria-label="Search hidden works"
        placeholder="Search by title or work ID"
        className="border-input rounded-md border p-2"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      {works.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {hiddenWorkIds.length === 0 ? "No hidden works." : "No matching hidden works."}
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {works.map(({ id, title }) => (
          <li key={id} className="flex items-center justify-between gap-3 py-3">
            <a
              className="text-primary min-w-0 break-words underline"
              href={`https://archiveofourown.org/works/${id}`}
              target="_blank"
              rel="noreferrer"
            >
              {title}
            </a>
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              aria-label={`Unhide ${title}`}
              onClick={() => void unhide(id)}
            >
              Unhide
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
