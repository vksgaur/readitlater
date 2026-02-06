/**
 * Margins Chrome Extension - Popup Logic
 * Handles article saving with Firebase cloud sync using Web Auth Flow
 */

import { firebaseConfig, isFirebaseConfigured, isOAuthConfigured, GOOGLE_CLIENT_ID } from './firebase-config.js';

// ============================================
// Constants
// ============================================

const AUTH_STORAGE_KEY = 'margins_auth';

// Google OAuth configuration
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// ============================================
// State
// ============================================

let currentUser = null;
let idToken = null;
let currentTab = null;

// ============================================
// DOM Elements
// ============================================

const elements = {
    signInBtn: null,
    signOutBtn: null,
    userProfile: null,
    userAvatar: null,
    userName: null,
    pageUrl: null,
    titleInput: null,
    tagsInput: null,
    saveForm: null,
    saveBtn: null,
    statusMessage: null,
    signinNotice: null
};

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    cacheElements();
    bindEvents();
    await initializePopup();
});

function cacheElements() {
    elements.signInBtn = document.getElementById('signInBtn');
    elements.signOutBtn = document.getElementById('signOutBtn');
    elements.userProfile = document.getElementById('userProfile');
    elements.userAvatar = document.getElementById('userAvatar');
    elements.userName = document.getElementById('userName');
    elements.pageUrl = document.getElementById('pageUrl');
    elements.titleInput = document.getElementById('titleInput');
    elements.tagsInput = document.getElementById('tagsInput');
    elements.saveForm = document.getElementById('saveForm');
    elements.saveBtn = document.getElementById('saveBtn');
    elements.statusMessage = document.getElementById('statusMessage');
    elements.signinNotice = document.getElementById('signinNotice');
}

function bindEvents() {
    elements.saveForm.addEventListener('submit', handleSaveArticle);
    elements.signInBtn.addEventListener('click', handleSignIn);
    elements.signOutBtn.addEventListener('click', handleSignOut);
}

async function initializePopup() {
    // Get current tab info
    await getCurrentTab();

    // Load saved auth state
    await loadAuthState();

    // Update UI based on auth state
    updateAuthUI();
}

// ============================================
// Tab Management
// ============================================

async function getCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            currentTab = tab;
            elements.pageUrl.textContent = truncateUrl(tab.url, 50);
            elements.titleInput.value = tab.title || '';

            // Try to execute script to get description and image
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: () => {
                        const description = document.querySelector('meta[name="description"]')?.content
                            || document.querySelector('meta[property="og:description"]')?.content
                            || '';
                        const image = document.querySelector('meta[property="og:image"]')?.content
                            || document.querySelector('meta[name="twitter:image"]')?.content
                            || '';
                        return { description, image };
                    }
                });

                if (results && results[0] && results[0].result) {
                    currentTab.meta = results[0].result;
                }
            } catch (e) {
                console.log('Script injection failed (likely restricted page):', e);
            }
        }
    } catch (error) {
        console.error('Error getting current tab:', error);
        elements.pageUrl.textContent = 'Unable to get page info';
    }
}

function truncateUrl(url, maxLength) {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
}

// ============================================
// Authentication using launchWebAuthFlow
// ============================================

