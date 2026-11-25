/** node-postgres reads sslrootcert as a file path. PlanetScale's libpq URL uses "system" for the runtime's trusted roots. */
export function nodePostgresUrl(connectionString: string): string {
  const url = URL.parse(connectionString);
  if (url?.searchParams.get("sslrootcert") !== "system") return connectionString;
  url.searchParams.delete("sslrootcert");
  url.searchParams.set("sslmode", "verify-full");
  return url.href;
}
