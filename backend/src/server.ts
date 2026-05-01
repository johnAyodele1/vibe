import http from 'http';
import app from './app';
import { setupSocket } from './socket';
import { initNotificationJob } from './jobs/notification.job';

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer(app);
setupSocket(server);

// Initialize background jobs
initNotificationJob();

server.listen(Number(PORT), HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
