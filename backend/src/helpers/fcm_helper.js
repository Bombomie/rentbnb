const admin = require('../config/firebase');
const db = admin.firestore();

async function sendPushToUser(userId, title, body, data = {}) {
    if (!userId) return;
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return;

        const fcmToken = userDoc.data().fcmToken;
        if (!fcmToken) return;

        const message = {
            token: fcmToken,
            notification: { title, body },
            data: Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v)])
            ),
            android: {
                priority: 'high',
                notification: {
                    channelId: 'rentbnb_default',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                }
            }
        };

        await admin.messaging().send(message);
    } catch (error) {
        // Never crash a business operation because a push failed
        console.warn(`FCM send failed for user ${userId}:`, error.message);
    }
}

module.exports = { sendPushToUser };