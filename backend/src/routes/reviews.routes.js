const express = require('express');
const router = express.Router();
const reviewsController = require('../controllers/reviews.controller');
const verifyToken = require('../middleware/authMiddleware');

router.post('/add', verifyToken, reviewsController.addReview);
router.get('/listing/:listingId', verifyToken, reviewsController.fetchReviews);

module.exports = router;