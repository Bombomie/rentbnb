const admin = require('../config/firebase');
const db = admin.firestore();

// Fetch the user's personal FAQs
const getMyFaqs = async (req, res) => {
    try {
        const { uid } = req.user;
        const snapshot = await db.collection('users').doc(uid).collection('faqs').get();
        const faqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(faqs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Add a new FAQ to the user's profile
const addMyFaq = async (req, res) => {
    try {
        const { uid } = req.user;
        const { question, answer } = req.body;
        const newDoc = await db.collection('users').doc(uid).collection('faqs').add({ question, answer });
        res.status(201).json({ id: newDoc.id, question, answer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update an existing user FAQ
const updateMyFaq = async (req, res) => {
    try {
        const { uid } = req.user;
        const { id } = req.params;
        const { question, answer } = req.body;
        await db.collection('users').doc(uid).collection('faqs').doc(id).update({ question, answer });
        res.status(200).json({ id, question, answer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Delete a user FAQ
const deleteMyFaq = async (req, res) => {
    try {
        const { uid } = req.user;
        const { id } = req.params;
        await db.collection('users').doc(uid).collection('faqs').doc(id).delete();
        res.status(200).json({ message: "FAQ deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getMyFaqs, addMyFaq, updateMyFaq, deleteMyFaq }; // Export these