const { Router } = require('express');
const { z } = require('zod');
const ctrl = require('../controllers/shifts.controller');
const authenticate = require('../middleware/authenticate');
const validateBody = require('../middleware/validateBody');

const router = Router();
router.use(authenticate);

const addScanSchema = z.object({
  gameId: z.string().uuid(),
  packNumber: z.string().max(20).optional().default(''),
  endTicket: z.number().int().min(0),
  scanMethod: z.enum(['camera', 'manual']).optional().default('camera'),
  isNewRoll: z.boolean().optional().default(false),
});

const activatePackSchema = z.object({
  gameId: z.string().uuid(),
  packNumber: z.string().min(1).max(20),
  startingTicket: z.number().int().min(0).optional(),
});

const closeShiftSchema = z.object({
  cashInDrawer: z.number().min(0).optional(),
  onlineLotterySales: z.number().min(0).optional(),
  drawerFloatUsed: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

router.post('/open', ctrl.openShift);
router.get('/current', ctrl.getCurrentShift);
router.get('/carryover', ctrl.getCarryover);
router.post('/activate-pack', validateBody(activatePackSchema), ctrl.activatePack);
router.get('/', ctrl.listShifts);
router.get('/:id', ctrl.getShift);
router.post('/:id/scan', validateBody(addScanSchema), ctrl.addScan);
router.delete('/:id/scan/:scanId', ctrl.deleteScan);
router.post('/:id/close', validateBody(closeShiftSchema), ctrl.closeShift);

module.exports = router;
