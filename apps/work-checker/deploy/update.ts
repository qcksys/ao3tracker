/**
 * Deploy the CI-published work checker image for each API environment. Run on hub by
 * ao3-work-checker-update.service with `node update.ts`.
 *
 * Each environment follows one image tag, which CI moves only after that environment's API
 * deployment succeeded. The updater resolves the tag to a digest, replaces only that
 * environment's container, and records the digest once Compose reports it healthy. The
 * healthcheck passes only after a poll reached the Worker with the configured token.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const IMAGE = "ghcr.io/qcksys/ao3tracker-work-checker";
/** Compose service -> image tag published by that environment's release */
export const ENVIRONMENTS = { dev: "dev", prod: "main" } as const;

export type Service = keyof typeof ENVIRONMENTS;
export interface DeploymentRecord {
  image: string;
  previousImage: string | null;
  deployedAt: number;
}
export type DeploymentState = Partial<Record<Service, DeploymentRecord>>;

/** Compose variables pinning every deployed environment, and optionally one new digest */
export function imageEnv(
  state: DeploymentState,
  service?: Service,
  digest?: string,
): Record<string, string> {
  const images: Partial<Record<Service, string>> = {};
  for (const [name, record] of Object.entries(state)) {
    if (record?.image) images[name as Service] = record.image;
  }
  if (service && digest) images[service] = digest;
  return Object.fromEntries(
    Object.entries(images).map(([name, image]) => [`${name.toUpperCase()}_IMAGE`, image]),
  );
}

/** Whether a failed pull means the tag has not been published yet, rather than an outage */
export function isUnpublished(output: string): boolean {
  return /manifest unknown|not found/i.test(output);
}

export function repoDigest(repoDigests: string[]): string {
  const digest = repoDigests.find((value) => value.startsWith(`${IMAGE}@sha256:`));
  if (!digest) throw new Error(`No ${IMAGE} digest among ${repoDigests.join(", ")}`);
  return digest;
}

function run(args: string[], directory: string, env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync(args[0], args.slice(1), {
    cwd: directory,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15 * 60_000,
  }).trim();
}

function failureOutput(error: unknown): string {
  const { stdout, stderr, message } = error as {
    stdout?: string;
    stderr?: string;
    message?: string;
  };
  return `${stdout ?? ""}${stderr ?? ""}` || (message ?? String(error));
}

function deploy(directory: string, service: Service, state: DeploymentState): boolean {
  const tag = `${IMAGE}:${ENVIRONMENTS[service]}`;
  try {
    run(["docker", "pull", tag], directory);
  } catch (error) {
    if (isUnpublished(failureOutput(error))) {
      console.log(`${service}: ${tag} is not published yet`);
      return false;
    }
    throw error;
  }
  const digest = repoDigest(
    JSON.parse(
      run(["docker", "image", "inspect", tag, "--format", "{{json .RepoDigests}}"], directory),
    ),
  );
  const previous = state[service];
  if (previous?.image === digest) return false;

  const env = { ...process.env, ...imageEnv(state, service, digest) };
  const compose = ["docker", "compose", "--file", join(directory, "compose.yaml")];
  run([...compose, "config", "--quiet"], directory, env);
  console.log(`${service}: deploying ${digest}`);
  run(
    [
      ...compose,
      "up",
      "--detach",
      "--wait",
      "--wait-timeout",
      "300",
      "--pull",
      "never",
      "--no-deps",
      service,
    ],
    directory,
    env,
  );
  state[service] = {
    image: digest,
    previousImage: previous?.image ?? null,
    deployedAt: Math.floor(Date.now() / 1000),
  };
  console.log(`${service}: verified healthy deployment ${digest}`);
  return true;
}

export function update(directory: string): void {
  const stateFile = join(directory, "deployment.json");
  const state: DeploymentState = existsSync(stateFile)
    ? JSON.parse(readFileSync(stateFile, "utf8"))
    : {};
  const failures: string[] = [];
  for (const service of Object.keys(ENVIRONMENTS) as Service[]) {
    try {
      if (deploy(directory, service, state)) {
        writeFileSync(`${stateFile}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
        renameSync(`${stateFile}.tmp`, stateFile);
      }
    } catch (error) {
      failures.push(`${service}: ${failureOutput(error)}`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    update(process.argv[2] ?? dirname(fileURLToPath(import.meta.url)));
  } catch (error) {
    console.error(`Deployment failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
