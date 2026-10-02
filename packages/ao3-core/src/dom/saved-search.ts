import { normalizeWhitespace } from "./utils";

const scopeFields: Record<string, string> = {
  tags: "tag_id",
  users: "user_id",
  pseuds: "pseud_id",
  collections: "collection_id",
  languages: "language_id",
};

const fieldLabels: Record<string, string> = {
  query: "Search",
  bookmarkable_query: "Search",
  bookmark_query: "Bookmark tags and notes",
  other_tag_names: "Include",
  excluded_tag_names: "Exclude",
  other_bookmark_tag_names: "Include bookmark tags",
  excluded_bookmark_tag_names: "Exclude bookmark tags",
  words_from: "Words from",
  words_to: "Words to",
  date_from: "Updated from",
  date_to: "Updated to",
  sort_column: "Sort by",
};

function humanize(value: string): string {
  const text = value.replace(/_(?:names|ids?)$/, "").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function tagName(value: string): string {
  const escapes: Record<string, string> = { s: "/", a: "&", d: ".", q: "?", h: "#" };
  return value.replace(/\*([sadqh])\*/g, (_, key: string) => escapes[key] ?? key);
}

function inputLabel(input: HTMLInputElement): string | null {
  const label = input.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
  if (!label) return null;
  const hasCount = label.querySelector(".count") !== null;
  for (const count of label.querySelectorAll(".count, .indicator")) count.remove();
  const text = normalizeWhitespace(label.textContent);
  return hasCount ? text : (text?.replace(/\s+\([\d,]+\)$/, "") ?? null);
}

export function suggestSavedSearchName(doc: Document, href: string): string {
  const url = new URL(href);
  const filters: string[] = [];
  const scopes = new Map<string, string>();
  const parts = url.pathname.split("/").filter(Boolean);
  for (let index = 0; index < parts.length - 1; index += 2) {
    const field = scopeFields[parts[index] ?? ""];
    const value = parts[index + 1];
    if (field && value) scopes.set(field, decodeURIComponent(value));
  }
  for (const field of [...Object.values(scopeFields), "fandom_id"]) {
    const value = url.searchParams.get(field);
    if (value && !scopes.has(field)) scopes.set(field, value);
  }
  for (const [field, value] of scopes) {
    filters.push(`${humanize(field)}: ${field === "tag_id" ? tagName(value) : value}`);
  }

  // Advanced results have a server-rendered filter summary, including resolved tag IDs.
  const summary = /\/(works|bookmarks)\/search\/?$/.test(url.pathname)
    ? normalizeWhitespace(doc.querySelector("#main > h4.heading")?.textContent)
    : null;
  const hasSummary = summary?.startsWith("You searched for:") ?? false;
  if (hasSummary && summary) filters.push(summary.replace(/^You searched for:\s*/, ""));

  const controls = [
    ...doc.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "#work-filters input, #work-filters select, #bookmark-filters input, #bookmark-filters select, form.work_search input, form.work_search select, form.bookmark_search input, form.bookmark_search select",
    ),
  ];
  for (const [key, raw] of url.searchParams) {
    const match = key.match(
      /^(?:(include|exclude)_)?(?:work|bookmark)_search\[([a-z_]+)\](?:\[\])?$/,
    );
    const field = match?.[2];
    const value = normalizeWhitespace(raw);
    if (!field || field === "page" || !value) continue;
    const excluded = match?.[1] === "exclude" || field.startsWith("excluded_");
    // AO3's advanced summary omits exclusions, including the user's default hidden tags.
    const omittedFromSummary =
      ["words_from", "words_to", "date_from", "date_to", "tag_ids"].includes(field) ||
      (url.pathname.includes("/bookmarks/") && ["sort_column", "sort_direction"].includes(field));
    if (hasSummary && !excluded && !omittedFromSummary) continue;
    if (["rec", "with_notes", "single_chapter"].includes(field) && ["0", "false"].includes(value))
      continue;

    const control = controls.find(
      (entry) => entry.name === key && (entry.tagName === "SELECT" || entry.value === raw),
    );
    const label = control?.tagName === "INPUT" ? inputLabel(control as HTMLInputElement) : null;
    const option =
      control?.tagName === "SELECT"
        ? [...(control as HTMLSelectElement).options].find((entry) => entry.value === raw)
        : null;
    const display = normalizeWhitespace(option?.label || option?.textContent) ?? value;
    if (field.endsWith("_ids")) {
      const prefix = ["tag_ids", "excluded_bookmark_tag_ids"].includes(field)
        ? " bookmark tags"
        : "";
      filters.push(`${excluded ? "Exclude" : "Include"}${prefix}: ${label ?? display}`);
    } else if (control?.type === "checkbox" || control?.type === "radio") {
      filters.push(label ?? `${humanize(field)}: ${display}`);
    } else if (["complete", "crossover"].includes(field)) {
      const values =
        field === "complete"
          ? { T: "Complete works only", F: "Works in progress only" }
          : { T: "Only crossovers", F: "Exclude crossovers" };
      filters.push(values[value as keyof typeof values] ?? `${humanize(field)}: ${display}`);
    } else {
      filters.push(`${fieldLabels[field] ?? humanize(field)}: ${display}`);
    }
  }
  return ([...new Set(filters.filter(Boolean))].join(" · ") || "AO3 search").slice(0, 191);
}
