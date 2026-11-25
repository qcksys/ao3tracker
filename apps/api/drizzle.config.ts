import "./src/env";
import type { Config } from "drizzle-kit";
import { DB_TABLE_PREFIX, databasePrefix } from "./src/const";
import { nodePostgresUrl } from "./src/db/connection-url";

// RC.4 combines the local year with UTC dates when naming migration folders.
process.env.TZ = "UTC";
if (process.argv.includes("generate") && DB_TABLE_PREFIX !== databasePrefix("local")) {
  throw new Error("Generate shared migrations with AO3_DB_ENV=local.");
}

const env = process.env as { DATABASE_URL: string };

export const drizzleConfig: {
  schema: string;
  out: string;
} = {
  schema: "./src/db/schema/*",
  out: "./src/db/postgres-migrations",
};

export default {
  dialect: "postgresql",
  schema: drizzleConfig.schema,
  out: drizzleConfig.out,
  dbCredentials: {
    url: nodePostgresUrl(env.DATABASE_URL),
  },
  tablesFilter: [`${DB_TABLE_PREFIX}*`],
  migrations: {
    table: `${DB_TABLE_PREFIX}migrations`,
  },
} satisfies Config;
