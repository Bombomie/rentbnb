const admin = require('../config/firebase');
const db = admin.firestore();

exports.getUserPayments = async (req, res) => {
    try {
        const { id } = req.params;

        if (req.user && req.user.uid !== id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized' 
            });
        }

        const snapshot = await db.collection('payments')
            .where('payerId', '==', id)
            .orderBy('createdAt', 'desc')
            .get();

        const payments = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.createdAt && data.createdAt.toDate) {
                data.createdAt = data.createdAt.toDate().toISOString();
            }
            return { id: doc.id, ...data };
        });


    } catch(err) {
        console.error('Fetch payments error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

exports.getUserPayouts = async (req, res) => {
    try {
        const { id } = req.params;

        if (req.user && req.user.uid !== id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const snapshot = await db.collection('payments')
            .where('payeeId', '==', id)
            .orderBy('createdAt', 'desc')
            .get();

        const payouts = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.createdAt && data.createdAt.toDate) {
                data.createdAt = data.createdAt.toDate().toISOString();
            }
            return { id: doc.id, ...data };
        });

        const totalEarnings = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);

        res.status(200).json({ 
            success: true, 
            count: payouts.length, 
            totalEarnings: totalEarnings,
            data: payouts 
        });

    } catch (error) {
        console.error('Fetch payouts error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getPaymentReceipt = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const userId = req.user.uid;

        const doc = await db.collection('payments').doc(paymentId).get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }

        const paymentData = doc.data();

        if (paymentData.payerId !== userId && paymentData.payeeId !== userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized to view this receipt' });
        }

        if (paymentData.createdAt && paymentData.createdAt.toDate) {
            paymentData.createdAt = paymentData.createdAt.toDate().toISOString();
        }

        res.status(200).json({ success: true, data: paymentData });

    } catch (error) {
        console.error('Fetch receipt error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};