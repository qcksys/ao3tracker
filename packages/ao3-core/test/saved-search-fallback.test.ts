import { expect, it } from "vite-plus/test";
import { suggestSavedSearchName } from "~/dom";

it("retains exclusions without facet labels and keeps collection names over numeric IDs", () => {
  const doc = document.implementation.createHTMLDocument();
  expect(
    suggestSavedSearchName(
      doc,
      "https://archiveofourown.org/collections/Favorites/works?collection_id=123&exclude_work_search[fandom_ids][]=456",
    ),
  ).toBe("Collection: Favorites · Exclude: 456");
});

it("preserves numeric tag suffixes while removing separate result counts", () => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<form id="work-filters"><label>
    <input type="checkbox" name="include_work_search[fandom_ids][]" value="1">
    Dune (1984) <span class="count">(123)</span>
  </label></form>`;
  expect(
    suggestSavedSearchName(
      doc,
      "https://archiveofourown.org/works?include_work_search[fandom_ids][]=1",
    ),
  ).toBe("Include: Dune (1984)");
});
