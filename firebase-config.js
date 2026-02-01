/**
 * Firebase Configuration for Margins
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com
 * 2. Click "Create a project" (or use existing)
 * 3. Once created, click the web icon </> to add a web app
 * 4. Copy the firebaseConfig object and paste below
 * 5. Enable Authentication: Build > Authentication > Get Started > Google (enable)
 * 6. Enable Firestore: Build > Firestore Database > Create Database > Start in test mode
 * 
 * IMPORTANT: Replace the placeholder values below with your actual Firebase config!
 */

var firebaseConfig = {
  apiKey: "AIzaSyCP2_uP-KVynVDJqEzDdhrD2cfL-Uu4pc8",
  authDomain: "readlater-10a14.firebaseapp.com",
  projectId: "readlater-10a14",
  storageBucket: "readlater-10a14.firebasestorage.app",
  messagingSenderId: "814814205402",
  appId: "1:814814205402:web:bb1bff5712f920d0f0dce3"
};

// Check if Firebase is configured
var isFirebaseConfigured = () => {
  return firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    firebaseConfig.projectId !== "YOUR_PROJECT_ID";
};
