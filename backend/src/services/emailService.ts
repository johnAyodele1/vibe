import { sendEmail } from '../shared/email/brevoClient';

export const sendVerificationEmail = async (email: string, token: string) => {
  const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/adult/verify-email?token=${token}`;
  await sendEmail({
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
  const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/adult/reset-password?token=${token}`;
  await sendEmail({
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
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@zippo.com.ng';
  await sendEmail({
    to: adminEmail,
    subject: `Admin Alert: ${subject}`,
    html: `<p>${message}</p>`,
  });
};
