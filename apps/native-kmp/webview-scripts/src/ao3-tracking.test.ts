/**
 * Tests for AO3 tracking script parsing functions
 */

import { describe, expect, it, beforeEach } from "vitest";
import { workPageHtml, chapterIndexHtml, minimalHtml } from "./fixtures";
import {
    getWorkInfo,
    getWorkTagInfo,
    getWorkChapterIndex,
    getWorkChapterSelect,
    findListWorkIds,
    formatBadge,
    applyListBadges,
    type WorkBadgeData,
} from "./ao3-tracking";

// Helper to set up location mock
function mockLocation(url: string) {
    const parsedUrl = new URL(url);
    Object.defineProperty(window, "location", {
        value: {
            href: url,
            pathname: parsedUrl.pathname,
            search: parsedUrl.search,
        },
        writable: true,
        configurable: true,
    });
}

beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = "";
    // Reset initialization flag
    window.__ao3TrackerInitialized = false;
});

describe("getWorkChapterSelect", () => {
    it("should parse chapters from the select dropdown", () => {
        document.body.innerHTML = workPageHtml;
        mockLocation(
            "https://archiveofourown.org/works/10828137/chapters/24029673"
        );

        const result = getWorkChapterSelect();

        expect(result).not.toBeNull();
        expect(result!.type).toBe("workChapterIndex");
        expect(result!.url).toBe(
            "https://archiveofourown.org/works/10828137/chapters/24029673"
        );
        expect(result!.authorUrl).toBe("/users/Xabiar/pseuds/Xabiar");

        // Check chapters array
        expect(result!.chapters).toBeDefined();
        expect(result!.chapters.length).toBe(87); // Based on fixture

        // Check first chapter
        expect(result!.chapters[0]).toEqual({
            chapterDate: null, // Not available from dropdown
            chapterNumber: "1. Introduction",
            chapterUrl: "/works/10828137/chapters/24029673",
        });

        // Check second chapter
        expect(result!.chapters[1]).toEqual({
            chapterDate: null,
            chapterNumber: "2. Prologue - The Last Command",
            chapterUrl: "/works/10828137/chapters/24029694",
        });

        // Check last chapter
        expect(result!.chapters[86]).toEqual({
            chapterDate: null,
            chapterNumber: "87. Visions of Ruin, Armies of Zeal - Part IV",
            chapterUrl: "/works/10828137/chapters/146762578",
        });
    });

    it("should return null when select element is missing", () => {
        document.body.innerHTML = minimalHtml;
        mockLocation("https://archiveofourown.org/works/12345");

        const result = getWorkChapterSelect();

        expect(result).toBeNull();
    });

    it("should return null when URL has no work ID", () => {
        document.body.innerHTML = workPageHtml;
        mockLocation("https://archiveofourown.org/some/other/page");

        const result = getWorkChapterSelect();

        expect(result).toBeNull();
    });
});

describe("getWorkChapterIndex (navigate page)", () => {
    it("should parse chapters with dates from the navigate page", () => {
        document.body.innerHTML = chapterIndexHtml;
        mockLocation("https://archiveofourown.org/works/10828137/navigate");

        const result = getWorkChapterIndex();

        expect(result.type).toBe("workChapterIndex");
        expect(result.authorUrl).toBe("/users/Xabiar/pseuds/Xabiar");

        // Check chapters array - navigate page has dates
        expect(result.chapters.length).toBe(3);

        expect(result.chapters[0]).toEqual({
            chapterDate: "(2017-05-05)",
            chapterNumber: "1. Introduction",
            chapterUrl: "/works/10828137/chapters/24029673",
        });

        expect(result.chapters[1]).toEqual({
            chapterDate: "(2017-05-05)",
            chapterNumber: "2. Prologue - The Last Command",
            chapterUrl: "/works/10828137/chapters/24029694",
        });

        expect(result.chapters[2]).toEqual({
            chapterDate: "(2017-05-15)",
            chapterNumber: "3. Unification Day",
            chapterUrl: "/works/10828137/chapters/24258660",
        });
    });
});

describe("getWorkInfo", () => {
    it("should parse work info from work page", () => {
        document.body.innerHTML = workPageHtml;
        mockLocation(
            "https://archiveofourown.org/works/10828137/chapters/24029673"
        );

        const result = getWorkInfo();

        expect(result.type).toBe("workInfo");
        expect(result.workName).toBe("XCOM: The Advent Directive");
        expect(result.authorName).toBe("Xabiar");
        expect(result.authorUrl).toBe("/users/Xabiar/pseuds/Xabiar");
        expect(result.totalChapters).toBe("87/?");
        expect(result.wordCount).toBe("2000503");
        expect(result.language).toBe("English");
        expect(result.chapterId).toBe("24029673");
    });
});

