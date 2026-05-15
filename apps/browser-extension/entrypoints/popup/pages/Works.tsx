import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type FavouriteTagItem,
  type SyncTagMetadata,
  type SyncWorkMetadata,
  type WorkBadgeStatus,
  formatBadge,
  tagTypeIdToName,
} from "@qcksys/ao3tracker-core";
import { ArrowDownIcon, ArrowUpIcon, StarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  favouriteTagsItem,
  type TrackedChapter,
  type TrackedWork,
  tagMetadataItem,
  trackedChaptersItem,
  trackedWorksItem,
  workMetadataItem,
} from "@/lib/storage";
import {
  applyFilters,
  applySort,
  buildWorksList,
  SORT_FIELD_LABELS,
  STATUS_LABELS,
  type SortField,
  type SortOrder,
  type WorksFilterState,
  type WorksListRow,
  type WorksSortState,
} from "@/lib/works-view";
import { authClient } from "~popup/lib/auth-client";

const ALL_STATUSES: WorkBadgeStatus[] = [
  "not-started",
  "in-progress",
  "caught-up",
  "finished",
  "has-new-chapters",
  "private",
];

const SORT_OPTIONS: SortField[] = [
  "lastRead",
  "title",
  "author",
  "wordCount",
  "hits",
  "kudos",
  "bookmarks",
  "comments",
  "currentChapters",
  "published",
  "updated",
];

