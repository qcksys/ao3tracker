import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TDatabase } from "~/db/db.client";
import { getTokensByUserIds, invalidateToken } from "~/db/queries/push-token";
import { FcmClient, sendNotificationsToUsers } from "~/lib/fcm-client";

vi.mock("~/db/queries/push-token", () => ({
  getTokensByUserIds: vi.fn(),
  invalidateToken: vi.fn(),
}));
vi.mock("jose", () => ({
  importPKCS8: vi.fn(),
  SignJWT: class {
    setProtectedHeader() {
      return this;
    }
    setIssuer() {
      return this;
    }
    setSubject() {
      return this;
    }
    setAudience() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return "test-jwt";
    }
  },
}));

describe("FCM delivery failures", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reads FCM error codes from the HTTP response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ access_token: "token", expires_in: 3600 }))
        .mockResolvedValueOnce(
          Response.json(
            {
              error: {
                message: "Token expired",
                status: "NOT_FOUND",
                code: 404,
                details: [
                  {
                    "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                    errorCode: "UNREGISTERED",
                  },
                ],
              },
            },
            { status: 404 },
          ),
        ),
    );
    const result = await new FcmClient(JSON.stringify({ project_id: "test" })).sendMulticast(
      ["invalid"],
      { title: "Title", body: "Body" },
    );
    expect(result).toEqual([
      {
        success: false,
        error: "Token expired",
        errorCode: "UNREGISTERED",
      },
    ]);
  });

  it("sends only to the selected device and invalidates only an unregistered token", async () => {
    vi.mocked(getTokensByUserIds).mockResolvedValue(
      ["a", "b"].map((deviceId) => ({
        userId: "user",
        deviceId,
        token: deviceId,
        platform: "android",
        lastValidatedAt: new Date(),
        rowCreatedAt: new Date(),
        rowUpdatedAt: new Date(),
        rowDeletedAt: null,
      })),
    );
    const send = vi
      .spyOn(FcmClient.prototype, "sendMulticast")
      .mockResolvedValueOnce([{ success: false, errorCode: "INVALID_ARGUMENT" }])
      .mockResolvedValueOnce([{ success: false, errorCode: "UNREGISTERED" }]);
    const notification = { title: "Title", body: "Body", data: {} };
    const db = {} as TDatabase;
    expect(await sendNotificationsToUsers(db, "{}", ["user"], notification, "b")).toEqual({
      sent: 0,
      failed: 1,
      invalidTokensRemoved: 0,
    });
    expect(invalidateToken).not.toHaveBeenCalled();
    expect(await sendNotificationsToUsers(db, "{}", ["user"], notification, "b")).toEqual({
      sent: 0,
      failed: 1,
      invalidTokensRemoved: 1,
    });
    expect(send.mock.calls.map(([tokens]) => tokens)).toEqual([["b"], ["b"]]);
    expect(invalidateToken).toHaveBeenCalledWith(db, "b");
  });
});
