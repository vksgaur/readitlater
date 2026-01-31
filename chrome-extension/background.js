/**
 * Margins Chrome Extension - Background Service Worker
 * Handles background tasks, context menus, and badge updates
 */

// ============================================
// Constants
// ============================================

const STORAGE_KEY = 'readlater_articles';

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
            totalReadTime: 0,
            needsSync: true
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
// Badge Updates
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

// ============================================
// Notifications
// ============================================

function showNotification(title, message) {
    // Simple notification using chrome.notifications if available
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
// Storage Change Listener
// ============================================

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) {
        updateBadge();
    }
});

// ============================================
// Message Handler
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'GET_UNREAD_COUNT':
            getUnreadCount().then(count => {
                sendResponse({ count });
            });
            return true; // Keep channel open for async response

        case 'UPDATE_BADGE':
            updateBadge();
            sendResponse({ success: true });
            break;

        case 'SAVE_ARTICLE':
            saveArticle(message.article)
                .then(() => {
                    sendResponse({ success: true });
                    updateBadge();
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        default:
            sendResponse({ error: 'Unknown message type' });
    }
});
