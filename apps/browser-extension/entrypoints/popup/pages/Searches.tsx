import { zodResolver } from "@hookform/resolvers/zod";
import { savedSearchTags } from "@qcksys/ao3tracker-core/dom";
import { CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "~popup/lib/auth-client";
import { usePopupState } from "~popup/lib/state";

const renameSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(191),
});
type RenameValues = z.infer<typeof renameSchema>;

export default function Searches() {
  const { state, dispatch } = usePopupState();
  const { data: session } = authClient.useSession();
  const [copyResult, setCopyResult] = useState<{ message: string; error: boolean } | null>(null);

  if (!state) return <div className="text-muted-foreground text-sm">Loading…</div>;
  if (!session?.user) {
    return (
      <p className="text-muted-foreground text-sm">
        Sign in to save and sync searches across devices.
      </p>
    );
  }

  const searches = state.savedSearches.filter((s) => !s.deleted);

  return (
    <div className="flex h-full flex-col gap-3">
      <header>
        <h1 className="text-lg font-semibold">Saved searches</h1>
        <p className="text-muted-foreground text-sm">
          Named AO3 filter URLs. Save one with the “Save this search” button on any AO3 works or
          bookmarks listing. Syncs across devices.
        </p>
      </header>
      {copyResult && (
        <p
          role={copyResult.error ? "alert" : "status"}
          className={
            copyResult.error ? "text-destructive text-xs" : "text-muted-foreground text-xs"
          }
        >
          {copyResult.message}
        </p>
      )}
      {searches.length === 0 ? (
        <p className="text-muted-foreground text-xs">No saved searches yet.</p>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto">
          {searches.map((s) => {
            const tags = savedSearchTags(s.url);
            return (
              <div key={s.id} className="bg-muted/50 flex flex-col gap-1 rounded px-2 py-2 text-sm">
                <button
                  type="button"
                  className="w-full text-left font-medium wrap-anywhere hover:underline"
                  title={s.url}
                  onClick={() => {
                    void browser.tabs.create({ url: s.url });
                  }}
                >
                  {s.name}
                </button>
                {tags.length > 0 && (
                  <ul
                    aria-label={`Tags in ${s.name}`}
                    className="flex flex-wrap gap-1 text-[10px] leading-[14px]"
                  >
                    {tags.slice(0, 5).map((tag) => (
                      <li
                        key={tag}
                        className="bg-background text-muted-foreground max-w-full rounded px-1 py-px wrap-anywhere"
                      >
                        {tag}
                      </li>
                    ))}
                    {tags.length > 5 && (
                      <li className="text-muted-foreground px-1 py-px">+{tags.length - 5} more</li>
                    )}
                  </ul>
                )}
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Copy link for ${s.name}`}
                    title="Copy link"
                    onClick={async () => {
                      setCopyResult(null);
                      try {
                        await navigator.clipboard.writeText(s.url);
                        setCopyResult({ message: "Link copied", error: false });
                      } catch {
                        setCopyResult({ message: "Couldn't copy link. Try again.", error: true });
                      }
                    }}
                  >
                    <CopyIcon />
                  </Button>
                  <RenameSearchDialog
                    currentName={s.name}
                    onRename={(name) => dispatch({ kind: "renameSavedSearch", id: s.id, name })}
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Delete ${s.name}`}
                    onClick={() => {
                      void dispatch({ kind: "deleteSavedSearch", id: s.id });
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RenameSearchDialog({
  currentName,
  onRename,
}: {
  currentName: string;
  onRename: (name: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<RenameValues>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: currentName },
  });

  const onSubmit = async (values: RenameValues): Promise<void> => {
    await onRename(values.name.trim());
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset({ name: currentName });
      }}
    >
      <DialogTrigger
        render={<Button size="icon-xs" variant="ghost" aria-label={`Rename ${currentName}`} />}
      >
        <PencilIcon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename search</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
