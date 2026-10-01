import { sql } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/db.client";

afterEach(() => vi.unstubAllGlobals());

it("executes parameterized queries through the installed PlanetScale driver", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      result: {
        fields: [{ name: "answer", type: "INT32" }],
        rows: [{ lengths: ["2"], values: btoa("42") }],
      },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const db = createDbConnection("mysql://test:test@database.example/test");
  const result = await db.execute(sql`SELECT ${42} AS answer`);

  expect(result.rows).toEqual([{ answer: 42 }]);
  expect(fetchMock).toHaveBeenCalledOnce();
  const request = fetchMock.mock.calls[0][1];
  expect(await new Response(request?.body).json()).toMatchObject({ query: "SELECT 42 AS answer" });
  expect(request).not.toHaveProperty("cache");
});
