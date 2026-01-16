/**
 * ReadLater - Read It Later Web Application
 * A beautiful reading list manager with Firebase cloud sync
 */

// ============================================
// Configuration
// ============================================

const STORAGE_KEY = 'readlater_articles';
let db = null;
let auth = null;
let currentUser = null;
let unsubscribeSnapshot = null;

// ============================================
// Firebase Initialization
// ============================================

const FirebaseService = {
    isConfigured: false,

    init() {
        // Check if Firebase config exists and is valid
        if (typeof firebaseConfig !== 'undefined' && isFirebaseConfigured()) {
            try {
                firebase.initializeApp(firebaseConfig);
                auth = firebase.auth();
                db = firebase.firestore();

                // Enable offline persistence
                db.enablePersistence({ synchronizeTabs: true })
                    .catch(err => console.log('Persistence error:', err.code));

                this.isConfigured = true;
                this.setupAuthListener();
                console.log('✓ Firebase initialized');
            } catch (error) {
                console.error('Firebase init error:', error);
                this.isConfigured = false;
            }
        } else {
            console.log('ℹ Firebase not configured - using localStorage only');
            this.isConfigured = false;
            UI.showConfigNotice();
        }
    },

    setupAuthListener() {
        auth.onAuthStateChanged(user => {
            currentUser = user;
            if (user) {
                UI.showUserProfile(user);
                UI.updateSyncStatus('synced');
                this.subscribeToArticles();
            } else {
                UI.showSignInButton();
                UI.updateSyncStatus('local');
                if (unsubscribeSnapshot) {
                    unsubscribeSnapshot();
                    unsubscribeSnapshot = null;
                }
                UI.render();
            }
        });
    },

    async signIn() {
        if (!this.isConfigured) {
            alert('Please configure Firebase first. Check firebase-config.js');
            return;
        }

        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            UI.updateSyncStatus('syncing');
            await auth.signInWithPopup(provider);
        } catch (error) {
            console.error('Sign in error:', error);
            UI.updateSyncStatus('error');
            if (error.code !== 'auth/popup-closed-by-user') {
                alert('Sign in failed: ' + error.message);
            }
        }
    },

    async signOut() {
        try {
            await auth.signOut();
        } catch (error) {
            console.error('Sign out error:', error);
        }
    },

    // Get Firestore collection reference for current user
    getArticlesRef() {
        if (!currentUser) return null;
        return db.collection('users').doc(currentUser.uid).collection('articles');
    },

    // Subscribe to real-time updates
    subscribeToArticles() {
        const articlesRef = this.getArticlesRef();
        if (!articlesRef) return;

        UI.showLoading();

        unsubscribeSnapshot = articlesRef
            .orderBy('dateAdded', 'desc')
            .onSnapshot(snapshot => {
                const articles = [];
                snapshot.forEach(doc => {
                    articles.push({ id: doc.id, ...doc.data() });
                });

                // Also save to localStorage for offline access
                LocalStorage.saveArticles(articles);

                UI.hideLoading();
                UI.renderArticles(articles);
                UI.updateSyncStatus('synced');
            }, error => {
                console.error('Snapshot error:', error);
                UI.updateSyncStatus('error');
                UI.hideLoading();
                // Fall back to localStorage
                UI.render();
            });
    },

    // Add article to Firestore
    async addArticle(article) {
        const articlesRef = this.getArticlesRef();
        if (!articlesRef) return false;

        try {
            UI.updateSyncStatus('syncing');
            await articlesRef.doc(article.id).set({
                url: article.url,
                title: article.title,
                category: article.category,
                isRead: article.isRead,
                dateAdded: article.dateAdded
            });
            UI.updateSyncStatus('synced');
            return true;
        } catch (error) {
            console.error('Add article error:', error);
            UI.updateSyncStatus('error');
            return false;
        }
    },

    // Update article in Firestore
    async updateArticle(id, updates) {
        const articlesRef = this.getArticlesRef();
        if (!articlesRef) return false;

        try {
            UI.updateSyncStatus('syncing');
            await articlesRef.doc(id).update(updates);
            UI.updateSyncStatus('synced');
            return true;
        } catch (error) {
            console.error('Update article error:', error);
            UI.updateSyncStatus('error');
            return false;
        }
    },

    // Delete article from Firestore
    async deleteArticle(id) {
        const articlesRef = this.getArticlesRef();
        if (!articlesRef) return false;

        try {
            UI.updateSyncStatus('syncing');
            await articlesRef.doc(id).delete();
            UI.updateSyncStatus('synced');
            return true;
        } catch (error) {
            console.error('Delete article error:', error);
            UI.updateSyncStatus('error');
            return false;
        }
    }
};

