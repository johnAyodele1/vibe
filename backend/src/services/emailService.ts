import nodemailer from 'nodemailer';

// Use a mock transporter for testing if SMTP_HOST is not set or in test env
const isTest = process.env.NODE_ENV === 'test';

const transporter = isTest
  ? { sendMail: async () => ({ messageId: 'test-id' }) }
  : nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

export const sendVerificationEmail = async (email: string, token: string) => {
  const url = `${process.env.FRONTEND_URL}/adult/verify-email?token=${token}`;
  await (transporter as any).sendMail({
    from: process.env.FROM_EMAIL || 'noreply@adultzone.app',
    to: email,
    subject: 'Verify your email - Adult Zone',
    html: `
      <h1>Welcome to Adult Zone</h1>
      <p>Please click the link below to verify your email address:</p>
      <a href="${url}">${url}</a>
    `,
  });
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const url = `${process.env.FRONTEND_URL}/adult/reset-password?token=${token}`;
  await (transporter as any).sendMail({
    from: process.env.FROM_EMAIL || 'noreply@adultzone.app',
    to: email,
    subject: 'Reset your password - Adult Zone',
    html: `
      <h1>Password Reset Request</h1>
      <p>Please click the link below to reset your password:</p>
      <a href="${url}">${url}</a>
    `,
  });
};

export const sendAdminNotification = async (subject: string, message: string) => {
    await (transporter as any).sendMail({
      from: process.env.FROM_EMAIL || 'noreply@adultzone.app',
      to: process.env.ADMIN_EMAIL,
      subject: `Admin Alert: ${subject}`,
      text: message,
    });
};
