const { Router } = require('express');
const { z } = require('zod');
const ctrl = require('../controllers/store.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validateBody');

const router = Router();
router.use(authenticate);

const updateStoreSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  address: z.string().max(255).optional(),
  drawerFloat: z.number().min(0).optional(),
});

const fcmTokenSchema = z.object({
  fcmToken: z.string().min(1),
});

router.get('/', ctrl.getStore);
router.put('/', authorize('owner'), validateBody(updateStoreSchema), ctrl.updateStore);
router.get('/employees', authorize('owner'), ctrl.listEmployees);
router.post('/employees/invite', authorize('owner'), ctrl.createInvite);
router.delete('/employees/:id', authorize('owner'), ctrl.deactivateEmployee);
router.put('/fcm-token', authorize('owner'), validateBody(fcmTokenSchema), ctrl.updateFcmToken);

module.exports = router;
