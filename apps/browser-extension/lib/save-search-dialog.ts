import type { SavedSearchItem } from "@qcksys/ao3tracker-core/schemas";

type SaveSearchChoice =
  | { kind: "saveSearch"; name: string }
  | { kind: "updateSavedSearch"; id: string };

export function showSaveSearchDialog(
  doc: Document,
  suggestedName: string,
  searches: ReadonlyArray<SavedSearchItem>,
  onSave: (choice: SaveSearchChoice) => Promise<void>,
): () => void {
  const dialog = doc.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "ao3-tracker-save-title");
  dialog.style.cssText =
    "box-sizing: border-box; width: min(28rem, calc(100vw - 2rem)); max-height: calc(100vh - 2rem); overflow: auto; padding: 1.5rem; border-radius: .5rem;";
  dialog.innerHTML = `
    <form style="display: flex; flex-direction: column; gap: 1rem; margin: 0;">
      <h3 id="ao3-tracker-save-title">Save this search</h3>
      <label data-name>Name <input name="name" maxlength="191" required style="box-sizing: border-box; width: 100%;"></label>
      <div data-update hidden>
        <p>Update saved search to match the current filters. Its name stays the same.</p>
        <label>Saved search <select name="search" style="width: 100%;"><option value="">Choose saved search</option></select></label>
      </div>
      <button type="button" data-toggle>Update saved search to match</button>
      <p role="alert" hidden></p>
      <div>
        <button type="submit">Save</button>
        <button type="button" data-cancel>Cancel</button>
      </div>
    </form>`;
  const form = dialog.querySelector("form")!;
  const name = dialog.querySelector("input")!;
  const nameField = dialog.querySelector<HTMLElement>("[data-name]")!;
  const updateField = dialog.querySelector<HTMLElement>("[data-update]")!;
  const select = dialog.querySelector("select")!;
  const toggle = dialog.querySelector<HTMLButtonElement>("[data-toggle]")!;
  const submit = dialog.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const cancel = dialog.querySelector<HTMLButtonElement>("[data-cancel]")!;
  const error = dialog.querySelector<HTMLElement>('[role="alert"]')!;
  const liveSearches = searches.filter((search) => !search.deleted);
  for (const search of liveSearches) {
    const option = doc.createElement("option");
    option.value = search.id;
    option.textContent = `${search.name} — ${search.url}`;
    select.append(option);
  }
  name.value = suggestedName.slice(0, 191);
  toggle.hidden = liveSearches.length === 0;
  let updating = false;
  let saving = false;
  const refresh = () => {
    nameField.hidden = updating;
    name.disabled = updating || saving;
    updateField.hidden = !updating;
    select.disabled = !updating || saving;
    toggle.textContent = updating ? "Save as new search instead" : "Update saved search to match";
    toggle.disabled = saving;
    cancel.disabled = saving;
    submit.textContent = saving ? "Saving…" : updating ? "Update" : "Save";
    submit.disabled = saving || (updating ? !select.value : !name.value.trim());
  };
  const dismiss = () => {
    dialog.close();
    dialog.remove();
  };
  toggle.addEventListener("click", () => {
    updating = !updating;
    error.hidden = true;
    refresh();
    (updating ? select : name).focus();
  });
  name.addEventListener("input", refresh);
  select.addEventListener("change", refresh);
  cancel.addEventListener("click", dismiss);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!saving) dismiss();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const choice: SaveSearchChoice = updating
      ? { kind: "updateSavedSearch", id: select.value }
      : { kind: "saveSearch", name: name.value.trim() };
    saving = true;
    error.hidden = true;
    refresh();
    void onSave(choice)
      .then(dismiss)
      .catch((reason: unknown) => {
        error.textContent =
          reason instanceof Error ? reason.message : "Could not save. Please try again.";
        error.hidden = false;
        saving = false;
        refresh();
      });
  });
  refresh();
  doc.body.append(dialog);
  dialog.showModal();
  name.focus();
  return dismiss;
}
