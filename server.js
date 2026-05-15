require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth.routes');
const shiftRoutes = require('./src/routes/shifts.routes');
const gamesRoutes = require('./src/routes/games.routes');
const storeRoutes = require('./src/routes/store.routes');
const billingRoutes = require('./src/routes/billing.routes');
const billingController = require('./src/controllers/billing.controller');

const app = express();

app.use(cors());

// Stripe webhook needs the raw request body for signature verification, so it
// must be registered BEFORE express.json() consumes the stream.
app.post(
  '/api/v1/billing/webhook',
  express.raw({ type: 'application/json' }),
  billingController.handleWebhook,
);

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/shifts', shiftRoutes);
app.use('/api/v1/games', gamesRoutes);
app.use('/api/v1/store', storeRoutes);
app.use('/api/v1/billing', billingRoutes);

// Global error handler
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  const message = err.message ?? 'Internal server error';
  if (status === 500) console.error(err);
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`LottoClose API running on port ${PORT}`));