// ============================================
// Local Storage (Fallback & Offline Cache)
// ============================================

const LocalStorage = {
    getArticles() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return [];
        }
    },

    saveArticles(articles) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
            return true;
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            return false;
        }
    },

    addArticle(article) {
        const articles = this.getArticles();
        articles.unshift(article);
        return this.saveArticles(articles);
    },

    updateArticle(id, updates) {
        const articles = this.getArticles();
        const index = articles.findIndex(a => a.id === id);
        if (index !== -1) {
            articles[index] = { ...articles[index], ...updates };
            return this.saveArticles(articles);
        }
        return false;
    },

    deleteArticle(id) {
        const articles = this.getArticles();
        const filtered = articles.filter(a => a.id !== id);
        return this.saveArticles(filtered);
    }
};

// ============================================
// Storage (Unified Interface)
// ============================================

const Storage = {
    getArticles() {
        return LocalStorage.getArticles();
    },

    async addArticle(article) {
        // Always save to localStorage first
        LocalStorage.addArticle(article);

        // If signed in, also save to Firestore
        if (currentUser && FirebaseService.isConfigured) {
            return await FirebaseService.addArticle(article);
        }
        return true;
    },

    async updateArticle(id, updates) {
        // Always update localStorage first
        LocalStorage.updateArticle(id, updates);

        // If signed in, also update Firestore
        if (currentUser && FirebaseService.isConfigured) {
            return await FirebaseService.updateArticle(id, updates);
        }
        return true;
    },

    async deleteArticle(id) {
        // Always delete from localStorage first
        LocalStorage.deleteArticle(id);

        // If signed in, also delete from Firestore
        if (currentUser && FirebaseService.isConfigured) {
            return await FirebaseService.deleteArticle(id);
        }
        return true;
    }
};

// ============================================
// Article Model
// ============================================

class Article {
    constructor(url, title = '', category = 'general') {
        this.id = this.generateId();
        this.url = url;
        this.title = title || this.extractDomain(url);
        this.category = category;
        this.isRead = false;
        this.dateAdded = new Date().toISOString();
    }

    generateId() {
        return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    extractDomain(url) {
        try {
            const hostname = new URL(url).hostname;
            return hostname.replace('www.', '');
        } catch {
            return url;
        }
    }
}

// ============================================
// UI Controller
// ============================================

const UI = {
    elements: {},
    currentFilter: 'all',
    currentCategoryFilter: 'all',
    searchQuery: '',
    cachedArticles: [],

    init() {
        this.cacheElements();
        this.bindEvents();

        // Initialize Firebase
        FirebaseService.init();

        // If not using Firebase or not signed in, render from localStorage
        if (!FirebaseService.isConfigured || !currentUser) {
            this.render();
        }
    },

    cacheElements() {
        this.elements = {
            addForm: document.getElementById('addForm'),
            urlInput: document.getElementById('urlInput'),
            titleInput: document.getElementById('titleInput'),
            categorySelect: document.getElementById('categorySelect'),
            searchInput: document.getElementById('searchInput'),
            articlesGrid: document.getElementById('articlesGrid'),
            emptyState: document.getElementById('emptyState'),
            loadingState: document.getElementById('loadingState'),
            filterTabs: document.querySelectorAll('.filter-tab'),
            categoryFilter: document.getElementById('categoryFilter'),
            totalCount: document.querySelector('#totalCount .stat-value'),
            unreadCount: document.querySelector('#unreadCount .stat-value'),
            signInBtn: document.getElementById('signInBtn'),
            signOutBtn: document.getElementById('signOutBtn'),
            userProfile: document.getElementById('userProfile'),
            userAvatar: document.getElementById('userAvatar'),
            userName: document.getElementById('userName'),
            syncStatus: document.getElementById('syncStatus'),
            configNotice: document.getElementById('configNotice'),
            dismissNotice: document.getElementById('dismissNotice'),
            addBtn: document.getElementById('addButton')
        };
    },

    bindEvents() {
        // Form submission
        this.elements.addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddArticle();
        });

