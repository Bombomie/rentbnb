const admin = require('firebase-admin');
const fs = require('fs');

let serviceAccount;

if (fs.existsSync('/etc/secrets/serviceAccountKey.json')) {
    console.log("Loading secret file from Render");
    serviceAccount = require('/etc/secrets/serviceAccountKey.json');
} else {
    console.log("Loading local file");
    serviceAccount = require('./serviceAccountKey.json');
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
module.exports = admin;