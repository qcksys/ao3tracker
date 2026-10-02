// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  openTab: vi.fn(),
  searches: [
    {
      id: "works",
      name: "Favourite stories",
      url: "https://archiveofourown.org/works?work_search%5Bquery%5D=slow+burn&page=2#work_123",
      deleted: false,
    },
    {
      id: "bookmarks",
      name: "Saved bookmarks",
      url: "https://archiveofourown.org/bookmarks?bookmark_search%5Bother_tag_names%5D=Fluff%2C+Caf%C3%A9",
      deleted: false,
    },
    {
      id: "deleted",
      name: "Deleted search",
      url: "https://archiveofourown.org/works",
      deleted: true,
    },
  ],
}));

vi.mock("~popup/lib/state", () => ({
  usePopupState: () => ({ state: { savedSearches: mocks.searches }, dispatch: mocks.dispatch }),
}));
vi.mock("~popup/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { name: "Reader" } } }) },
}));

import Searches from "../entrypoints/popup/pages/Searches";

let container: HTMLDivElement;
let root: Root;

function copyButton(name: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="Copy link for ${name}"]`);
  if (!button) throw new Error(`Copy button not found: ${name}`);
  return button;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("browser", { tabs: { create: mocks.openTab } });
  mocks.dispatch.mockReset();
  mocks.openTab.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Searches />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saved search copy link", () => {
  it("copies each selected URL unchanged without opening or modifying the search", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    for (const search of mocks.searches.filter((search) => !search.deleted)) {
      await act(async () => copyButton(search.name).click());
      expect(writeText).toHaveBeenLastCalledWith(search.url);
      expect(container.querySelector('[role="status"]')?.textContent).toBe("Link copied");
    }

    expect(writeText).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("Deleted search");
    expect(mocks.openTab).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("only confirms after the clipboard write succeeds", async () => {
    let finish: () => void = () => {};
    vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );

    await act(async () => copyButton("Favourite stories").click());
    expect(container.querySelector('[role="status"]')).toBeNull();
    await act(async () => finish());
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Link copied");
  });

  it("reports a failed copy and allows a successful retry", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new DOMException("Clipboard access denied", "NotAllowedError"))
      .mockResolvedValue();

    await act(async () => copyButton("Favourite stories").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Couldn't copy link. Try again.",
    );
    expect(container.querySelector('[role="status"]')).toBeNull();

    await act(async () => copyButton("Favourite stories").click());
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Link copied");
    expect(mocks.openTab).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});

describe("saved search tag previews", () => {
  it.each([0, 4, 5, 7])(
    "shows up to five of %i tags with only the remaining count",
    async (count) => {
      const search = mocks.searches[0]!;
      const originalUrl = search.url;
      const tags = [
        "Fluff",
        "Café",
        "Slow Burn",
        "Friendship",
        "Happy Ending",
        "Angst",
        "Humour",
      ].slice(0, count);
      try {
        search.url = `https://archiveofourown.org/works?${new URLSearchParams({ "work_search[other_tag_names]": tags.join(", ") })}`;
        await act(async () => root.render(<Searches />));
        const list = container.querySelector('[aria-label="Tags in Favourite stories"]');
        if (count === 0) {
          expect(list).toBeNull();
        } else {
          const expected = tags.slice(0, 5);
          if (count > 5) expected.push(`+${count - 5} more`);
          expect([...list!.querySelectorAll("li")].map((item) => item.textContent)).toEqual(
            expected,
          );
        }
        const open = [...container.querySelectorAll("button")].find(
          (button) => button.textContent === search.name,
        )!;
        await act(async () => open.click());
        expect(mocks.openTab).toHaveBeenCalledWith({ url: search.url });
      } finally {
        search.url = originalUrl;
      }
    },
  );
});
