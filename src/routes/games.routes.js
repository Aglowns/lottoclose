const { Router } = require('express');
const { z } = require('zod');
const ctrl = require('../controllers/games.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validateBody');

const router = Router();
router.use(authenticate);

const addGameSchema = z.object({
  gameNumber: z.number().int().positive(),
  name: z.string().min(1).max(100),
  price: z.number().positive(),
});

const bulkSchema = z.object({
  gameIds: z.array(z.string().uuid()).min(1),
});

const updateGameSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  price: z.number().positive().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

router.get('/', ctrl.listGames);
router.get('/library/:state', authorize('owner'), ctrl.getLibrary);
router.post('/', authorize('owner'), validateBody(addGameSchema), ctrl.addGame);
router.post('/bulk', authorize('owner'), validateBody(bulkSchema), ctrl.bulkAddGames);
router.put('/:id', authorize('owner'), validateBody(updateGameSchema), ctrl.updateGame);
router.delete('/:id', authorize('owner'), ctrl.deactivateGame);

module.exports = router;
