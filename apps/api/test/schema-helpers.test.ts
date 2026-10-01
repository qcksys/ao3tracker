import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { omitTimestampCols } from "~/db/helpers/schema";

describe("omitTimestampCols", () => {
  it("removes both database-managed clocks while preserving the deletion field", () => {
    const schema = omitTimestampCols(
      z.object({
        id: z.number(),
        rowCreatedAt: z.date(),
        rowUpdatedAt: z.date(),
        rowDeletedAt: z.date().nullable(),
      }),
    );
    expect(schema.parse({ id: 1, rowDeletedAt: null })).toEqual({ id: 1, rowDeletedAt: null });
    expect(Object.keys(schema.shape)).toEqual(["id", "rowDeletedAt"]);
  });

  it("supports link tables with only a creation timestamp", () => {
    const schema = omitTimestampCols(z.object({ tag: z.number(), rowCreatedAt: z.date() }));
    expect(schema.parse({ tag: 1 })).toEqual({ tag: 1 });
    expect(Object.keys(schema.shape)).toEqual(["tag"]);
  });

  it("supports schemas without database-managed timestamps", () => {
    const schema = omitTimestampCols(z.object({ id: z.number() }));
    expect(schema.parse({ id: 1 })).toEqual({ id: 1 });
  });
});
