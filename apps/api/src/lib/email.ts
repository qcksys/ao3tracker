/**
 * Thin wrapper around the Cloudflare Email Sending binding (`SendEmail`).
 * Bound to `env.EMAIL` per [wrangler.json](../../wrangler.json); allowed sender
 * addresses are pinned per-env so the worker can only send `From:` the
 * `SYSTEM_EMAIL_ADDRESS` for that environment.
 */
export interface SendEmailArgs {
    binding: SendEmail;
    to: string;
    fromAddress: string;
    fromName: string;
    subject: string;
    text?: string;
    html?: string;
}

export async function sendEmail({
    binding,
    to,
    fromAddress,
    fromName,
    subject,
    text,
    html,
}: SendEmailArgs) {
    return await binding.send({
        from: { name: fromName, email: fromAddress },
        to,
        subject,
        ...(text !== undefined ? { text } : {}),
        ...(html !== undefined ? { html } : {}),
    });
}
