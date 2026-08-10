import { sendEmail as unifiedSendEmail } from '../shared/email/brevoClient';

export interface EmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    const result = await unifiedSendEmail({
      to: options.to,
      subject: options.subject,
      html: options.htmlContent,
    });
    return !!result;
  } catch (error) {
    console.error('Error sending email via unified Brevo client:', error);
    return false;
  }
};
