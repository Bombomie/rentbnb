const express = require('express');
const router  = express.Router();
const lensController = require('../controllers/lens.controller');
const verifyIdToken  = require('../middleware/authMiddleware');

router.post('/analyse', verifyIdToken, lensController.analyseImage);

module.exports = router;