const { Router } = require('express');
const ctrl = require('../controllers/admin.controller');

const router = Router();

// Simple secret-header guard — no JWT needed for admin ops
router.use((req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
});

router.post('/library/sync', ctrl.syncLibrary);
router.get('/library/status', ctrl.libraryStatus);

module.exports = router;
