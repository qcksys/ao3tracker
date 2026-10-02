import { z } from "zod";

export const searchWorkSchema = z.object({
  id: z.number().int().positive(),
  updated: z.string(),
  chapters: z.string(),
  words: z.string(),
});
export type SearchWork = z.infer<typeof searchWorkSchema>;

export const searchCheckMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("searchCheckProgress"), pages: z.number().int().positive() }),
  z.object({
    type: z.literal("searchCheckResult"),
    context: z.string(),
    works: z.array(searchWorkSchema),
  }),
  z.object({ type: z.literal("searchCheckError"), error: z.string() }),
]);
export type SearchCheckMessage = z.infer<typeof searchCheckMessageSchema>;
