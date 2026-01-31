/**
 * Firebase & OAuth Configuration for Margins Chrome Extension
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Go to Google Cloud Console: https://console.cloud.google.com
 * 2. Select your Firebase project (readlater-10a14)
 * 3. Navigate to: APIs & Services > Credentials
 * 4. Click "Create Credentials" > "OAuth client ID"
 * 5. Select "Chrome Extension" as application type
 * 6. Enter your extension's name
 * 7. Get Extension ID:
 *    - Load extension in Chrome (chrome://extensions)
 *    - Copy the ID shown under your extension
 *    - Paste it in the "Item ID" field
 * 8. Click Create and copy the Client ID
 * 9. Paste the Client ID in GOOGLE_CLIENT_ID below
 * 
 * The Extension ID format looks like: abcdefghijklmnopqrstuvwxyzabcdef
 */

// Firebase configuration (same as web app)
const firebaseConfig = {
    apiKey: "AIzaSyCP2_uP-KVynVDJqEzDdhrD2cfL-Uu4pc8",
    authDomain: "readlater-10a14.firebaseapp.com",
    projectId: "readlater-10a14",
    storageBucket: "readlater-10a14.firebasestorage.app",
    messagingSenderId: "814814205402",
    appId: "1:814814205402:web:bb1bff5712f920d0f0dce3"
};

/**
 * IMPORTANT: Replace this with your Chrome Extension OAuth Client ID
 * 
 * To get this:
 * 1. Go to https://console.cloud.google.com/apis/credentials
 * 2. Create OAuth client ID for "Chrome Extension"
 * 3. Paste the client ID here (format: xxxx.apps.googleusercontent.com)
 */
const GOOGLE_CLIENT_ID = "814814205402-sac9f597akhea5llc0f0auun1o7a6vto.apps.googleusercontent.com";

// Check if Firebase is configured
const isFirebaseConfigured = () => {
    return firebaseConfig.apiKey !== "YOUR_API_KEY" &&
        firebaseConfig.projectId !== "YOUR_PROJECT_ID";
};

// Check if OAuth is configured
const isOAuthConfigured = () => {
    return !GOOGLE_CLIENT_ID.includes("REPLACE_WITH");
};

export { firebaseConfig, isFirebaseConfigured, isOAuthConfigured, GOOGLE_CLIENT_ID };
