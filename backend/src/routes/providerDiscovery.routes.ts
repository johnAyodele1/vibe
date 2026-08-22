import express from 'express';
import { verifyAdultJWT } from '../middleware/adultAuth';
import {
  getRecommendedProviders,
  getRecommendedHookupProviders,
  getProviderResponseStats,
  getPublicProviderProfileWithResponseStats,
} from '../controllers/providerDiscovery.controller';

const router = express.Router();

router.get('/providers/recommended', getRecommendedProviders);
router.get('/providers/:providerId/response-stats', getProviderResponseStats);
router.get('/providers/:providerId', verifyAdultJWT, getPublicProviderProfileWithResponseStats);
router.get('/hookup/recommended', getRecommendedHookupProviders);

export default router;
