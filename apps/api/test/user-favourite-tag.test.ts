import { describe, expect, it } from "vitest";
import {
    type FavouriteTagUpsert,
    resolveFavouriteTagMerge,
} from "~/db/queries/user-favourite-tag";

const baseTs = new Date("2024-01-01T12:00:00Z");
const olderTs = new Date("2024-01-01T10:00:00Z");
const newerTs = new Date("2024-01-01T14:00:00Z");

function makeItem(
    tagType: number,
    tag: string,
    favourited: boolean,
    updatedAt: Date,
): FavouriteTagUpsert {
    return { tagType, tag, favourited, updatedAt };
}

describe("resolveFavouriteTagMerge", () => {
    it("accepts incoming row when no server row exists", () => {
        const items = [makeItem(4, "Fluff", true, baseTs)];
        const { toUpsert, results } = resolveFavouriteTagMerge(
            items,
            new Map(),
        );

        expect(results).toEqual([
            { tagType: 4, tag: "Fluff", status: "accepted" },
        ]);
        expect(toUpsert).toEqual(items);
    });

    it("accepts incoming row when client timestamp is strictly newer", () => {
        const items = [makeItem(4, "Fluff", false, newerTs)];
        const existing = new Map([["4\tFluff", baseTs]]);

        const { toUpsert, results } = resolveFavouriteTagMerge(items, existing);

        expect(results).toEqual([
            { tagType: 4, tag: "Fluff", status: "accepted" },
        ]);
        expect(toUpsert).toHaveLength(1);
        expect(toUpsert[0].favourited).toBe(false);
        expect(toUpsert[0].updatedAt).toEqual(newerTs);
    });

    it("ignores incoming row when server is strictly newer", () => {
        const items = [makeItem(4, "Fluff", true, olderTs)];
        const existing = new Map([["4\tFluff", baseTs]]);

        const { toUpsert, results } = resolveFavouriteTagMerge(items, existing);

        expect(results).toEqual([
            { tagType: 4, tag: "Fluff", status: "ignored" },
        ]);
        expect(toUpsert).toEqual([]);
    });

    it("ignores on timestamp tie (server wins)", () => {
        const items = [makeItem(4, "Fluff", false, baseTs)];
        const existing = new Map([["4\tFluff", baseTs]]);

        const { toUpsert, results } = resolveFavouriteTagMerge(items, existing);

        expect(results).toEqual([
            { tagType: 4, tag: "Fluff", status: "ignored" },
        ]);
        expect(toUpsert).toEqual([]);
    });

    it("accepts a tombstone (favourited=false) like any other write", () => {
        // Unfavouriting at a newer timestamp must win — that's how cross-device
        // unfavourites propagate.
        const items = [makeItem(7, "Slow Burn", false, newerTs)];
        const existing = new Map([["7\tSlow Burn", baseTs]]);

        const { toUpsert, results } = resolveFavouriteTagMerge(items, existing);

        expect(results[0].status).toBe("accepted");
        expect(toUpsert[0].favourited).toBe(false);
    });

    it("handles a mixed batch: keeps newer, drops older, accepts new", () => {
        const items = [
            // Newer than server — accepted
            makeItem(4, "Fluff", true, newerTs),
            // Older than server — ignored
            makeItem(4, "Angst", false, olderTs),
            // No server row — accepted
            makeItem(7, "Slow Burn", true, baseTs),
        ];
        const existing = new Map<string, Date>([
            ["4\tFluff", baseTs],
            ["4\tAngst", baseTs],
        ]);

        const { toUpsert, results } = resolveFavouriteTagMerge(items, existing);

        expect(results).toEqual([
            { tagType: 4, tag: "Fluff", status: "accepted" },
            { tagType: 4, tag: "Angst", status: "ignored" },
            { tagType: 7, tag: "Slow Burn", status: "accepted" },
        ]);
        expect(toUpsert.map((u) => u.tag)).toEqual(["Fluff", "Slow Burn"]);
    });

    it("treats identical (tagType, tag) keys across types as distinct", () => {
        // Same tag string under two different tag types must be independent rows.
        const items = [
            makeItem(4, "Marvel", true, newerTs), // fandom
            makeItem(6, "Marvel", true, newerTs), // character — different row
        ];
        const existing = new Map<string, Date>([
            ["4\tMarvel", baseTs], // only fandom version is currently stored
        ]);

        const { toUpsert, results } = resolveFavouriteTagMerge(items, existing);

        expect(results).toEqual([
            { tagType: 4, tag: "Marvel", status: "accepted" },
            { tagType: 6, tag: "Marvel", status: "accepted" },
        ]);
        expect(toUpsert).toHaveLength(2);
    });
});