async function loadAuthState() {
    try {
        const result = await chrome.storage.local.get(AUTH_STORAGE_KEY);
        if (result[AUTH_STORAGE_KEY]) {
            const authData = result[AUTH_STORAGE_KEY];
            currentUser = authData.user;
            idToken = authData.idToken;

            // Check if token is expired (with 5 min buffer)
            if (idToken && authData.expiresAt) {
                const bufferTime = 5 * 60 * 1000; // 5 minutes
                if (Date.now() > (authData.expiresAt - bufferTime)) {
                    console.log('Token expired or expiring soon, attempting refresh...');
                    // Try to refresh the token silently
                    const refreshed = await tryRefreshToken();
                    if (!refreshed) {
                        // Token refresh failed, clear auth state
                        currentUser = null;
                        idToken = null;
                        await saveAuthState(null);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error loading auth state:', error);
    }
}

async function tryRefreshToken() {
    try {
        // Try silent auth flow (non-interactive)
        const redirectUrl = chrome.identity.getRedirectURL();
        const nonce = generateNonce();

        const authParams = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            response_type: 'id_token token',
            redirect_uri: redirectUrl,
            scope: 'openid email profile',
            nonce: nonce,
            prompt: 'none' // Silent refresh - no UI
        });

        const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`;

        const responseUrl = await new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow(
                { url: authUrl, interactive: false },
                (response) => {
                    if (chrome.runtime.lastError || !response) {
                        reject(new Error(chrome.runtime.lastError?.message || 'Silent refresh failed'));
                    } else {
                        resolve(response);
                    }
                }
            );
        });

        // Parse and process the response
        const hashParams = new URLSearchParams(responseUrl.split('#')[1]);
        const googleIdToken = hashParams.get('id_token');

        if (!googleIdToken) {
            return false;
        }

        // Exchange for Firebase token
        const firebaseAuthResult = await signInWithGoogle(googleIdToken);

        idToken = firebaseAuthResult.idToken;
        currentUser = {
            uid: firebaseAuthResult.localId,
            email: firebaseAuthResult.email,
            name: firebaseAuthResult.displayName,
            picture: firebaseAuthResult.photoUrl
        };

        const expiresIn = firebaseAuthResult.expiresIn ? parseInt(firebaseAuthResult.expiresIn) : 3600;
        await saveAuthState({
            user: currentUser,
            idToken: idToken,
            expiresAt: Date.now() + (expiresIn * 1000)
        });

        console.log('Token refreshed successfully');
        return true;
    } catch (error) {
        console.log('Silent token refresh failed:', error.message);
        return false;
    }
}

async function saveAuthState(authData) {
    try {
        if (authData) {
            await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: authData });
        } else {
            await chrome.storage.local.remove(AUTH_STORAGE_KEY);
        }
    } catch (error) {
        console.error('Error saving auth state:', error);
    }
}

function updateAuthUI() {
    const isSignedIn = currentUser && idToken;

    if (isSignedIn) {
        // User is signed in
        elements.signInBtn.style.display = 'none';
        elements.userProfile.style.display = 'flex';
        elements.userAvatar.src = currentUser.picture || '';
        elements.userName.textContent = currentUser.name?.split(' ')[0] || currentUser.email?.split('@')[0] || 'User';

        // Hide sign-in notice, enable save button
        elements.signinNotice.style.display = 'none';
        elements.saveBtn.disabled = false;
        elements.saveBtn.querySelector('.btn-text').textContent = 'Save Article';
    } else {
        // User is NOT signed in
        elements.signInBtn.style.display = 'flex';
        elements.userProfile.style.display = 'none';

        // Show sign-in notice, disable save button
        elements.signinNotice.style.display = 'flex';
        elements.saveBtn.disabled = true;
        elements.saveBtn.querySelector('.btn-text').textContent = 'Sign in to Save';
    }
}

async function handleSignIn() {
    if (!isFirebaseConfigured()) {
        showStatus('Firebase not configured', 'error');
        return;
    }

    if (!isOAuthConfigured()) {
        showStatus('OAuth not configured', 'error');
        return;
    }

    const originalText = elements.signInBtn.innerHTML;
    elements.signInBtn.textContent = 'Signing in...';
    elements.signInBtn.disabled = true;

    try {
        // Build Google OAuth URL
        const redirectUrl = chrome.identity.getRedirectURL();
        console.log('Redirect URL:', redirectUrl);

        const nonce = generateNonce();

        const authParams = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            response_type: 'id_token token',
            redirect_uri: redirectUrl,
            scope: 'openid email profile',
            nonce: nonce,
            prompt: 'select_account'
        });

        const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`;

        // Launch auth flow
        const responseUrl = await new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow(
                { url: authUrl, interactive: true },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response) {
                        resolve(response);
                    } else {
                        reject(new Error('No response from auth flow'));
                    }
                }
            );
        });

        // Parse the response URL
        const hashParams = new URLSearchParams(responseUrl.split('#')[1]);
        const googleIdToken = hashParams.get('id_token');

        if (!googleIdToken) {
            throw new Error('No ID token received');
        }

        // Exchange Google token for Firebase token
        const firebaseAuthResult = await signInWithGoogle(googleIdToken);

        idToken = firebaseAuthResult.idToken;
        currentUser = {
            uid: firebaseAuthResult.localId,
            email: firebaseAuthResult.email,
            name: firebaseAuthResult.displayName,
            picture: firebaseAuthResult.photoUrl
        };

        // Save auth state with expiration
        const expiresIn = firebaseAuthResult.expiresIn ? parseInt(firebaseAuthResult.expiresIn) : 3600;
        await saveAuthState({
            user: currentUser,
            idToken: idToken,
            expiresAt: Date.now() + (expiresIn * 1000)
        });

        updateAuthUI();
        showStatus('Signed in successfully!', 'success');

    } catch (error) {
        console.error('Sign in error:', error);
        if (!error.message.includes('canceled') && !error.message.includes('closed')) {
            showStatus('Sign in failed: ' + error.message, 'error');
        }
    } finally {
        elements.signInBtn.innerHTML = originalText;
        elements.signInBtn.disabled = false;
    }
}

async function signInWithGoogle(googleIdToken) {
    // Use Firebase Auth REST API to sign in with Google credential
    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${firebaseConfig.apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                postBody: `id_token=${googleIdToken}&providerId=google.com`,
                requestUri: chrome.identity.getRedirectURL(),
                returnIdpCredential: true,
                returnSecureToken: true
            })
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Firebase auth failed');
    }

    return await response.json();
}

async function handleSignOut() {
    currentUser = null;
    idToken = null;
    await saveAuthState(null);

    // Clear cached auth
    chrome.identity.clearAllCachedAuthTokens(() => {
        updateAuthUI();
        showStatus('Signed out', 'success');
    });
}

