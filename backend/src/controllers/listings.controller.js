const admin = require('../config/firebase');
const db = admin.firestore();
const { generateSearchTags } = require('./lens.controller');

// Only return listings that are active AND not paused.
// Booked listings (bookingStatus: 'booked') ARE returned — they show an indicator.
exports.getAllListings = async (req, res) => {
    try {
        const { island } = req.query;
        let query = db.collection('listings').where('status', '==', 'active');
        if (island) query = query.where('island', '==', island);

        const snapshot = await query.get();
        const listings = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
            if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate().toISOString();
            return { id: doc.id, ...data };
        });

        res.status(200).json({ success: true, data: listings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createListing = async (req, res) => {
    try {
        const {
            productName, description, category, island,
            price, priceUnit, paymentMethods, suggestedActivities,
            imageUrls, penalties
        } = req.body;

        const ownerId = req.user.uid;

        if (!productName || !category || !price || !island) {
            return res.status(400).json({ success: false, message: 'title, category, price, and island are required.' });
        }

        let penaltiesData = null;
        if (penalties) {
            const { penaltyUnit, penaltyAmount } = penalties;
            const validUnits = ['Hourly', 'Daily', 'Weekly', 'Monthly'];
            if (!penaltyUnit || !validUnits.includes(penaltyUnit)) {
                return res.status(400).json({ success: false, message: `penaltyUnit must be one of: ${validUnits.join(', ')}` });
            }
            if (typeof penaltyAmount !== 'number' || penaltyAmount < 0) {
                return res.status(400).json({ success: false, message: 'penaltyAmount must be a non-negative number.' });
            }
            penaltiesData = { penaltyUnit, penaltyAmount };
        }

        const docRef = await db.collection('listings').add({
            ownerId,
            productName,
            description: description || '',
            category,
            island,
            price: parseFloat(price),
            priceUnit: priceUnit || 'per_day',
            paymentMethods: paymentMethods || [],
            suggestedActivities: suggestedActivities || [],
            imageUrls: imageUrls || [],
            penalties: penaltiesData,
            searchTags: [],          // populated asynchronously below
            status: 'active',
            bookingStatus: null,
            rating: 0,
            totalReviews: 0,
            timesRented: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.status(201).json({ success: true, listingId: docRef.id, message: 'Listing created successfully.' });

        generateSearchTags(docRef.id, productName, category, description || '')
            .catch(err => console.error('[Tags] Background generation failed:', err.message));
    } catch (error) {
        console.error('createListing error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getOwnerListings = async (req, res) => {
    try {
        const { ownerId } = req.params;
        if (req.user.uid !== ownerId) {
            return res.status(403).json({ success: false, message: 'Unauthorized.' });
        }

        const snapshot = await db.collection('listings')
            .where('ownerId', '==', ownerId)
            .orderBy('createdAt', 'desc')
            .get();

        const listings = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
            if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate().toISOString();
            return { id: doc.id, ...data };
        });

        res.status(200).json({ success: true, data: listings });
    } catch (error) {
        console.error('getOwnerListings error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Pause / unpause a listing
// Only the owner can call this.
// status: 'active' | 'paused'
// A listing with bookingStatus:'booked' can still be paused (it won't appear
// for new renters) but the current booking continues unaffected.
// ---------------------------------------------------------------------------

exports.updateListingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.uid;

        if (!['active', 'paused'].includes(status)) {
            return res.status(400).json({ success: false, message: "status must be 'active' or 'paused'." });
        }

        const listingRef = db.collection('listings').doc(id);
        const doc        = await listingRef.get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Listing not found.' });

        if (doc.data().ownerId !== userId) {
            return res.status(403).json({ success: false, message: 'Only the owner can change listing status.' });
        }

        await listingRef.update({
            status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ success: true, message: `Listing ${status === 'paused' ? 'paused' : 'reactivated'}.` });
    } catch (error) {
        console.error('updateListingStatus error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};