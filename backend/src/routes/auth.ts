import express, { Router } from 'express';
import { body } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import {
  signup,
  login,
  refresh,
  logout,
  me,
} from '../controllers/auth.controller';
import {
  googleLogin,
  getGoogleClientId,
  googleCallback,
} from '../controllers/googleAuth.controller';
import passport from 'passport';

const router = Router();

const signupValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').optional().trim(),
  body('dateOfBirth').isISO8601(),
  body('gender').isIn(['Male', 'Female', 'Non-binary', 'Other']),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').exists(),
];

router.post('/signup', signupValidation, signup);
router.post('/login', loginValidation, login);
router.post('/refresh', refresh);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, me);

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth', session: false }),
  googleCallback
);

router.post('/google', googleLogin);
router.get('/google-client-id', getGoogleClientId);

export default router;
