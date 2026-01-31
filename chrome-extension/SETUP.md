# Margins Chrome Extension - Setup Guide

This guide will help you set up the Chrome extension with Google sign-in for cross-device sync.

## Step 1: Load the Extension & Get Extension ID

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the folder: `d:\Projects\Personal Blog\readitlater\chrome-extension`
5. **Copy the Extension ID** shown under your extension
   - Example: `glghokoipikgimflbbelgeatpjkkt`

## Step 2: Get Your Redirect URL

Your extension's redirect URL is:
```
https://YOUR_EXTENSION_ID.chromiumapp.org/
```

For example, if your Extension ID is `glghokoipikgimflbbelgeatpjkkt`, then your redirect URL is:
```
https://glghokoipikgimflbbelgeatpjkkt.chromiumapp.org/
```

## Step 3: Create OAuth Client ID (IMPORTANT - Use Web Application Type!)

1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
2. Make sure you're in the **readlater-10a14** project
3. Click **Create Credentials** → **OAuth client ID**
4. Select **Web application** (NOT "Chrome Extension")
5. Enter name: `Margins Extension`
6. Under **Authorized redirect URIs**, click **ADD URI**
7. Enter your redirect URL from Step 2:
   ```
   https://YOUR_EXTENSION_ID.chromiumapp.org/
   ```
8. Click **Create**
9. **Copy the Client ID** (format: `xxxxx.apps.googleusercontent.com`)

## Step 4: Configure the Extension

1. Open `chrome-extension/firebase-config.js`
2. Replace `GOOGLE_CLIENT_ID` with your new Web Application Client ID:

```javascript
const GOOGLE_CLIENT_ID = "YOUR_WEB_APP_CLIENT_ID.apps.googleusercontent.com";
```

## Step 5: Reload & Test

1. Go back to `chrome://extensions/`
2. Click the **refresh icon** on your extension
3. Click the Margins extension icon
4. Click **Sign in** - you should see the Google account picker!

---

## Troubleshooting

### Error: "redirect_uri_mismatch" 
**This is the most common error!**

Fix:
1. Make sure you created a **Web Application** OAuth client (not "Chrome Extension" type)
2. Double-check the redirect URI includes your exact Extension ID
3. Make sure there's a trailing slash: `https://xxx.chromiumapp.org/`
4. Verify the Client ID in `firebase-config.js` matches the one you created

### How to find your Extension ID
1. Go to `chrome://extensions/`
2. Find "Margins - Save to Read Later"
3. The ID is shown below the extension name

### Error: "popup_closed_by_user"
This just means you closed the sign-in window. Not an error!

### Error: "OAuth not configured"
Your Client ID hasn't been set in `firebase-config.js`

---

## Need Help?

Right-click on the extension popup → **Inspect** to open DevTools and see any error messages.
