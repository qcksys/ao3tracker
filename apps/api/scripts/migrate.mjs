import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@planetscale/database";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { migrate } from "drizzle-orm/planetscale-serverless/migrator";
import { DB_TABLE_PREFIX } from "../src/const.ts";

export async function runMigrations(url) {
  if (!url) throw new Error("DATABASE_URL is required");
  const client = new Client({
    url,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
  });
  await migrate(drizzle({ client }), {
    migrationsFolder: fileURLToPath(new URL("../src/db/migrations/", import.meta.url)),
    migrationsTable: `${DB_TABLE_PREFIX}migrations`,
  });
}

export function formatMigrationError(error, url) {
  const messages = [];
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    messages.push(cause.message);
  }
  const secrets = [url];
  if (url && URL.canParse(url)) {
    const { username, password } = new URL(url);
    secrets.push(username, password);
    try {
      secrets.push(decodeURIComponent(username), decodeURIComponent(password));
    } catch {
      // Invalid percent escapes are still covered by the raw credentials above.
    }
  }
  return secrets
    .filter(Boolean)
    .reduce(
      (message, secret) => message.replaceAll(secret, "[REDACTED]"),
      messages.join("\nCaused by: ") || "Unknown migration error",
    );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dotenv.config({ path: fileURLToPath(new URL("../.dev.vars", import.meta.url)), quiet: true });
  const url = process.env.DATABASE_URL;
  try {
    await runMigrations(url);
    console.log({ message: "Database migrations applied successfully" });
  } catch (error) {
    console.error({
      message: "Database migration failed",
      error: formatMigrationError(error, url),
    });
    process.exitCode = 1;
  }
}
