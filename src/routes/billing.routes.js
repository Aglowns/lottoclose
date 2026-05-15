const { Router } = require('express');
const ctrl = require('../controllers/billing.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const router = Router();
router.use(authenticate);

router.post('/checkout-session', authorize('owner'), ctrl.startCheckout);
router.get('/status', ctrl.getStatus);

module.exports = router;
