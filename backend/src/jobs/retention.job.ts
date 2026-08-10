import cron from 'node-cron';
import AdultUser from '../models/AdultUser';
import AdultMessage from '../models/AdultMessage';
import CreditTransaction from '../models/CreditTransaction';
import { sendEmail } from '../shared/email/brevoClient';
import { getCache, setCache } from '../config/redisFallback';
import { getDiamondNairaRate } from '../shared/pricing';

export const reEngagementEmailHtml = ({ providerName, messageCount, earnedThisWeek, loginUrl }: any) => `
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
    .alert-box { background: #1e1318; border: 1px solid #c8102e; border-radius: 12px;
                 padding: 20px; margin: 20px 0; text-align: center; }
    .count { font-size: 32px; font-weight: bold; color: #c8102e; margin-bottom: 4px; }
    .cta { display: block; width: 100%; padding: 16px; background: #c8102e;
           color: white; font-size: 16px; font-weight: 700; text-align: center;
           text-decoration: none; border-radius: 12px; margin-top: 24px;
           letter-spacing: 0.05em; box-sizing: border-box; }
    .footer { padding: 20px 24px; border-top: 1px solid #2a1520; }
    .footer p { font-size: 11px; color: #5a3d47; margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Zippo</h1></div>
    <div class="body">
      <p style="font-size:18px; font-weight:600;">Hi ${providerName} 👋</p>
      <p style="color:#a08898;">It's been a few days since you checked your inbox.</p>

      <div class="alert-box">
        <div class="count">${messageCount}</div>
        <p style="margin: 0; font-weight: bold; color: #f5edf0;">Unanswered messages waiting for you</p>
      </div>

      <p style="color:#a08898; font-size:14px;">
        You earned <strong>💎 ${earnedThisWeek} diamonds</strong> recently. Reply to your pending messages to keep your engagement high and make more money!
      </p>

      <a href="${loginUrl}" class="cta">💬 Open My Inbox</a>
    </div>
    <div class="footer">
      <p>You are receiving this re-engagement summary because you have an active provider account on Zippo.</p>
    </div>
  </div>
</body>
</html>
`;

export const weeklyEarningsSummaryHtml = ({ providerName, totalDiamonds, totalNaira, breakdownText, loginUrl }: any) => `
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
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; }
    .stat-card { background: #1e1318; border: 1px solid #2a1520; border-radius: 12px; padding: 16px; text-align: center; }
    .stat-card .val { font-size: 24px; font-weight: bold; color: #eab308; }
    .stat-card .label { font-size: 12px; color: #a08898; margin-top: 4px; }
    .breakdown-box { background: #150d11; border-radius: 12px; padding: 16px; margin: 20px 0; border: 1px solid #2a1520; }
    .breakdown-title { font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #f5edf0; }
    .cta { display: block; width: 100%; padding: 16px; background: #c8102e;
           color: white; font-size: 16px; font-weight: 700; text-align: center;
           text-decoration: none; border-radius: 12px; margin-top: 24px;
           letter-spacing: 0.05em; box-sizing: border-box; }
    .footer { padding: 20px 24px; border-top: 1px solid #2a1520; }
    .footer p { font-size: 11px; color: #5a3d47; margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Zippo</h1></div>
    <div class="body">
      <p style="font-size:18px; font-weight:600;">Hi ${providerName} 💎</p>
      <p style="color:#a08898;">Here is a summary of what you earned this week on Zippo.</p>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="val">💎 ${totalDiamonds.toLocaleString()}</div>
          <div class="label">Diamonds Earned</div>
        </div>
        <div class="stat-card">
          <div class="val">₦${totalNaira.toLocaleString('en-NG')}</div>
          <div class="label">Estimated Value</div>
        </div>
      </div>

      <div class="breakdown-box">
        <div class="breakdown-title">Earnings Breakdown</div>
        <p style="color: #a08898; font-size: 13px; line-height: 1.6; white-space: pre-wrap; margin: 0;">${breakdownText}</p>
      </div>

      <a href="${loginUrl}" class="cta">💸 Request Payout</a>
    </div>
    <div class="footer">
      <p>You are receiving this summary because you have emailWeeklySummary preference enabled on Zippo.</p>
    </div>
  </div>
</body>
</html>
`;

