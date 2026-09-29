const admin = require('../config/firebase');
module.exports = async (req, res, next) => {

    const authHeader = req.headers.authorization;

    // console.log("POSTMAN SENT THIS HEADER: ", authHeader);

    if(!authHeader || !authHeader.startsWith('Bearer ')){
        return res.status(401).json({ error: 'Unauthorized no token provided' });
    }
    const rawToken = req.headers.authorization?.split('Bearer')[1];
    if (!rawToken){
        return res.status(401).json({ error: 'Unauthorized' });
    }
    //for testing purposes on postman. Logcat provides dirty token with invisible spaces`
    const cleanToken = rawToken.replace(/\s+/g, '');

    try{
        const decodedToken = await admin.auth().verifyIdToken(cleanToken);
        req.user = decodedToken;
        next();
    } catch (error){
        console.log("2. firebase rejected the token because: ", error.message);
        return res.status(401).json({ error: 'Unauthorized' });
    }
}