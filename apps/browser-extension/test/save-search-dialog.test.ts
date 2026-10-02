// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { showSaveSearchDialog } from "../lib/save-search-dialog";

const searches = [
  {
    id: "first",
    name: "Stories",
    url: "https://archiveofourown.org/works",
    deleted: false,
    updatedAt: "2026-10-02T00:00:00Z",
  },
  {
    id: "second",
    name: "Bookmarks",
    url: "https://archiveofourown.org/bookmarks",
    deleted: false,
    updatedAt: "2026-10-02T00:00:00Z",
  },
  {
    id: "deleted",
    name: "Deleted",
    url: "https://archiveofourown.org/works",
    deleted: true,
    updatedAt: "2026-10-02T00:00:00Z",
  },
];
const button = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!;
const submit = () =>
  document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));

afterEach(() => {
  document.body.replaceChildren();
});

describe("save search dialog", () => {
  it("keeps creating a named search as the default", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    showSaveSearchDialog(document, "Suggested filters", searches, save);
    const input = document.querySelector("input")!;
    expect(input.value).toBe("Suggested filters");
    input.value = "  My filters  ";
    input.dispatchEvent(new Event("input"));
    submit();
    await vi.waitFor(() => expect(document.querySelector("dialog")).toBeNull());
    expect(save).toHaveBeenCalledExactlyOnceWith({ kind: "saveSearch", name: "My filters" });
  });

  it("requires an explicit live search selection and updates that ID", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    showSaveSearchDialog(document, "New filters", searches, save);
    button("[data-toggle]").click();
    expect(button('[type="submit"]').disabled).toBe(true);
    const select = document.querySelector("select")!;
    expect(Array.from(select.options, (option) => option.value)).toEqual(["", "first", "second"]);
    select.value = "second";
    select.dispatchEvent(new Event("change"));
    expect(button('[type="submit"]').textContent).toBe("Update");
    submit();
    submit();
    await vi.waitFor(() => expect(document.querySelector("dialog")).toBeNull());
    expect(save).toHaveBeenCalledExactlyOnceWith({ kind: "updateSavedSearch", id: "second" });
  });

  it("allows switching back to a new search and cancelling without saving", () => {
    const save = vi.fn();
    showSaveSearchDialog(document, "Original name", searches, save);
    button("[data-toggle]").click();
    button("[data-toggle]").click();
    expect(document.querySelector("input")!.value).toBe("Original name");
    expect(button('[type="submit"]').textContent).toBe("Save");
    button("[data-cancel]").click();
    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("hides update without live searches and disables blank names", () => {
    showSaveSearchDialog(
      document,
      "   ",
      searches.filter((search) => search.deleted),
      vi.fn(),
    );
    expect(button("[data-toggle]").hidden).toBe(true);
    expect(button('[type="submit"]').disabled).toBe(true);
  });

  it("keeps the selected search after a failure and allows retry", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Search unavailable"))
      .mockResolvedValue(undefined);
    showSaveSearchDialog(document, "Filters", searches, save);
    button("[data-toggle]").click();
    const select = document.querySelector("select")!;
    select.value = "first";
    select.dispatchEvent(new Event("change"));
    submit();
    await vi.waitFor(() => expect(button('[type="submit"]').disabled).toBe(false));
    expect(document.querySelector('[role="alert"]')!.textContent).toBe("Search unavailable");
    expect(select.value).toBe("first");
    submit();
    await vi.waitFor(() => expect(document.querySelector("dialog")).toBeNull());
    expect(save).toHaveBeenCalledTimes(2);
  });
});