// ============================================
// Article Saving
// ============================================

async function handleSaveArticle(e) {
    e.preventDefault();

    // Double-check auth state
    if (!currentUser || !idToken) {
        showStatus('Please sign in first', 'error');
        return;
    }

    if (!currentTab?.url) {
        showStatus('Unable to get page URL', 'error');
        return;
    }

    const url = currentTab.url;
    const title = elements.titleInput.value.trim() || extractDomain(url);
    const tagsStr = elements.tagsInput.value.trim();
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];

    // Create article object
    const now = new Date().toISOString();
    const article = {
        id: generateId(),
        url: url,
        title: title,
        category: 'other', // Default category
        tags: tags,
        isRead: false,
        isFavorite: false,
        isArchived: false,
        dateAdded: now,
        lastModified: now,
        thumbnail: currentTab.meta?.image || '',
        excerpt: currentTab.meta?.description || '',
        readingTime: 0,
        content: '',
        highlights: [],
        readProgress: 0,
        folderId: null,
        lastReadAt: null,
        readCount: 0,
        totalReadTime: 0
    };

    setLoading(true);

    try {
        // Save directly to Firebase Firestore
        await saveToFirestore(article);
        showStatus('Saved to Margins!', 'success');

        // Close popup after short delay
        setTimeout(() => {
            window.close();
        }, 1000);

    } catch (error) {
        console.error('Error saving article:', error);

        // Check if it's an auth error
        if (error.message.includes('401') || error.message.includes('403') || error.message.includes('UNAUTHENTICATED')) {
            // Token expired, try to refresh
            const refreshed = await tryRefreshToken();
            if (refreshed) {
                // Retry save with new token
                try {
                    await saveToFirestore(article);
                    showStatus('Saved to Margins!', 'success');
                    setTimeout(() => window.close(), 1000);
                    return;
                } catch (retryError) {
                    console.error('Retry failed:', retryError);
                }
            }

            // Refresh failed, need to sign in again
            currentUser = null;
            idToken = null;
            await saveAuthState(null);
            updateAuthUI();
            showStatus('Session expired. Please sign in again.', 'error');
        } else if (error.message.includes('already')) {
            showStatus('Article already saved!', 'warning');
        } else {
            showStatus('Failed to save: ' + error.message, 'error');
        }
    } finally {
        setLoading(false);
    }
}

async function saveToFirestore(article) {
    // Convert article to Firestore document format (REST API format)
    const firestoreDoc = {
        fields: {
            url: { stringValue: article.url },
            title: { stringValue: article.title },
            category: { stringValue: article.category },
            isRead: { booleanValue: article.isRead },
            isFavorite: { booleanValue: article.isFavorite },
            isArchived: { booleanValue: article.isArchived },
            dateAdded: { stringValue: article.dateAdded },
            lastModified: { stringValue: article.lastModified },
            tags: {
                arrayValue: {
                    values: article.tags.length > 0
                        ? article.tags.map(t => ({ stringValue: t }))
                        : []
                }
            },
            thumbnail: { stringValue: article.thumbnail || '' },
            excerpt: { stringValue: article.excerpt || '' },
            readingTime: { integerValue: String(article.readingTime || 0) },
            content: { stringValue: article.content || '' },
            highlights: { arrayValue: { values: [] } },
            readProgress: { integerValue: String(article.readProgress || 0) },
            folderId: { nullValue: null },
            lastReadAt: { nullValue: null },
            readCount: { integerValue: String(article.readCount || 0) },
            totalReadTime: { integerValue: String(article.totalReadTime || 0) }
        }
    };

    // Use the :commit endpoint
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents:commit`;
    const docPath = `projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${currentUser.uid}/articles/${article.id}`;

    console.log('Saving to Firestore:', { uid: currentUser.uid, articleId: article.id });

    const commitBody = {
        writes: [{
            update: {
                name: docPath,
                fields: firestoreDoc.fields
            }
        }]
    };

    const response = await fetch(commitUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(commitBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Error: ${response.status}`);
    }

    return await response.json();
}

// ============================================
// Utilities
// ============================================

function generateId() {
    return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateNonce() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function extractDomain(url) {
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace('www.', '');
    } catch {
        return url;
    }
}

function setLoading(isLoading) {
    elements.saveBtn.disabled = isLoading;
    elements.saveBtn.classList.toggle('loading', isLoading);
    elements.saveBtn.querySelector('.btn-text').textContent = isLoading ? 'Saving...' : 'Save Article';
}

function showStatus(message, type = 'success') {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message show ${type}`;

    // Auto-hide non-success messages after 4 seconds
    if (type !== 'success') {
        setTimeout(() => {
            elements.statusMessage.className = 'status-message';
        }, 4000);
    }
}

// ============================================
// Message Listener
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTH_STATE_CHANGED') {
        loadAuthState().then(() => {
            updateAuthUI();
            sendResponse({ success: true });
        });
        return true;
    }
});
