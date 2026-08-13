import { sendEmail } from './brevoClient';
import { getCache, setCache } from '../../config/redisFallback';
import AdultUser from '../../models/AdultUser';

export const newMessageEmailHtml = ({ providerName, memberName, preview, loginUrl }: any) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { background: #0a0608; color: #f5edf0; font-family: 'DM Sans', Arial, sans-serif; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 40px auto; background: #130d10;
                 border: 1px solid #2a1520; border-radius: 16px; overflow: hidden; }
    .header { background: #c8102e; padding: 24px; text-align: center; }
    .header h1 { font-family: Georgia, serif; font-style: italic; font-size: 28px;
                 color: white; margin: 0; }
    .body { padding: 32px 24px; }
    .preview-box { background: #1e1318; border: 1px solid #2a1520; border-radius: 12px;
                   padding: 16px; margin: 20px 0; }
    .preview-from { font-size: 12px; color: #a08898; margin-bottom: 6px; }
    .preview-text { font-size: 15px; color: #f5edf0; font-style: italic; }
    .cta { display: block; width: 100%; padding: 16px; background: #c8102e;
           color: white; font-size: 16px; font-weight: 700; text-align: center;
           text-decoration: none; border-radius: 12px; margin-top: 24px;
           letter-spacing: 0.05em; box-sizing: border-box; }
    .footer { padding: 20px 24px; border-top: 1px solid #2a1520; }
    .footer p { font-size: 11px; color: #5a3d47; margin: 4px 0; }
    .footer a { color: #a08898; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Zippo</h1></div>
    <div class="body">
      <p style="font-size:18px; font-weight:600;">Hi ${providerName} 👋</p>
      <p style="color:#a08898;">You have a new message waiting for you.</p>
      <div class="preview-box">
        <div class="preview-from">From ${memberName}</div>
        <div class="preview-text">"${preview}"</div>
      </div>
      <p style="color:#a08898; font-size:14px;">
        Reply quickly to keep the conversation going —
        responsive providers earn more and rank higher.
      </p>
      <a href="${loginUrl}" class="cta">💬 Reply Now on Zippo</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you have an active provider account on Zippo.</p>
      <p><a href="${loginUrl}/adult/provider/settings?tab=notifications">Manage email preferences</a></p>
    </div>
  </div>
</body>
</html>
`;

const EMAIL_COOLDOWN_KEY = (providerId: string) => `email:cooldown:${providerId}`;
const COOLDOWN_SECONDS = parseInt(process.env.PROVIDER_EMAIL_COOLDOWN_MINUTES || '60') * 60;

export const sendNewMessageEmail = async ({
  providerId,
  providerEmail,
  providerName,
  memberName,
  messagePreview
}: {
  providerId: string;
  providerEmail?: string;
  providerName: string;
  memberName: string;
  messagePreview: string;
}) => {
  try {
    // Check cooldown using our fallback-safe getCache
    const cooldownActive = await getCache(EMAIL_COOLDOWN_KEY(providerId));
    if (cooldownActive) {
      console.log(`[Email] Cooldown active for provider ${providerId} — skipping`);
      return;
    }

    // Check provider's preferences and email
    const provider = await AdultUser.findById(providerId);
    if (!provider) {
      console.log(`[Email] Provider ${providerId} not found`);
      return;
    }

    // If opted out
    const prefs = (provider as any).providerProfile?.notificationPrefs;
    if (prefs?.emailMessages === false) {
      console.log(`[Email] Provider ${providerId} has opted out of message emails`);
      return;
    }

    const emailToUse = provider.email || providerEmail;
    if (!emailToUse) {
      console.log(`[Email] No email address for provider ${providerId}`);
      return;
    }

    const loginUrl = process.env.FRONTEND_ADULT_URL || `${process.env.FRONTEND_URL || 'http://localhost:3000'}`;

    const result = await sendEmail({
      to: emailToUse,
      toName: providerName,
      subject: `💬 ${memberName} sent you a message on Zippo`,
      html: newMessageEmailHtml({
        providerName,
        memberName,
        preview: messagePreview.slice(0, 100),
        loginUrl
      })
    });

    if (!result) {
      throw new Error('Email sending failed via Brevo');
    }

    // Set cooldown
    await setCache(EMAIL_COOLDOWN_KEY(providerId), COOLDOWN_SECONDS, '1');

    console.log(`[Email] ✅ Sent new message notification to provider ${providerId}`);
  } catch (err: any) {
    console.error(`[Email] ❌ Failed to send to provider ${providerId}:`, err.message);
  }
};
