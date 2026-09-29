const express = require('express');
const router = express.Router();

const favoritesController = require('../controllers/favorites.controller');
const verifyIdToken = require('../middleware/authMiddleware');

router.get('/users/:userId/islands', verifyIdToken, favoritesController.fetchFavoriteIslands);
router.get('/users/:userId/listings', verifyIdToken, favoritesController.fetchFavoriteListings);
router.post('/users/:userId/islands', verifyIdToken, favoritesController.addFavoriteIsland);
router.post('/users/:userId/listings', verifyIdToken, favoritesController.addFavoriteListing);
router.delete('/users/:userId/islands/:islandId', verifyIdToken, favoritesController.removeFavoriteIsland);
router.delete('/users/:userId/listings/:listingId', verifyIdToken, favoritesController.removeFavoriteListing);

module.exports = router;
