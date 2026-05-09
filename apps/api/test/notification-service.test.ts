import { describe, expect, it } from "vitest";
import {
    generateNotificationContent,
    type WorkUpdateEvent,
} from "~/lib/notification-service";

describe("notification-service", () => {
    describe("generateNotificationContent", () => {
        describe("new_chapters", () => {
            it("should generate content for single new chapter with known total", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "My Amazing Fic",
                    type: "new_chapters",
                    oldChapters: 5,
                    newChapters: 6,
                    totalChapters: 10,
                };

                const result = generateNotificationContent(event);

                expect(result.title).toBe("New chapter available");
                expect(result.body).toBe(
                    "My Amazing Fic has 1 new chapter (6/10)",
                );
            });

            it("should generate content for multiple new chapters with known total", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "My Amazing Fic",
                    type: "new_chapters",
                    oldChapters: 5,
                    newChapters: 8,
                    totalChapters: 10,
                };

                const result = generateNotificationContent(event);

                expect(result.title).toBe("New chapter available");
                expect(result.body).toBe(
                    "My Amazing Fic has 3 new chapters (8/10)",
                );
            });

            it("should generate content for new chapters with unknown total", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "Ongoing Work",
                    type: "new_chapters",
                    oldChapters: 10,
                    newChapters: 12,
                    totalChapters: null,
                };

                const result = generateNotificationContent(event);

                expect(result.title).toBe("New chapter available");
                expect(result.body).toBe(
                    "Ongoing Work has 2 new chapters (12/?)",
                );
            });

            it("should handle missing oldChapters (default to 0)", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "New Work",
                    type: "new_chapters",
                    newChapters: 3,
                    totalChapters: 5,
                };

                const result = generateNotificationContent(event);

                expect(result.body).toBe("New Work has 3 new chapters (3/5)");
            });

            it("should handle missing newChapters (default to 0)", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "Work",
                    type: "new_chapters",
                    oldChapters: 5,
                    totalChapters: 10,
                };

                const result = generateNotificationContent(event);

                // -5 chapters is weird but tests the default behavior
                expect(result.body).toContain("Work has -5 new chapters");
            });

            it("should use singular 'chapter' for exactly one new chapter", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "Fic",
                    type: "new_chapters",
                    oldChapters: 0,
                    newChapters: 1,
                    totalChapters: 1,
                };

                const result = generateNotificationContent(event);

                expect(result.body).toBe("Fic has 1 new chapter (1/1)");
            });

            it("should handle work title with special characters", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: 'A <Story> & More "Quotes"',
                    type: "new_chapters",
                    oldChapters: 1,
                    newChapters: 2,
                    totalChapters: 5,
                };

                const result = generateNotificationContent(event);

                expect(result.body).toBe(
                    'A <Story> & More "Quotes" has 1 new chapter (2/5)',
                );
            });
        });

        describe("work_completed", () => {
            it("should generate content for work completion", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "Finished Story",
                    type: "work_completed",
                    newChapters: 20,
                    totalChapters: 20,
                };

                const result = generateNotificationContent(event);

                expect(result.title).toBe("Work completed!");
                expect(result.body).toBe(
                    "Finished Story has been marked as complete",
                );
            });
        });

        describe("work_restricted", () => {
            it("should generate content for work restriction", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "Private Work",
                    type: "work_restricted",
                };

                const result = generateNotificationContent(event);

                expect(result.title).toBe("Work restricted");
                expect(result.body).toBe(
                    "Private Work is now restricted (requires AO3 login)",
                );
            });
        });

        describe("work_deleted", () => {
            it("should generate content for work deletion", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "Deleted Work",
                    type: "work_deleted",
                };

                const result = generateNotificationContent(event);

                expect(result.title).toBe("Work deleted");
                expect(result.body).toBe(
                    "Deleted Work has been deleted from AO3",
                );
            });

            it("should handle placeholder title for unknown work", () => {
                const event: WorkUpdateEvent = {
                    workId: 12345,
                    workTitle: "[Deleted]",
                    type: "work_deleted",
                };

                const result = generateNotificationContent(event);

                expect(result.body).toBe("[Deleted] has been deleted from AO3");
            });
        });

        describe("unknown type (default case)", () => {
            it("should generate generic content for unknown type", () => {
                const event = {
                    workId: 12345,
                    workTitle: "Some Work",
                    type: "unknown_type" as WorkUpdateEvent["type"],
                };

                const result = generateNotificationContent(event);

                expect(result.title).toBe("Work updated");
                expect(result.body).toBe("Some Work has been updated");
            });
        });
    });
});
