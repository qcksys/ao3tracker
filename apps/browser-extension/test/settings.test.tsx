// @vitest-environment happy-dom
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import HiddenWorks from "../entrypoints/popup/pages/HiddenWorks";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { defaultNotificationPreferences } from "@qcksys/ao3tracker-core/notifications";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  signOut: vi.fn(),
  setAuthToken: vi.fn(),
  preferences: {
    enabled: true,
    new_chapters: true,
    work_completed: true,
    work_restricted: true,
    work_deleted: true,
  },
}));

vi.mock("~popup/lib/state", () => ({
  usePopupState: () => ({
    state: {
      apiBaseUrl: "https://ao3tracker.com",
      notificationPreferences: mocks.preferences,
      browsingPreferences: {
        hiddenTags: ["Angst"],
        hiddenWorkIds: [123],
        hiddenWorkTitles: { 123: "A Hidden Story" },
        hideCaughtUp: false,
        languageFilterEnabled: false,
        searchLanguage: "en",
        maxFandoms: null,
      },
    },
    dispatch: mocks.dispatch,
  }),
}));
vi.mock("~popup/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { name: "Reader", email: "reader@example.com" } } }),
    signOut: mocks.signOut,
    passkey: { addPasskey: vi.fn() },
  },
}));
vi.mock("@/lib/auth-token-cache", () => ({ setAuthToken: mocks.setAuthToken }));
vi.mock("@wxt-dev/storage", () => ({
  storage: {
    defineItem: (_key: string, options: { fallback: unknown }) => ({
      getValue: async () => options.fallback,
      setValue: vi.fn(),
    }),
  },
}));

import Settings from "../entrypoints/popup/pages/Settings";

let container: HTMLDivElement;
let root: Root;

