import { Router } from 'express';
import { getFirebaseConfig } from '../controllers/config.controller';

const router = Router();

router.get('/firebase', getFirebaseConfig);

export default router;
