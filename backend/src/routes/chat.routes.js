const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const helpController = require('../controllers/help.controller');
const verifyIdToken = require('../middleware/authMiddleware');

router.post('/inquilino/opening', verifyIdToken, chatController.generateOpeningMessage);
router.post('/inquilino/reply', verifyIdToken, chatController.generateReply);
router.post('/help', verifyIdToken, helpController.getHelpAnswer);

module.exports = router;