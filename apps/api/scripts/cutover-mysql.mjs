import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Client as MySQL } from "@planetscale/database";
import pg from "pg";
import { nodePostgresUrl } from "../src/db/connection-url.ts";

const prefix = "ao3track__";
const ledger = "public.ao3track__mysql_cutover";
const role = "ao3track_prod_runtime";
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

class CutoverError extends Error {}
function check(condition, message) {
  if (!condition) throw new CutoverError(message);
}
function identifier(name) {
  check(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name), "Unexpected database identifier");
  return `"${name}"`;
}
function mysqlName(name) {
  return identifier(name).replaceAll('"', String.fromCharCode(96));
}
function wireText(_field, value) {
  return value === null ? null : decoder.decode(Buffer.from(value, "latin1"));
}
function normalize(value, column) {
  if (value === null) return null;
  if (column.type === "bool") {
    check(value === "1" || value === "0", `Invalid boolean on ${column.name}`);
    return value === "1";
  }
  if (column.type === "timestamptz") {
    const timestamp = /^(\d{4}-\d\d-\d\d) \d\d:\d\d:\d\d(?:\.(\d+))?$/.exec(value);
    check(
      timestamp &&
        !value.startsWith("0000") &&
        !/[1-9]/.test((timestamp[2] ?? "").slice(column.precision < 0 ? 6 : column.precision)),
      `Unrepresentable timestamp on ${column.name}`,
    );
    return `${value}+00`;
  }
  return value;
}

async function tableDefinitions(db, mysql) {
  const result = await db.query(
    "SELECT c.relname AS table_name,a.attname AS name,t.typname AS type,a.atttypmod AS precision,a.attidentity AS identity,coalesce(a.attnum=ANY(i.indkey),false) AS pk " +
      "FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_index i ON i.indrelid=c.oid AND i.indisprimary " +
      "WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND starts_with(c.relname,$1) AND c.relname NOT IN ($2,$3) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",
    [prefix, `${prefix}migrations`, `${prefix}mysql_cutover`],
  );
  const source = await mysql.execute(
    "SELECT TABLE_NAME AS tbl,COLUMN_NAME AS col,COLUMN_KEY AS key_type FROM information_schema.columns WHERE table_schema=database() AND left(table_name,10)='ao3track__' AND table_name<>'ao3track__migrations'",
  );
  const tables = Object.entries(Object.groupBy(result.rows, (c) => c.table_name)).map(
    ([name, columns]) => {
      const keys = columns.filter((c) => c.pk).map((c) => c.name);
      check(
        keys.length &&
          columns.every((c) =>
            source.rows.some(
              (m) => m.tbl === name && m.col === c.name && (m.key_type === "PRI") === c.pk,
            ),
          ),
        `Column or primary key mismatch on ${name}`,
      );
      return {
        name,
        columns,
        keys,
        target: `public.${identifier(name)}`,
        stage: identifier(`copy_${name}`),
      };
    },
  );
  check(
    tables.length === 21 && result.rows.length === source.rows.length,
    "Source and target schema inventories differ",
  );
  return tables;
}

