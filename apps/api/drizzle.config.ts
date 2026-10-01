import "./src/env";
import type { Config } from "drizzle-kit";
import { DB_TABLE_PREFIX } from "./src/const";

// RC.4 combines the local year with UTC dates when naming migration folders.
process.env.TZ = "UTC";

const env = process.env as { DATABASE_URL: string };

export const drizzleConfig: {
  schema: string;
  out: string;
} = {
  schema: "./src/db/schema/*",
  out: "./src/db/migrations",
};

export default {
  dialect: "mysql",
  schema: drizzleConfig.schema,
  out: drizzleConfig.out,
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  tablesFilter: [DB_TABLE_PREFIX],
  migrations: {
    table: `${DB_TABLE_PREFIX}migrations`,
  },
} satisfies Config;
