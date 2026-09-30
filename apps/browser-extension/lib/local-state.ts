let mutations: Promise<unknown> = Promise.resolve();

/** All background read-modify-write operations share this queue. */
export function withLocalState<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutations.then(operation);
  mutations = result.catch(() => undefined);
  return result;
}

export function nextUpdatedAt(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
