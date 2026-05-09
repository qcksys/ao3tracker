import { describe, expect, it } from "vitest";
import { type LWWField, resolveLWW } from "~/db/helpers/lww";

describe("lww", () => {
    describe("resolveLWW", () => {
        const baseDate = new Date("2024-01-01T12:00:00Z");
        const olderDate = new Date("2024-01-01T10:00:00Z");
        const newerDate = new Date("2024-01-01T14:00:00Z");

        describe("when only client has explicit timestamp", () => {
            it("should return client value with shouldUpdate=true", () => {
                const client: LWWField<boolean> = {
                    value: true,
                    updatedAt: baseDate,
                    fallbackTs: olderDate,
                };
                const server: LWWField<boolean> = {
                    value: false,
                    updatedAt: null,
                    fallbackTs: newerDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(true);
                expect(result.value).toBe(true);
                expect(result.updatedAt).toEqual(baseDate);
            });

            it("should prefer client even when server fallback is newer", () => {
                const client: LWWField<string> = {
                    value: "client",
                    updatedAt: olderDate,
                    fallbackTs: olderDate,
                };
                const server: LWWField<string> = {
                    value: "server",
                    updatedAt: null,
                    fallbackTs: newerDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(true);
                expect(result.value).toBe("client");
            });
        });

        describe("when only server has explicit timestamp", () => {
            it("should return server value with shouldUpdate=false", () => {
                const client: LWWField<boolean> = {
                    value: true,
                    updatedAt: null,
                    fallbackTs: newerDate,
                };
                const server: LWWField<boolean> = {
                    value: false,
                    updatedAt: baseDate,
                    fallbackTs: olderDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(false);
                expect(result.value).toBe(false);
                expect(result.updatedAt).toEqual(baseDate);
            });

            it("should prefer server even when client fallback is newer", () => {
                const client: LWWField<string> = {
                    value: "client",
                    updatedAt: null,
                    fallbackTs: newerDate,
                };
                const server: LWWField<string> = {
                    value: "server",
                    updatedAt: olderDate,
                    fallbackTs: olderDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(false);
                expect(result.value).toBe("server");
            });
        });

        describe("when both have explicit timestamps", () => {
            it("should return client value when client timestamp is newer", () => {
                const client: LWWField<boolean> = {
                    value: true,
                    updatedAt: newerDate,
                    fallbackTs: olderDate,
                };
                const server: LWWField<boolean> = {
                    value: false,
                    updatedAt: baseDate,
                    fallbackTs: olderDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(true);
                expect(result.value).toBe(true);
                expect(result.updatedAt).toEqual(newerDate);
            });

            it("should return server value when server timestamp is newer", () => {
                const client: LWWField<boolean> = {
                    value: true,
                    updatedAt: baseDate,
                    fallbackTs: newerDate,
                };
                const server: LWWField<boolean> = {
                    value: false,
                    updatedAt: newerDate,
                    fallbackTs: olderDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(false);
                expect(result.value).toBe(false);
                expect(result.updatedAt).toEqual(newerDate);
            });

            it("should return server value on timestamp tie (server wins)", () => {
                const client: LWWField<boolean> = {
                    value: true,
                    updatedAt: baseDate,
                    fallbackTs: olderDate,
                };
                const server: LWWField<boolean> = {
                    value: false,
                    updatedAt: baseDate,
                    fallbackTs: olderDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(false);
                expect(result.value).toBe(false);
            });
        });

        describe("when neither has explicit timestamp", () => {
            it("should compare fallback timestamps and return client when newer", () => {
                const client: LWWField<boolean> = {
                    value: true,
                    updatedAt: null,
                    fallbackTs: newerDate,
                };
                const server: LWWField<boolean> = {
                    value: false,
                    updatedAt: null,
                    fallbackTs: baseDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(true);
                expect(result.value).toBe(true);
                expect(result.updatedAt).toEqual(newerDate);
            });

            it("should compare fallback timestamps and return server when newer", () => {
                const client: LWWField<boolean> = {
                    value: true,
                    updatedAt: null,
                    fallbackTs: baseDate,
                };
                const server: LWWField<boolean> = {
                    value: false,
                    updatedAt: null,
                    fallbackTs: newerDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(false);
                expect(result.value).toBe(false);
                expect(result.updatedAt).toEqual(newerDate);
            });

            it("should return server on fallback timestamp tie (server wins)", () => {
                const client: LWWField<boolean> = {
                    value: true,
                    updatedAt: null,
                    fallbackTs: baseDate,
                };
                const server: LWWField<boolean> = {
                    value: false,
                    updatedAt: null,
                    fallbackTs: baseDate,
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(false);
                expect(result.value).toBe(false);
            });
        });

        describe("with different value types", () => {
            it("should work with number values", () => {
                const client: LWWField<number> = {
                    value: 100,
                    updatedAt: newerDate,
                    fallbackTs: baseDate,
                };
                const server: LWWField<number> = {
                    value: 50,
                    updatedAt: baseDate,
                    fallbackTs: baseDate,
                };

                const result = resolveLWW(client, server);

                expect(result.value).toBe(100);
            });

            it("should work with string values", () => {
                const client: LWWField<string> = {
                    value: "new",
                    updatedAt: newerDate,
                    fallbackTs: baseDate,
                };
                const server: LWWField<string> = {
                    value: "old",
                    updatedAt: baseDate,
                    fallbackTs: baseDate,
                };

                const result = resolveLWW(client, server);

                expect(result.value).toBe("new");
            });

            it("should work with object values", () => {
                const clientObj = { name: "client" };
                const serverObj = { name: "server" };

                const client: LWWField<{ name: string }> = {
                    value: clientObj,
                    updatedAt: newerDate,
                    fallbackTs: baseDate,
                };
                const server: LWWField<{ name: string }> = {
                    value: serverObj,
                    updatedAt: baseDate,
                    fallbackTs: baseDate,
                };

                const result = resolveLWW(client, server);

                expect(result.value).toBe(clientObj);
            });
        });

        describe("real-world sync scenarios", () => {
            it("should handle favourite toggle on Device A while Device B syncs reading progress", () => {
                // Device A toggled favourite at 2pm with explicit timestamp
                // Device B synced reading progress at 3pm but has no favourite timestamp
                const deviceA: LWWField<boolean> = {
                    value: true, // favourited
                    updatedAt: new Date("2024-01-01T14:00:00Z"), // favouriteUpdatedAt
                    fallbackTs: new Date("2024-01-01T10:00:00Z"), // lastReadAt (old)
                };
                const deviceB: LWWField<boolean> = {
                    value: false, // not favourited (default)
                    updatedAt: null, // no favouriteUpdatedAt
                    fallbackTs: new Date("2024-01-01T15:00:00Z"), // lastReadAt (newer)
                };

                // Device A should win because it has an explicit timestamp
                const result = resolveLWW(deviceA, deviceB);

                expect(result.shouldUpdate).toBe(true);
                expect(result.value).toBe(true); // favourite preserved
            });

            it("should handle subscription change overriding older explicit change", () => {
                // Server had subscription set to false at 2pm
                // Client changes it to true at 3pm
                const client: LWWField<boolean> = {
                    value: true, // subscribing
                    updatedAt: new Date("2024-01-01T15:00:00Z"),
                    fallbackTs: new Date("2024-01-01T10:00:00Z"),
                };
                const server: LWWField<boolean> = {
                    value: false, // unsubscribed
                    updatedAt: new Date("2024-01-01T14:00:00Z"),
                    fallbackTs: new Date("2024-01-01T10:00:00Z"),
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(true);
                expect(result.value).toBe(true);
            });

            it("should use lastReadAt for comparison when neither has field-specific timestamp", () => {
                // Legacy scenario: neither client nor server has subscribedUpdatedAt
                // Fall back to comparing lastReadAt
                const client: LWWField<boolean> = {
                    value: true,
                    updatedAt: null,
                    fallbackTs: new Date("2024-01-01T16:00:00Z"), // newer lastReadAt
                };
                const server: LWWField<boolean> = {
                    value: false,
                    updatedAt: null,
                    fallbackTs: new Date("2024-01-01T14:00:00Z"), // older lastReadAt
                };

                const result = resolveLWW(client, server);

                expect(result.shouldUpdate).toBe(true);
                expect(result.value).toBe(true);
            });
        });
    });
});
