import { Router } from 'express';
import {
  getEligibleAd,
  recordImpression,
  recordClick,
} from '../controllers/advertisement.controller';
import { verifyAdultJWT } from '../middleware/adultAuth';

const router = Router();

router.get('/eligible', verifyAdultJWT, getEligibleAd);
router.post('/:id/impression', verifyAdultJWT, recordImpression);
router.post('/:id/click', verifyAdultJWT, recordClick);

export default router;