async function snapshot(mysql, tables) {
  return mysql.transaction(async (tx) => {
    const counts = (
      await tx.execute(
        tables
          .map((t) => `SELECT '${t.name}' AS tbl,count(*) AS n FROM ${mysqlName(t.name)}`)
          .join(" UNION ALL "),
      )
    ).rows;
    const snapshot = new Map();
    for (const t of tables) {
      const n = Number(counts.find((c) => c.tbl === t.name)?.n);
      const rows = [];
      const selection =
        "SELECT " +
        t.columns.map((c) => mysqlName(c.name)).join(",") +
        " FROM " +
        mysqlName(t.name) +
        " ORDER BY " +
        t.keys.map(mysqlName).join(",");
      const pageSize = 2000;
      for (let offset = 0; offset < n; offset += pageSize) {
        const page = await tx.execute(`${selection} LIMIT ${pageSize} OFFSET ${offset}`, null, {
          as: "array",
          cast: wireText,
        });
        rows.push(...page.rows.map((r) => r.map((v, i) => normalize(v, t.columns[i]))));
      }
      check(rows.length === n, `Incomplete source snapshot on ${t.name}`);
      snapshot.set(t.name, {
        rows,
        hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      });
    }
    const inc = await tx.execute(
      "SELECT TABLE_NAME AS tbl,AUTO_INCREMENT AS next_id FROM information_schema.tables WHERE table_schema=database() AND table_name IN ('ao3track__notification','ao3track__work_tag')",
      null,
      { as: "object", cast: wireText },
    );
    check(inc.rows.length === 2, "Missing source identity counters");
    for (const r of inc.rows) {
      check(r.next_id === null || /^\d+$/.test(r.next_id), "Invalid identity counter");
      snapshot.get(r.tbl).next = r.next_id ?? "1";
    }
    return snapshot;
  });
}

