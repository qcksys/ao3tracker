import { describe, expect, it } from "vite-plus/test";
import { savedSearchTags } from "../src/dom/saved-search-tags";

describe("saved search tags", () => {
  it("decodes scoped and named tags, removes duplicates and ignores non-tag filters", () => {
    const url =
      "https://archiveofourown.org/tags/Alice*s*Bob/works?" +
      new URLSearchParams({
        "work_search[other_tag_names]": "Fluff, Café,  , Fluff",
        "work_search[relationship_names]": "Alice/Bob",
        "work_search[excluded_tag_names]": "Angst, Major Character Death",
        "work_search[query]": "not a tag",
        "work_search[language_id]": "en",
        "work_search[words_from]": "1000",
        page: "2",
      });
    expect(savedSearchTags(url)).toEqual([
      "Alice/Bob",
      "Fluff",
      "Café",
      "Exclude: Angst",
      "Exclude: Major Character Death",
    ]);
  });

  it("includes bookmark tags and gives numeric IDs explicit labels", () => {
    const url =
      "https://archiveofourown.org/bookmarks?tag_id=Fandom*a*Friends" +
      "&include_bookmark_search[fandom_ids][]=123&include_bookmark_search[fandom_ids][]=456" +
      "&exclude_bookmark_search[relationship_ids][]=789" +
      "&bookmark_search[other_bookmark_tag_names]=Favourites%2C+Read+again" +
      "&bookmark_search[excluded_bookmark_tag_names]=Spoilers" +
      "&bookmark_search[tag_ids][]=42&bookmark_search[excluded_bookmark_tag_ids][]=99";
    expect(savedSearchTags(url)).toEqual([
      "Fandom&Friends",
      "Fandom #123",
      "Fandom #456",
      "Exclude: Relationship #789",
      "Favourites",
      "Read again",
      "Exclude: Spoilers",
      "Tag #42",
      "Exclude: Bookmark tag #99",
    ]);
  });

  it("keeps included and excluded tags distinct and named numeric tags intact", () => {
    expect(
      savedSearchTags(
        "https://archiveofourown.org/works?work_search[tag_names]=1984,Fluff&work_search[excluded_tag_names]=Fluff",
      ),
    ).toEqual(["1984", "Fluff", "Exclude: Fluff"]);
  });

  it("handles empty searches and malformed URLs without breaking the list", () => {
    expect(savedSearchTags("https://archiveofourown.org/works?work_search[query]=hello")).toEqual(
      [],
    );
    expect(savedSearchTags("not a URL")).toEqual([]);
    expect(
      savedSearchTags("https://archiveofourown.org/tags/%ZZ/works?work_search[tag_names]=Fluff"),
    ).toEqual([]);
  });
});
