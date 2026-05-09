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
