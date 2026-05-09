import { importPKCS8, SignJWT } from "jose";
import ky, { type KyInstance } from "ky";
import type { TDatabase } from "~/db/db.client";
import { getTokensByUserIds, invalidateToken } from "~/db/queries/push-token";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface ServiceAccount {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
}

interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface FcmMessage {
    token: string;
    notification?: {
        title: string;
        body: string;
    };
    data?: Record<string, string>;
    android?: {
        priority?: "normal" | "high";
        notification?: {
            channel_id?: string;
            click_action?: string;
        };
    };
}

interface FcmSendRequest {
    message: FcmMessage;
}

interface FcmSendResponse {
    name: string;
}

interface FcmErrorResponse {
    error: {
        code: number;
        message: string;
        status: string;
        details?: Array<{
            "@type": string;
            errorCode?: string;
        }>;
    };
}

export interface SendNotificationResult {
    sent: number;
    failed: number;
    invalidTokensRemoved: number;
}

/**
 * Create a signed JWT using jose
 */
async function createJwt(serviceAccount: ServiceAccount): Promise<string> {
    const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");

    return new SignJWT({ scope: FCM_SCOPE })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(serviceAccount.client_email)
        .setSubject(serviceAccount.client_email)
        .setAudience(GOOGLE_TOKEN_URL)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);
}

/**
 * FCM HTTP v1 API client using ky
 * Lightweight alternative to firebase-admin for Cloudflare Workers
 */
export class FcmClient {
    private serviceAccount: ServiceAccount;
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;
    private client: KyInstance;

    constructor(serviceAccountJson: string) {
        this.serviceAccount = JSON.parse(serviceAccountJson);
        this.client = ky.create({
            timeout: 30000,
            retry: {
                limit: 2,
                statusCodes: [408, 429, 500, 502, 503, 504],
            },
        });
    }

    /**
     * Get a valid access token, refreshing if necessary
     */
    private async getAccessToken(): Promise<string> {
        // Return cached token if still valid (with 5 min buffer)
        if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
            return this.accessToken;
        }

        const jwt = await createJwt(this.serviceAccount);

        const response = await this.client
            .post(GOOGLE_TOKEN_URL, {
                body: new URLSearchParams({
                    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    assertion: jwt,
                }),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            })
            .json<TokenResponse>();

        this.accessToken = response.access_token;
        this.tokenExpiresAt = Date.now() + response.expires_in * 1000;

        return this.accessToken;
    }

    /**
     * Send a single message via FCM HTTP v1 API
     */
    async send(message: FcmMessage): Promise<FcmSendResponse> {
        const accessToken = await this.getAccessToken();
        const url = `https://fcm.googleapis.com/v1/projects/${this.serviceAccount.project_id}/messages:send`;

        const request: FcmSendRequest = { message };

        return this.client
            .post(url, {
                json: request,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            })
            .json<FcmSendResponse>();
    }

    /**
     * Send messages to multiple tokens
     * Returns results for each token
     */
    async sendEach(
        messages: FcmMessage[],
    ): Promise<
        Array<{ success: boolean; error?: string; errorCode?: string }>
    > {
        const accessToken = await this.getAccessToken();
        const url = `https://fcm.googleapis.com/v1/projects/${this.serviceAccount.project_id}/messages:send`;

        const results = await Promise.allSettled(
            messages.map((message) =>
                this.client
                    .post(url, {
                        json: { message },
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    })
                    .json<FcmSendResponse>(),
            ),
        );

        return results.map((result) => {
            if (result.status === "fulfilled") {
                return { success: true };
            }

            // Extract error details
            const error = result.reason;
            let errorCode: string | undefined;
            let errorMessage = "Unknown error";

            if (error instanceof Error) {
                errorMessage = error.message;

                // Try to parse FCM error response
                if ("response" in error) {
                    try {
                        const body = (
                            error as { response?: { body?: unknown } }
                        ).response?.body;
                        if (
                            body &&
                            typeof body === "object" &&
                            "error" in body
                        ) {
                            const fcmError = body as FcmErrorResponse;
                            errorMessage = fcmError.error.message;
                            // Look for FCM-specific error code in details
                            const detail = fcmError.error.details?.find(
                                (d) => d.errorCode,
                            );
                            errorCode = detail?.errorCode;
                        }
                    } catch {
                        // Ignore parsing errors
                    }
                }
            }

            return { success: false, error: errorMessage, errorCode };
        });
    }

    /**
     * Send a notification to multiple tokens with the same content
     */
    async sendMulticast(
        tokens: string[],
        notification: { title: string; body: string },
        data?: Record<string, string>,
        android?: FcmMessage["android"],
    ): Promise<
        Array<{ success: boolean; error?: string; errorCode?: string }>
    > {
        const messages: FcmMessage[] = tokens.map((token) => ({
            token,
            notification,
            data,
            android,
        }));

        return this.sendEach(messages);
    }
}

// Error codes that indicate the token is invalid and should be removed
const INVALID_TOKEN_ERROR_CODES = [
    "UNREGISTERED",
    "INVALID_ARGUMENT",
    "NOT_FOUND",
];

/**
 * Send notifications to multiple users via FCM using ky-based client
 */
export async function sendNotificationsToUsers(
    db: TDatabase,
    fcmServiceAccount: string,
    userIds: string[],
    notification: {
        title: string;
        body: string;
        data: Record<string, string>;
    },
): Promise<SendNotificationResult> {
    // Get all tokens for these users
    const tokens = await getTokensByUserIds(db, userIds);

    if (tokens.length === 0) {
        console.log({
            message: "No push tokens found for users",
            userCount: userIds.length,
        });
        return { sent: 0, failed: 0, invalidTokensRemoved: 0 };
    }

    // Initialize FCM client
    const fcm = new FcmClient(fcmServiceAccount);

    // Extract token strings
    const tokenStrings = tokens.map((t) => t.token);

    // Send notifications
    const results = await fcm.sendMulticast(
        tokenStrings,
        { title: notification.title, body: notification.body },
        notification.data,
        {
            priority: "high",
            notification: {
                channel_id: "work_updates",
                click_action: "OPEN_WORK",
            },
        },
    );

    // Process results and handle invalid tokens
    let sent = 0;
    let failed = 0;
    let invalidTokensRemoved = 0;

    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.success) {
            sent++;
        } else {
            failed++;
            // Check if token should be invalidated
            if (
                result.errorCode &&
                INVALID_TOKEN_ERROR_CODES.includes(result.errorCode)
            ) {
                invalidTokensRemoved++;
                await invalidateToken(db, tokenStrings[i]);
            }
        }
    }

    console.log({
        message: "FCM send complete",
        sent,
        failed,
        invalidTokensRemoved,
        totalTokens: tokens.length,
    });

    return { sent, failed, invalidTokensRemoved };
}
