import {
    EmailParams,
    MailerSend,
    type Recipient,
    type Sender,
} from "mailersend";

export type IEmailSender = (config: {
    apiKey: string;
    from: Sender;
    to: Recipient[];
    cc?: Recipient[];
    bcc?: Recipient[];
    replyTo?: Recipient;
    subject: string;
    content:
        | {
              html?: string;
              text: string;
          }
        | {
              html: string;
              text?: string;
          };
}) => Promise<boolean>;

export const sendEmail: IEmailSender = async ({
    apiKey,
    from,
    to,
    cc,
    bcc,
    replyTo,
    subject,
    content: { html, text },
}) => {
    const mailerSend = new MailerSend({
        apiKey,
    });

    const emailParams = new EmailParams()
        .setFrom(from)
        .setTo(to)
        .setReplyTo(replyTo ?? from)
        .setSubject(subject);

    html && emailParams.setHtml(html);
    text && emailParams.setText(text);
    cc && emailParams.setCc(cc);
    bcc && emailParams.setBcc(bcc);

    const response = await mailerSend.email.send(emailParams);

    return response.statusCode.toString().startsWith("2");
};
