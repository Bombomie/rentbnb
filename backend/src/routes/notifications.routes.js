const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');
const verifyIdToken = require('../middleware/authMiddleware');

router.get('/',              verifyIdToken, notificationsController.getNotifications);
router.patch('/:id/read',    verifyIdToken, notificationsController.markAsRead);
router.patch('/read-all',    verifyIdToken, notificationsController.markAllAsRead);
router.delete('/:id',        verifyIdToken, notificationsController.deleteNotification);

module.exports = router;