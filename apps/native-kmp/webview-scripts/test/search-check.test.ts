import type { SearchCheckMessage } from "@qcksys/ao3tracker-core/schemas";
import { describe, expect, it, vi } from "vite-plus/test";
import { checkSearch } from "../src/search-check";

const url = "https://archiveofourown.org/works";
const page = (ids: number[], next?: string, viewer = "reader") => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<div id="greeting"><a href="/users/${viewer}">Me</a></div>
    <div id="main"><ol class="work index">${ids.map((id) => `<li id="work_${id}"></li>`).join("")}</ol>
    ${next ? `<a rel="next" href="${next}">Next</a>` : ""}</div>`;
  return doc;
};
const pause = async () => {};

describe("local saved search checks", () => {
  it("reads all pages and counts each visible work only once", async () => {
    const messages: SearchCheckMessage[] = [];
    const load = vi.fn(async () => page([2, 3, 4]));
    await checkSearch(
      page([1, 2], "?page=2"),
      url,
      [],
      [4],
      null,
      (message) => messages.push(message),
      load,
      pause,
    );
    expect(load).toHaveBeenCalledExactlyOnceWith(`${url}?page=2`);
    expect(messages.at(-1)).toMatchObject({
      type: "searchCheckResult",
      works: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    expect(messages.filter((message) => message.type === "searchCheckProgress")).toHaveLength(2);
  });

  it("starts on page one and applies the device's hidden tags", async () => {
    const load = vi.fn(async (href: string) => {
      const requested = new URL(href);
      expect(requested.searchParams.has("page")).toBe(false);
      expect(requested.searchParams.get("work_search[excluded_tag_names]")).toBe("Angst");
      return page([1]);
    });
    const messages: SearchCheckMessage[] = [];
    await checkSearch(
      page([9]),
      `${url}?page=3`,
      ["Angst"],
      [],
      null,
      (message) => messages.push(message),
      load,
      pause,
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(messages.at(-1)).toMatchObject({ type: "searchCheckResult", works: [{ id: 1 }] });
  });

  it("applies the enabled language and includes it in the baseline context", async () => {
    const messages: SearchCheckMessage[] = [];
    const load = vi.fn(async (href: string) => {
      expect(new URL(href).searchParams.get("work_search[language_id]")).toBe("fr");
      return page([1]);
    });
    await checkSearch(
      page([9]),
      `${url}?work_search%5Blanguage_id%5D=en`,
      [],
      [],
      "fr",
      (message) => messages.push(message),
      load,
      pause,
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(messages.at(-1)).toMatchObject({
      type: "searchCheckResult",
      context: JSON.stringify([
        JSON.stringify(["/works", [["work_search[language_id]", "fr"]]]),
        "/users/reader",
        [],
      ]),
      works: [{ id: 1 }],
    });
  });

  it("never emits a completed result after a later page fails", async () => {
    const messages: SearchCheckMessage[] = [];
    await checkSearch(
      page([1], "?page=2"),
      url,
      [],
      [],
      null,
      (message) => messages.push(message),
      async () => {
        throw new Error("AO3 returned 429");
      },
      pause,
    );
    expect(messages.at(-1)).toEqual({ type: "searchCheckError", error: "AO3 returned 429" });
    expect(messages.some((message) => message.type === "searchCheckResult")).toBe(false);
  });

  it("rejects a sign-in change during pagination", async () => {
    const messages: SearchCheckMessage[] = [];
    await checkSearch(
      page([1], "?page=2"),
      url,
      [],
      [],
      null,
      (message) => messages.push(message),
      async () => page([2], undefined, "other"),
      pause,
    );
    expect(messages.at(-1)).toMatchObject({ type: "searchCheckError" });
  });

  it("rejects pagination loops instead of returning a partial count", async () => {
    const messages: SearchCheckMessage[] = [];
    await checkSearch(
      page([1], "?page=2"),
      url,
      [],
      [],
      null,
      (message) => messages.push(message),
      async () => page([2], "?page=2"),
      pause,
    );
    expect(messages.at(-1)).toEqual({
      type: "searchCheckError",
      error: "AO3 repeated a results page. Please try again.",
    });
  });
});
