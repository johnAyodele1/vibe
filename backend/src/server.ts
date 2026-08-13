import http from 'http';
import app from './app';
import { setupSocket } from './socket';
import { initNotificationJob } from './jobs/notification.job';
import { initAnalyticsJob } from './jobs/analytics.job';
import { initRetentionJobs } from './jobs/retention.job';

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

import { captureError } from './utils/captureError';

process.on('unhandledRejection', async (reason: any) => {
  console.error('[Server] Unhandled rejection:', reason);
  try {
    await captureError(reason instanceof Error ? reason : new Error(String(reason)), { operation: 'unhandled_rejection', priority: 'critical' });
  } catch (err) {
    console.error('Failed to capture error:', err);
  }
});

process.on('uncaughtException', async (err: Error) => {
  console.error('[Server] Uncaught exception:', err);
  try {
    await captureError(err, { operation: 'uncaught_exception', priority: 'critical' });
  } catch (captureErr) {
    console.error('Failed to capture error:', captureErr);
  }
  setTimeout(() => process.exit(1), 1000);
});

const server = http.createServer(app);
setupSocket(server);

import { initVAPID } from './config/vapid';
initVAPID();

initNotificationJob();
initAnalyticsJob();
initRetentionJobs();

server.listen(Number(PORT), HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
