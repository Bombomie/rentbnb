const admin = require('../config/firebase');
const db = admin.firestore();

const fetchFavoriteIslands = async (req, res) => {
    try{
        
        const requestedUserId = req.params.userId;
        const authenticatedUserId = req.user.uid;

        if (authenticatedUserId !== requestedUserId) {
            return res.status(403).json({ 
                error: "Forbidden: You cannot modify another user's favorites." 
            });
        }

        const favoriteRef = db.collection('users')
            .doc(authenticatedUserId)
            .collection('favoriteIslands');

        const favoriteSnapshot = await favoriteRef.get();

        const favoriteIslandsList = [];

        favoriteSnapshot.forEach(doc => {
            favoriteIslandsList.push(doc.data());
        });

        return res.status(200).json({
            data: favoriteIslandsList
        });

    } catch (error){
        console.error('Error fetching favorite islands:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
};

const fetchFavoriteListings = async (req, res) => {
    try{
        const requestedUserId = req.params.userId;
        const authenticatedUserId = req.user.uid;

        if (authenticatedUserId !== requestedUserId) {
            return res.status(403).json({ 
                error: "Forbidden: You cannot modify another user's favorites." 
            });
        }
        const favoriteRef = db.collection('users')
            .doc(authenticatedUserId)
            .collection('favoriteListings');

        const favoriteSnapshot = await favoriteRef.get();

        const favoriteListingsList = [];

        favoriteSnapshot.forEach(doc => {
            favoriteListingsList.push(doc.data());
        });

        return res.status(200).json({
            data: favoriteListingsList
        });
    } catch (error){
        console.error('Error fetching favorite listings:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });   
    }
};

const addFavoriteIsland = async (req, res) => {
    try{
        const requestedUserId = req.params.userId;
        const authenticatedUserId = req.user.uid;

        if (authenticatedUserId !== requestedUserId) {
            return res.status(403).json({ 
                error: "Forbidden: You cannot modify another user's favorites." 
            });
        }
        
        const islandData = req.body;


        if (!islandData || !islandData.id){
            return res.status(400).json({
                error: 'Invalid island data'
            });
        }


        const favoriteRef = db.collection('users')
            .doc(authenticatedUserId)
            .collection('favoriteIslands')
            .doc(islandData.id);


        await favoriteRef.set(islandData);   

        return res.status(200).json({
            message: 'Favorite island added successfully'
        });


    } catch (error){
        console.error('Error adding favorite island:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
};

const addFavoriteListing = async (req, res) => {
    try{
        const requestedUserId = req.params.userId;
        const authenticatedUserId = req.user.uid;

        if (authenticatedUserId !== requestedUserId) {
            return res.status(403).json({ 
                error: "Forbidden: You cannot modify another user's favorites." 
            });
        }

        const listingsData = req.body;

        if (!listingsData || !listingsData.id){
            return res.status(400).json({
                error: 'Invalid listings data'
            });
        }

        const favoritesRef = db.collection('users')
            .doc(authenticatedUserId)
            .collection('favoriteListings')
            .doc(listingsData.id);

            await favoritesRef.set(listingsData);

            return res.status(200).json({
            message: 'Favorite island added successfully'
        });

    } catch (error){
        console.error('Error adding favorite listings:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
};

const removeFavoriteIsland = async (req, res) => {
    try{
        const requestedUserId = req.params.userId;
        const authenticatedUserId = req.user.uid;

        if (authenticatedUserId !== requestedUserId) {
            return res.status(403).json({ 
                error: "Forbidden: You cannot modify another user's favorites." 
            });
        }

        const islandId = req.params.islandId;

        if (!islandId){
            return res.status(400).json({
                error: 'Invalid island ID'
            });
        }

        const favoriteRef = db.collection('users')
            .doc(authenticatedUserId)
            .collection('favoriteIslands')
            .doc(islandId);

        await favoriteRef.delete();

        return res.status(200).json({
            message: 'Favorite island removed successfully'
        });

    } catch (error){
        console.error('Error removing favorite island:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
};

const removeFavoriteListing = async (req, res) => {
    try{
        const requestedUserId = req.params.userId;
        const authenticatedUserId = req.user.uid;

        if (authenticatedUserId !== requestedUserId) {
            return res.status(403).json({ 
                error: "Forbidden: You cannot modify another user's favorites." 
            });
        }

        const listingId = req.params.listingId;

        if (!listingId){
            return res.status(400).json({
                error: 'Invalid listing ID'
            });
        
        }

        const favoriteRef = db.collection('users')
            .doc(authenticatedUserId)
            .collection('favoriteListings')
            .doc(listingId);

        await favoriteRef.delete();

        return res.status(200).json({
            message: 'Favorite listing removed successfully'
        });

    } catch (error){
        console.error('Error removing favorite listing:', error);   
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
};

module.exports = {
    fetchFavoriteIslands,
    fetchFavoriteListings,
    addFavoriteIsland,
    addFavoriteListing,
    removeFavoriteIsland,
    removeFavoriteListing

}