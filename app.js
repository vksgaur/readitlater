/**
 * Margins - Your Curated Reading List
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

    async init() {
        console.log('Initializing App...');

        // Initialize Firebase
        if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined') {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                auth = firebase.auth();
                db = firebase.firestore();

                // Enable offline persistence
                db.enablePersistence({ synchronizeTabs: true })
                    .catch(err => console.log('Persistence error:', err.code));

                this.isConfigured = true;

                // Setup auth listener
                this.setupAuthListener();
                console.log('✓ Firebase initialized');
            } catch (error) {
                console.error('Firebase initialization error:', error);
                this.isConfigured = false;
            }
        } else {
            console.log('ℹ Firebase not configured - using localStorage only');
            this.isConfigured = false;
            UI.showConfigNotice();
        }

        // Run tag cleanup once on startup
        this.normalizeExistingTags();
    },

    // Self-healing: Merge case-variant tags (e.g. "Design" and "design")
    normalizeExistingTags() {
        // Assuming 'Storage' is a global object or imported, similar to 'LocalStorage'
        // If 'Storage' is meant to be 'LocalStorage', please adjust.
        const articles = LocalStorage.getArticles();
        if (!articles.length) return;

        const tagMap = new Map(); // lowercase -> { canonical: string, count: number }

        // Step 1: Count frequency of each casing
        articles.forEach(a => {
            if (a.tags && Array.isArray(a.tags)) {
                a.tags.forEach(tag => {
                    const lower = tag.toLowerCase();
                    if (!tagMap.has(lower)) {
                        tagMap.set(lower, {});
                    }
                    const entry = tagMap.get(lower);
                    entry[tag] = (entry[tag] || 0) + 1;
                });
            }
        });

        // Step 2: Determine canonical form for each (most frequent wins)
        const canonicalMap = new Map(); // lowercase -> canonical string
        let hasChanges = false;

        tagMap.forEach((variations, lower) => {
            // Find variation with highest count
            let bestCurrent = lower;
            let maxCount = -1;

            Object.entries(variations).forEach(([variant, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    bestCurrent = variant;
                }
            });
            canonicalMap.set(lower, bestCurrent);
        });

        // Step 3: Update articles
        articles.forEach(a => {
            if (a.tags && Array.isArray(a.tags)) {
                // Check if any tag needs updating
                const newTags = a.tags.map(t => canonicalMap.get(t.toLowerCase()) || t);
                const needsUpdate = JSON.stringify(a.tags) !== JSON.stringify(newTags);

                if (needsUpdate) {
                    a.tags = newTags;
                    // We only save to local storage here to avoid huge cloud sync spikes on startup
                    // Cloud will sync eventually when user edits or naturally
                    LocalStorage.saveArticles(articles);
                    hasChanges = true;
                }
            }
        });

        if (hasChanges) {
            console.log('🧹 Tags normalized: Duplicates merged.');
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

        // DEBUG: Log user info
        console.log('=== SUBSCRIBING TO ARTICLES ===');
        console.log('User UID:', currentUser.uid);
        console.log('User Email:', currentUser.email);
        console.log('================================');

        UI.showLoading();

        unsubscribeSnapshot = articlesRef
            .orderBy('dateAdded', 'desc')
            .onSnapshot(snapshot => {
                console.log('Snapshot received, document count:', snapshot.size);

                const articles = [];
                snapshot.forEach(doc => {
                    articles.push({ id: doc.id, ...doc.data() });
                });

                console.log('Articles loaded:', articles.length);

                // Also save to localStorage for offline access
                LocalStorage.saveArticles(articles);

                UI.hideLoading();
                UI.renderArticles(articles);
                UI.updateSyncStatus('synced');
            }, error => {
                console.error('Snapshot error:', error);
                console.error('Error code:', error.code);
                console.error('Error message:', error.message);
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
                dateAdded: article.dateAdded,
                // Additional fields that were missing
                tags: article.tags || [],
                isFavorite: article.isFavorite || false,
                isArchived: article.isArchived || false,
                thumbnail: article.thumbnail || '',
                readingTime: article.readingTime || 0,
                content: article.content || '',
                highlights: article.highlights || [],
                readProgress: article.readProgress || 0,
                folderId: article.folderId || null,
                lastReadAt: article.lastReadAt || null,
                readCount: article.readCount || 0,
                totalReadTime: article.totalReadTime || 0
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
    // Update article in Firestore
    async updateArticle(id, updates) {
        const articlesRef = this.getArticlesRef();
        if (!articlesRef) return false;

        try {
            UI.updateSyncStatus('syncing');
            // Use set with merge to handle both existing and new documents
            await articlesRef.doc(id).set(updates, { merge: true });
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
            const success = await FirebaseService.updateArticle(id, updates);
            if (!success) {
                throw new Error('Failed to sync with cloud storage');
            }
            return success;
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
// Highlights Manager (Global Search & Stats)
// ============================================

const HighlightsManager = {
    // Get all highlights across all articles
    getAllHighlights() {
        const articles = Storage.getArticles();
        const allHighlights = [];

        articles.forEach(article => {
            if (article.highlights && article.highlights.length > 0) {
                article.highlights.forEach(h => {
                    allHighlights.push({
                        ...h,
                        articleId: article.id,
                        articleTitle: article.title,
                        articleUrl: article.url
                    });
                });
            }
        });

        return allHighlights;
    },

    // Search highlights by text, note, or tags
    searchHighlights(query) {
        const allHighlights = this.getAllHighlights();
        const lowerQuery = query.toLowerCase();

        return allHighlights.filter(h =>
            h.text.toLowerCase().includes(lowerQuery) ||
            (h.note && h.note.toLowerCase().includes(lowerQuery)) ||
            (h.tags && h.tags.some(t => t.includes(lowerQuery)))
        );
    },

    // Get highlights by tag
    getHighlightsByTag(tag) {
        const allHighlights = this.getAllHighlights();
        return allHighlights.filter(h => h.tags && h.tags.includes(tag.toLowerCase()));
    },

    // Get all unique tags from highlights
    getAllTags() {
        const allHighlights = this.getAllHighlights();
        const tagCounts = {};

        allHighlights.forEach(h => {
            if (h.tags) {
                h.tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });

        return Object.entries(tagCounts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
    },

    // Get highlight statistics
    getStats() {
        const allHighlights = this.getAllHighlights();
        const articles = Storage.getArticles();
        const articlesWithHighlights = articles.filter(a => a.highlights && a.highlights.length > 0);

        const colorCounts = {};
        allHighlights.forEach(h => {
            colorCounts[h.color] = (colorCounts[h.color] || 0) + 1;
        });

        const highlightsWithNotes = allHighlights.filter(h => h.note && h.note.trim());
        const highlightsWithTags = allHighlights.filter(h => h.tags && h.tags.length > 0);

        return {
            totalHighlights: allHighlights.length,
            articlesWithHighlights: articlesWithHighlights.length,
            highlightsWithNotes: highlightsWithNotes.length,
            highlightsWithTags: highlightsWithTags.length,
            colorDistribution: colorCounts,
            topTags: this.getAllTags().slice(0, 10),
            avgHighlightsPerArticle: articlesWithHighlights.length > 0
                ? (allHighlights.length / articlesWithHighlights.length).toFixed(1)
                : 0
        };
    },

    // Export all highlights to Markdown
    exportAllHighlights() {
        const allHighlights = this.getAllHighlights();

        if (allHighlights.length === 0) {
            alert('No highlights to export');
            return;
        }

        // Group by article
        const byArticle = {};
        allHighlights.forEach(h => {
            if (!byArticle[h.articleId]) {
                byArticle[h.articleId] = {
                    title: h.articleTitle,
                    url: h.articleUrl,
                    highlights: []
                };
            }
            byArticle[h.articleId].highlights.push(h);
        });

        let markdown = `# All Highlights\n\nExported: ${new Date().toLocaleString()}\n\n`;
        markdown += `Total: ${allHighlights.length} highlights from ${Object.keys(byArticle).length} articles\n\n---\n\n`;

        Object.values(byArticle).forEach(article => {
            markdown += `## ${article.title}\n\n`;
            markdown += `[${article.url}](${article.url})\n\n`;

            article.highlights.forEach(h => {
                markdown += `> ${h.text}\n\n`;
                if (h.note) markdown += `**Note:** ${h.note}\n\n`;
                if (h.tags && h.tags.length) markdown += `**Tags:** ${h.tags.join(', ')}\n\n`;
            });

            markdown += `---\n\n`;
        });

        // Download file
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `all-highlights-${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }
};

// ============================================
// Reading Analytics Module
// ============================================

const ReadingAnalytics = {
    // Reading session tracking
    currentSession: null,
    readingSessions: [],

    // Start a reading session
    startSession(articleId) {
        this.currentSession = {
            articleId,
            startTime: Date.now(),
            endTime: null,
            duration: 0
        };
    },

    // End current reading session
    endSession() {
        if (this.currentSession) {
            this.currentSession.endTime = Date.now();
            this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;

            // Save session to history
            this.saveSession(this.currentSession);

            // Update article stats
            this.updateArticleStats(this.currentSession.articleId, this.currentSession.duration);

            this.currentSession = null;
        }
    },

    // Save session to localStorage
    saveSession(session) {
        const sessions = JSON.parse(localStorage.getItem('readitlater_sessions') || '[]');
        sessions.push(session);
        // Keep only last 100 sessions
        if (sessions.length > 100) sessions.shift();
        localStorage.setItem('readitlater_sessions', JSON.stringify(sessions));
    },

    // Update article read stats
    updateArticleStats(articleId, duration) {
        const articles = Storage.getArticles();
        const article = articles.find(a => a.id === articleId);

        if (article) {
            article.lastReadAt = new Date().toISOString();
            article.readCount = (article.readCount || 0) + 1;
            article.totalReadTime = (article.totalReadTime || 0) + duration;
            Storage.saveArticles(articles);
        }
    },

    // Estimate reading time for content (words per minute)
    estimateReadingTime(text, wpm = 200) {
        if (!text) return 0;
        const wordCount = text.trim().split(/\s+/).length;
        return Math.ceil(wordCount / wpm);
    },

    // Get reading history (last N days)
    getReadingHistory(days = 30) {
        const sessions = JSON.parse(localStorage.getItem('readitlater_sessions') || '[]');
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

        return sessions.filter(s => s.startTime > cutoff);
    },

    // Get daily reading stats
    getDailyStats(days = 7) {
        const sessions = this.getReadingHistory(days);
        const dailyStats = {};

        sessions.forEach(s => {
            const date = new Date(s.startTime).toISOString().split('T')[0];
            if (!dailyStats[date]) {
                dailyStats[date] = { sessions: 0, totalTime: 0, articles: new Set() };
            }
            dailyStats[date].sessions++;
            dailyStats[date].totalTime += s.duration || 0;
            dailyStats[date].articles.add(s.articleId);
        });

        // Convert to array and sort by date
        return Object.entries(dailyStats)
            .map(([date, stats]) => ({
                date,
                sessions: stats.sessions,
                totalTime: stats.totalTime,
                articlesRead: stats.articles.size
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    },

    // Calculate reading streak
    getReadingStreak() {
        const dailyStats = this.getDailyStats(365);
        if (dailyStats.length === 0) return 0;

        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        let streak = 0;
        let checkDate = today;

        // Check if read today
        const readToday = dailyStats.some(s => s.date === today);
        if (!readToday) {
            // Check yesterday - if didn't read yesterday, streak is 0
            const readYesterday = dailyStats.some(s => s.date === yesterday);
            if (!readYesterday) return 0;
            checkDate = yesterday;
        }

        // Count consecutive days
        const dates = new Set(dailyStats.map(s => s.date));
        let d = new Date(checkDate);

        while (dates.has(d.toISOString().split('T')[0])) {
            streak++;
            d.setDate(d.getDate() - 1);
        }

        return streak;
    },

    // Get comprehensive analytics
    getAnalytics() {
        const articles = Storage.getArticles();
        const sessions = this.getReadingHistory(30);
        const dailyStats = this.getDailyStats(7);

        // Calculate totals
        const totalReadTime = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
        const readArticles = articles.filter(a => a.isRead);
        const unreadArticles = articles.filter(a => !a.isRead && !a.isArchived);
        const favoriteArticles = articles.filter(a => a.isFavorite);

        // Most read articles
        const mostRead = [...articles]
            .filter(a => a.readCount > 0)
            .sort((a, b) => (b.readCount || 0) - (a.readCount || 0))
            .slice(0, 5);

        // Recently read
        const recentlyRead = [...articles]
            .filter(a => a.lastReadAt)
            .sort((a, b) => new Date(b.lastReadAt) - new Date(a.lastReadAt))
            .slice(0, 5);

        // Category distribution
        const categoryStats = {};
        articles.forEach(a => {
            categoryStats[a.category] = (categoryStats[a.category] || 0) + 1;
        });

        return {
            // Summary stats
            totalArticles: articles.length,
            readArticles: readArticles.length,
            unreadArticles: unreadArticles.length,
            favoriteArticles: favoriteArticles.length,

            // Reading stats
            totalReadTime: Math.round(totalReadTime / 60000), // minutes
            sessionsLast30Days: sessions.length,
            readingStreak: this.getReadingStreak(),
            avgSessionTime: sessions.length > 0
                ? Math.round((totalReadTime / sessions.length) / 60000)
                : 0,

            // Trends
            dailyStats,
            categoryDistribution: categoryStats,

            // Lists
            mostReadArticles: mostRead,
            recentlyReadArticles: recentlyRead
        };
    },

    // Format time for display
    formatTime(minutes) {
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
};

// ============================================
// Article Model
// ============================================

class Article {
    constructor(url, title = '', category = 'poem', options = {}) {
        this.id = this.generateId();
        this.url = url;
        this.title = title || this.extractDomain(url);
        this.category = category;
        this.isRead = false;
        this.dateAdded = new Date().toISOString();

        // Content & progress fields
        this.thumbnail = options.thumbnail || '';
        this.readingTime = options.readingTime || 0;
        this.readProgress = 0; // 0-100 percentage
        this.tags = options.tags || [];

        // Organization fields
        this.isFavorite = options.isFavorite || false;
        this.isArchived = options.isArchived || false;
        this.folderId = options.folderId || null;

        // Analytics fields
        this.lastReadAt = null;
        this.readCount = 0;
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
// Folder Model
// ============================================

class Folder {
    constructor(name, color = '#6366f1') {
        this.id = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.name = name;
        this.color = color;
        this.createdAt = new Date().toISOString();
    }
}

// ============================================
// Folder Manager
// ============================================

const FolderManager = {
    STORAGE_KEY: 'readlater_folders',

    getFolders() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error reading folders:', error);
            return [];
        }
    },

    saveFolders(folders) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(folders));
            return true;
        } catch (error) {
            console.error('Error saving folders:', error);
            return false;
        }
    },

    addFolder(name, color) {
        const folders = this.getFolders();
        const folder = new Folder(name, color);
        folders.push(folder);
        this.saveFolders(folders);
        return folder;
    },

    deleteFolder(id) {
        const folders = this.getFolders().filter(f => f.id !== id);
        return this.saveFolders(folders);
    },

    updateFolder(id, updates) {
        const folders = this.getFolders();
        const index = folders.findIndex(f => f.id === id);
        if (index !== -1) {
            folders[index] = { ...folders[index], ...updates };
            return this.saveFolders(folders);
        }
        return false;
    }
};

// ============================================
// UI Controller
// ============================================

const UI = {
    elements: {},
    currentFilter: 'all',
    currentFolderFilter: null,
    currentTagFilter: '',
    searchQuery: '',
    cachedArticles: [],
    selectedArticles: [], // For bulk actions
    isSelectionMode: false,

    init() {
        this.cacheElements();
        this.bindEvents();

        // Initialize Firebase
        FirebaseService.init();

        // If not using Firebase or not signed in, render from localStorage
        if (!FirebaseService.isConfigured || !currentUser) {
            this.render();
        }

        // Handle bookmarklet URL parameters
        this.handleBookmarkletParams();
    },

    // Handle URL parameters from bookmarklet
    handleBookmarkletParams() {
        const params = new URLSearchParams(window.location.search);
        const addMode = params.get('add');
        const url = params.get('url');
        const title = params.get('title');

        if (addMode && url) {
            // Pre-fill the form with bookmarklet data
            this.elements.urlInput.value = decodeURIComponent(url);
            if (title) {
                this.elements.titleInput.value = decodeURIComponent(title);
            }

            // Focus the title field for quick editing
            this.elements.titleInput.focus();
            this.elements.titleInput.select();

            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);

            // Show visual feedback
            this.showSuccess('Article URL loaded! Edit details and click Add Article.');
        }
    },

    cacheElements() {
        this.elements = {
            addForm: document.getElementById('addForm'),
            urlInput: document.getElementById('urlInput'),
            titleInput: document.getElementById('titleInput'),
            searchInput: document.getElementById('searchInput'),
            articlesGrid: document.getElementById('articlesGrid'),
            emptyState: document.getElementById('emptyState'),
            loadingState: document.getElementById('loadingState'),
            navItems: document.querySelectorAll('.nav-item'),
            folderList: document.getElementById('folderList'),
            addFolderBtn: document.getElementById('addFolderBtn'),
            totalCount: document.getElementById('totalCount'),
            unreadCount: document.getElementById('unreadCount'),
            // Auth elements
            signInBtn: document.getElementById('signInBtn'),
            signOutBtn: document.getElementById('signOutBtn'),
            userProfile: document.getElementById('userProfile'),
            userAvatar: document.getElementById('userAvatar'),
            userName: document.getElementById('userName'),
            syncStatus: document.getElementById('syncStatus'),
            configNotice: document.getElementById('configNotice'),
            dismissNotice: document.getElementById('dismissNotice'),
            addBtn: document.getElementById('addButton'),
            tagsInput: document.getElementById('tagsInput'),
            tagsFilterContainer: document.getElementById('tagsFilterContainer'),
            // Stats widget elements (optional, if kept)
            statsWidget: document.getElementById('statsWidget'),
            statStreak: document.getElementById('statStreak'),
            statTotal: document.getElementById('statTotal'),
            statRead: document.getElementById('statRead'),
            statTime: document.getElementById('statTime')
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

        // Sidebar Navigation (All, Favorites, Archive)
        this.elements.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const filter = item.dataset.filter;
                this.setFilter(filter);

                // Update active state
                this.elements.navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');

                // Clear folder selection
                this.currentFolderFilter = null;
                this.renderFolderList(); // Re-render to remove active class from folders
            });
        });

        // Add Folder Button
        if (this.elements.addFolderBtn) {
            this.elements.addFolderBtn.addEventListener('click', () => {
                this.handleAddFolder();
            });
        }

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

        // Use current folder if selected
        const folderId = this.currentFolderFilter;

        if (!this.validateUrl(url)) {
            this.showError('Please enter a valid URL');
            return;
        }

        // Check for duplicate URLs
        const normalizedUrl = this.normalizeUrl(url);
        const articles = this.cachedArticles.length > 0 ? this.cachedArticles : Storage.getArticles();
        const duplicate = articles.find(a => this.normalizeUrl(a.url) === normalizedUrl);

        if (duplicate) {
            const confirmAdd = confirm(`This article "${duplicate.title}" is already saved. Add anyway?`);
            if (!confirmAdd) {
                return;
            }
        }

        // Disable button and show loading state
        const addBtn = this.elements.addBtn;
        const originalText = addBtn.innerHTML;
        addBtn.disabled = true;
        addBtn.innerHTML = '<span class="loading-spinner-small"></span> Fetching...';

        // Parse tags from input
        const tagsRaw = this.elements.tagsInput ? this.elements.tagsInput.value.trim() : '';
        const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(t => t) : [];

        // Fetch article metadata (title, thumbnail, reading time)
        let articleData = { title: '', image: '', readingTime: 0 };
        try {
            articleData = await ContentFetcher.fetchArticle(url);
            if (!title && articleData.title) {
                title = articleData.title;
            }
            console.log('✓ Fetched article data:', articleData.title);
        } catch (error) {
            console.log('Could not fetch article data:', error.message);
        }

        const article = new Article(url, title, 'general', { // Default category 'general' as fallback
            thumbnail: articleData.image || '',
            readingTime: articleData.readingTime || 0,
            tags: tags,
            folderId: folderId
        });

        // Store content if fetched
        if (articleData.content) {
            article.content = articleData.content;
        }

        if (await Storage.addArticle(article)) {
            this.elements.urlInput.value = '';
            this.elements.titleInput.value = '';
            // Category select removed
            if (this.elements.tagsInput) this.elements.tagsInput.value = '';

            // Update tags filter
            this.updateTagsFilter();

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
        addBtn.innerHTML = originalText;
    },

    validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    // Folder Management
    handleAddFolder() {
        const name = prompt('Enter folder name:');
        if (name && name.trim()) {
            FolderManager.addFolder(name.trim());
            this.renderFolderList();
        }
    },

    handleDeleteFolder(id, event) {
        event.stopPropagation();
        if (confirm('Delete this folder? Articles will remain in "All Articles".')) {
            FolderManager.deleteFolder(id);
            // If current folder was deleted, switch to all
            if (this.currentFolderFilter === id) {
                this.currentFolderFilter = null;
                this.setFilter('all');
            }
            this.renderFolderList();
        }
    },

    setFilter(filter) {
        this.currentFilter = filter;
        this.applyFilters();
    },

    renderFolderList() {
        const folders = FolderManager.getFolders();
        const listEl = this.elements.folderList;
        if (!listEl) return;

        listEl.innerHTML = folders.map(folder => `
            <div class="nav-item folder-item ${this.currentFolderFilter === folder.id ? 'active' : ''}" 
                 onclick="UI.handleFolderClick('${folder.id}')">
                <span class="folder-name">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: ${folder.color}">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    ${this.escapeHtml(folder.name)}
                </span>
                <button class="btn-icon delete-folder" onclick="UI.handleDeleteFolder('${folder.id}', event)" title="Delete Folder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');
    },

    handleFolderClick(folderId) {
        this.currentFolderFilter = folderId;
        this.currentFilter = 'folder'; // Internal state to know we are in folder mode

        // Update UI active states
        this.elements.navItems.forEach(nav => nav.classList.remove('active'));
        this.renderFolderList(); // Re-render to update active class

        this.applyFilters();
    },

    // Normalize URL for duplicate detection (removes protocol, www, trailing slash)
    normalizeUrl(url) {
        try {
            const parsed = new URL(url);
            let normalized = parsed.hostname.replace(/^www\./, '') + parsed.pathname;
            // Remove trailing slash
            normalized = normalized.replace(/\/$/, '');
            // Remove common tracking params
            return normalized.toLowerCase();
        } catch {
            return url.toLowerCase();
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

    async handleToggleFavorite(id) {
        const articles = Storage.getArticles();
        const article = articles.find(a => a.id === id);
        if (article) {
            await Storage.updateArticle(id, { isFavorite: !article.isFavorite });
            if (!currentUser || !FirebaseService.isConfigured) {
                this.render();
            }
        }
    },

    async handleToggleArchive(id) {
        const articles = Storage.getArticles();
        const article = articles.find(a => a.id === id);
        if (article) {
            await Storage.updateArticle(id, { isArchived: !article.isArchived });
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

        // Handle special filters
        if (this.currentFilter === 'favorites') {
            filtered = filtered.filter(a => a.isFavorite && !a.isArchived);
        } else if (this.currentFilter === 'archived') {
            filtered = filtered.filter(a => a.isArchived);
        } else if (this.currentFilter === 'read') {
            filtered = filtered.filter(a => a.isRead && !a.isArchived);
        } else if (this.currentFilter === 'unread') {
            filtered = filtered.filter(a => !a.isRead && !a.isArchived);
        } else {
            // 'all' filter excludes archived articles
            filtered = filtered.filter(a => !a.isArchived);
        }

        // Category filter removed
        /* if (this.currentCategoryFilter !== 'all') {
            filtered = filtered.filter(a => a.category === this.currentCategoryFilter);
        } */

        // Folder filter
        if (this.currentFolderFilter) {
            filtered = filtered.filter(a => a.folderId === this.currentFolderFilter);
        }

        // Tag filter
        if (this.currentTagFilter) {
            filtered = filtered.filter(a => a.tags && a.tags.includes(this.currentTagFilter));
        }

        if (this.searchQuery) {
            filtered = filtered.filter(a =>
                a.title.toLowerCase().includes(this.searchQuery) ||
                a.url.toLowerCase().includes(this.searchQuery) ||
                (a.tags && a.tags.some(t => t.includes(this.searchQuery)))
            );
        }

        // Sort by lastReadAt (most recent first), then by dateAdded for articles never read
        filtered.sort((a, b) => {
            // Both have lastReadAt - sort by most recent
            if (a.lastReadAt && b.lastReadAt) {
                return new Date(b.lastReadAt) - new Date(a.lastReadAt);
            }
            // Only a has lastReadAt - a comes first
            if (a.lastReadAt) return -1;
            // Only b has lastReadAt - b comes first
            if (b.lastReadAt) return 1;
            // Neither has lastReadAt - sort by dateAdded (newest first)
            return new Date(b.dateAdded) - new Date(a.dateAdded);
        });

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
        this.renderFolderList(); // New: Render folders
        this.renderTagCloud(); // Build tag cloud from articles
        this.updateTagsFilter();
        this.applyFilters();
        this.updateStats();
    },

    // New: Render Global Tag Cloud
    renderTagCloud() {
        // Collect all tags and their counts
        const tagCounts = {};
        this.cachedArticles.forEach(article => {
            if (article.tags && Array.isArray(article.tags)) {
                article.tags.forEach(tag => {
                    const normalizedTag = tag.toLowerCase().trim();
                    if (normalizedTag) {
                        tagCounts[normalizedTag] = (tagCounts[normalizedTag] || 0) + 1;
                    }
                });
            }
        });

        // Find container (we might need to create it if it doesn't exist yet in HTML, 
        // but for now let's assume we render it into the filters section or a new sidebar)
        // Let's repurpose the 'tagsFilterContainer' for this visual cloud
        const container = document.getElementById('tagsFilterContainer');
        if (!container) return;

        const tags = Object.keys(tagCounts);
        if (tags.length === 0) {
            container.innerHTML = '<span class="no-tags">No tags yet</span>';
            return;
        }

        // Sort by count (desc) then name
        tags.sort((a, b) => tagCounts[b] - tagCounts[a] || a.localeCompare(b));

        container.innerHTML = tags.map(tag => {
            const count = tagCounts[tag];
            // Simple weighting: 1 to 3 classes based on count
            const weightClass = count > 5 ? 'tag-large' : (count > 2 ? 'tag-medium' : 'tag-small');
            const isActive = this.currentTagFilter === tag ? 'active' : '';

            return `
                <button class="tag-cloud-item ${weightClass} ${isActive}" 
                        onclick="UI.filterByTag('${tag}')">
                    #${tag}
                    <span class="tag-count">${count}</span>
                </button>
            `;
        }).join('');
    },

    // New: Filter by specific tag (called from Cloud or Reader)
    filterByTag(tag) {
        // Toggle if clicking same tag
        if (this.currentTagFilter === tag) {
            this.currentTagFilter = null;
        } else {
            this.currentTagFilter = tag;
        }

        // Update UI
        this.renderTagCloud(); // Re-render to show active state
        this.applyFilters();

        // Scroll to top of list
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // Update stats widget with analytics data
    updateStats() {
        if (typeof ReadingAnalytics === 'undefined') return;

        try {
            const analytics = ReadingAnalytics.getAnalytics();

            if (this.elements.statStreak) {
                this.elements.statStreak.textContent = analytics.readingStreak || 0;
            }
            if (this.elements.statTotal) {
                this.elements.statTotal.textContent = analytics.totalArticles || 0;
            }
            if (this.elements.statRead) {
                this.elements.statRead.textContent = analytics.readArticles || 0;
            }
            if (this.elements.statTime) {
                this.elements.statTime.textContent = ReadingAnalytics.formatTime(analytics.totalReadTime || 0);
            }
        } catch (e) {
            console.log('Stats update skipped', e);
        }
    },

    updateTagsFilter() {
        const articles = this.cachedArticles.length > 0 ? this.cachedArticles : Storage.getArticles();

        // Collect all unique tags
        const allTags = new Set();
        articles.forEach(article => {
            if (article.tags && Array.isArray(article.tags)) {
                article.tags.forEach(tag => allTags.add(tag));
            }
        });

        // Render tag filter chips
        const container = this.elements.tagsFilterContainer;
        if (!container) return;

        if (allTags.size === 0) {
            container.innerHTML = '';
            return;
        }

        const tagsArray = Array.from(allTags).sort();
        container.innerHTML = `
            <span class="tags-label">Tags:</span>
            ${tagsArray.map(tag => `
                <button class="tag-filter-btn ${this.currentTagFilter === tag ? 'active' : ''}" data-tag="${tag}">
                    ${tag}
                </button>
            `).join('')}
            ${this.currentTagFilter ? '<button class="tag-filter-btn clear" data-tag="">Clear</button>' : ''}
        `;

        // Bind tag filter events
        container.querySelectorAll('.tag-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentTagFilter = btn.dataset.tag;
                this.updateTagsFilter();
                this.applyFilters();
            });
        });
    },

    renderArticleCard(article) {
        const relativeTime = this.getRelativeTime(article.dateAdded);
        const statusClass = article.isRead ? 'read' : 'unread';
        const statusText = article.isRead ? 'Read' : 'Unread';
        const toggleText = article.isRead ? 'Mark Unread' : 'Mark Read';
        const cardClass = article.isRead ? 'is-read' : '';

        // Reading time display - calculate from content if not set
        let readingTime = article.readingTime || 0;
        if (readingTime === 0 && article.content) {
            const words = article.content.trim().split(/\s+/).length;
            readingTime = Math.max(1, Math.ceil(words / 200));
        }
        const readingTimeText = readingTime > 0 ? `${readingTime} min read` : '';

        // Reading progress
        const readProgress = article.readProgress || 0;
        const progressClass = readProgress > 0 ? 'has-progress' : '';

        // Thumbnail with lazy loading
        const thumbnailHtml = article.thumbnail
            ? `<div class="card-thumbnail"><img data-src="${this.escapeHtml(article.thumbnail)}" alt="" onerror="this.parentElement.style.display='none'"></div>`
            : '';

        // Tags
        const tagsHtml = article.tags && article.tags.length > 0
            ? `<div class="card-tags">${article.tags.map(tag => `<span class="tag" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</span>`).join('')}</div>`
            : '';

        // Category display name
        const categoryDisplay = this.getCategoryDisplayName(article.category);

        return `
            <article class="article-card ${cardClass} ${progressClass}" data-id="${article.id}">
                ${thumbnailHtml}
                ${readProgress > 0 ? `<div class="card-progress-bar"><div class="progress-fill" style="width: ${readProgress}%"></div></div>` : ''}
                <div class="card-header">
                    <div class="card-status">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <span class="category-badge ${article.category}">${categoryDisplay}</span>
                    </div>
                    <div class="card-reading-info">
                        ${readingTimeText ? `<span class="reading-time">${readingTimeText}</span>` : ''}
                        ${readProgress > 0 ? `<span class="reading-progress">${readProgress}%</span>` : ''}
                    </div>
                </div>
                <h3 class="card-title">
                    <a href="#" class="title-link" data-action="reader" data-id="${article.id}">
                        ${this.escapeHtml(article.title)}
                    </a>
                </h3>
                ${tagsHtml}
                <div class="card-meta">
                    <span>Added ${relativeTime}</span>
                </div>
                <div class="card-actions">
                    <button class="btn-action btn-favorite ${article.isFavorite ? 'active' : ''}" data-action="favorite" data-id="${article.id}" title="${article.isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${article.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </button>
                    <button class="btn-action btn-read" data-action="toggle" data-id="${article.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        ${toggleText}
                    </button>
                    <button class="btn-action btn-archive" data-action="archive" data-id="${article.id}" title="${article.isArchived ? 'Unarchive' : 'Archive'}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="21 8 21 21 3 21 3 8"></polyline>
                            <rect x="1" y="3" width="22" height="5"></rect>
                            <line x1="10" y1="12" x2="14" y2="12"></line>
                        </svg>
                    </button>
                    <button class="btn-action btn-delete" data-action="delete" data-id="${article.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </article>
    `;
    },

    getCategoryDisplayName(category) {
        const names = {
            'poem': 'Poem',
            'short-story': 'Short Story',
            'finance': 'Finance',
            'deep': 'Deep',
            'other': 'Other',
            'general': 'General'
        };
        return names[category] || category;
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

        // Reader buttons (including title links)
        document.querySelectorAll('[data-action="reader"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleOpenReader(btn.dataset.id);
            });
        });

        // Favorite buttons
        document.querySelectorAll('[data-action="favorite"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleToggleFavorite(btn.dataset.id);
            });
        });

        // Archive buttons
        document.querySelectorAll('[data-action="archive"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleToggleArchive(btn.dataset.id);
            });
        });

        // Lazy load images with Intersection Observer
        this.setupLazyLoading();
    },

    // Setup Intersection Observer for lazy loading images
    setupLazyLoading() {
        const images = document.querySelectorAll('.card-thumbnail img[data-src]');

        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        observer.unobserve(img);
                    }
                });
            }, {
                rootMargin: '50px 0px', // Start loading 50px before visible
                threshold: 0.01
            });

            images.forEach(img => imageObserver.observe(img));
        } else {
            // Fallback for older browsers
            images.forEach(img => {
                img.src = img.dataset.src;
            });
        }
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
// Theme Manager
// ============================================

const ThemeManager = {
    storageKey: 'margins_theme',

    init() {
        // Load saved theme or use system preference
        const savedTheme = localStorage.getItem(this.storageKey);
        if (savedTheme) {
            this.setTheme(savedTheme);
        } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            this.setTheme('light');
        }

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
            if (!localStorage.getItem(this.storageKey)) {
                this.setTheme(e.matches ? 'light' : 'dark');
            }
        });

        // Bind toggle button
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }
    },

    setTheme(theme) {
        if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem(this.storageKey, theme);
    },

    toggle() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    },

    getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
};

// ============================================
// Initialize Application
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    UI.init();
});