        // Search input
        this.elements.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.applyFilters();
        });

        // Filter tabs
        this.elements.filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.elements.filterTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentFilter = tab.dataset.filter;
                this.applyFilters();
            });
        });

        // Category filter
        this.elements.categoryFilter.addEventListener('change', (e) => {
            this.currentCategoryFilter = e.target.value;
            this.applyFilters();
        });

        // Auth buttons
        this.elements.signInBtn.addEventListener('click', () => {
            FirebaseService.signIn();
        });

        this.elements.signOutBtn.addEventListener('click', () => {
            FirebaseService.signOut();
        });

        // Config notice dismiss
        this.elements.dismissNotice.addEventListener('click', () => {
            this.elements.configNotice.style.display = 'none';
            localStorage.setItem('readlater_notice_dismissed', 'true');
        });

        // Keyboard shortcut
        this.elements.urlInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                this.handleAddArticle();
            }
        });
    },

    async handleAddArticle() {
        const url = this.elements.urlInput.value.trim();
        let title = this.elements.titleInput.value.trim();
        const category = this.elements.categorySelect.value;

        if (!this.validateUrl(url)) {
            this.showError('Please enter a valid URL');
            return;
        }

        // Disable button and show loading state
        const addBtn = this.elements.addBtn;
        const originalText = addBtn.textContent;
        addBtn.disabled = true;
        addBtn.textContent = 'Fetching...';

        // If no title provided, try to fetch it from the URL
        if (!title) {
            try {
                const metadata = await ContentFetcher.fetchMetadata(url);
                if (metadata.title) {
                    title = metadata.title;
                    console.log('✓ Auto-fetched title:', title);
                }
            } catch (error) {
                console.log('Could not fetch title:', error.message);
                // Will fall back to domain name
            }
        }

        const article = new Article(url, title, category);

        if (await Storage.addArticle(article)) {
            this.elements.urlInput.value = '';
            this.elements.titleInput.value = '';
            this.elements.categorySelect.value = 'general';

            // If not using Firebase real-time updates, render manually
            if (!currentUser || !FirebaseService.isConfigured) {
                this.render();
            }
            this.showSuccess('Article saved!');
        } else {
            this.showError('Failed to save article');
        }

        // Restore button
        addBtn.disabled = false;
        addBtn.textContent = originalText;
    },

    validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    async handleToggleRead(id) {
        const articles = Storage.getArticles();
        const article = articles.find(a => a.id === id);
        if (article) {
            await Storage.updateArticle(id, { isRead: !article.isRead });
            if (!currentUser || !FirebaseService.isConfigured) {
                this.render();
            }
        }
    },

    async handleDelete(id) {
        if (await Storage.deleteArticle(id)) {
            if (!currentUser || !FirebaseService.isConfigured) {
                this.render();
            }
        }
    },

    handleOpen(url) {
        window.open(url, '_blank', 'noopener,noreferrer');
    },

    getFilteredArticles(articles) {
        let filtered = [...articles];

        if (this.currentFilter === 'read') {
            filtered = filtered.filter(a => a.isRead);
        } else if (this.currentFilter === 'unread') {
            filtered = filtered.filter(a => !a.isRead);
        }

        if (this.currentCategoryFilter !== 'all') {
            filtered = filtered.filter(a => a.category === this.currentCategoryFilter);
        }

        if (this.searchQuery) {
            filtered = filtered.filter(a =>
                a.title.toLowerCase().includes(this.searchQuery) ||
                a.url.toLowerCase().includes(this.searchQuery)
            );
        }

        return filtered;
    },

    // Called from Firebase real-time listener
    renderArticles(articles) {
        this.cachedArticles = articles;
        this.applyFilters();
    },

    applyFilters() {
        const articles = this.cachedArticles.length > 0 ? this.cachedArticles : Storage.getArticles();
        const filteredArticles = this.getFilteredArticles(articles);

        // Update stats
        this.elements.totalCount.textContent = articles.length;
        this.elements.unreadCount.textContent = articles.filter(a => !a.isRead).length;

        // Toggle empty state
        if (filteredArticles.length === 0) {
            this.elements.articlesGrid.innerHTML = '';
            this.elements.emptyState.classList.add('visible');
        } else {
            this.elements.emptyState.classList.remove('visible');
            this.elements.articlesGrid.innerHTML = filteredArticles.map(article => this.renderArticleCard(article)).join('');
            this.bindCardEvents();
        }
    },

    render() {
        this.cachedArticles = Storage.getArticles();
        this.applyFilters();
    },

    renderArticleCard(article) {
        const relativeTime = this.getRelativeTime(article.dateAdded);
        const statusClass = article.isRead ? 'read' : 'unread';
        const statusText = article.isRead ? 'Read' : 'Unread';
        const toggleText = article.isRead ? 'Mark Unread' : 'Mark Read';
        const cardClass = article.isRead ? 'is-read' : '';

        return `
            <article class="article-card ${cardClass}" data-id="${article.id}">
                <div class="card-header">
                    <div class="card-status">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <span class="category-badge ${article.category}">${article.category}</span>
                    </div>
                </div>
                <h3 class="card-title">
                    <a href="${this.escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">
                        ${this.escapeHtml(article.title)}
                    </a>
                </h3>
                <p class="card-url">${this.escapeHtml(article.url)}</p>
                <div class="card-meta">
                    <span>Added ${relativeTime}</span>
                </div>
                <div class="card-actions">
                    <button class="btn-action btn-reader" data-action="reader" data-id="${article.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                        </svg>
                        Read
                    </button>
                    <button class="btn-action btn-open" data-action="open" data-url="${this.escapeHtml(article.url)}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        Open
                    </button>
                    <button class="btn-action btn-read" data-action="toggle" data-id="${article.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        ${toggleText}
                    </button>
                    <button class="btn-action btn-delete" data-action="delete" data-id="${article.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Delete
                    </button>
                </div>
            </article>
        `;
    },

    bindCardEvents() {
        document.querySelectorAll('[data-action="open"]').forEach(btn => {
            btn.addEventListener('click', () => this.handleOpen(btn.dataset.url));
        });

        document.querySelectorAll('[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', () => this.handleToggleRead(btn.dataset.id));
        });

        document.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => this.handleDelete(btn.dataset.id));
        });

        // Reader buttons
        document.querySelectorAll('[data-action="reader"]').forEach(btn => {
            btn.addEventListener('click', () => this.handleOpenReader(btn.dataset.id));
        });
    },

    handleOpenReader(id) {
        const articles = this.cachedArticles.length > 0 ? this.cachedArticles : Storage.getArticles();
        const article = articles.find(a => a.id === id);
        if (article && typeof Reader !== 'undefined') {
            Reader.open(article);
        }
    },

    // Auth UI
    showSignInButton() {
        this.elements.signInBtn.style.display = 'flex';
        this.elements.userProfile.style.display = 'none';
    },

    showUserProfile(user) {
        this.elements.signInBtn.style.display = 'none';
        this.elements.userProfile.style.display = 'flex';
        this.elements.userAvatar.src = user.photoURL || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236366f1"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6 0-8 3-8 6v2h16v-2c0-3-2-6-8-6z"/></svg>';
        this.elements.userName.textContent = user.displayName || user.email;
    },

    // Sync status
    updateSyncStatus(status) {
        const syncEl = this.elements.syncStatus;
        const textEl = syncEl.querySelector('.sync-text');
        const iconEl = syncEl.querySelector('.sync-icon');

        syncEl.className = 'sync-status ' + status;

        switch (status) {
            case 'synced':
                textEl.textContent = 'Synced';
                break;
            case 'syncing':
                textEl.textContent = 'Syncing...';
                break;
            case 'error':
                textEl.textContent = 'Sync error';
                break;
            default:
                textEl.textContent = 'Local';
        }
    },

    // Loading state
    showLoading() {
        this.elements.loadingState.style.display = 'flex';
        this.elements.articlesGrid.style.display = 'none';
        this.elements.emptyState.classList.remove('visible');
    },

    hideLoading() {
        this.elements.loadingState.style.display = 'none';
        this.elements.articlesGrid.style.display = 'grid';
    },

    // Config notice
    showConfigNotice() {
        const dismissed = localStorage.getItem('readlater_notice_dismissed');
        if (!dismissed) {
            this.elements.configNotice.style.display = 'block';
        }
    },

    getRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);

        if (diffSecs < 60) return 'just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
        return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    showSuccess(message) {
        console.log('✓', message);
    },

    showError(message) {
        console.error('✗', message);
        alert(message);
    }
};

// ============================================
// Initialize Application
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
});
