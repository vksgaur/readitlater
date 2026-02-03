/**
 * Margins Chrome Extension - Popup Logic
 * Handles article saving with Firebase cloud sync using Web Auth Flow
 */

import { firebaseConfig, isFirebaseConfigured, isOAuthConfigured, GOOGLE_CLIENT_ID } from './firebase-config.js';

// ============================================
// Constants
// ============================================

const STORAGE_KEY = 'margins_pending_articles';
const AUTH_STORAGE_KEY = 'margins_auth';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

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
    categorySelect: null,
    tagsInput: null,
    saveForm: null,
    saveBtn: null,
    statusMessage: null
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
    elements.categorySelect = document.getElementById('categorySelect');
    elements.tagsInput = document.getElementById('tagsInput');
    elements.saveForm = document.getElementById('saveForm');
    elements.saveBtn = document.getElementById('saveBtn');
    elements.statusMessage = document.getElementById('statusMessage');
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

    // Update UI
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
            elements.pageUrl.textContent = tab.url;
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

            // Check if token is expired
            if (idToken && authData.expiresAt) {
                if (Date.now() > authData.expiresAt) {
                    // Token expired, need to sign in again
                    currentUser = null;
                    idToken = null;
                    await saveAuthState(null);
                }
            }
        }
    } catch (error) {
        console.error('Error loading auth state:', error);
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
    if (currentUser) {
        elements.signInBtn.style.display = 'none';
        elements.userProfile.style.display = 'flex';
        elements.userAvatar.src = currentUser.picture || '';
        elements.userName.textContent = currentUser.name?.split(' ')[0] || currentUser.email?.split('@')[0] || 'User';
    } else {
        elements.signInBtn.style.display = 'flex';
        elements.userProfile.style.display = 'none';
    }
}

async function handleSignIn() {
    if (!isFirebaseConfigured()) {
        showStatus('Firebase not configured', 'error');
        return;
    }

    if (!isOAuthConfigured()) {
        showStatus('OAuth not configured. See firebase-config.js', 'error');
        return;
    }

    const originalText = elements.signInBtn.innerHTML;
    elements.signInBtn.textContent = 'Opening...';
    elements.signInBtn.disabled = true;

    try {
        // Build Google OAuth URL
        const redirectUrl = chrome.identity.getRedirectURL();

        // DEBUG: Show the redirect URL that must be added to Google Cloud Console
        console.log('=== REDIRECT URL FOR GOOGLE CLOUD CONSOLE ===');
        console.log(redirectUrl);
        console.log('==============================================');

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
        const accessToken = hashParams.get('access_token');

        if (!googleIdToken) {
            throw new Error('No ID token received');
        }

        // Exchange Google token for Firebase token
        const firebaseAuthResult = await signInWithGoogle(googleIdToken, accessToken);

        idToken = firebaseAuthResult.idToken;
        currentUser = {
            uid: firebaseAuthResult.localId,
            email: firebaseAuthResult.email,
            name: firebaseAuthResult.displayName,
            picture: firebaseAuthResult.photoUrl
        };

        // Save auth state with expiration (default 1 hour if not provided)
        const expiresIn = firebaseAuthResult.expiresIn ? parseInt(firebaseAuthResult.expiresIn) : 3600;
        await saveAuthState({
            user: currentUser,
            idToken: idToken,
            expiresAt: Date.now() + (expiresIn * 1000)
        });

        updateAuthUI();
        showStatus('Signed in!', 'success');

    } catch (error) {
        console.error('Sign in error:', error);
        if (!error.message.includes('canceled') && !error.message.includes('closed')) {
            showStatus('Sign in failed', 'error');
        }
    } finally {
        elements.signInBtn.innerHTML = originalText;
        elements.signInBtn.disabled = false;
    }
}

async function signInWithGoogle(googleIdToken, accessToken) {
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

    if (!currentTab?.url) {
        showStatus('Unable to get page URL', 'error');
        return;
    }

    const url = currentTab.url;
    const title = elements.titleInput.value.trim() || extractDomain(url);
    const category = elements.categorySelect.value;
    const tagsStr = elements.tagsInput.value.trim();
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];

    // Create article object
    const article = {
        id: generateId(),
        url: url,
        title: title,
        category: category,
        tags: tags,
        isRead: false,
        isFavorite: false,
        isArchived: false,
        dateAdded: new Date().toISOString(),
        thumbnail: currentTab.meta?.image || '', // Use grabbed image
        excerpt: currentTab.meta?.description || '', // Use grabbed description
        readingTime: 0,
        content: '', // Content fetching happens in app usually, or we can fetch here
        highlights: [],
        readProgress: 0,
        folderId: null,
        lastReadAt: null,
        readCount: 0,
        totalReadTime: 0
    };

    setLoading(true);

    try {
        if (currentUser && idToken) {
            // Save to Firebase Firestore
            await saveToFirestore(article);
            showStatus('✓ Saved to cloud!', 'success');
        } else {
            // Save to pending queue for later sync
            await saveToPending(article);
            showStatus('✓ Saved locally (sign in to sync)', 'warning');
        }

        // Notify background to update badge
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE' });

        // Close popup after short delay
        setTimeout(() => {
            window.close();
        }, 1200);

    } catch (error) {
        console.error('Error saving article:', error);

        // Check if it's an auth error
        if (error.message.includes('401') || error.message.includes('403') || error.message.includes('UNAUTHENTICATED')) {
            // Token expired, save locally
            currentUser = null;
            idToken = null;
            await saveAuthState(null);
            updateAuthUI();

            await saveToPending(article);
            showStatus('Session expired. Saved locally.', 'warning');
        } else if (error.message.includes('already')) {
            showStatus('Article already saved!', 'warning');
        } else {
            // Try to save locally as fallback
            try {
                await saveToPending(article);
                showStatus('Saved locally (sync later)', 'warning');
            } catch {
                showStatus('Failed to save', 'error');
            }
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
            tags: {
                arrayValue: {
                    values: article.tags.length > 0
                        ? article.tags.map(t => ({ stringValue: t }))
                        : []
                }
            },
            thumbnail: { stringValue: article.thumbnail || '' },
            excerpt: { stringValue: article.excerpt || '' }, // Save excerpt
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

    // Use the :commit endpoint to create/update document (more compatible with SDK)
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents:commit`;

    const docPath = `projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${currentUser.uid}/articles/${article.id}`;

    // DEBUG: Log the user ID and path being used
    console.log('=== SAVING TO FIRESTORE ===');
    console.log('User UID:', currentUser.uid);
    console.log('Document path:', docPath);
    console.log('===========================');

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

async function saveToPending(article) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
            const articles = result[STORAGE_KEY] || [];

            // Check for duplicate
            const exists = articles.some(a => a.url === article.url);
            if (exists) {
                reject(new Error('Article already saved'));
                return;
            }

            articles.unshift(article);

            chrome.storage.local.set({ [STORAGE_KEY]: articles }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    });
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
