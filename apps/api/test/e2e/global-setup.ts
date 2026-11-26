import { execFile } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { createTestHarness } from "wrangler";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    apiUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const { provide } = project;
  const resources = new AsyncDisposableStack();
  try {
    const postgres = resources.use(await new PostgreSqlContainer("postgres:18").start());
    const databaseUrl = new URL(postgres.getConnectionUri());
    if (databaseUrl.hostname === "localhost") databaseUrl.hostname = "127.0.0.1";
    for (const environment of ["main", "dev", "local", "local"]) {
      await promisify(execFile)(
        process.execPath,
        [fileURLToPath(new URL("../../scripts/migrate.mjs", import.meta.url))],
        {
          env: { ...process.env, AO3_DB_ENV: environment, DATABASE_URL: databaseUrl.href },
          timeout: 120_000,
          windowsHide: true,
        },
      );
    }
    provide("databaseUrl", databaseUrl.href);
    const server = createTestHarness({
      root: fileURLToPath(new URL("../../", import.meta.url)),
      workers: [
        {
          config: {
            hyperdrive: [
              {
                binding: "HYPERDRIVE",
                id: "00000000000000000000000000000000",
                localConnectionString: databaseUrl.href,
              },
            ],
            name: "sync-e2e",
            main: "dist/ssr/index.js",
            compatibility_date: "2025-11-18",
            compatibility_flags: ["nodejs_compat"],
            r2_buckets: [{ binding: "WORK_BACKUPS_BUCKET", bucket_name: "e2e-backups" }],
            vars: {
              DATABASE_URL: databaseUrl.href,
              ENVIRONMENT: "local",
              BETTER_AUTH_URL: "http://localhost",
              BETTER_AUTH_SECRET: "e2e-only-secret-not-for-deployment-123456789",
              ALLOWED_ORIGINS: "http://localhost",
              GOOGLE_ID: "",
              GOOGLE_SECRET: "",
              WORK_CHECKER_TOKEN: "e2e-checker",
            },
          },
        },
      ],
    });
    resources.defer(() => server.close());
    provide("apiUrl", (await server.listen()).url.href.replace(/\/$/, ""));
    return async () => {
      if (project.vitest.state.getFiles().some((file) => file.result?.state === "fail")) {
        server.debug();
      }
      await resources.disposeAsync();
    };
  } catch (error) {
    await resources.disposeAsync();
    throw error;
  }
}
