import dotenv from 'dotenv';

dotenv.config();

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'contact@zippo.com.ng';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'zippo dating app';

export interface EmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY is not defined in environment variables');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: BREVO_SENDER_NAME,
          email: BREVO_SENDER_EMAIL,
        },
        to: [
          {
            email: options.to,
          },
        ],
        subject: options.subject,
        htmlContent: options.htmlContent,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Brevo API error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending email via Brevo:', error);
    return false;
  }
};
