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

async function sendShortageAlert({ ownerFcmToken, cashierName, amount, storeName }) {
  const fb = getAdmin();
  if (!fb || !ownerFcmToken) return;

  try {
    await fb.messaging().send({
      token: ownerFcmToken,
      notification: {
        title: `${storeName} — Shortage Alert`,
        body: `${cashierName}'s shift is short $${Math.abs(amount).toFixed(2)}.`,
      },
      data: {
        type: 'shortage_alert',
        amount: String(amount),
        cashierName,
      },
    });
  } catch (err) {
    console.error('FCM send failed:', err.message);
  }
}

async function sendShiftClosed({ ownerFcmToken, cashierName, totalSales, storeName, shiftId }) {
  const fb = getAdmin();
  if (!fb || !ownerFcmToken) return;

  try {
    await fb.messaging().send({
      token: ownerFcmToken,
      notification: {
        title: `${storeName} — Shift Closed`,
        body: `${cashierName} closed: $${Number(totalSales).toFixed(2)} in sales.`,
      },
      data: {
        type: 'shift_closed',
        shiftId: String(shiftId),
        cashierName,
        totalSales: String(totalSales),
      },
    });
  } catch (err) {
    console.error('FCM send failed:', err.message);
  }
}

module.exports = { sendShortageAlert, sendShiftClosed };
