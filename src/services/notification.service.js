let admin;

function getAdmin() {
  if (admin) return admin;

  admin = require('firebase-admin');

  if (admin.apps.length > 0) return admin;

  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  } else {
    console.warn('Firebase not configured — push notifications disabled.');
    return null;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
}

async function send({ token, title, body, data = {}, badge }) {
  const fb = getAdmin();
  if (!fb || !token) return;

  const message = {
    token,
    notification: { title, body },
    data,
    apns: {
      payload: {
        aps: {
          sound: 'default',
          ...(badge !== undefined ? { badge } : {}),
        },
      },
    },
    android: {
      notification: { sound: 'default' },
    },
  };

  try {
    await fb.messaging().send(message);
  } catch (err) {
    console.error('FCM send failed:', err.message);
  }
}

// Cashier closed shift — rich content, single notification
async function sendShiftClosed({ ownerFcmToken, cashierName, totalSales, storeName, shiftId, packCount, overShort }) {
  const hasShortage = overShort !== null && overShort !== undefined && overShort < -5;
  const packs = packCount ? ` · ${packCount} pack${packCount !== 1 ? 's' : ''}` : '';

  if (hasShortage) {
    const shortAmount = Math.abs(overShort).toFixed(2);
    await send({
      token: ownerFcmToken,
      title: `⚠️ ${storeName} — Shortage`,
      body: `${cashierName} is short $${shortAmount} · $${Number(totalSales).toFixed(2)} sales${packs}`,
      data: { type: 'shortage_alert', shiftId: String(shiftId), cashierName, totalSales: String(totalSales) },
      badge: 1,
    });
  } else {
    await send({
      token: ownerFcmToken,
      title: `✅ ${storeName} — Shift Closed`,
      body: `${cashierName} closed · $${Number(totalSales).toFixed(2)} in sales${packs}`,
      data: { type: 'shift_closed', shiftId: String(shiftId), cashierName, totalSales: String(totalSales) },
    });
  }
}

// Cashier logged in via PIN — shift starting
async function sendShiftStarted({ ownerFcmToken, cashierName, storeName }) {
  await send({
    token: ownerFcmToken,
    title: `${storeName} — ${cashierName} clocked in`,
    body: 'Your cashier just started a shift.',
    data: { type: 'shift_started', cashierName },
  });
}

// New pack activated mid-shift
async function sendPackActivated({ ownerFcmToken, cashierName, gameName, packNumber, storeName }) {
  await send({
    token: ownerFcmToken,
    title: `${storeName} — New Pack Activated`,
    body: `${cashierName} opened ${gameName} pack #${packNumber}`,
    data: { type: 'pack_activated', cashierName, gameName, packNumber: String(packNumber) },
  });
}

// End-of-day summary
async function sendDailySummary({ ownerFcmToken, storeName, totalSales, shiftCount, shortageCount }) {
  const shortageNote = shortageCount > 0 ? ` · ⚠️ ${shortageCount} shortage${shortageCount > 1 ? 's' : ''}` : '';
  await send({
    token: ownerFcmToken,
    title: `${storeName} — Daily Summary`,
    body: `$${Number(totalSales).toFixed(2)} in sales · ${shiftCount} shift${shiftCount !== 1 ? 's' : ''}${shortageNote}`,
    data: { type: 'daily_summary', totalSales: String(totalSales), shiftCount: String(shiftCount) },
  });
}

// Cashier joined the store via invite code
async function sendCashierJoined({ ownerFcmToken, cashierName, storeName }) {
  await send({
    token: ownerFcmToken,
    title: `${storeName} — New Team Member`,
    body: `${cashierName} just joined your store.`,
    data: { type: 'cashier_joined', cashierName },
  });
}

// Cashier edited a closed shift
async function sendShiftEdited({ ownerFcmToken, cashierName, storeName, shiftId, newOverShort }) {
  const shortNote = newOverShort !== null && newOverShort < -5
    ? ` · ⚠️ Short $${Math.abs(newOverShort).toFixed(2)}`
    : newOverShort !== null && newOverShort > 5
    ? ` · +$${newOverShort.toFixed(2)} over`
    : '';

  await send({
    token: ownerFcmToken,
    title: `${storeName} — Shift Updated`,
    body: `${cashierName} edited a closed shift${shortNote}`,
    data: { type: 'shift_edited', shiftId: String(shiftId), cashierName },
    ...(newOverShort !== null && newOverShort < -5 ? { badge: 1 } : {}),
  });
}

// New game/ticket added to price book — notify all cashiers
async function sendNewGameAdded({ cashierFcmTokens, gameName, price, storeName }) {
  const fb = getAdmin();
  if (!fb || !cashierFcmTokens?.length) return;

  const priceStr = `$${Number(price).toFixed(2)}`;
  const message = {
    notification: {
      title: `${storeName} — New Ticket Added`,
      body: `${gameName} (${priceStr}) is now in your price book.`,
    },
    data: { type: 'new_game', gameName, price: String(price) },
    apns: { payload: { aps: { sound: 'default' } } },
    android: { notification: { sound: 'default' } },
  };

  try {
    await fb.messaging().sendEachForMulticast({
      tokens: cashierFcmTokens,
      ...message,
    });
  } catch (err) {
    console.error('FCM multicast failed:', err.message);
  }
}

module.exports = { sendShiftClosed, sendShiftStarted, sendPackActivated, sendDailySummary, sendCashierJoined, sendShiftEdited, sendNewGameAdded };
