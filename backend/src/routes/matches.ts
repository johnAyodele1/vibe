import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getMatches, unmatch } from '../controllers/match.controller';

const router = Router();

router.get('/', authenticateToken, getMatches);
router.delete('/:id', authenticateToken, unmatch);

export default router;
