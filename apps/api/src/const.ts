export function databasePrefix(environment: string) {
  switch (environment) {
    case "main":
    case "prod":
      return "ao3track__";
    case "dev":
      return "ao3track_dev__";
    case "local":
      return "ao3track_local__";
    default:
      throw new Error(`Unknown database environment: ${environment}`);
  }
}

export const DB_TABLE_PREFIX = databasePrefix(process.env.AO3_DB_ENV ?? "local");

export const PROD_ENV_NAME = "prod";

export const LOCAL_ENV_NAME = "local";

export const AO3_BASE_URL = "https://archiveofourown.org";

export const AO3_USER_AGENT = "AO3Tracker/1.0 (https://github.com/qcksys/ao3tracker)";