function formatCompactNumber(n: number | null): string {
  if (n === null) return "?";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

function chapterProgress(row: WorksListRow): string {
  const current = row.currentChapters ?? "?";
  const total = row.totalChapters ?? "?";
  return `${current}/${total}`;
}

interface RawData {
  works: Record<number, TrackedWork>;
  metadata: Record<number, SyncWorkMetadata>;
  chapters: Record<string, TrackedChapter>;
  tagMetadata: SyncTagMetadata[];
  favouriteTags: FavouriteTagItem[];
}

export default function Works() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [raw, setRaw] = useState<RawData | null>(null);
  const [filter, setFilter] = useState<WorksFilterState>({
    searchQuery: "",
    statuses: [],
    favouritesOnly: false,
    subscribedOnly: false,
    includeTags: new Set(),
  });
  const [sort, setSort] = useState<WorksSortState>({
    field: "lastRead",
    order: "desc",
  });
  const [showFilters, setShowFilters] = useState(false);

  const refresh = useCallback(async () => {
    const [works, metadata, chapters, tagMetadata, favouriteTags] =
      await Promise.all([
        trackedWorksItem.getValue(),
        workMetadataItem.getValue(),
        trackedChaptersItem.getValue(),
        tagMetadataItem.getValue(),
        favouriteTagsItem.getValue(),
      ]);
    setRaw({ works, metadata, chapters, tagMetadata, favouriteTags });
  }, []);

  useEffect(() => {
    void refresh();
    const handler = (): void => void refresh();
    browser.storage.local.onChanged.addListener(handler);
    return () => browser.storage.local.onChanged.removeListener(handler);
  }, [refresh]);

  const rows: WorksListRow[] = useMemo(() => {
    if (!raw) return [];
    return buildWorksList(raw);
  }, [raw]);

  const filteredAndSorted = useMemo(() => {
    return applySort(applyFilters(rows, filter), sort);
  }, [rows, filter, sort]);

  const pinnedTags = useMemo(() => {
    if (!raw) return [];
    return raw.favouriteTags
      .filter((t) => t.favourited)
      .map((t) => ({ ...t, typeName: tagTypeIdToName(t.tagType) }));
  }, [raw]);

  if (sessionPending) {
    return <div className="text-muted-foreground text-sm">Loading…</div>;
  }
  if (!session?.user) {
    return (
      <p className="text-muted-foreground text-sm">
        Sign in to view your tracked works.
      </p>
    );
  }

  const toggleStatus = (status: WorkBadgeStatus): void => {
    setFilter((f) => ({
      ...f,
      statuses: f.statuses.includes(status)
        ? f.statuses.filter((s) => s !== status)
        : [...f.statuses, status],
    }));
  };

  const toggleTag = (tag: string): void => {
    setFilter((f) => {
      const next = new Set(f.includeTags);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return { ...f, includeTags: next };
    });
  };

  const clearFilters = (): void => {
    setFilter({
      searchQuery: "",
      statuses: [],
      favouritesOnly: false,
      subscribedOnly: false,
      includeTags: new Set(),
    });
  };

  const hasActiveFilters =
    filter.searchQuery.trim().length > 0 ||
    filter.statuses.length > 0 ||
    filter.favouritesOnly ||
    filter.subscribedOnly ||
    filter.includeTags.size > 0;

  return (
    <div className="flex h-full flex-col gap-2">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Works</h1>
        <div className="text-muted-foreground text-xs">
          {filteredAndSorted.length} / {rows.length}
        </div>
      </header>

      <Input
        placeholder="Search title or author"
        value={filter.searchQuery}
        onChange={(e) =>
          setFilter((f) => ({ ...f, searchQuery: e.target.value }))
        }
      />

      <div className="flex items-center gap-1">
        <Select
          value={sort.field}
          onValueChange={(v) =>
            setSort((s) => ({ ...s, field: v as SortField }))
          }
        >
          <SelectTrigger size="sm" className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((field) => (
              <SelectItem key={field} value={field}>
                {SORT_FIELD_LABELS[field]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setSort((s) => ({
              ...s,
              order: s.order === "asc" ? "desc" : "asc",
            }))
          }
          title={sort.order === "asc" ? "Ascending" : "Descending"}
        >
          {sort.order === "asc" ? (
            <ArrowUpIcon className="size-3" />
          ) : (
            <ArrowDownIcon className="size-3" />
          )}
        </Button>
        <Button
          size="sm"
          variant={showFilters ? "default" : "outline"}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filter
        </Button>
      </div>

      {showFilters ? (
        <div className="border-border bg-muted/40 flex flex-col gap-2 rounded border p-2">
          <div className="flex flex-wrap gap-1">
            <Button
              size="xs"
              variant={filter.favouritesOnly ? "default" : "outline"}
              onClick={() =>
                setFilter((f) => ({ ...f, favouritesOnly: !f.favouritesOnly }))
              }
            >
              ★ Favourites
            </Button>
            <Button
              size="xs"
              variant={filter.subscribedOnly ? "default" : "outline"}
              onClick={() =>
                setFilter((f) => ({ ...f, subscribedOnly: !f.subscribedOnly }))
              }
            >
              Subscribed
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_STATUSES.map((s) => (
              <Button
                key={s}
                size="xs"
                variant={filter.statuses.includes(s) ? "default" : "outline"}
                onClick={() => toggleStatus(s)}
              >
                {STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
          {pinnedTags.length > 0 ? (
            <div>
              <div className="text-muted-foreground mb-1 text-xs">
                Pinned tags
              </div>
              <div className="flex flex-wrap gap-1">
                {pinnedTags.map((t) => (
                  <Button
                    key={`${t.tagType}-${t.tag}`}
                    size="xs"
                    variant={
                      filter.includeTags.has(t.tag) ? "default" : "outline"
                    }
                    onClick={() => toggleTag(t.tag)}
                    className="capitalize"
                    title={t.typeName}
                  >
                    {t.tag}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {hasActiveFilters ? (
            <Button size="xs" variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No tracked works yet. Open a work on AO3 to start tracking.
          </p>
        ) : filteredAndSorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No works match the current filters.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {filteredAndSorted.map((row) => (
              <WorkRow key={row.workId} row={row} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WorkRow({ row }: { row: WorksListRow }) {
  const badge = formatBadge({
    id: row.workId,
    status: row.status,
    progressPercent: row.progressPercent,
    favourite: row.favourite,
  });
  return (
    <li className="border-border bg-card/60 rounded border p-2">
      <div className="flex items-start justify-between gap-2">
        <a
          href={`https://archiveofourown.org/works/${row.workId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary line-clamp-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          {row.title ?? `Work ${row.workId}`}
        </a>
        {row.favourite ? (
          <StarIcon className="size-3 shrink-0 fill-yellow-400 text-yellow-400" />
        ) : null}
      </div>
      {row.author ? (
        <div className="text-muted-foreground text-xs">by {row.author}</div>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold text-white",
          )}
          style={{ background: badge.color }}
        >
          {badge.label}
        </span>
        <span className="text-muted-foreground">
          {chapterProgress(row)} ch · {formatCompactNumber(row.wordCount)} words
        </span>
        {row.kudos !== null ? (
          <span className="text-muted-foreground">
            {formatCompactNumber(row.kudos)} kudos
          </span>
        ) : null}
      </div>
    </li>
  );
}
