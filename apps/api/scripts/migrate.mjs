import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/pg-core/async/session";
import pg from "pg";
import { databasePrefix } from "../src/const.ts";
import { nodePostgresUrl } from "../src/db/connection-url.ts";

export function postgresMigrations(environment) {
  const prefix = databasePrefix(environment);
  const migrations = readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL("../src/db/postgres-migrations/", import.meta.url)),
  });
  for (const migration of migrations) {
    migration.sql = migration.sql.map((statement) =>
      statement.replaceAll('"ao3track_local__', `"${prefix}`),
    );
  }
  return { migrations, migrationsTable: `${prefix}migrations` };
}

export async function runMigrations(url, environment = process.env.AO3_DB_ENV ?? "local") {
  if (!url) throw new Error("DATABASE_URL is required");
  if (!/^postgres(?:ql)?:\/\//i.test(url)) {
    throw new Error("DATABASE_URL must be a Postgres connection string");
  }
  const { migrations, migrationsTable } = postgresMigrations(environment);
  const client = new pg.Pool({
    connectionString: nodePostgresUrl(url),
    connectionTimeoutMillis: 10_000,
  });
  try {
    await migrate(migrations, drizzle({ client }), { migrationsSchema: "public", migrationsTable });
  } finally {
    await client.end();
  }
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
