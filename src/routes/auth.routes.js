const { Router } = require('express');
const { z } = require('zod');
const ctrl = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const validateBody = require('../middleware/validateBody');

const router = Router();

const signupSchema = z.object({
  storeName: z.string().min(2).max(100),
  state: z.string().length(2),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const pinLoginSchema = z.object({
  storeId: z.string().uuid(),
  pin: z.string().length(4),
});

const joinSchema = z.object({
  code: z.string().min(6).max(7),
  name: z.string().min(1).max(80),
  pin: z.string().length(4),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post('/signup', validateBody(signupSchema), ctrl.signup);
router.post('/login', validateBody(loginSchema), ctrl.login);
router.post('/pin-login', validateBody(pinLoginSchema), ctrl.pinLogin);
router.post('/join', validateBody(joinSchema), ctrl.join);
router.post('/refresh', validateBody(refreshSchema), ctrl.refresh);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
