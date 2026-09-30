import { z } from "zod";

/**
 * Tag type id, matches the `tagTypes` enum in apps/api/src/db/schema/work.tag.ts.
 * Keep these values in sync with the server schema — they are the wire format.
 */
export const tagTypeIds = {
  unknown: 0,
  rating: 1,
  warning: 2,
  category: 3,
  fandom: 4,
  relationship: 5,
  character: 6,
  freeform: 7,
} as const;

export type TagTypeName = keyof typeof tagTypeIds;
export type TagTypeId = (typeof tagTypeIds)[TagTypeName];

export const TAG_TYPE_NAMES: readonly TagTypeName[] = [
  "unknown",
  "rating",
  "warning",
  "category",
  "fandom",
  "relationship",
  "character",
  "freeform",
];

export const tagTypeIdSchema = z
  .number()
  .int()
  .refine((n): n is TagTypeId => TAG_TYPE_NAMES.some((name) => tagTypeIds[name] === n), {
    message: "Unknown tagType id",
  });

export const tagTypeNameSchema = z.enum(TAG_TYPE_NAMES as readonly [TagTypeName, ...TagTypeName[]]);

export function tagTypeIdToName(id: TagTypeId): TagTypeName {
  return TAG_TYPE_NAMES.find((name) => tagTypeIds[name] === id) ?? "unknown";
}

export function tagTypeNameToId(name: TagTypeName): TagTypeId {
  return tagTypeIds[name];
}

export const favouriteTagKey = (tagType: TagTypeId, tag: string): string => `${tagType}\t${tag}`;
