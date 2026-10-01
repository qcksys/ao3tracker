import { Client } from "@planetscale/database";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { relations } from "~/db/relations";

export type TDatabase = ReturnType<typeof createDbConnection>;
export const createDbConnection = (url: string) => {
  const client = new Client({
    url,
    fetch: (url, init) => {
      if (init) {
        delete init.cache;
      }
      return fetch(url, init);
    },
  });
  return drizzle({ client, relations });
};
