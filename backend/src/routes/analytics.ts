import { Router } from 'express';
import { trackVisit } from '../controllers/analytics.controller';

const router = Router();

router.post('/visit', trackVisit);

export default router;
