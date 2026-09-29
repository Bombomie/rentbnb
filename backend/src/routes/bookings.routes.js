const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookings.controller');
const verifyIdToken = require('../middleware/authMiddleware');

router.get('/users/:id/history',       verifyIdToken, bookingController.getUserBookingHistory);
router.get('/users/:id/lent-history',  verifyIdToken, bookingController.getUserLentHistory);
router.post('/',                        verifyIdToken, bookingController.createBooking);
router.put('/:id/status',              verifyIdToken, bookingController.updateBookingStatus);
router.get('/owner/:ownerId',           verifyIdToken, bookingController.getOwnerBookings);
router.get('/owner/:ownerId/earnings',  verifyIdToken, bookingController.getOwnerEarnings);
router.post('/:id/confirm-return',      verifyIdToken, bookingController.confirmReturn);
router.post('/:id/apply-penalty',       verifyIdToken, bookingController.applyPenalty);

module.exports = router;