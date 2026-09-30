import { afterEach, expect, it, vi } from "vitest";
import { getWorkInfo } from "../src/dom/extract";
import { publishScrollPercentage } from "../src/dom/scroll";
import { scrollProgressMessageSchema } from "../src/schemas/messages";

afterEach(() => vi.restoreAllMocks());

it("includes the same chapter identity as workInfo on the ordinary work URL", () => {
  window.history.replaceState({}, "", "/works/123");
  document.body.innerHTML =
    '<select id="selected_id"><option value="456" selected>1</option></select><div id="chapters"></div>';
  const chapters = document.getElementById("chapters")!;
  vi.spyOn(chapters, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 1000));
  const info = getWorkInfo(document, window.location);
  const progress = publishScrollPercentage(document, window);
  expect(info.chapterId).toBe("456");
  expect(progress?.chapterId).toBe(info.chapterId);
  expect(scrollProgressMessageSchema.parse(progress).chapterId).toBe("456");
});

it("continues accepting events from clients without chapterId", () => {
  expect(
    scrollProgressMessageSchema.parse({
      type: "scrollProgress",
      url: "https://archiveofourown.org/works/123",
      scrollPercentage: 20,
    }).chapterId,
  ).toBeUndefined();
});