function changed(tables, previous, current) {
  return tables.filter((t) => previous?.get(t.name)?.hash !== current.get(t.name).hash);
}
async function loadStage(db, t, rows) {
  await db.query(`TRUNCATE pg_temp.${t.stage}`);
  for (let i = 0; i < rows.length; i += 240) {
    const batch = rows.slice(i, i + 240);
    const bindings = batch
      .map((r, k) => `(${r.map((_, j) => `$${1 + k * r.length + j}`).join(",")})`)
      .join(",");
    await db.query(`INSERT INTO pg_temp.${t.stage} VALUES ${bindings}`, batch.flat());
  }
}
async function reconcile(db, t) {
  const sameKey = t.keys.map((k) => `a.${identifier(k)}=b.${identifier(k)}`).join(" AND ");
  const left = t.columns.map((c) => `a.${identifier(c.name)}`).join(",");
  const right = t.columns.map((c) => `b.${identifier(c.name)}`).join(",");
  const staging = `pg_temp.${t.stage}`;
  // Reinsert changed rows to preserve source audit times through BEFORE UPDATE triggers.
  await db.query(
    "DELETE FROM " +
      t.target +
      " a WHERE NOT EXISTS(SELECT FROM " +
      staging +
      " b WHERE " +
      sameKey +
      " AND ROW(" +
      left +
      ") IS NOT DISTINCT FROM ROW(" +
      right +
      "))",
  );
  await db.query(
    "INSERT INTO " +
      t.target +
      " (" +
      t.columns.map((c) => identifier(c.name)).join(",") +
      ") SELECT " +
      right +
      " FROM " +
      staging +
      " b WHERE NOT EXISTS(SELECT FROM " +
      t.target +
      " a WHERE " +
      sameKey +
      ")",
  );
}
async function verify(db, tables) {
  const differences = await db.query(
    tables
      .map((t) => {
        const cols = t.columns.map((c) => identifier(c.name)).join(",");
        const target = `SELECT ${cols} FROM ${t.target}`,
          staging = `SELECT ${cols} FROM pg_temp.${t.stage}`;
        return (
          "SELECT '" +
          t.name +
          "' AS tbl WHERE EXISTS((" +
          target +
          " EXCEPT ALL " +
          staging +
          ") UNION ALL (" +
          staging +
          " EXCEPT ALL " +
          target +
          "))"
        );
      })
      .join(" UNION ALL "),
  );
  check(
    !differences.rowCount,
    `Postgres row comparison failed for ${differences.rows.map((r) => r.tbl).join(",")}`,
  );
}
async function alignSequences(db, tables, snap) {
  for (const t of tables) {
    const c = t.columns.find((c) => c.identity);
    if (!c) continue;
    const seq = `public.${identifier(`${t.name}_${c.name}_seq`)}`;
    const {
      rows: [r],
    } = await db.query(
      "SELECT greatest((SELECT coalesce(max(" +
        identifier(c.name) +
        "),0)+1 FROM " +
        t.target +
        "), (SELECT last_value+is_called::integer FROM " +
        seq +
        "),$1::bigint) AS next",
      [snap.get(t.name).next],
    );
    check(/^[1-9]\d*$/.test(r.next), "Invalid next Postgres identity");
    await db.query(`ALTER SEQUENCE ${seq} RESTART WITH ${r.next}`);
  }
}
async function copy(db, tables, previous, current) {
  for (const table of changed(tables, previous, current)) {
    await loadStage(db, table, current.get(table.name).rows);
    await reconcile(db, table);
  }
  await verify(db, tables);
  await alignSequences(db, tables, current);
}
async function transaction(db, fn) {
  await db.query("BEGIN");
  try {
    const value = await fn();
    await db.query("COMMIT");
    return value;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
export async function cutover(db, mysql, deploy) {
  const {
    rows: [lock],
  } = await db.query(
    "SELECT pg_try_advisory_lock(hashtextextended('ao3tracker production mysql cutover',0)) AS acquired, pg_is_in_recovery() AS replica",
  );
  check(lock.acquired && !lock.replica, "Postgres primary or cutover lock unavailable");
  await db.query(
    "CREATE TABLE IF NOT EXISTS " +
      ledger +
      " (id integer PRIMARY KEY CHECK(id=1),phase text NOT NULL CHECK(phase IN ('copying','live')))",
  );
  const state = (await db.query(`SELECT phase FROM ${ledger} WHERE id=1`)).rows[0]?.phase;
  if (state === "live") {
    console.log("Production cutover already recorded; deploying without replaying MySQL");
    await deploy();
    return;
  }
  check(mysql, "Production copy is incomplete and no MySQL source was provided");
  const identity = await mysql.execute(
    "SELECT now()=utc_timestamp() AS utc, (SELECT count(*) FROM ao3track__work_checker_status WHERE checkerId='hub-prod') AS prod,(SELECT count(*) FROM ao3track__work_checker_status WHERE checkerId='hub-dev') AS dev",
  );
  check(
    Number(identity.rows[0].utc) === 1 &&
      Number(identity.rows[0].prod) === 1 &&
      Number(identity.rows[0].dev) === 0,
    "Source is not the verified UTC production database",
  );
  const tables = await tableDefinitions(db, mysql);
  const targets = tables.map((t) => t.target).join(",");
  for (const t of tables) {
    await db.query(`CREATE TEMP TABLE ${t.stage} AS TABLE ${t.target} WITH NO DATA`);
    await db.query(
      "ALTER TABLE pg_temp." +
        t.stage +
        " ADD PRIMARY KEY (" +
        t.keys.map(identifier).join(",") +
        ")",
    );
  }
  const baseline = await snapshot(mysql, tables);
  await transaction(db, async () => {
    await db.query(`LOCK TABLE ${targets} IN ACCESS EXCLUSIVE MODE NOWAIT`);
    if (!state) {
      const { rows } = await db.query(
        tables
          .map((t) => `SELECT '${t.name}' AS tbl WHERE EXISTS(SELECT FROM ${t.target})`)
          .join(" UNION ALL "),
      );
      check(!rows.length, "Initial destination contains data without a cutover record");
      await db.query(`INSERT INTO ${ledger} VALUES(1,'copying')`);
    } else {
      const {
        rows: [p],
      } = await db.query(
        "SELECT has_table_privilege($1,'public.ao3track__auth_user','INSERT') AS writable",
        [role],
      );
      check(!p.writable, "Cannot replay into a writable destination");
    }
    await db.query(`REVOKE INSERT,UPDATE,DELETE ON TABLE ${targets} FROM ${identifier(role)}`);
    await copy(db, tables, null, baseline);
  });
  console.log(
    "Verified baseline:",
    tables.length,
    "tables,",
    Array.from(baseline.values()).reduce((n, t) => n + t.rows.length, 0),
    "rows",
  );
  let last = baseline;
  await transaction(db, async () => {
    await db.query(`LOCK TABLE ${targets} IN ACCESS EXCLUSIVE MODE NOWAIT`);
    await deploy();
    for (let i = 0; i < 5; i++) {
      const current = await snapshot(mysql, tables);
      await copy(db, tables, last, current);
      const confirmation = await snapshot(mysql, tables);
      last = current;
      if (changed(tables, current, confirmation).length) continue;
      await alignSequences(db, tables, confirmation);
      await db.query(`GRANT INSERT,UPDATE,DELETE ON TABLE ${targets} TO ${identifier(role)}`);
      await db.query(`UPDATE ${ledger} SET phase='live' WHERE id=1`);
      last = confirmation;
      return;
    }
    throw new CutoverError("MySQL was still changing; production Postgres writes remain fenced");
  });
  console.log(
    "Production cutover committed:",
    tables.length,
    "tables,",
    Array.from(last.values()).reduce((n, t) => n + t.rows.length, 0),
    "rows verified against two source snapshots",
  );
  await delay(20000);
  const late = await snapshot(mysql, tables);
  const lateChanges = changed(tables, last, late);
  check(
    !lateChanges.length,
    "Post-cutover MySQL changes require reconciliation: " +
      lateChanges.map((t) => t.name).join(","),
  );
  const advanced = tables.filter((t) => {
    const next = late.get(t.name).next;
    return next !== undefined && BigInt(next) > BigInt(last.get(t.name).next);
  });
  if (advanced.length) {
    await transaction(db, async () => {
      await db.query(
        `LOCK TABLE ${advanced.map((t) => t.target).join(",")} IN SHARE ROW EXCLUSIVE MODE`,
      );
      await alignSequences(db, advanced, late);
    });
  }
  console.log("No late source row changes; identity counters verified");
}

async function main() {
  const source = process.env.MYSQL_SOURCE_URL ? new URL(process.env.MYSQL_SOURCE_URL) : null;
  const destination = new URL(nodePostgresUrl(process.env.POSTGRES_CUTOVER_URL));
  check(
    (!source || (source.protocol === "mysql:" && source.hostname.endsWith(".psdb.cloud"))) &&
      ["postgres:", "postgresql:"].includes(destination.protocol) &&
      destination.hostname.endsWith(".psdb.cloud"),
    "Invalid PlanetScale endpoints",
  );
  if (destination.port === "6432") destination.port = "5432";
  delete process.env.MYSQL_SOURCE_URL;
  delete process.env.POSTGRES_CUTOVER_URL;
  const mysql =
    source &&
    new MySQL({
      url: source.href,
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }),
    });
  const db = new pg.Client({
    connectionString: destination.href,
    connectionTimeoutMillis: 12000,
    application_name: "ao3-production-cutover",
  });
  const [program, ...args] = process.argv.slice(2);
  check(
    program === "vp" && args.includes("wrangler") && args.includes("deploy"),
    "Missing production release command",
  );
  try {
    await db.connect();
    await cutover(
      db,
      mysql,
      () =>
        new Promise((resolve, reject) => {
          const p = spawn(program, args, { stdio: "inherit" });
          p.on("error", reject);
          p.on("exit", (code) =>
            code === 0 ? resolve() : reject(new CutoverError("Worker deploy failed")),
          );
        }),
    );
  } finally {
    await db.end();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Driver errors can contain full rows, SQL parameters or credentials.
    console.error(
      error instanceof CutoverError
        ? error.message
        : "Cutover failed (" +
            String(error.code ?? error.name)
              .replace(/[^a-z0-9_]/gi, "")
              .slice(0, 30) +
            ")",
    );
    process.exitCode = 1;
  });
}
