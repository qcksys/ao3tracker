import pg from "pg";
import { expect, inject, it } from "vitest";
import { cutover } from "../../scripts/cutover-mysql.mjs";

it("resumes a failed handoff, verifies changes made during deployment and never replays over live data", async () => {
  const url = inject("databaseUrl");
  const connect = async () => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    return db;
  };
  let db = await connect();
  try {
    await db.query("CREATE ROLE ao3track_prod_runtime");
    await db.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ao3track_prod_runtime",
    );
    const { rows: columns } = await db.query(
      "SELECT c.relname AS tbl,a.attname AS col,CASE WHEN a.attnum=ANY(i.indkey) THEN 'PRI' ELSE '' END AS key_type FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid JOIN pg_index i ON i.indrelid=c.oid AND i.indisprimary WHERE c.relnamespace='public'::regnamespace AND starts_with(c.relname,'ao3track__') AND c.relname<>'ao3track__migrations' AND a.attnum>0 AND NOT a.attisdropped",
    );
    const names = [...new Set(columns.map((c) => c.tbl))];
    const created = "2026-11-20 01:02:03";
    const fixture = {
      ao3track__app_setting: [
        ["old", "null", created, created, null],
        ["kept", '{"long":9007199254740993}', created, created, null],
      ],
      ao3track__work_tag: [["9007199254740993", "Café ☕", "/tags/test", "7"]],
    };
    const mysql = {
      async execute(sql) {
        if (sql.includes(" AS utc")) return { rows: [{ utc: "1", prod: "1", dev: "0" }] };
        if (sql.includes("information_schema.columns")) return { rows: columns };
        if (sql.includes(" UNION ALL "))
          return { rows: names.map((tbl) => ({ tbl, n: fixture[tbl]?.length ?? 0 })) };
        if (sql.includes("information_schema.tables"))
          return {
            rows: [
              { tbl: "ao3track__notification", next_id: "3" },
              { tbl: "ao3track__work_tag", next_id: "9007199254741005" },
            ],
          };
        const tbl = / FROM .(ao3track__\w+). ORDER BY /.exec(sql)?.[1];
        if (!Object.hasOwn(fixture, tbl)) throw Error("Unexpected fixture query");
        return { rows: fixture[tbl].map((r) => [...r]) };
      },
      async transaction(fn) {
        return fn(this);
      },
    };
    await expect(
      cutover(db, mysql, async () => {
        throw Error("upload interrupted");
      }),
    ).rejects.toThrow("upload interrupted");
    expect((await db.query("SELECT phase FROM ao3track__mysql_cutover")).rows[0].phase).toBe(
      "copying",
    );
    expect(
      (
        await db.query(
          "SELECT has_table_privilege('ao3track_prod_runtime','ao3track__app_setting','INSERT') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    await db.end();
    db = await connect();
    await cutover(db, mysql, async () => {
      fixture.ao3track__app_setting = [
        ["new", '"✅"', created, created, null],
        ["kept", '{"long":9007199254740995}', created, created, null],
      ];
    });
    expect(
      (await db.query("SELECT key,value::text AS value FROM ao3track__app_setting ORDER BY key"))
        .rows,
    ).toEqual([
      { key: "kept", value: '{"long": 9007199254740995}' },
      { key: "new", value: '"✅"' },
    ]);
    expect((await db.query("SELECT nextval('ao3track__work_tag_id_seq') AS id")).rows[0].id).toBe(
      "9007199254741005",
    );
    expect(
      (
        await db.query(
          "SELECT has_table_privilege('ao3track_prod_runtime','ao3track__app_setting','INSERT') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(true);
    await db.query("DELETE FROM ao3track__app_setting WHERE key='kept'");
    await cutover(db, null, async () => {});
    expect((await db.query("SELECT key FROM ao3track__app_setting")).rows).toEqual([
      { key: "new" },
    ]);
  } finally {
    await db.end();
  }
}, 60000);
