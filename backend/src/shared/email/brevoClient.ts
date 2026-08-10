const SibApiV3Sdk = require('sib-api-v3-sdk');

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKeyAuth = defaultClient.authentications['api-key'];
apiKeyAuth.apiKey = process.env.BREVO_API_KEY || 'mock-key';

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'noreply@zippo.com.ng';
const FROM_NAME  = process.env.BREVO_FROM_NAME  || 'Zippo';

export interface SendEmailOptions {
  to: string | string[];
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Send a transactional email via Brevo
 */
export const sendEmail = async ({ to, toName, subject, html, text, replyTo }: SendEmailOptions) => {
  const recipients = Array.isArray(to)
    ? to.map((email: string) => ({ email }))
    : [{ email: to, name: toName || undefined }];

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

  sendSmtpEmail.sender     = { email: FROM_EMAIL, name: FROM_NAME };
  sendSmtpEmail.to         = recipients;
  sendSmtpEmail.subject    = subject;
  sendSmtpEmail.htmlContent = html;

  if (text)    sendSmtpEmail.textContent = text;
  if (replyTo) sendSmtpEmail.replyTo = { email: replyTo };

  try {
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`[Brevo] Email sent to ${to}.`);
    return result;
  } catch (err: any) {
    console.error(`[Brevo] Failed to send email to ${to}:`, err?.response?.body || err.message);
    // Never throw — email failures should not break app flows
  }
};
