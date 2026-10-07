import express from 'express';
import {
  getRecommendedProviders,
  getRecommendedMeetupProviders,
  getProviderResponseStats,
} from '../controllers/providerDiscovery.controller';

const router = express.Router();

router.get('/providers/recommended', getRecommendedProviders);
router.get('/providers/:providerId/response-stats', getProviderResponseStats);
router.get('/meetup/recommended', getRecommendedMeetupProviders);

export default router;
