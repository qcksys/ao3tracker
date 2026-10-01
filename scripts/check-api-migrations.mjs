import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const migrationsDirectory = fileURLToPath(
  new URL("../apps/api/src/db/migrations/", import.meta.url),
);
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));

class ReadinessError extends Error {}

export async function readMigrationManifest(directory = migrationsDirectory) {
  const folders = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const migrations = [];
  let snapshot;
  for (const folder of folders) {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_[a-zA-Z0-9_-]+$/.exec(folder.name);
    if (!folder.isDirectory() || !match) {
      throw new ReadinessError(
        "Every API migration must use a timestamped Drizzle migration folder.",
      );
    }
    const [, year, month, day, hour, minute, second] = match;
    const date = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
    const when = Date.parse(date);
    if (!Number.isSafeInteger(when) || new Date(when).toISOString() !== date) {
      throw new ReadinessError(`Migration ${folder.name} has an invalid UTC timestamp.`);
    }
    const sql = await readFile(resolve(directory, folder.name, "migration.sql"), "utf8");
    if (!sql.trim()) throw new ReadinessError(`Migration ${folder.name} is empty.`);
    const lfSql = sql.replaceAll("\r\n", "\n");
    migrations.push({
      tag: folder.name,
      when,
      hashes: [lfSql, lfSql.replaceAll("\n", "\r\n")].map((text) =>
        createHash("sha256").update(text).digest("hex"),
      ),
    });
    snapshot = JSON.parse(await readFile(resolve(directory, folder.name, "snapshot.json"), "utf8"));
  }
  if (
    snapshot?.dialect !== "mysql" ||
    snapshot.version !== "6" ||
    !snapshot.ddl?.some((entity) => entity.entityType === "columns")
  ) {
    throw new ReadinessError("The latest API migration must have a nonempty MySQL snapshot.");
  }
  return { migrations, snapshot };
}

export function verifyMigrationHistory(migrations, rows) {
  const namedHistory = rows.some((row) => Object.hasOwn(row, "name"));
  const applied = new Set();
  for (const row of rows) {
    // The RC folder format drops milliseconds; upgraded legacy ledgers retain them.
    const when = Math.floor(Number(row.created_at) / 1000) * 1000;
    const candidates = migrations.filter((migration) =>
      namedHistory
        ? migration.tag === row.name && migration.when === when
        : migration.when === when,
    );
    const migration =
      candidates.length === 1
        ? candidates[0]
        : candidates.find((candidate) => candidate.hashes.includes(row.hash));
    if (!migration || applied.has(migration.tag)) {
      throw new ReadinessError("Production migration history has unknown or duplicate entries.");
    }
    if (!migration.hashes.includes(row.hash)) {
      throw new ReadinessError(`Production migration checksum differs: ${migration.tag}.`);
    }
    applied.add(migration.tag);
  }
  for (const migration of migrations) {
    if (!applied.has(migration.tag)) {
      throw new ReadinessError(`Production migration is not recorded: ${migration.tag}.`);
    }
  }
}

export function verifySchemaColumns(snapshot, rows) {
  const actual = new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
  for (const column of snapshot.ddl.filter((entity) => entity.entityType === "columns")) {
    const name = `${column.table}.${column.name}`;
    const live = actual.get(name);
    if (!live) throw new ReadinessError(`Production schema is missing ${name}.`);
    const temporalType = /^(datetime|timestamp)(?:\((\d+)\))?$/.exec(column.type);
    if (
      temporalType &&
      (live.data_type !== temporalType[1] ||
        Number(live.datetime_precision) < Number(temporalType[2] ?? 0))
    ) {
      throw new ReadinessError(`Production schema needs ${column.type} for ${name}.`);
    }
  }
}

export async function checkDatabaseReadiness(connection, manifest) {
  let history;
  let columns;
  try {
    columns = await connection.execute(
      "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type, " +
        "DATETIME_PRECISION AS datetime_precision FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()",
    );
    const hasNames = columns.rows.some(
      (column) => column.table_name === "ao3track__migrations" && column.column_name === "name",
    );
    history = await connection.execute(
      hasNames
        ? "SELECT hash, created_at, name FROM `ao3track__migrations` ORDER BY created_at"
        : "SELECT hash, created_at FROM `ao3track__migrations` ORDER BY created_at",
    );
  } catch {
    throw new ReadinessError(
      "Could not read the production migration ledger and schema. Check DATABASE_URL, read permissions, and the ao3track__migrations ledger.",
    );
  }
  verifyMigrationHistory(manifest.migrations, history.rows);
  verifySchemaColumns(manifest.snapshot, columns.rows);
}

export async function main(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new ReadinessError(
      "Set a read-only production DATABASE_URL in the api-production environment.",
    );
  }
  const manifest = await readMigrationManifest();
  const { connect } = await import(pathToFileURL(apiRequire.resolve("@planetscale/database")).href);
  const connection = connect({
    url: env.DATABASE_URL,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
  });
  await checkDatabaseReadiness(connection, manifest);
  console.log(
    `Production database is ready for ${manifest.migrations.length} recorded API migrations.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      error instanceof ReadinessError ? error.message : "API database readiness check failed.",
    );
    console.error(
      "Deployment stopped. Review and apply schema changes through PlanetScale, then reconcile the migration ledger after verifying production. This check never applies SQL or baselines history.",
    );
    process.exitCode = 1;
  });
}
