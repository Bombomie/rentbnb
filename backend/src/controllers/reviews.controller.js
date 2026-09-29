const admin = require('../config/firebase');
const db = admin.firestore();

const addReview = async (req, res) => {
    try {
        const { uid } = req.user;
        const { listingId, rating, comment } = req.body;

        if (!listingId || rating == undefined) {
            return res.status(400).json({ error: "Missing ListingId or rating" });
        }

        const numericalRating = parseFloat(rating);
        const listingRef = db.collection('listings').doc(listingId);
        const reviewsRef = db.collection('reviews').doc();

        await db.runTransaction(async (transaction) => {
            const listingDoc = await transaction.get(listingRef);

            if (!listingDoc.exists) {
                throw new Error("Listing not found");
            }

            const listingData = listingDoc.data();
            
            const hostId = listingData.ownerId; 
            if (!hostId) {
                throw new Error("Listing has no owner assigned");
            }
            
            const renterRef = db.collection('users').doc(uid);
            const hostRef = db.collection('users').doc(hostId);
            
            const [renterDoc, hostDoc] = await Promise.all([
                transaction.get(renterRef),
                transaction.get(hostRef)
            ]);

            const renterData = renterDoc.exists ? renterDoc.data() : {};
            const hostData = hostDoc.exists ? hostDoc.data() : {};
            
            const officialReviewerName = renterData.displayName || "Anonymous";
            const reviewerPhotoUrl = renterData.photoUrl || '';

            const currentListingRating = listingData.rating || 0;
            const currentListingTotalReviews = listingData.totalReviews || 0;

            const newListingTotalReviews = currentListingTotalReviews + 1;
            const newListingRating = ((currentListingRating * currentListingTotalReviews) + numericalRating) / newListingTotalReviews;

            // --- 5. HOST MATH ---
            const currentHostRating = hostData.rating || 0;
            const currentHostTotalReviews = hostData.totalReviews || 0;

            const newHostTotalReviews = currentHostTotalReviews + 1;
            const newHostRating = ((currentHostRating * currentHostTotalReviews) + numericalRating) / newHostTotalReviews;

            // --- 6. SAVE TO DATABASE ---
            const reviewData = {
                id: reviewsRef.id,
                listingId: listingId,
                reviewerId: uid,
                reviewerName: officialReviewerName,
                reviewerPhotoUrl: reviewerPhotoUrl,
                rating: numericalRating,
                comment: comment || '',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            transaction.set(reviewsRef, reviewData);
            
            transaction.update(listingRef, {
                rating: newListingRating,
                totalReviews: newListingTotalReviews
            });

            // FIXED: Updating the Host, not the Renter
            transaction.update(hostRef, {
                rating: newHostRating,
                totalReviews: newHostTotalReviews
            });
        });

        return res.status(200).json({ message: "Review added successfully" });
    } catch (error) {
        console.error("Error adding review:", error.message);
        if (error.message === "Listing not found") {
            return res.status(404).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};


const fetchReviews = async (req, res) => {
    try{
        const { listingId } = req.params;

        const reviewRef = db.collection('reviews').where('listingId', '==', listingId).orderBy('createdAt', 'desc');
        const reviewSnapshot = await reviewRef.get();

        const reviewsList = [];

        reviewSnapshot.forEach(doc => {
            const data = doc.data();
            const formattedDate = data.createdAt ? data.createdAt.toDate().toISOString() : null;
            
            reviewsList.push({
                ...data,
                createdAt: formattedDate
            });
        });

        return res.status(200).json({
            reviews: reviewsList
        });

    } catch (error){
        console.error('Error fetching reviews:', error);
        return res.status(500).json({
            error: 'Internal server error'
        });
    }
}

module.exports = { addReview, fetchReviews };