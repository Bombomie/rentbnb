const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/payments.controller');
const verifyIdToken = require('../middleware/authMiddleware');

router.get('/users/:id/history', verifyIdToken, paymentsController.getUserPayments);

router.get('/users/:id/payouts', verifyIdToken, paymentsController.getUserPayouts);

router.get('/:paymentId', verifyIdToken, paymentsController.getPaymentReceipt);

module.exports = router;