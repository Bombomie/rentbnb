const express = require('express');
const router = express.Router();
const listingsController = require('../controllers/listings.controller');
const verifyIdToken = require('../middleware/authMiddleware');

router.get('/', listingsController.getAllListings);
router.post('/', verifyIdToken, listingsController.createListing);
router.get('/owner/:ownerId', verifyIdToken, listingsController.getOwnerListings);
router.patch('/:id/status', verifyIdToken, listingsController.updateListingStatus);

module.exports = router;