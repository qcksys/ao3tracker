import { execFile } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import { MySqlContainer } from "@testcontainers/mysql";
import { GenericContainer, Network, Wait } from "testcontainers";
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
    const network = resources.use(await new Network().start());
    const mysql = resources.use(
      await new MySqlContainer("mysql:8.0.45")
        .withDatabase("sync_e2e")
        .withNetwork(network)
        .withNetworkAliases("mysql")
        .withCommand(["--default-time-zone=+00:00", "--max-connections=1000"])
        .start(),
    );
    const proxy = resources.use(
      await new GenericContainer("ghcr.io/mattrobenolt/ps-http-sim:v0.0.12")
        .withNetwork(network)
        .withCommand([
          "-listen-addr=0.0.0.0",
          "-listen-port=3900",
          "-mysql-addr=mysql",
          "-mysql-dbname=sync_e2e",
          "-mysql-max-rows=100000",
          "-mysql-idle-timeout=1s",
          "-log-level=warn",
        ])
        .withExposedPorts(3900)
        .withWaitStrategy(Wait.forHttp("/", 3900).forStatusCode(404))
        .start(),
    );

    const databaseUrl = new URL(`http://${proxy.getHost()}:${proxy.getMappedPort(3900)}`);
    databaseUrl.username = mysql.getUsername();
    databaseUrl.password = mysql.getUserPassword();
    await promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL("../../scripts/migrate.mjs", import.meta.url))],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl.href },
        timeout: 120_000,
        windowsHide: true,
      },
    );
    provide("databaseUrl", databaseUrl.href);
    const server = createTestHarness({
      root: fileURLToPath(new URL("../../", import.meta.url)),
      workers: [
        {
          config: {
            name: "sync-e2e",
            main: "dist/ssr/index.js",
            compatibility_date: "2025-11-18",
            compatibility_flags: ["nodejs_compat"],
            vars: {
              DATABASE_URL: databaseUrl.href,
              ENVIRONMENT: "local",
              BETTER_AUTH_URL: "http://localhost",
              BETTER_AUTH_SECRET: "e2e-only-secret-not-for-deployment-123456789",
              ALLOWED_ORIGINS: "http://localhost",
              GOOGLE_ID: "",
              GOOGLE_SECRET: "",
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