function button(label: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll("button")).find(
    (element) =>
      element.textContent?.startsWith(label) || element.getAttribute("aria-label") === label,
  );
  if (!result) throw new Error(`Button not found: ${label}`);
  return result;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.preferences = { ...defaultNotificationPreferences };
  mocks.dispatch.mockReset().mockResolvedValue({ ok: true });
  mocks.signOut.mockReset().mockResolvedValue(undefined);
  mocks.setAuthToken.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/hidden-works" element={<HiddenWorks />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("settings sections", () => {
  it("opens a separate searchable hidden-work list with title links and restore actions", async () => {
    await act(async () => button("Search preferences").click());
    await act(async () =>
      container.querySelector<HTMLAnchorElement>('a[href="/settings/hidden-works"]')!.click(),
    );
    const workLink = container.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    expect(workLink.textContent).toBe("A Hidden Story");
    expect(workLink.href).toBe("https://archiveofourown.org/works/123");
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const search = async (value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await search("missing");
    expect(container.textContent).toContain("No matching hidden works");
    await search("hidden story");
    expect(container.querySelector('a[target="_blank"]')).not.toBeNull();
    await search("123");
    await act(async () => button("Unhide A Hidden Story").click());
    expect(mocks.dispatch).toHaveBeenCalledWith({ kind: "unhideWork", workId: 123 });
  });

  it("adds and removes tag chips and enables caught-up hiding", async () => {
    await act(async () => button("Search preferences").click());
    expect(container.querySelector("textarea")).toBeNull();
    await act(async () => button("Remove Angst").click());
    expect(mocks.dispatch).toHaveBeenLastCalledWith({ kind: "setHiddenTags", hiddenTags: [] });
    const input = container.querySelector<HTMLInputElement>("#hidden-tags")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "Fluff, angst",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    mocks.dispatch.mockResolvedValueOnce({ ok: false, error: "Save failed" });
    await act(async () =>
      input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(input.value).toBe("Fluff, angst");
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      kind: "setHiddenTags",
      hiddenTags: ["Angst", "Fluff"],
    });
    await act(async () =>
      input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(input.value).toBe("");
    await act(async () => container.querySelector<HTMLButtonElement>("#hide-caught-up")!.click());
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      kind: "setHideCaughtUp",
      hideCaughtUp: true,
    });
  });

  it("validates, saves and clears the fandom limit, retaining drafts after save failures", async () => {
    await act(async () => button("Search preferences").click());
    const input = container.querySelector<HTMLInputElement>("#max-fandoms")!;
    const enter = async (value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    expect(input.value).toBe("");
    for (const invalid of ["0", "-1", "1.5"]) {
      await enter(invalid);
      expect(button("Save fandom limit").disabled).toBe(true);
    }
    await enter("3");
    mocks.dispatch.mockResolvedValueOnce({ ok: false, error: "Save failed" });
    await act(async () => button("Save fandom limit").click());
    expect(mocks.dispatch).toHaveBeenLastCalledWith({ kind: "setMaxFandoms", maxFandoms: 3 });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Save failed");
    await act(async () => button("Search preferences").click());
    await act(async () => button("Search preferences").click());
    expect(input.value).toBe("3");
    await act(async () => button("Save fandom limit").click());
    expect(mocks.dispatch).toHaveBeenLastCalledWith({ kind: "setMaxFandoms", maxFandoms: 3 });
    await enter("1");
    await act(async () => button("Save fandom limit").click());
    expect(mocks.dispatch).toHaveBeenLastCalledWith({ kind: "setMaxFandoms", maxFandoms: 1 });
    await enter("3");
    await enter("");
    await act(async () => button("Save fandom limit").click());
    expect(mocks.dispatch).toHaveBeenLastCalledWith({ kind: "setMaxFandoms", maxFandoms: null });
  });
  it("chooses and enables a language and retains the draft after a failed save", async () => {
    await act(async () => button("Search preferences").click());
    const select = container.querySelector<HTMLSelectElement>("#search-language")!;
    expect(select.value).toBe("en");
    expect(select.options.length).toBeGreaterThan(100);
    expect(button("Filter searches by language").getAttribute("aria-checked")).toBe("false");
    await act(async () => {
      select.value = "fr";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("Filter searches by language").click());
    await act(async () => button("Search preferences").click());
    await act(async () => button("Search preferences").click());
    expect(select.value).toBe("fr");
    mocks.dispatch.mockResolvedValueOnce({ ok: false, error: "Save failed" });
    await act(async () => button("Save language filter").click());
    expect(mocks.dispatch).toHaveBeenCalledWith({
      kind: "setSearchLanguage",
      searchLanguage: "fr",
      languageFilterEnabled: true,
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Save failed");
    expect(select.value).toBe("fr");
    await act(async () => button("Filter searches by language").click());
    await act(async () => button("Save language filter").click());
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      kind: "setSearchLanguage",
      searchLanguage: "fr",
      languageFilterEnabled: false,
    });
  });

  it("keeps account actions visible and expands sections independently", async () => {
    expect(button("Sign out").closest("[hidden]")).toBeNull();
    expect(button("Notifications").getAttribute("aria-expanded")).toBe("false");
    expect(button("Advanced").getAttribute("aria-expanded")).toBe("false");
    expect(button("Search preferences").getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("A Hidden Story");
    expect(button("New chapters").closest("[hidden]")).not.toBeNull();

    await act(async () => button("Notifications").click());
    await act(async () => button("Advanced").click());
    expect(button("Notifications").getAttribute("aria-expanded")).toBe("true");
    expect(button("Advanced").getAttribute("aria-expanded")).toBe("true");
    expect(button("New chapters").closest("[hidden]")).toBeNull();
    await act(async () => button("Search preferences").click());
    expect(container.querySelector('a[href="/settings/hidden-works"]')?.textContent).toContain(
      "Hidden works (1)",
    );
    expect(container.textContent).not.toContain("A Hidden Story");

    await act(async () => button("Sign out").click());
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.setAuthToken).toHaveBeenCalledWith(null);
  });

  it("retains a pending notification save and its error when collapsed", async () => {
    let finish: (value: { ok: false; error: string }) => void = () => {};
    mocks.dispatch.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await act(async () => button("Notifications").click());
    await act(async () => button("New chapters").click());
    expect(mocks.dispatch).toHaveBeenCalledWith({
      kind: "setNotificationPreference",
      key: "new_chapters",
      enabled: false,
    });
    expect(button("New chapters").disabled).toBe(true);

    await act(async () => button("Notifications").click());
    await act(async () => finish({ ok: false, error: "Please try again" }));
    await act(async () => button("Notifications").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Please try again");
    expect(button("New chapters").disabled).toBe(false);
  });

  it("keeps notification categories disabled when the master switch is off", async () => {
    mocks.preferences.enabled = false;
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/settings"]}>
          <Routes>
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/hidden-works" element={<HiddenWorks />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    await act(async () => button("Notifications").click());
    expect(button("Enable notifications").disabled).toBe(false);
    for (const label of ["New chapters", "Completed works", "Restricted works", "Deleted works"]) {
      expect(button(label).disabled).toBe(true);
    }
  });
});
