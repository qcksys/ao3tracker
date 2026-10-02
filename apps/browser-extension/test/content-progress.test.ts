// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("@wxt-dev/storage", () => ({
  storage: { defineItem: () => ({ watch: () => vi.fn() }) },
}));

let cleanup: (() => void)[];

beforeEach(() => {
  vi.resetModules();
  cleanup = [];
  Reflect.deleteProperty(window, "__ao3TrackerInitialized");
  window.history.replaceState({}, "", "/works/123/chapters/456");
});

afterEach(() => {
  for (const stop of cleanup) stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("reports a short chapter as fully read on load and stops reporting after invalidation", async () => {
  document.body.innerHTML =
    '<div id="chapters"></div><div id="feedback"><ul class="actions"><li><a href="/works/123/chapters/789">Next Chapter →</a></li></ul></div>';
  vi.spyOn(document.getElementById("chapters")!, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 100, window.innerHeight * 2),
  );
  const bounds = vi
    .spyOn(document.querySelector("#feedback a")!, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, window.innerHeight - 10, 100, 24));
  const sendMessage = vi.fn().mockResolvedValue({ kind: "ok" });
  vi.stubGlobal("browser", { runtime: { sendMessage } });
  type Context = { onInvalidated: (stop: () => void) => void };
  let main: ((ctx: Context) => Promise<void>) | undefined;
  vi.stubGlobal("defineContentScript", (definition: { main: NonNullable<typeof main> }) => {
    main = definition.main;
    return definition;
  });
  await import("../entrypoints/content");
  if (!main) throw new Error("Content script was not registered");
  await main({ onInvalidated: (stop) => cleanup.push(stop) });
  expect(sendMessage).toHaveBeenCalledWith({
    kind: "pageEvent",
    payload: expect.objectContaining({
      type: "scrollProgress",
      chapterId: "456",
      scrollPercentage: 100,
    }),
  });
  for (const stop of cleanup) stop();
  cleanup = [];
  sendMessage.mockClear();
  bounds.mockReturnValue(new DOMRect(0, window.innerHeight + 20, 100, 24));
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  expect(sendMessage).not.toHaveBeenCalled();
});
