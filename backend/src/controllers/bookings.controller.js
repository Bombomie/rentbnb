const admin = require('../config/firebase');
const db = admin.firestore();
const { sendPushToUser } = require('../helpers/fcm_helper');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function checkAndMarkOverdue(listingId) {
    const now = new Date();
    const snapshot = await db.collection('bookings')
        .where('listingId', '==', listingId)
        .where('status', '==', 'ACTIVE')
        .get();
 
    const batch = db.batch();
    let hasUpdates = false;
 
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const endDate = data.schedule?.endDate?.toDate
            ? data.schedule.endDate.toDate()
            : new Date(data.schedule?.endDate);
 
        if (endDate && endDate < now) {
            batch.update(doc.ref, {
                status: 'OVERDUE',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            hasUpdates = true;
 
            // Persist in-app notification for overdue
            await db.collection('notifications').add({
                userId: data.ownerId,
                type: 'OVERDUE',
                title: 'Booking Overdue',
                body: `A booking for "${data.listingTitle || 'your listing'}" is past its return date.`,
                bookingId: doc.id,
                listingId: data.listingId,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
 
            // Push notification to owner
            sendPushToUser(data.ownerId, 'Booking Overdue',
                `A booking for "${data.listingTitle || 'your listing'}" is past its return date.`,
                { type: 'OVERDUE', bookingId: doc.id, listingId: data.listingId });
 
            // Push notification to renter
            sendPushToUser(data.renterId, 'Return Overdue',
                `Please return "${data.listingTitle || 'the item'}" as soon as possible.`,
                { type: 'OVERDUE', bookingId: doc.id, listingId: data.listingId });
        }
    }
 
    if (hasUpdates) await batch.commit();
}

async function sendOverdueWarnings(ownerId) {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
 
    const snapshot = await db.collection('bookings')
        .where('ownerId', '==', ownerId)
        .where('status', '==', 'ACTIVE')
        .get();
 
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const endDate = data.schedule?.endDate?.toDate
            ? data.schedule.endDate.toDate()
            : new Date(data.schedule?.endDate);
 
        if (!endDate) continue;
 
        // Warn if within next 24 hours but not yet overdue
        if (endDate > now && endDate <= in24h) {
            // Only warn once — check if we already sent a WARNING notification today
            const existingWarn = await db.collection('notifications')
                .where('bookingId', '==', doc.id)
                .where('type', '==', 'OVERDUE_WARNING')
                .limit(1)
                .get();
 
            if (existingWarn.empty) {
                await db.collection('notifications').add({
                    userId: ownerId,
                    type: 'OVERDUE_WARNING',
                    title: 'Return Due Soon',
                    body: `"${data.listingTitle || 'A listing'}" is due for return within 24 hours.`,
                    bookingId: doc.id,
                    listingId: data.listingId,
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
 
                sendPushToUser(ownerId, 'Return Due Soon',
                    `"${data.listingTitle || 'A listing'}" is due for return within 24 hours.`,
                    { type: 'OVERDUE_WARNING', bookingId: doc.id });
 
                sendPushToUser(data.renterId, 'Return Due Tomorrow',
                    `Please prepare to return "${data.listingTitle || 'the item'}" by tomorrow.`,
                    { type: 'OVERDUE_WARNING', bookingId: doc.id });
            }
        }
    }
}

async function hasDateConflict(listingId, startDate, endDate, excludeBookingId = null) {
    const proposedStart = new Date(startDate);
    const proposedEnd   = new Date(endDate);

    const snapshot = await db.collection('bookings')
        .where('listingId', '==', listingId)
        .where('status', 'in', ['ACTIVE', 'OVERDUE', 'RETURN_PENDING'])
        .get();

    for (const doc of snapshot.docs) {
        if (excludeBookingId && doc.id === excludeBookingId) continue;
        const data = doc.data();
        const existStart = data.schedule?.startDate?.toDate
            ? data.schedule.startDate.toDate() : new Date(data.schedule?.startDate);
        const existEnd = data.schedule?.endDate?.toDate
            ? data.schedule.endDate.toDate() : new Date(data.schedule?.endDate);
        if (proposedStart <= existEnd && proposedEnd >= existStart) return true;
    }
    return false;
}

async function serializeBooking(doc) {
    const data = doc.data();
    if (data.schedule?.startDate?.toDate) data.schedule.startDate = data.schedule.startDate.toDate().toISOString();
    if (data.schedule?.endDate?.toDate)   data.schedule.endDate   = data.schedule.endDate.toDate().toISOString();
    if (data.createdAt?.toDate)           data.createdAt          = data.createdAt.toDate().toISOString();
    if (data.updatedAt?.toDate)           data.updatedAt          = data.updatedAt.toDate().toISOString();

    // Resolve owner name
    let ownerName = null;
    if (data.ownerId) {
        const ownerDoc = await db.collection('users').doc(data.ownerId).get();
        if (ownerDoc.exists) {
            ownerName = ownerDoc.data().displayName || ownerDoc.data().name || null;
        }
    }

    return { id: doc.id, ...data, ownerName };
}

// ---------------------------------------------------------------------------
// Renter history
// ---------------------------------------------------------------------------

exports.getUserBookingHistory = async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user && req.user.uid !== id) {
            return res.status(403).json({ success: false, message: 'Unauthorized.' });
        }
        const snapshot = await db.collection('bookings')
            .where('renterId', '==', id)
            .orderBy('createdAt', 'desc')
            .get();

        const bookings = await Promise.all(snapshot.docs.map(serializeBooking));
        res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } catch (error) {
        console.error('getUserBookingHistory error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getUserLentHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const snapshot = await db.collection('bookings')
            .where('ownerId', '==', id)
            .orderBy('createdAt', 'desc')
            .get();
        res.status(200).json({ success: true, data: snapshot.docs.map(serializeBooking) });
    } catch (error) {
        console.error('getUserLentHistory error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Owner bookings
// ---------------------------------------------------------------------------

exports.getOwnerBookings = async (req, res) => {
    try {
        const { ownerId } = req.params;
        if (req.user.uid !== ownerId) {
            return res.status(403).json({ success: false, message: 'Unauthorized.' });
        }

        const listingsSnap = await db.collection('listings').where('ownerId', '==', ownerId).get();
        listingsSnap.docs.forEach(d => checkAndMarkOverdue(d.id).catch(console.error));

        const snapshot = await db.collection('bookings')
            .where('ownerId', '==', ownerId)
            .where('status', 'in', ['PENDING_OWNER_APPROVAL', 'ACTIVE', 'OVERDUE', 'RETURN_PENDING'])
            .get();

        res.status(200).json({ success: true, data: snapshot.docs.map(serializeBooking) });
    } catch (error) {
        console.error('getOwnerBookings error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Owner earnings
// ---------------------------------------------------------------------------

exports.getOwnerEarnings = async (req, res) => {
    try {
        const { ownerId } = req.params;
        if (req.user.uid !== ownerId) {
            return res.status(403).json({ success: false, message: 'Unauthorized.' });
        }

        const now        = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const snapshot = await db.collection('bookings')
            .where('ownerId', '==', ownerId)
            .where('status', 'in', ['ACTIVE', 'OVERDUE', 'RETURN_PENDING', 'COMPLETED'])
            .get();

        let totalEarnings  = 0;
        let pendingPayouts = 0;

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const createdAt = data.createdAt?.toDate
                ? data.createdAt.toDate()
                : (data.createdAt ? new Date(data.createdAt) : null);
            if (!createdAt || createdAt < monthStart || createdAt > monthEnd) return;

            const amount = data.financialSummary?.totalCharged || 0;
            totalEarnings += amount;
            if (data.status !== 'COMPLETED') pendingPayouts += amount;
        });

        res.status(200).json({
            success: true,
            data: {
                totalEarnings:  parseFloat(totalEarnings.toFixed(2)),
                pendingPayouts: parseFloat(pendingPayouts.toFixed(2))
            }
        });
    } catch (error) {
        console.error('getOwnerEarnings error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Create booking
// ---------------------------------------------------------------------------

exports.createBooking = async (req, res) => {
    try {
        const renterId = req.user.uid;
        const {
            listingId, ownerId, startDate, endDate,
            totalDays, financialSummary, renterDetails,
            paymentMethod, cardLast4
        } = req.body;

        if (!listingId || !ownerId || !startDate || !endDate || !totalDays) {
            return res.status(400).json({ success: false, message: 'listingId, ownerId, startDate, endDate, and totalDays are required.' });
        }
        if (!financialSummary || typeof financialSummary.totalCharged !== 'number') {
            return res.status(400).json({ success: false, message: 'financialSummary.totalCharged is required.' });
        }
        if (!renterDetails || !renterDetails.name || !renterDetails.contactNumber) {
            return res.status(400).json({ success: false, message: 'renterDetails must include name and contactNumber.' });
        }
        if (!paymentMethod) {
            return res.status(400).json({ success: false, message: 'paymentMethod is required.' });
        }

        const listingDoc = await db.collection('listings').doc(listingId).get();
        if (!listingDoc.exists) return res.status(404).json({ success: false, message: 'Listing not found.' });

        const listingData = listingDoc.data();
        if (listingData.status === 'paused') {
            return res.status(400).json({ success: false, message: 'This listing is not available for booking.' });
        }
        if (listingData.ownerId !== ownerId) {
            return res.status(403).json({ success: false, message: 'ownerId does not match listing owner.' });
        }
        if (listingData.ownerId === renterId) {
            return res.status(403).json({ success: false, message: 'You cannot book your own listing.' });
        }

        const paymentRef = db.collection('payments').doc();
        const bookingRef = db.collection('bookings').doc();
        const now        = admin.firestore.FieldValue.serverTimestamp();

        const isCardPayment = ['card','visa','mastercard','credit']
            .some(k => paymentMethod.toLowerCase().includes(k));

        const batch = db.batch();

        // Payment is HELD until the owner confirms return (COMPLETED)
        batch.set(paymentRef, {
            paymentId: paymentRef.id,
            bookingId: bookingRef.id,
            payerId: renterId,
            payeeId: ownerId,
            amount: financialSummary.totalCharged,
            currency: 'PHP',
            paymentMethod,
            cardLast4: isCardPayment && cardLast4 ? cardLast4 : null,
            type: 'RENTAL',
            status: 'HELD',
            createdAt: now
        });

        batch.set(bookingRef, {
            bookingId: bookingRef.id,
            listingId,
            listingTitle: listingData.productName || '',
            listingImageUrl: (listingData.imageUrls && listingData.imageUrls[0]) || '',
            renterId,
            ownerId,
            status: 'PENDING_OWNER_APPROVAL',
            schedule: {
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                totalDays
            },
            financialSummary,
            agreedPenalties: listingData.penalties || null,
            renterDetails,
            paymentId: paymentRef.id,
            createdAt: now,
            updatedAt: now
        });

        await batch.commit();

        await db.collection('notifications').add({
            userId: ownerId,
            type: 'NEW_BOOKING_REQUEST',
            title: 'New Booking Request',
            body: `${renterDetails.name} wants to rent "${listingData.productName}".`,
            bookingId: bookingRef.id,
            listingId,
            read: false,
            createdAt: now
        });

        sendPushToUser(ownerId, 'New Booking Request',
            `${renterDetails.name} wants to rent "${listingData.productName}".`,
            { type: 'NEW_BOOKING_REQUEST', bookingId: bookingRef.id, listingId });

        res.status(201).json({ success: true, message: 'Booking submitted.', bookingId: bookingRef.id });
    } catch (error) {
        console.error('createBooking error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Update booking status (accept / reject / cancel)
// ---------------------------------------------------------------------------

exports.updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.uid;

        const VALID_STATUSES = ['ACTIVE', 'REJECTED', 'CANCELLED', 'OVERDUE'];
        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
        }

        const bookingRef = db.collection('bookings').doc(id);
        const doc        = await bookingRef.get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Booking not found.' });

        const booking = doc.data();

        if (booking.ownerId !== userId && booking.renterId !== userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized.' });
        }
        if ((status === 'ACTIVE' || status === 'REJECTED') && booking.ownerId !== userId) {
            return res.status(403).json({ success: false, message: 'Only the owner can accept or reject.' });
        }

        if (status === 'ACTIVE') {
            const conflict = await hasDateConflict(
                booking.listingId,
                booking.schedule.startDate.toDate ? booking.schedule.startDate.toDate() : booking.schedule.startDate,
                booking.schedule.endDate.toDate   ? booking.schedule.endDate.toDate()   : booking.schedule.endDate
            );
            if (conflict) {
                return res.status(409).json({ success: false, message: 'These dates conflict with an existing booking.' });
            }
        }

        const batch = db.batch();
        batch.update(bookingRef, {
            status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // When accepted, mark listing as being booked
        if (status === 'ACTIVE') {
            const listingRef = db.collection('listings').doc(booking.listingId);
            batch.update(listingRef, { bookingStatus: 'booked' });
        }

        // When rejected/cancelled, clear listing bookingStatus if no other active booking
        if (status === 'REJECTED' || status === 'CANCELLED') {
            const otherActive = await db.collection('bookings')
                .where('listingId', '==', booking.listingId)
                .where('status', 'in', ['ACTIVE', 'OVERDUE', 'RETURN_PENDING'])
                .get();
            if (otherActive.empty) {
                const listingRef = db.collection('listings').doc(booking.listingId);
                batch.update(listingRef, { bookingStatus: null });
            }
        }

        await batch.commit();

        const notifMessages = {
            ACTIVE:   { title: 'Booking Accepted', body: 'Your booking request has been accepted.' },
            REJECTED: { title: 'Booking Declined', body: 'Your booking request was declined.' },
        };
        if (notifMessages[status]) {
            await db.collection('notifications').add({
                userId: booking.renterId,
                type: `BOOKING_${status}`,
                ...notifMessages[status],
                bookingId: id,
                listingId: booking.listingId,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            sendPushToUser(booking.renterId, notifMap[status].title, notifMap[status].body,
                { type: `BOOKING_${status}`, bookingId: id, listingId: booking.listingId });
        }

        res.status(200).json({ success: true, message: `Booking updated to ${status}.` });
    } catch (error) {
        console.error('updateBookingStatus error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Confirm return — owner marks the item as physically returned.
//
// Flow:
//   If booking has agreedPenalties → status becomes RETURN_PENDING so the
//   owner can apply a penalty charge before finalising.
//   If no penalties defined     → immediately COMPLETED + payment released.
// ---------------------------------------------------------------------------

exports.confirmReturn = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.uid;

        const bookingRef = db.collection('bookings').doc(id);
        const doc        = await bookingRef.get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Booking not found.' });

        const booking = doc.data();

        if (booking.ownerId !== userId) {
            return res.status(403).json({ success: false, message: 'Only the owner can confirm return.' });
        }

        const allowedStatuses = ['ACTIVE', 'OVERDUE'];
        if (!allowedStatuses.includes(booking.status)) {
            return res.status(400).json({ success: false, message: `Cannot confirm return for a booking with status: ${booking.status}` });
        }

        const hasPenalty = booking.agreedPenalties
            && typeof booking.agreedPenalties.penaltyAmount === 'number'
            && booking.agreedPenalties.penaltyAmount > 0;

        if (hasPenalty) {
            // Owner needs to decide on penalty — go to RETURN_PENDING
            await bookingRef.update({
                status: 'RETURN_PENDING',
                returnConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            res.status(200).json({
                success: true,
                requiresPenaltyReview: true,
                message: 'Return confirmed. Please review penalty charges before completing.',
                penaltyUnit:   booking.agreedPenalties.penaltyUnit,
                penaltyAmount: booking.agreedPenalties.penaltyAmount
            });
        } else {
            // No penalty — complete immediately and release payment
            await completeBookingAndReleasePayment(bookingRef, booking, id, null);
            res.status(200).json({ success: true, requiresPenaltyReview: false, message: 'Booking completed and payment released.' });
        }
    } catch (error) {
        console.error('confirmReturn error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Apply penalty — owner charges the renter a penalty and finalises the booking.
// penaltyAmount: 0 means owner waives the penalty.
// ---------------------------------------------------------------------------

exports.applyPenalty = async (req, res) => {
    try {
        const { id } = req.params;
        const { penaltyAmount } = req.body;
        const userId = req.user.uid;

        if (typeof penaltyAmount !== 'number' || penaltyAmount < 0) {
            return res.status(400).json({ success: false, message: 'penaltyAmount must be a non-negative number.' });
        }

        const bookingRef = db.collection('bookings').doc(id);
        const doc        = await bookingRef.get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Booking not found.' });

        const booking = doc.data();

        if (booking.ownerId !== userId) {
            return res.status(403).json({ success: false, message: 'Only the owner can apply penalties.' });
        }
        if (booking.status !== 'RETURN_PENDING') {
            return res.status(400).json({ success: false, message: 'Booking must be in RETURN_PENDING status to apply a penalty.' });
        }

        let penaltyPaymentId = null;

        if (penaltyAmount > 0) {
            // Create a separate penalty payment record (renter owes this)
            const penaltyPaymentRef = db.collection('payments').doc();
            penaltyPaymentId = penaltyPaymentRef.id;
            await penaltyPaymentRef.set({
                paymentId: penaltyPaymentRef.id,
                bookingId: id,
                payerId: booking.renterId,
                payeeId: booking.ownerId,
                amount: penaltyAmount,
                currency: 'PHP',
                type: 'PENALTY',
                status: 'PENDING',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Notify renter of penalty
            await db.collection('notifications').add({
                userId: booking.renterId,
                type: 'PENALTY_CHARGED',
                title: 'Penalty Fee Applied',
                body: `A penalty of ₱${penaltyAmount.toFixed(2)} has been applied to your booking.`,
                bookingId: id,
                listingId: booking.listingId,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            sendPushToUser(booking.renterId, 'Penalty Fee Applied',
                `A penalty of ₱${penaltyAmount.toFixed(2)} has been applied to your booking.`,
                { type: 'PENALTY_CHARGED', bookingId: id });
        }

        await completeBookingAndReleasePayment(bookingRef, booking, id, penaltyPaymentId);

        res.status(200).json({ success: true, message: 'Penalty applied and booking completed.' });
    } catch (error) {
        console.error('applyPenalty error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------------------------------------------------------------------
// Internal helper: complete booking and release held payment to owner
// ---------------------------------------------------------------------------

async function completeBookingAndReleasePayment(bookingRef, booking, bookingId, penaltyPaymentId) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    // Transition booking to COMPLETED
    batch.update(bookingRef, {
        status: 'COMPLETED',
        completedAt: now,
        updatedAt: now,
        ...(penaltyPaymentId ? { penaltyPaymentId } : {})
    });

    // Release the held rental payment
    if (booking.paymentId) {
        const paymentRef = db.collection('payments').doc(booking.paymentId);
        batch.update(paymentRef, {
            status: 'RELEASED',
            releasedAt: now
        });
    }

    // Clear listing bookingStatus — listing is available again
    const otherActive = await db.collection('bookings')
        .where('listingId', '==', booking.listingId)
        .where('status', 'in', ['ACTIVE', 'OVERDUE', 'RETURN_PENDING'])
        .get();

    const remainingActive = otherActive.docs.filter(d => d.id !== bookingId);
    if (remainingActive.length === 0) {
        const listingRef = db.collection('listings').doc(booking.listingId);
        batch.update(listingRef, { bookingStatus: null });
    }

    await batch.commit();

    // Notify renter
    await db.collection('notifications').add({
        userId: booking.renterId,
        type: 'BOOKING_COMPLETED',
        title: 'Booking Completed',
        body: `Your booking for "${booking.listingTitle}" is complete. Thank you!`,
        bookingId,
        listingId: booking.listingId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendPushToUser(booking.renterId, 'Booking Completed',
        `Your booking for "${booking.listingTitle}" is complete. Thank you!`,
        { type: 'BOOKING_COMPLETED', bookingId, listingId: booking.listingId });
}