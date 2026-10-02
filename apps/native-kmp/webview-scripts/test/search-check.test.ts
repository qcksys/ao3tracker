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
        null,
      ]),
      works: [{ id: 1 }],
    });
  });

  it("filters fandoms on every page and resets the baseline when the limit changes", async () => {
    const first = page([1, 2], "?page=2");
    const second = page([3, 4]);
    for (const [doc, id, count] of [
      [first, 2, 4],
      [second, 3, 3],
      [second, 4, 4],
    ] as const) {
      const blurb = doc.querySelector(`#work_${id}`);
      if (!blurb) throw new Error("Expected work blurb");
      blurb.innerHTML = `<h5 class="fandoms">${'<a class="tag">Fandom</a>'.repeat(count)}</h5>`;
    }
    const messages: SearchCheckMessage[] = [];
    const post = (message: SearchCheckMessage) => messages.push(message);
    await checkSearch(first, url, [], [], null, post, async () => second, pause, 3);
    const limited = messages.at(-1);
    expect(limited).toMatchObject({ type: "searchCheckResult", works: [{ id: 1 }, { id: 3 }] });
    await checkSearch(first, url, [], [], null, post, async () => second, pause, null);
    const unlimited = messages.at(-1);
    expect(unlimited).toMatchObject({
      type: "searchCheckResult",
      works: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
    });
    if (limited?.type !== "searchCheckResult" || unlimited?.type !== "searchCheckResult")
      throw new Error("Expected complete checks");
    expect(limited.context).not.toBe(unlimited.context);
  });

  it("injects AO3's crossover exclusion when checking single-fandom searches", async () => {
    const messages: SearchCheckMessage[] = [];
    const load = vi.fn(async (href: string) => {
      expect(new URL(href).searchParams.get("work_search[crossover]")).toBe("F");
      return page([1]);
    });
    await checkSearch(
      page([9]),
      url,
      [],
      [],
      null,
      (message) => messages.push(message),
      load,
      pause,
      1,
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(messages.at(-1)).toMatchObject({ type: "searchCheckResult", works: [{ id: 1 }] });
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
