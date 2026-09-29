const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const faqController = require('../controllers/faq.controller');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/register',authMiddleware, authController.register);
router.post('/google', authMiddleware, authController.google);
router.get('/users/me', authMiddleware, authController.userData);
router.put('/update', authMiddleware, authController.editProfile);
router.put('/payout-methods', authMiddleware, authController.updatePayoutMethods);
router.post('/fcm-token',   authMiddleware, authController.saveFcmToken);

router.get('/faqs', authMiddleware, faqController.getMyFaqs);
router.post('/faqs', authMiddleware, faqController.addMyFaq);
router.put('/faqs/:id', authMiddleware, faqController.updateMyFaq);
router.delete('/faqs/:id', authMiddleware, faqController.deleteMyFaq);

module.exports = router;