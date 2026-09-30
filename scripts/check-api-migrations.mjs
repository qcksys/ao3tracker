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
  const journal = JSON.parse(await readFile(resolve(directory, "meta/_journal.json"), "utf8"));
  if (journal.dialect !== "mysql" || !Array.isArray(journal.entries) || !journal.entries.length) {
    throw new ReadinessError("The API migration journal must contain MySQL migrations.");
  }
  const migrations = [];
  for (const [index, entry] of journal.entries.entries()) {
    if (
      entry.idx !== index ||
      !/^[0-9]{4}_[a-zA-Z0-9_-]+$/.test(entry.tag) ||
      !Number.isSafeInteger(entry.when) ||
      entry.when <= (migrations.at(-1)?.when ?? 0)
    ) {
      throw new ReadinessError("The API migration journal has an invalid entry or order.");
    }
    const sql = await readFile(resolve(directory, `${entry.tag}.sql`), "utf8");
    if (!sql.trim()) throw new ReadinessError(`Migration ${entry.tag} is empty.`);
    const lfSql = sql.replaceAll("\r\n", "\n");
    migrations.push({
      tag: entry.tag,
      when: entry.when,
      hashes: [lfSql, lfSql.replaceAll("\n", "\r\n")].map((text) =>
        createHash("sha256").update(text).digest("hex"),
      ),
    });
  }
  const sqlFiles = (await readdir(directory)).filter((name) => name.endsWith(".sql"));
  if (
    sqlFiles.length !== migrations.length ||
    sqlFiles.some((name) => !migrations.some((entry) => name === `${entry.tag}.sql`))
  ) {
    throw new ReadinessError("Every API SQL migration must be registered in the journal.");
  }
  const snapshot = JSON.parse(
    await readFile(
      resolve(directory, `meta/${String(migrations.length - 1).padStart(4, "0")}_snapshot.json`),
      "utf8",
    ),
  );
  if (snapshot.dialect !== "mysql" || !snapshot.tables || !Object.keys(snapshot.tables).length) {
    throw new ReadinessError("The latest API migration must have a nonempty MySQL snapshot.");
  }
  return { migrations, snapshot };
}

export function verifyMigrationHistory(migrations, rows) {
  const expected = new Map(migrations.map((migration) => [migration.when, migration]));
  const applied = new Map();
  for (const row of rows) {
    const when = Number(row.created_at);
    if (!expected.has(when) || applied.has(when)) {
      throw new ReadinessError("Production migration history has unknown or duplicate entries.");
    }
    applied.set(when, row.hash);
  }
  for (const migration of migrations) {
    if (!applied.has(migration.when)) {
      throw new ReadinessError(`Production migration is not recorded: ${migration.tag}.`);
    }
    if (!migration.hashes.includes(applied.get(migration.when))) {
      throw new ReadinessError(`Production migration checksum differs: ${migration.tag}.`);
    }
  }
}

export function verifySchemaColumns(snapshot, rows) {
  const actual = new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
  for (const table of Object.values(snapshot.tables)) {
    for (const column of Object.values(table.columns)) {
      const name = `${table.name}.${column.name}`;
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
}

export async function checkDatabaseReadiness(connection, manifest) {
  let history;
  let columns;
  try {
    history = await connection.execute(
      "SELECT hash, created_at FROM `ao3track__migrations` ORDER BY created_at",
    );
    columns = await connection.execute(
      "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type, " +
        "DATETIME_PRECISION AS datetime_precision FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()",
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
