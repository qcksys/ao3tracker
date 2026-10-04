import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { applyHiddenWorks, applyFandomLimit } from "~/dom/browsing";
import type { WorkBadgeData } from "~/badges";

const badges: WorkBadgeData[] = [
  { id: 1, status: "caught-up", progressPercent: 100, favourite: false, currentChapters: 2 },
  { id: 2, status: "finished", progressPercent: 100, favourite: false, currentChapters: 2 },
  { id: 3, status: "in-progress", progressPercent: 50, favourite: false, currentChapters: 2 },
];

beforeEach(() => {
  document.body.innerHTML = `<ol>${[1, 2, 3, 4].map((id) => `<li id="work_${id}"><h4 class="heading"><a href="/works/${id}">Story ${id}</a></h4><dd class="chapters">2/5</dd><h5 class="fandoms"><a class="tag">A</a><a class="tag">B</a></h5></li>`).join("")}<li id="bookmark_9"><h4 class="heading"><a href="/works/1">Story 1</a></h4><dd class="chapters">2/5</dd></li></ol>`;
});

describe("hiding all tracked works", () => {
  it.each<WorkBadgeData["status"]>([
    "not-started",
    "in-progress",
    "caught-up",
    "finished",
    "has-new-chapters",
    "private",
  ])("hides tracked work and bookmark blurbs with %s status, including new chapters", (status) => {
    const entries = [{ ...badges[0]!, status, currentChapters: 1 }];
    applyHiddenWorks(document, [], vi.fn(), { badges: entries });
    expect(document.querySelectorAll(".ao3-tracker-work-hidden")).toHaveLength(0);
    applyHiddenWorks(document, [], vi.fn(), {
      hideTracked: true,
      hideCaughtUp: true,
      badges: entries,
    });
    expect(document.querySelectorAll(".ao3-tracker-work-hidden")).toHaveLength(2);
    for (const row of document.querySelectorAll(".ao3-tracker-hidden-work")) {
      expect(row.textContent).toContain("Story 1 · Hidden - tracked · Show");
      expect(row.querySelector("a")?.href).toBe("https://archiveofourown.org/works/1");
    }
    expect(document.querySelector("#work_2")?.classList.contains("ao3-tracker-work-hidden")).toBe(
      false,
    );
  });

  it("preserves page-local reveals and manual hides when preferences or tracked works change", () => {
    const change = vi.fn();
    applyHiddenWorks(document, [3], change, { hideTracked: true, badges });
    document.querySelector<HTMLButtonElement>("#work_1 + li button")!.click();
    applyHiddenWorks(document, [3], change, { hideTracked: true, badges });
    expect(document.querySelector("#work_1 + .ao3-tracker-hidden-work")).toBeNull();
    expect(change).not.toHaveBeenCalled();
    applyFandomLimit(document, 1);
    expect(
      document.querySelector("#work_2 + li")?.classList.contains("ao3-tracker-fandom-limit-hidden"),
    ).toBe(true);
    applyFandomLimit(document, null);
    applyHiddenWorks(document, [3], change, { hideTracked: true, badges: [] });
    expect(document.querySelectorAll(".ao3-tracker-work-hidden")).toHaveLength(1);
    applyHiddenWorks(document, [3], change, { hideTracked: false, hideCaughtUp: true, badges });
    expect(document.querySelector("#work_2 + li")?.textContent).toContain("Hidden - finished");
    applyHiddenWorks(document, [3], change, { hideTracked: false, badges });
    expect(document.querySelectorAll(".ao3-tracker-work-hidden")).toHaveLength(1);
    expect(document.querySelector("#work_3 + li")?.textContent).toContain("Hidden · Unhide");
    document.querySelector<HTMLButtonElement>("#work_3 + li button")!.click();
    expect(change).toHaveBeenCalledExactlyOnceWith(3, false);
  });
});

describe("hiding caught-up works", () => {
  it("is opt-in and labels caught-up and finished works with clickable titles", () => {
    applyHiddenWorks(document, [], vi.fn(), { badges });
    expect(document.querySelectorAll(".ao3-tracker-work-hidden")).toHaveLength(0);
    applyHiddenWorks(document, [], vi.fn(), { hideCaughtUp: true, badges });
    expect(document.querySelectorAll(".ao3-tracker-work-hidden")).toHaveLength(3);
    const rows = document.querySelectorAll(".ao3-tracker-hidden-work");
    expect(rows[0]?.textContent).toContain("Story 1 · Hidden - caught up");
    expect(rows[1]?.textContent).toContain("Story 2 · Hidden - finished");
    expect(rows[0]?.querySelector("a")?.href).toBe("https://archiveofourown.org/works/1");
    expect(document.querySelector("#work_3")?.classList.contains("ao3-tracker-work-hidden")).toBe(
      false,
    );
  });

  it("restores new chapters, unread works and disabled filtering without clearing manual hides", () => {
    const change = vi.fn();
    applyHiddenWorks(document, [3], change, { hideCaughtUp: true, badges });
    document.querySelector("#work_1 dd.chapters")!.textContent = "3/5";
    applyHiddenWorks(document, [3], change, {
      hideCaughtUp: true,
      badges: [badges[0]!, { ...badges[1]!, status: "in-progress" }],
    });
    expect(document.querySelector("#work_1 + .ao3-tracker-hidden-work")).toBeNull();
    expect(document.querySelector("#work_2 + .ao3-tracker-hidden-work")).toBeNull();
    applyHiddenWorks(document, [3], change, { hideCaughtUp: false, badges });
    expect(document.querySelectorAll(".ao3-tracker-work-hidden")).toHaveLength(1);
    expect(document.querySelector("#work_3 + .ao3-tracker-hidden-work")?.textContent).toContain(
      "Hidden · Unhide",
    );
    expect(change).not.toHaveBeenCalled();
  });

  it("allows a temporary reveal and keeps fandom limits independent", () => {
    const change = vi.fn();
    applyHiddenWorks(document, [], change, { hideCaughtUp: true, badges });
    document.querySelector<HTMLButtonElement>("#work_1 + li button")!.click();
    applyHiddenWorks(document, [], change, { hideCaughtUp: true, badges });
    expect(document.querySelector("#work_1 + .ao3-tracker-hidden-work")).toBeNull();
    expect(change).not.toHaveBeenCalled();
    applyFandomLimit(document, 1);
    expect(
      document.querySelector("#work_2 + li")?.classList.contains("ao3-tracker-fandom-limit-hidden"),
    ).toBe(true);
    applyFandomLimit(document, null);
    expect(document.querySelector("#work_2 + li")?.textContent).toContain("Hidden - finished");
  });
});
