const admin = require('../config/firebase');

const register = async (req, res) => {
    try {
        const { uid, email } = req.user; 

        const { 
            displayName, 
            phone, 
            city,
            province, 
            completeAddress,
            userType, 
            age, 
            gender, 
            companyDetails 
        } = req.body;

        const db = admin.firestore();
        const userRef = db.collection('users').doc(uid);

        console.log(`Finalizing profile for UID: ${uid}`);

        const userData = {
            uid: uid,
            email: email,
            displayName: displayName || '',
            photoUrl: req.user.picture || '',
            phone: phone || '',
            location: { city: city || '', province: province || '' },
            address: completeAddress || '',
            userType: userType || 'INDIVIDUAL', 
            age: age || null,
            gender: gender || '',
            rating: 0,
            totalReviews: 0,
            totalEarnings: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (userType === 'COMPANY' && companyDetails) {
            userData.companyDetails = {
                companyName: companyDetails.companyName || '',
                permitNumber: companyDetails.permitNumber || 'PENDING',
                businessType: companyDetails.businessType || '',
                yearsOfOperation: companyDetails.yearsOfOperation || '',
                isVerified: false,
                optionalMobiles: [
                    companyDetails.optionalMobile1 || '',
                    companyDetails.optionalMobile2 || '',
                    companyDetails.optionalMobile3 || ''
                ].filter(num => num !== ''), 
                serviceArea: {
                    radius: companyDetails.radius || '',
                    coverage: companyDetails.coverage || '',
                    specificAreas: companyDetails.specificAreas || ''
                }
            };
        }
        
        await userRef.set(userData, { merge: true });

        delete userData.createdAt;
        
        return res.status(201).json({
            message: 'User profile finalized and saved',
            user: userData
        });
    } catch (error) {
        console.error("Error finalizing profile:", error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const google = async (req, res) => {
    try {
        const { uid, email, name, picture } = req.user;

        const db = admin.firestore();
        const userRef = db.collection('users').doc(uid);
        const docSnap = await userRef.get();

        if (docSnap.exists) {
            console.log(`User ${uid} logging in.`);
            const existingData = docSnap.data();

            if (existingData.createdAt && existingData.createdAt.toDate) {
                existingData.createdAt = existingData.createdAt.toDate().toISOString();
            }

            return res.status(200).json({
                message: 'Login successful',
                user: existingData,
                isNewUser: false 
            });
        }
        
        const userData = {
            uid: uid,
            email: email,
            displayName: name || '',
            photoUrl: picture || '',
            userType: 'INDIVIDUAL', 
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await userRef.set(userData);

        delete userData.createdAt;
        
        return res.status(201).json({
            message: 'Initial Google profile created',
            user: userData,
            isNewUser: true
        });

    } catch (error) {
        console.error("Google Auth Error:", error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const userData = async (req, res) => {
    try{
        const { uid } = req.user;

        const db = admin.firestore();
        const userRef = db.collection('users').doc(uid);
        const docSnap = await userRef.get();

        if (!docSnap.exists){
            return res.status(404).json({ error: 'User not found' });
        }
        const data = docSnap.data();

        const listingSnapshot = await db.collection('listings').where('ownerId', '==', uid).count().get();
        const totalListings = listingSnapshot.data().count;


        const userDataPayload = {
            uid: data.uid || uid,
            email: data.email,
            displayName: data.displayName,
            photoUrl: data.photoUrl,
            phone: data.phone,
            age: data.age,
            gender: data.gender,
            completeAddress: data.address,
            location: {
                city: data.location?.city || "",
                province: data.location?.province || ""
            },
            rating: data.rating || 0,
            totalReviews: data.totalReviews || 0,
            totalEarnings: data.totalEarnings || 0,
            userType: data.userType || "INDIVIDUAL", 
            listingsCount: totalListings || 0,
            createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
            companyDetails: data.companyDetails || null,
            payoutMethods: data.payoutMethods || null
        }

        return res.status(200).json({
            message: "Successfully fetched user data",
            user: userDataPayload
        });
    } catch (error){
        console.error("Error fetching user data:", error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const editProfile = async (req, res) => {
    try{
        const {uid} = req.user;
        const db = admin.firestore();
        const userRef = db.collection('users').doc(uid);
        const docSnap = await userRef.get();

        if (!docSnap.exists){
            return res.status(404).json({ error: 'User not found' });
        }

        const {
            displayName, phone, age, gender, city, province, completeAddress, companyDetails
        } = req.body;
        
        const updateData = {};

        if (displayName !== undefined) updateData.displayName = displayName;
        if (phone !== undefined) updateData.phone = phone;
        if (age !== undefined) updateData.age = age;
        if (gender !== undefined) updateData.gender = gender;
        if(completeAddress !== undefined) updateData.address = completeAddress;
        if(city !== undefined) updateData['location.city'] = city;
        if(province !== undefined) updateData['location.province'] = province;
        
        if (companyDetails) {
            if (companyDetails.businessType !== undefined) updateData['companyDetails.businessType'] = companyDetails.businessType;
            if (companyDetails.yearsOfOperation !== undefined) updateData['companyDetails.yearsOfOperation'] = companyDetails.yearsOfOperation;
            
            if (companyDetails.serviceArea) {
                if (companyDetails.serviceArea.radius !== undefined) 
                    updateData['companyDetails.serviceArea.radius'] = companyDetails.serviceArea.radius;
                if (companyDetails.serviceArea.coverage !== undefined) 
                    updateData['companyDetails.serviceArea.coverage'] = companyDetails.serviceArea.coverage;
                if (companyDetails.serviceArea.specificAreas !== undefined) 
                    updateData['companyDetails.serviceArea.specificAreas'] = companyDetails.serviceArea.specificAreas;
            }       
        };

        await userRef.update(updateData);

        return res.status(200).json({message: "Profile Successfully Updated"});

    } catch (error) {
        console.error("Error updating profile:", error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const saveFcmToken = async (req, res) => {
    try {
        const { uid } = req.user;
        const { fcmToken } = req.body;
 
        if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.trim() === '') {
            return res.status(400).json({ error: 'fcmToken is required.' });
        }
 
        const db = admin.firestore();
        await db.collection('users').doc(uid).update({
            fcmToken: fcmToken.trim(),
            fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
 
        return res.status(200).json({ message: 'FCM token saved.' });
    } catch (error) {
        console.error('saveFcmToken error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const updatePayoutMethods = async (req, res) => {
    try {
        const { uid } = req.user;
        const db = admin.firestore();
        const userRef = db.collection('users').doc(uid);
        const docSnap = await userRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { gcash, paypal } = req.body;
        const updateData = {};

        // Use safe dot notation to update subfields without wiping out other properties
        if (gcash !== undefined) updateData['payoutMethods.gcash'] = gcash;
        if (paypal !== undefined) updateData['payoutMethods.paypal'] = paypal;

        await userRef.update(updateData);

        return res.status(200).json({ message: "Payout methods successfully updated" });
    } catch (error) {
        console.error("Error updating payout methods:", error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};


module.exports = { register, google, userData, editProfile, saveFcmToken, updatePayoutMethods };