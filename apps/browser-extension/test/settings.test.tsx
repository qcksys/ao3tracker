// @vitest-environment happy-dom
import { act } from "react";
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
      browsingPreferences: { hiddenTags: ["Angst"], hiddenWorkIds: [123] },
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
  await act(async () => root.render(<Settings />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("settings sections", () => {
  it("keeps account actions visible and expands sections independently", async () => {
    expect(button("Sign out").closest("[hidden]")).toBeNull();
    expect(button("Notifications").getAttribute("aria-expanded")).toBe("false");
    expect(button("Advanced").getAttribute("aria-expanded")).toBe("false");
    expect(button("Search preferences").getAttribute("aria-expanded")).toBe("false");
    expect(button("Unhide work 123").closest("[hidden]")).not.toBeNull();
    expect(button("New chapters").closest("[hidden]")).not.toBeNull();

    await act(async () => button("Notifications").click());
    await act(async () => button("Advanced").click());
    expect(button("Notifications").getAttribute("aria-expanded")).toBe("true");
    expect(button("Advanced").getAttribute("aria-expanded")).toBe("true");
    expect(button("New chapters").closest("[hidden]")).toBeNull();
    await act(async () => button("Search preferences").click());
    expect(button("Unhide work 123").closest("[hidden]")).toBeNull();
    await act(async () => button("Unhide work 123").click());
    expect(mocks.dispatch).toHaveBeenCalledWith({ kind: "unhideWork", workId: 123 });

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
    await act(async () => root.render(<Settings />));
    await act(async () => button("Notifications").click());
    expect(button("Enable notifications").disabled).toBe(false);
    for (const label of ["New chapters", "Completed works", "Restricted works", "Deleted works"]) {
      expect(button(label).disabled).toBe(true);
    }
  });
});