export const initRetentionJobs = () => {
  // 1. Re-engagement Cron: Runs every Monday at 9am Lagos time
  cron.schedule('0 9 * * 1', async () => {
    console.log('[Retention Cron] Running re-engagement job...');
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      // Find all unanswered messages sent to providers older than 3 days
      const unansweredMessages = await AdultMessage.find({
        receiverId: { $exists: true },
        repliedAt: null,
        createdAt: { $lte: threeDaysAgo },
        messageType: { $in: ['text', 'image', 'locked_image', 'locked_video', 'video', 'voice_note', 'voice'] }
      });

      const uniqueProviderIds = [...new Set(unansweredMessages.map(m => m.receiverId!.toString()))];

      for (const providerId of uniqueProviderIds) {
        try {
          const lastReengageKey = `reengage:${providerId}`;
          const alreadySent = await getCache(lastReengageKey);
          if (alreadySent) {
            console.log(`[Retention Cron] Re-engagement already sent within 7 days for provider ${providerId} — skipping`);
            continue;
          }

          const provider = await AdultUser.findById(providerId);
          if (!provider || provider.role !== 'provider' || !provider.email) {
            continue;
          }

          // Count total unreplied messages
          const unrepliedCount = await AdultMessage.countDocuments({
            receiverId: providerId,
            repliedAt: null,
            messageType: { $in: ['text', 'image', 'locked_image', 'locked_video', 'video', 'voice_note', 'voice'] }
          });

          // Fetch recent weekly earnings
          const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const weeklyTx = await CreditTransaction.find({
            userId: providerId,
            type: { $in: ['tip_received', 'call_earning', 'service_payment_received', 'spin_wheel'] },
            createdAt: { $gte: oneWeekAgo },
            status: 'completed'
          });
          const weeklyEarnings = weeklyTx.reduce((sum, tx) => sum + tx.amount, 0);

          const loginUrl = process.env.FRONTEND_ADULT_URL || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/adult/provider/messages`;

          await sendEmail({
            to: provider.email,
            toName: provider.providerProfile?.stageName || provider.displayName,
            subject: `💬 You have ${unrepliedCount} messages waiting on Zippo`,
            html: reEngagementEmailHtml({
              providerName: provider.providerProfile?.stageName || provider.displayName,
              messageCount: unrepliedCount,
              earnedThisWeek: weeklyEarnings,
              loginUrl
            })
          });

          // Mark as sent for 7 days
          await setCache(lastReengageKey, 7 * 24 * 60 * 60, '1');
          console.log(`[Retention Cron] Sent re-engagement email to provider ${providerId}`);
        } catch (err: any) {
          console.error(`[Retention Cron] Error processing provider ${providerId}:`, err.message);
        }
      }
    } catch (error) {
      console.error('[Retention Cron] Error in re-engagement cron job:', error);
    }
  }, { timezone: 'Africa/Lagos' });

  // 2. Weekly Earnings Summary Cron: Runs every Sunday at 7pm Lagos time
  cron.schedule('0 19 * * 0', async () => {
    console.log('[Retention Cron] Running weekly earnings summary job...');
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const activeProviders = await AdultUser.find({
        role: 'provider',
        isActive: true,
        'providerProfile.notificationPrefs.emailWeeklySummary': { $ne: false }
      });

      const rate = await getDiamondNairaRate();

      for (const provider of activeProviders) {
        try {
          const weeklyTx = await CreditTransaction.aggregate([
            {
              $match: {
                userId: provider._id,
                type: { $in: ['tip_received', 'call_earning', 'service_payment_received', 'spin_wheel', 'paid_media_unlock'] },
                createdAt: { $gte: oneWeekAgo },
                status: 'completed'
              }
            },
            {
              $group: {
                _id: '$type',
                total: { $sum: '$amount' },
                count: { $sum: 1 }
              }
            }
          ]);

          const totalEarned = weeklyTx.reduce((sum, tx) => sum + tx.total, 0);
          if (totalEarned <= 0) {
            continue; // Skip if they didn't earn anything
          }

          // Build nice breakdown text
          const breakdownText = weeklyTx
            .map(tx => {
              const label = tx._id.replace('_', ' ').toUpperCase();
              return `• ${label}: 💎 ${tx.total.toLocaleString()} (${tx.count} items)`;
            })
            .join('\n');

          const loginUrl = process.env.FRONTEND_ADULT_URL || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/adult/provider/earnings`;

          await sendEmail({
            to: provider.email,
            toName: provider.providerProfile?.stageName || provider.displayName,
            subject: `💎 You earned ${totalEarned.toLocaleString()} diamonds this week on Zippo`,
            html: weeklyEarningsSummaryHtml({
              providerName: provider.providerProfile?.stageName || provider.displayName,
              totalDiamonds: totalEarned,
              totalNaira: totalEarned * rate,
              breakdownText,
              loginUrl
            })
          });

          console.log(`[Retention Cron] Sent weekly earnings summary email to provider ${provider._id}`);
        } catch (err: any) {
          console.error(`[Retention Cron] Error processing weekly summary for ${provider._id}:`, err.message);
        }
      }
    } catch (error) {
      console.error('[Retention Cron] Error in weekly earnings summary cron job:', error);
    }
  }, { timezone: 'Africa/Lagos' });

  console.log('[Retention Cron] Retention jobs initialized successfully.');
};
