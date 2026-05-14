import { z } from "zod";
import type { SyncClientConfig } from "./config";
import { request } from "./transport";

/**
 * Better Auth ships a known shape for sign-in/sign-up endpoints. We don't
 * validate exhaustively here — we only assert the fields we read.
 */
const sessionResponseSchema = z.object({
  token: z.string().optional(),
  user: z
    .object({
      id: z.string(),
      email: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const signInBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SignInBody = z.infer<typeof signInBody>;

const signUpBody = signInBody.extend({ name: z.string().min(1) });
export type SignUpBody = z.infer<typeof signUpBody>;

export async function signInEmail(
  cfg: SyncClientConfig,
  body: SignInBody,
): Promise<{ token: string | null; userId: string | null }> {
  const parsed = signInBody.parse(body);
  const res = await request(
    cfg,
    "/auth/sign-in/email",
    { method: "POST", body: JSON.stringify(parsed) },
    sessionResponseSchema,
  );
  return { token: res.token ?? null, userId: res.user?.id ?? null };
}

export async function signUpEmail(
  cfg: SyncClientConfig,
  body: SignUpBody,
): Promise<{ token: string | null; userId: string | null }> {
  const parsed = signUpBody.parse(body);
  const res = await request(
    cfg,
    "/auth/sign-up/email",
    { method: "POST", body: JSON.stringify(parsed) },
    sessionResponseSchema,
  );
  return { token: res.token ?? null, userId: res.user?.id ?? null };
}

export async function signOut(cfg: SyncClientConfig): Promise<void> {
  await request(cfg, "/auth/sign-out", { method: "POST" }, z.unknown());
}

export async function getSession(
  cfg: SyncClientConfig,
): Promise<{ userId: string; email: string | null; name: string | null } | null> {
  const res = await request(cfg, "/auth/get-session", { method: "GET" }, sessionResponseSchema);
  if (!res.user) return null;
  return {
    userId: res.user.id,
    email: res.user.email ?? null,
    name: res.user.name ?? null,
  };
}
