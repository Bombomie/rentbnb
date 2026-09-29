const admin = require('../config/firebase');
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Get all notifications for the authenticated user, ordered newest first
// ---------------------------------------------------------------------------
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.uid;

        const snapshot = await db.collection('notifications')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const notifications = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
            return { id: doc.id, ...data };
        });

        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        console.error('getNotifications error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Mark a notification as read
// ---------------------------------------------------------------------------
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.uid;

        const notifRef = db.collection('notifications').doc(id);
        const doc      = await notifRef.get();

        if (!doc.exists) return res.status(404).json({ success: false, message: 'Notification not found.' });
        if (doc.data().userId !== userId) return res.status(403).json({ success: false, message: 'Unauthorized.' });

        await notifRef.update({ read: true });
        res.status(200).json({ success: true, message: 'Marked as read.' });
    } catch (error) {
        console.error('markAsRead error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Mark ALL notifications as read for the authenticated user
// ---------------------------------------------------------------------------
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.uid;

        const snapshot = await db.collection('notifications')
            .where('userId', '==', userId)
            .where('read', '==', false)
            .get();

        if (snapshot.empty) return res.status(200).json({ success: true, message: 'Nothing to update.' });

        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.update(doc.ref, { read: true }));
        await batch.commit();

        res.status(200).json({ success: true, message: `Marked ${snapshot.size} notifications as read.` });
    } catch (error) {
        console.error('markAllAsRead error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Delete a notification
// ---------------------------------------------------------------------------
exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.uid;

        const notifRef = db.collection('notifications').doc(id);
        const doc      = await notifRef.get();

        if (!doc.exists) return res.status(404).json({ success: false, message: 'Notification not found.' });
        if (doc.data().userId !== userId) return res.status(403).json({ success: false, message: 'Unauthorized.' });

        await notifRef.delete();
        res.status(200).json({ success: true, message: 'Notification deleted.' });
    } catch (error) {
        console.error('deleteNotification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};