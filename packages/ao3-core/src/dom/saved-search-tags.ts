import { normalizeWhitespace } from "./utils";

export function savedSearchTags(href: string): string[] {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return [];
  }
  const tags = new Set<string>();
  const add = (raw: string, field: string, excluded = false) => {
    const value = normalizeWhitespace(raw);
    if (!value) return;
    const type = field
      .replace(/^(?:other|excluded)_/, "")
      .replace(/_(?:names|ids?)$/, "")
      .replaceAll("_", " ");
    const label =
      /^\d+$/.test(value) && !field.endsWith("_names")
        ? `${type.charAt(0).toUpperCase() + type.slice(1)} #${value}`
        : value;
    tags.add(excluded ? `Exclude: ${label}` : label);
  };
  const tagName = (value: string) =>
    value
      .replaceAll("*s*", "/")
      .replaceAll("*a*", "&")
      .replaceAll("*d*", ".")
      .replaceAll("*q*", "?")
      .replaceAll("*h*", "#");
  const pathTag = url.pathname.match(/\/tags\/([^/]+)/)?.[1];
  if (pathTag) {
    try {
      add(tagName(decodeURIComponent(pathTag)), "tag_id");
    } catch {
      return [];
    }
  }
  for (const [key, raw] of url.searchParams) {
    if (key === "tag_id" || key === "fandom_id") {
      add(tagName(raw), key);
      continue;
    }
    const match = key.match(
      /^(?:(include|exclude)_)?(?:work|bookmark)_search\[([a-z_]+)\](?:\[\])?$/,
    );
    const field = match?.[2];
    if (
      !field ||
      !/^(?:(?:other|excluded)_)?(?:bookmark_tag|tag|fandom|relationship|character|freeform|rating|category|archive_warning)_(?:names|ids?)$/.test(
        field,
      )
    )
      continue;
    const excluded = match?.[1] === "exclude" || field.startsWith("excluded_");
    for (const value of raw.split(",")) add(value, field, excluded);
  }
  return [...tags];
}
