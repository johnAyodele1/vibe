import http from 'http';
import app from './app';
import { setupSocket } from './socket';
import { initNotificationJob } from './jobs/notification.job';
import { initAnalyticsJob } from './jobs/analytics.job';
import { initRetentionJobs } from './jobs/retention.job';
import { initFirebase } from './config/firebase';

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer(app);
setupSocket(server);

// Initialize Firebase
initFirebase();

// Initialize background jobs
initNotificationJob();
initAnalyticsJob();
initRetentionJobs();

server.listen(Number(PORT), HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
