const admin = require('../config/firebase');
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Haversine distance formula
// Returns distance in kilometres between two lat/lon coordinates.
// ---------------------------------------------------------------------------
function haversineKm(lat1, lon1, lat2, lon2) {
    const R    = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// GET /api/v1/islands
// Optional query params: lat, lon, radius (km, default 250)
//
// If lat and lon are provided, only returns islands within the radius.
// Each returned island includes a computed `distanceKm` field so the client
// can sort or display proximity without a second round trip.
// If no location is provided, all islands are returned (fallback behaviour).
// ---------------------------------------------------------------------------
exports.getAllIslands = async (req, res) => {
    try {
        const snapshot = await db.collection('islands').get();

        const userLat    = req.query.lat    ? parseFloat(req.query.lat)    : null;
        const userLon    = req.query.lon    ? parseFloat(req.query.lon)    : null;
        const radiusKm   = req.query.radius ? parseFloat(req.query.radius) : 250;

        const hasLocation = userLat !== null && userLon !== null
            && !isNaN(userLat) && !isNaN(userLon);

        const islands = snapshot.docs
            .map(doc => {
                const data = doc.data();
                const island = { id: doc.id, ...data };

                if (hasLocation && typeof data.lat === 'number' && typeof data.lon === 'number') {
                    island.distanceKm = parseFloat(
                        haversineKm(userLat, userLon, data.lat, data.lon).toFixed(1)
                    );
                } else {
                    island.distanceKm = null;
                }

                return island;
            })
            .filter(island => {
                // If location was provided AND the island has coordinates, filter by radius.
                // Islands without coordinates are always included (graceful degradation).
                if (!hasLocation || island.distanceKm === null) return true;
                return island.distanceKm <= radiusKm;
            })
            .sort((a, b) => {
                // Sort by proximity when distances are available
                if (a.distanceKm !== null && b.distanceKm !== null) {
                    return a.distanceKm - b.distanceKm;
                }
                return 0;
            });

        res.status(200).json({ success: true, data: islands });
    } catch (error) {
        console.error('Error fetching islands:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};