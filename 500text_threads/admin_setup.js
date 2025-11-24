const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function setAdminClaim(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    
    if (user.customClaims && user.customClaims.admin === true) {
      console.log(`User ${email} is already an admin.`);
      return;
    }

    await admin.auth().setCustomUserClaims(user.uid, {
      admin: true
    });

    console.log(`Successfully granted admin privileges to ${email}`);
    console.log("User must sign out and sign in again for changes to take effect.");
    
  } catch (error) {
    console.error("Error setting admin claim:", error);
  }
}

// Usage: node admin_setup.js <email>
const email = process.argv[2];
if (!email) {
  console.log("Usage: node admin_setup.js <email>");
  process.exit(1);
}

setAdminClaim(email);
