import { useMemo } from "react";
import { type TagTypeName, tagTypeIdToName } from "@qcksys/ao3tracker-core";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "~popup/lib/auth-client";
import { usePopupState } from "~popup/lib/state";

const SECTION_ORDER: TagTypeName[] = [
  "fandom",
  "relationship",
  "character",
  "freeform",
  "warning",
  "category",
  "rating",
];

export default function Lists() {
  const { state, dispatch } = usePopupState();
  const { data: session } = authClient.useSession();

  const grouped = useMemo(() => {
    const map = new Map<TagTypeName, { tag: string; favourited: boolean }[]>();
    for (const row of state?.favouriteTags ?? []) {
      const name = tagTypeIdToName(row.tagType);
      const list = map.get(name) ?? [];
      list.push({ tag: row.tag, favourited: row.favourited });
      map.set(name, list);
    }
    return map;
  }, [state?.favouriteTags]);

  if (!state) return <div className="text-muted-foreground text-sm">Loading…</div>;
  if (!session?.user) {
    return (
      <p className="text-muted-foreground text-sm">
        Sign in to manage favourite tags across devices.
      </p>
    );
  }

  const liveTags = (name: TagTypeName): { tag: string; favourited: boolean }[] =>
    (grouped.get(name) ?? []).filter((r) => r.favourited);

  return (
    <div className="flex h-full flex-col gap-3">
      <header>
        <h1 className="text-lg font-semibold">Favourites</h1>
        <p className="text-muted-foreground text-sm">
          Tag chips pinned to the top of AO3 filter sheets. Syncs across devices.
        </p>
      </header>
      <Tabs defaultValue={SECTION_ORDER[0]} className="flex-1 overflow-hidden">
        <TabsList className="flex w-full flex-wrap">
          {SECTION_ORDER.map((name) => (
            <TabsTrigger key={name} value={name} className="text-xs capitalize">
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
        {SECTION_ORDER.map((name) => (
          <TabsContent key={name} value={name} className="mt-2 flex flex-col gap-1 overflow-y-auto">
            {liveTags(name).length === 0 ? (
              <p className="text-muted-foreground text-xs">No favourite {name} tags yet.</p>
            ) : (
              liveTags(name).map((row) => (
                <div
                  key={`${name}-${row.tag}`}
                  className="bg-muted/50 flex items-center justify-between rounded px-2 py-1 text-sm"
                >
                  <span className="truncate">{row.tag}</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      void dispatch({
                        kind: "toggleFavouriteTag",
                        tagType: state.favouriteTags.find(
                          (f) => tagTypeIdToName(f.tagType) === name && f.tag === row.tag,
                        )!.tagType,
                        tag: row.tag,
                        favourited: false,
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
