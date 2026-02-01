/**
 * Margins Chrome Extension - Background Service Worker
 * Handles background tasks, context menus, and badge updates
 */

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

// ============================================
// Constants
// ============================================

const STORAGE_KEY = 'readlater_articles';
const AUTH_STORAGE_KEY = 'margins_auth';


// ============================================
// Installation & Startup
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
    console.log('Margins extension installed:', details.reason);

    // Create context menu for right-click save
    chrome.contextMenus.create({
        id: 'save-to-margins',
        title: 'Save to Margins',
        contexts: ['page', 'link']
    });

    // Initialize badge
    updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
    console.log('Margins extension started');
    updateBadge();
});

// ============================================
// Context Menu Handler
// ============================================

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'save-to-margins') {
        const url = info.linkUrl || info.pageUrl;
        const title = tab?.title || extractDomain(url);

        // Note: In background we can't easily scrape content/thumbnail without scripting
        // We'll save the basic info and let the main app fetch metadata if needed later

        // Create article with default category
        const article = {
            id: generateId(),
            url: url,
            title: title,
            category: 'other',
            tags: [],
            isRead: false,
            isFavorite: false,
            isArchived: false,
            dateAdded: new Date().toISOString(),
            thumbnail: '',
            readingTime: 0,
            content: '',
            highlights: [],
            readProgress: 0,
            folderId: null,
            lastReadAt: null,
            readCount: 0,
            totalReadTime: 0
        };

        try {
            await saveArticle(article);
            showNotification('Article Saved', `"${title}" has been added to your reading list.`);
            updateBadge();
        } catch (error) {
            console.error('Error saving article:', error);
            showNotification('Save Failed', error.message || 'Could not save the article.');
        }
    }
});

// ============================================
// Article Storage
// ============================================

async function saveArticle(article) {
    // 1. Always save locally first (for speed and offline support)
    await saveToLocal(article);

    // 2. Try to save to Firestore if user is authenticated
    try {
        const authState = await getAuthState();
        if (authState && authState.user && authState.idToken) {
            // Check if token is expired
            if (authState.expiresAt && Date.now() > authState.expiresAt) {
                console.log('Auth token expired, skipping cloud sync');
                return; // Just local save is fine, will sync next time app opens
            }

            await saveToFirestore(article, authState.user, authState.idToken);
            console.log('Synced to Firestore successfully');
        }
    } catch (e) {
        console.warn('Failed to sync to cloud (saved locally):', e);
        // We don't throw here because local save was successful
    }
}

async function saveToLocal(article) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
            const articles = result[STORAGE_KEY] || [];

            // Check for duplicate
            const exists = articles.some(a => a.url === article.url);
            if (exists) {
                reject(new Error('Article already saved'));
                return;
            }

            // Add new article
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

// REST API Save mechanism (ported from popup.js)
async function saveToFirestore(article, user, idToken) {
    if (!isFirebaseConfigured()) return;

    // Convert article to Firestore document format
    const firestoreDoc = {
        fields: {
            url: { stringValue: article.url },
            title: { stringValue: article.title },
            category: { stringValue: article.category },
            isRead: { booleanValue: article.isRead },
            isFavorite: { booleanValue: article.isFavorite },
            isArchived: { booleanValue: article.isArchived },
            dateAdded: { stringValue: article.dateAdded },
            tags: { arrayValue: { values: [] } }, // Empty tags for context menu save
            thumbnail: { stringValue: article.thumbnail },
            readingTime: { integerValue: String(article.readingTime || 0) },
            content: { stringValue: article.content },
            highlights: { arrayValue: { values: [] } },
            readProgress: { integerValue: String(article.readProgress || 0) },
            folderId: { nullValue: null },
            lastReadAt: { nullValue: null },
            readCount: { integerValue: String(article.readCount || 0) },
            totalReadTime: { integerValue: String(article.totalReadTime || 0) }
        }
    };

    const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents:commit`;
    const docPath = `projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${user.uid}/articles/${article.id}`;

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
        throw new Error(`Firestore error: ${response.status}`);
    }
}

// ============================================
// Auth Helpers
// ============================================

async function getAuthState() {
    return new Promise((resolve) => {
        chrome.storage.local.get(AUTH_STORAGE_KEY, (result) => {
            resolve(result[AUTH_STORAGE_KEY]);
        });
    });
}

async function getUnreadCount() {
    return new Promise((resolve) => {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
            const articles = result[STORAGE_KEY] || [];
            const unreadCount = articles.filter(a => !a.isRead && !a.isArchived).length;
            resolve(unreadCount);
        });
    });
}

// ============================================
// Badge & UI Updates
// ============================================

async function updateBadge() {
    try {
        const unreadCount = await getUnreadCount();

        if (unreadCount > 0) {
            chrome.action.setBadgeText({ text: unreadCount.toString() });
            chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
    } catch (error) {
        console.error('Error updating badge:', error);
    }
}

function showNotification(title, message) {
    if (chrome.notifications) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon-128.png',
            title: title,
            message: message
        });
    }
}

// ============================================
// Utilities
// ============================================

function generateId() {
    return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function extractDomain(url) {
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace('www.', '');
    } catch {
        return url;
    }
}

// ============================================
// Listeners
// ============================================

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) {
        updateBadge();
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'GET_UNREAD_COUNT':
            getUnreadCount().then(count => sendResponse({ count }));
            return true;

        case 'UPDATE_BADGE':
            updateBadge();
            sendResponse({ success: true });
            break;

        case 'SAVE_ARTICLE':
            // Popup delegates saving to background sometimes, or we can just use the exposed helper
            // Currently popup handles its own saving, but if it wanted to delegate:
            saveArticle(message.article)
                .then(() => {
                    sendResponse({ success: true });
                    updateBadge();
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;
    }
});
