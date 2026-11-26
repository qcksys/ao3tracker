import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { nodePostgresUrl } from "~/db/connection-url";
import { relations } from "~/db/relations";

export type TDatabase = ReturnType<typeof createDbConnection>;
export function createDbConnection(
  source: string | { DATABASE_URL: string; HYPERDRIVE?: { connectionString: string } },
) {
  const url =
    typeof source === "string"
      ? source
      : (source.HYPERDRIVE?.connectionString ?? source.DATABASE_URL);
  const client = new Pool({
    connectionString: nodePostgresUrl(url),
    statement_timeout: 900_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ...(typeof source === "string" ? {} : { max: 4, maxUses: 1 }),
  });
  return drizzle({ client, relations });
}
