/** JSON-lines logging, so `docker logs` output stays structured like the Worker's logs */
type LogFields = { message: string } & Record<string, unknown>;

export const log = {
  info: (fields: LogFields) => console.log(JSON.stringify({ level: "info", ...fields })),
  warn: (fields: LogFields) => console.warn(JSON.stringify({ level: "warn", ...fields })),
  error: (fields: LogFields) => console.error(JSON.stringify({ level: "error", ...fields })),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