describe("getWorkTagInfo", () => {
    it("should parse tags from work page", () => {
        document.body.innerHTML = workPageHtml;
        mockLocation(
            "https://archiveofourown.org/works/10828137/chapters/24029673"
        );

        const result = getWorkTagInfo();

        expect(result.type).toBe("workTags");
        expect(result.rating?.tag).toBe("Mature");
        expect(result.warning).toHaveLength(1);
        expect(result.warning[0].tag).toBe(
            "Creator Chose Not To Use Archive Warnings"
        );
        expect(result.fandom).toHaveLength(1);
        expect(result.fandom[0].tag).toBe("XCOM: Enemy Within");
        expect(result.character).toHaveLength(6);
        expect(result.freeform.length).toBeGreaterThan(0);
    });
});

describe("findListWorkIds", () => {
    it("returns IDs from all work blurbs on the page, in DOM order", () => {
        document.body.innerHTML = `
            <ol class="work index group">
                <li id="work_111"></li>
                <li id="work_222"></li>
                <li id="series_999"></li>
                <li id="work_333"></li>
            </ol>
        `;

        expect(findListWorkIds()).toEqual([111, 222, 333]);
    });

    it("skips blurbs with non-numeric or malformed IDs", () => {
        document.body.innerHTML = `
            <li id="work_42"></li>
            <li id="work_abc"></li>
            <li id="work_"></li>
            <li id="work_99extra"></li>
        `;

        expect(findListWorkIds()).toEqual([42]);
    });

    it("returns an empty array when no work blurbs are present", () => {
        document.body.innerHTML = `<div>No works here</div>`;

        expect(findListWorkIds()).toEqual([]);
    });
});

describe("formatBadge", () => {
    const base: WorkBadgeData = {
        id: 1,
        status: "not-started",
        progressPercent: 0,
        favourite: false,
    };

    it("renders distinct label+color per status", () => {
        expect(formatBadge({ ...base, status: "finished" })).toEqual({
            label: "✓ Finished",
            color: "#2e7d32",
        });
        expect(formatBadge({ ...base, status: "caught-up" })).toEqual({
            label: "Caught up",
            color: "#1565c0",
        });
        expect(formatBadge({ ...base, status: "has-new-chapters" })).toEqual({
            label: "New chapters",
            color: "#ef6c00",
        });
        expect(formatBadge({ ...base, status: "private" })).toEqual({
            label: "Private",
            color: "#616161",
        });
        expect(formatBadge({ ...base, status: "not-started" })).toEqual({
            label: "Tracked",
            color: "#455a64",
        });
    });

    it("shows progress percent for in-progress status", () => {
        expect(
            formatBadge({ ...base, status: "in-progress", progressPercent: 42 })
        ).toEqual({ label: "42%", color: "#6a1b9a" });
    });

    it("prepends a star for favourites", () => {
        expect(
            formatBadge({ ...base, status: "finished", favourite: true }).label
        ).toBe("★ ✓ Finished");
        expect(
            formatBadge({
                ...base,
                status: "in-progress",
                progressPercent: 10,
                favourite: true,
            }).label
        ).toBe("★ 10%");
    });
});

describe("applyListBadges", () => {
    function setupBlurbs(ids: number[]) {
        document.body.innerHTML = ids
            .map((id) => `<li id="work_${id}">work ${id}</li>`)
            .join("");
    }

    it("adds a badge to each matching blurb and skips unknown IDs", () => {
        setupBlurbs([1, 2]);

        applyListBadges(
            JSON.stringify([
                { id: 1, status: "finished", progressPercent: 100, favourite: false },
                { id: 99, status: "finished", progressPercent: 100, favourite: false },
            ])
        );

        const blurb1 = document.getElementById("work_1");
        const blurb2 = document.getElementById("work_2");

        expect(blurb1?.querySelector(".ao3-tracker-badge")?.textContent).toBe(
            "✓ Finished"
        );
        expect(blurb2?.querySelector(".ao3-tracker-badge")).toBeNull();
    });

    it("replaces an existing badge instead of stacking duplicates", () => {
        setupBlurbs([7]);

        const payload = (status: WorkBadgeData["status"]) =>
            JSON.stringify([
                { id: 7, status, progressPercent: 50, favourite: false },
            ]);

        applyListBadges(payload("in-progress"));
        applyListBadges(payload("finished"));

        const badges = document
            .getElementById("work_7")
            ?.querySelectorAll(".ao3-tracker-badge");
        expect(badges?.length).toBe(1);
        expect(badges?.[0].textContent).toBe("✓ Finished");
    });

    it("ensures the blurb is positioned for absolute children", () => {
        setupBlurbs([5]);
        const blurb = document.getElementById("work_5") as HTMLElement;
        // happy-dom returns "" for unset position; emulate "static"
        blurb.style.position = "static";

        applyListBadges(
            JSON.stringify([
                { id: 5, status: "caught-up", progressPercent: 100, favourite: false },
            ])
        );

        expect(blurb.style.position).toBe("relative");
    });

    it("ignores malformed JSON without throwing", () => {
        setupBlurbs([1]);

        expect(() => applyListBadges("not json")).not.toThrow();
        expect(
            document.getElementById("work_1")?.querySelector(".ao3-tracker-badge")
        ).toBeNull();
    });
});
