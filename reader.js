/**
 * Reader View Module
 * Provides clutter-free reading with text highlighting
 */

const Reader = {
    currentArticle: null,
    highlights: [],
    selectedColor: 'yellow',
    currentTheme: 'dark',
    currentFontSize: 'medium',
    currentFontFamily: 'serif',
    currentLineHeight: 'normal',
    currentWidth: 'medium',
    isOpen: false,

    // DOM Elements
    elements: {},

    init() {
        this.createReaderDOM();
        this.cacheElements();
        this.bindEvents();
        this.loadSettings();
        this.setupHashRouting();
    },

    // Handle URL hash routing for reader state persistence
    setupHashRouting() {
        // Listen for browser back/forward navigation
        window.addEventListener('popstate', (e) => {
            if (this.isOpen && !window.location.hash.startsWith('#read/')) {
                // User navigated back, close reader without pushing new history
                this.closeWithoutHistoryUpdate();
            } else if (!this.isOpen && window.location.hash.startsWith('#read/')) {
                // User navigated forward to a reader state
                this.restoreFromHash();
            }
        });

        // Check for hash on initial page load (after a small delay to ensure articles are loaded)
        setTimeout(() => this.restoreFromHash(), 500);
    },

    // Restore reader state from URL hash
    restoreFromHash() {
        const hash = window.location.hash;
        if (hash.startsWith('#read/')) {
            const articleId = hash.replace('#read/', '');
            const articles = Storage.getArticles();
            const article = articles.find(a => a.id === articleId);

            if (article) {
                // Open without pushing to history (we're already at this hash)
                this.openWithoutHistoryPush(article);
            } else {
                // Article not found, clear the hash
                window.history.replaceState({}, '', window.location.pathname + window.location.search);
            }
        }
    },

    // Open reader without pushing to history (for restoration)
    async openWithoutHistoryPush(article) {
        this.currentArticle = article;
        this.highlights = article.highlights || [];

        this.elements.title.textContent = article.title;
        this.elements.articleTitle.textContent = article.title;
        this.elements.articleLink.href = article.url;

        this.elements.overlay.classList.add('active');
        this.isOpen = true;
        document.body.style.overflow = 'hidden';

        // Don't push to history - we're restoring from existing hash

        this.updateHighlightCount();
        this.renderHighlightsList();

        if (article.content && article.content.trim()) {
            this.showArticleView(article.content);
        } else {
            await this.fetchArticleContent(article.url);
        }
    },

    // Close reader without updating history (for popstate handling)
    closeWithoutHistoryUpdate() {
        try {
            if (typeof ReadingAnalytics !== 'undefined') {
                ReadingAnalytics.endSession();
            }
        } catch (e) {
            console.error('Error ending reading session:', e);
        }

        this.elements.overlay.classList.remove('active');
        this.isOpen = false;
        document.body.style.overflow = '';
        this.hideHighlightPopup();
        this.elements.settingsDropdown.classList.remove('active');
    },

    createReaderDOM() {
        const readerHTML = `
            <!-- Reader Overlay -->
            <div class="reader-overlay theme-dark font-medium" id="readerOverlay">
                <!-- Reading Progress Bar -->
                <div class="reading-progress-container">
                    <div class="reading-progress-bar" id="readingProgressBar"></div>
                </div>
                <!-- Toolbar -->
                <div class="reader-toolbar">
                    <div class="reader-toolbar-left">
                        <button class="btn-reader-close" id="btnReaderClose">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                            Back
                        </button>
                        <span class="reader-title" id="readerTitle">Article Title</span>
                    </div>
                    
                    <div class="reader-toolbar-center">
                        <div class="highlight-colors" id="highlightColors">
                            <button class="highlight-color-btn yellow active" data-color="yellow" title="Yellow"></button>
                            <button class="highlight-color-btn green" data-color="green" title="Green"></button>
                            <button class="highlight-color-btn blue" data-color="blue" title="Blue"></button>
                            <button class="highlight-color-btn pink" data-color="pink" title="Pink"></button>
                            <button class="highlight-color-btn orange" data-color="orange" title="Orange"></button>
                        </div>
                    </div>
                    
                    <div class="reader-toolbar-right">
                        <button class="btn-toggle-sidebar" id="btnToggleSidebar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span id="highlightCountBadge">0</span>
                        </button>
                        
                        <div class="settings-wrapper">
                            <button class="reader-settings-btn" id="btnReaderSettings">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                            </button>
                            
                            <div class="reader-settings-dropdown" id="settingsDropdown">
                                <div class="settings-group">
                                    <span class="settings-label">Font</span>
                                    <div class="settings-row">
                                        <button class="font-family-btn active" data-font="serif">Serif</button>
                                        <button class="font-family-btn" data-font="sans">Sans</button>
                                        <button class="font-family-btn" data-font="mono">Mono</button>
                                    </div>
                                </div>
                                <div class="settings-group">
                                    <span class="settings-label">Font Size</span>
                                    <div class="settings-row">
                                        <button class="font-size-btn" data-size="small">A</button>
                                        <button class="font-size-btn active" data-size="medium">A</button>
                                        <button class="font-size-btn" data-size="large">A</button>
                                        <button class="font-size-btn" data-size="xlarge">A</button>
                                    </div>
                                </div>
                                <div class="settings-group">
                                    <span class="settings-label">Line Height</span>
                                    <div class="settings-row">
                                        <button class="line-height-btn" data-height="compact">Compact</button>
                                        <button class="line-height-btn active" data-height="normal">Normal</button>
                                        <button class="line-height-btn" data-height="relaxed">Relaxed</button>
                                    </div>
                                </div>
                                <div class="settings-group">
                                    <span class="settings-label">Content Width</span>
                                    <div class="settings-row">
                                        <button class="width-btn" data-width="narrow">Narrow</button>
                                        <button class="width-btn active" data-width="medium">Medium</button>
                                        <button class="width-btn" data-width="wide">Wide</button>
                                    </div>
                                </div>
                                <div class="settings-group">
                                    <span class="settings-label">Theme</span>
                                    <div class="settings-row">
                                        <button class="theme-btn active" data-theme="dark">Dark</button>
                                        <button class="theme-btn" data-theme="light">Light</button>
                                        <button class="theme-btn" data-theme="sepia">Sepia</button>
                                    </div>
                                </div>
                                <hr class="settings-divider">
                                <div class="settings-group">
                                    <span class="settings-label">Article Category</span>
                                    <select class="metadata-select" id="readerCategorySelect">
                                        <option value="general">General</option>
                                        <option value="tech">Tech</option>
                                        <option value="news">News</option>
                                        <option value="design">Design</option>
                                        <option value="productivity">Productivity</option>
                                        <option value="entertainment">Entertainment</option>
                                    </select>
                                </div>
                                <div class="settings-group">
                                    <span class="settings-label">Tags</span>
                                    <input type="text" class="metadata-input" id="readerTagsInput" placeholder="ai, webdev, important">
                                    <span class="settings-hint">Comma-separated</span>
                                </div>
                                <button class="btn-save-metadata" id="btnSaveMetadata">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Content Area -->
                <div class="reader-content-wrapper">
                    <div class="reader-content" id="readerContent">
                        <div class="reader-article" id="readerArticle">
                            <!-- Loading State -->
                            <div class="reader-loading" id="readerLoading" style="display: none;">
                                <div class="loading-spinner"></div>
                                <p>Fetching article content...</p>
                            </div>
                            
                            <!-- Input Container (shown when fetch fails) -->
                            <div class="reader-input-container" id="readerInputContainer" style="display: none;">
                                <div class="reader-input-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                        <line x1="16" y1="13" x2="8" y2="13"></line>
                                        <line x1="16" y1="17" x2="8" y2="17"></line>
                                        <polyline points="10 9 9 9 8 9"></polyline>
                                    </svg>
                                </div>
                                <h3 class="reader-input-title">Couldn't fetch article</h3>
                                <p class="reader-input-subtitle">Some websites block content extraction. You can paste the article text below:</p>
                                <textarea class="reader-textarea" id="readerTextarea" placeholder="Paste your article text here..."></textarea>
                                <button class="btn-start-reading" id="btnStartReading" disabled>Start Reading</button>
                            </div>
                            
                            <!-- Article View (shown when content exists) -->
                            <div class="reader-article-view" id="readerArticleView" style="display: none;">
                                <h1 class="reader-article-title" id="readerArticleTitle"></h1>
                                <div class="reader-article-meta" id="readerArticleMeta">
                                    <a href="#" id="readerArticleLink" target="_blank">View original</a>
                                </div>
                                <div class="reader-body" id="readerBody"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Highlights Sidebar -->
                    <div class="highlights-sidebar" id="highlightsSidebar">
                        <div class="sidebar-header">
                            <span class="sidebar-title">
                                Highlights
                                <span class="highlight-count" id="sidebarHighlightCount">0</span>
                            </span>
                            <div class="sidebar-actions">
                                <button class="btn-export-highlights" id="btnExportHighlights" title="Copy to clipboard">📋</button>
                                <button class="btn-export-highlights" id="btnExportPDF" title="Export to PDF">📄</button>
                            </div>
                        </div>
                        <div class="highlights-list" id="highlightsList">
                            <div class="highlights-empty" id="highlightsEmpty">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                </svg>
                                <p>No highlights yet.<br>Select text to highlight.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Highlight Popup (appears on text selection) -->
            <div class="highlight-popup" id="highlightPopup">
                <button class="highlight-popup-btn yellow" data-color="yellow"></button>
                <button class="highlight-popup-btn green" data-color="green"></button>
                <button class="highlight-popup-btn blue" data-color="blue"></button>
                <button class="highlight-popup-btn pink" data-color="pink"></button>
                <button class="highlight-popup-btn orange" data-color="orange"></button>
            </div>
            
            <!-- Note Modal -->
            <div class="note-modal-overlay" id="noteModalOverlay">
                <div class="note-modal">
                    <div class="note-modal-header">
                        <span class="note-modal-title">Add Note</span>
                        <button class="btn-note-close" id="btnNoteClose">&times;</button>
                    </div>
                    <div class="note-highlight-preview" id="noteHighlightPreview"></div>
                    <textarea class="note-textarea" id="noteTextarea" placeholder="Add your note..."></textarea>
                    <div class="note-tags-input">
                        <label for="noteTagsInput">Tags</label>
                        <input type="text" id="noteTagsInput" placeholder="Add tags (comma separated)" />
                    </div>
                    <div class="note-modal-actions">
                        <button class="btn-note-delete" id="btnNoteDelete" title="Delete highlight">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                        <button class="btn-note-cancel" id="btnNoteCancel">Cancel</button>
                        <button class="btn-note-save" id="btnNoteSave">Save Note</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', readerHTML);
    },

    cacheElements() {
        this.elements = {
            overlay: document.getElementById('readerOverlay'),
            closeBtn: document.getElementById('btnReaderClose'),
            title: document.getElementById('readerTitle'),
            highlightColors: document.getElementById('highlightColors'),
            toggleSidebarBtn: document.getElementById('btnToggleSidebar'),
            settingsBtn: document.getElementById('btnReaderSettings'),
            settingsDropdown: document.getElementById('settingsDropdown'),
            content: document.getElementById('readerContent'),
            inputContainer: document.getElementById('readerInputContainer'),
            textarea: document.getElementById('readerTextarea'),
            startReadingBtn: document.getElementById('btnStartReading'),
            articleView: document.getElementById('readerArticleView'),
            articleTitle: document.getElementById('readerArticleTitle'),
            articleMeta: document.getElementById('readerArticleMeta'),
            articleLink: document.getElementById('readerArticleLink'),
            body: document.getElementById('readerBody'),
            sidebar: document.getElementById('highlightsSidebar'),
            highlightsList: document.getElementById('highlightsList'),
            highlightsEmpty: document.getElementById('highlightsEmpty'),
            highlightCountBadge: document.getElementById('highlightCountBadge'),
            sidebarHighlightCount: document.getElementById('sidebarHighlightCount'),
            exportBtn: document.getElementById('btnExportHighlights'),
            highlightPopup: document.getElementById('highlightPopup'),
            noteModalOverlay: document.getElementById('noteModalOverlay'),
            noteHighlightPreview: document.getElementById('noteHighlightPreview'),
            noteTextarea: document.getElementById('noteTextarea'),
            noteTagsInput: document.getElementById('noteTagsInput'),
            noteCloseBtn: document.getElementById('btnNoteClose'),
            noteCancelBtn: document.getElementById('btnNoteCancel'),
            noteSaveBtn: document.getElementById('btnNoteSave'),
            noteDeleteBtn: document.getElementById('btnNoteDelete'),
            exportPdfBtn: document.getElementById('btnExportPDF'),
            loadingState: document.getElementById('readerLoading'),
            // Metadata editor elements
            categorySelect: document.getElementById('readerCategorySelect'),
            tagsInput: document.getElementById('readerTagsInput'),
            saveMetadataBtn: document.getElementById('btnSaveMetadata'),
            // Reading progress bar
            readingProgressBar: document.getElementById('readingProgressBar')
        };
    },

    bindEvents() {
        // Close reader
        this.elements.closeBtn.addEventListener('click', () => this.close());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Highlight color selection in toolbar
        this.elements.highlightColors.addEventListener('click', (e) => {
            const btn = e.target.closest('.highlight-color-btn');
            if (btn) {
                this.selectColor(btn.dataset.color);
            }
        });

        // Toggle sidebar
        this.elements.toggleSidebarBtn.addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Settings dropdown
        this.elements.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.settingsDropdown.classList.toggle('active');
        });

        // Close settings on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.settings-wrapper')) {
                this.elements.settingsDropdown.classList.remove('active');
            }
        });

        // Font size buttons
        document.querySelectorAll('.font-size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setFontSize(btn.dataset.size);
            });
        });

        // Theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTheme(btn.dataset.theme);
            });
        });

        // Font family buttons
        document.querySelectorAll('.font-family-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setFontFamily(btn.dataset.font);
            });
        });

        // Line height buttons
        document.querySelectorAll('.line-height-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setLineHeight(btn.dataset.height);
            });
        });

        // Content width buttons
        document.querySelectorAll('.width-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setContentWidth(btn.dataset.width);
            });
        });

        // Textarea input
        this.elements.textarea.addEventListener('input', () => {
            this.elements.startReadingBtn.disabled = !this.elements.textarea.value.trim();
        });

        // Start reading button
        this.elements.startReadingBtn.addEventListener('click', () => {
            this.startReading();
        });

        // Text selection for highlighting
        this.elements.body.addEventListener('mouseup', (e) => {
            this.handleTextSelection(e);
        });

        // Highlight popup buttons
        this.elements.highlightPopup.querySelectorAll('.highlight-popup-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.createHighlightFromSelection(btn.dataset.color);
            });
        });

        // Hide popup on click outside
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.highlight-popup')) {
                this.hideHighlightPopup();
            }
        });

        // Export highlights
        this.elements.exportBtn.addEventListener('click', () => {
            this.exportHighlights();
        });

        // Export to PDF
        this.elements.exportPdfBtn.addEventListener('click', () => {
            this.exportHighlightsToPDF();
        });

        // Note modal
        this.elements.noteCloseBtn.addEventListener('click', () => this.closeNoteModal());
        this.elements.noteCancelBtn.addEventListener('click', () => this.closeNoteModal());
        this.elements.noteSaveBtn.addEventListener('click', () => this.saveNote());
        this.elements.noteDeleteBtn.addEventListener('click', () => {
            if (this.currentEditingHighlightId && confirm('Delete this highlight?')) {
                this.deleteHighlight(this.currentEditingHighlightId);
                this.closeNoteModal();
            }
        });
        this.elements.noteModalOverlay.addEventListener('click', (e) => {
            if (e.target === this.elements.noteModalOverlay) {
                this.closeNoteModal();
            }
        });

        // Reading progress tracking - update visual immediately, debounce save
        let saveTimeout;
        this.elements.content.addEventListener('scroll', () => {
            this.updateReadProgressVisual();
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                this.saveReadProgress();
            }, 500);
        });

        // Metadata save button
        if (this.elements.saveMetadataBtn) {
            this.elements.saveMetadataBtn.addEventListener('click', () => this.saveMetadata());
        }
    },

    loadSettings() {
        const savedTheme = localStorage.getItem('reader_theme') || 'dark';
        const savedFontSize = localStorage.getItem('reader_fontsize') || 'medium';
        const savedFontFamily = localStorage.getItem('reader_fontfamily') || 'serif';
        const savedLineHeight = localStorage.getItem('reader_lineheight') || 'normal';
        const savedWidth = localStorage.getItem('reader_width') || 'medium';

        this.setTheme(savedTheme);
        this.setFontSize(savedFontSize);
        this.setFontFamily(savedFontFamily);
        this.setLineHeight(savedLineHeight);
        this.setContentWidth(savedWidth);
    },

    selectColor(color) {
        this.selectedColor = color;
        this.elements.highlightColors.querySelectorAll('.highlight-color-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === color);
        });
    },

    setTheme(theme) {
        this.currentTheme = theme;
        this.elements.overlay.className = this.elements.overlay.className
            .replace(/theme-\w+/, `theme-${theme}`)
            .replace(/font-\w+/, `font-${this.currentFontSize}`);

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });

        localStorage.setItem('reader_theme', theme);
    },

    setFontSize(size) {
        this.currentFontSize = size;
        this.elements.overlay.className = this.elements.overlay.className
            .replace(/font-size-\w+/g, '')
            .trim() + ` font-size-${size}`;

        document.querySelectorAll('.font-size-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === size);
        });

        localStorage.setItem('reader_fontsize', size);
    },

    setFontFamily(font) {
        this.currentFontFamily = font;
        // Remove existing font-family classes and add new one
        this.elements.overlay.className = this.elements.overlay.className
            .replace(/font-family-\w+/g, '')
            .trim() + ` font-family-${font}`;

        document.querySelectorAll('.font-family-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.font === font);
        });

        localStorage.setItem('reader_fontfamily', font);
    },

    setLineHeight(height) {
        this.currentLineHeight = height;
        this.elements.overlay.className = this.elements.overlay.className
            .replace(/line-height-\w+/g, '')
            .trim() + ` line-height-${height}`;

        document.querySelectorAll('.line-height-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.height === height);
        });

        localStorage.setItem('reader_lineheight', height);
    },

    setContentWidth(width) {
        this.currentWidth = width;
        this.elements.overlay.className = this.elements.overlay.className
            .replace(/content-width-\w+/g, '')
            .trim() + ` content-width-${width}`;

        document.querySelectorAll('.width-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.width === width);
        });

        localStorage.setItem('reader_width', width);
    },

    async open(article) {
        this.currentArticle = article;
        this.highlights = article.highlights || [];

        this.elements.title.textContent = article.title;
        this.elements.articleTitle.textContent = article.title;
        this.elements.articleLink.href = article.url;

        // Populate metadata editor fields
        if (this.elements.categorySelect) {
            this.elements.categorySelect.value = article.category || 'general';
        }
        if (this.elements.tagsInput) {
            this.elements.tagsInput.value = (article.tags || []).join(', ');
        }

        this.elements.overlay.classList.add('active');
        this.isOpen = true;
        document.body.style.overflow = 'hidden';

        // Initialize progress bar with saved progress
        if (this.elements.readingProgressBar) {
            const savedProgress = article.readProgress || 0;
            this.elements.readingProgressBar.style.width = `${savedProgress}%`;
        }

        // Update URL hash for state persistence
        window.history.pushState({ articleId: article.id }, '', `#read/${article.id}`);

        this.updateHighlightCount();
        this.renderHighlightsList();

        // Update lastReadAt to track recently opened articles
        this.currentArticle.lastReadAt = new Date().toISOString();
        await Storage.updateArticle(article.id, { lastReadAt: this.currentArticle.lastReadAt });

        // Check if article already has content
        if (article.content && article.content.trim()) {
            this.showArticleView(article.content);
        } else {
            // Try to fetch content automatically
            await this.fetchArticleContent(article.url);
        }
    },

    // Save article category and tags
    async saveMetadata() {
        if (!this.currentArticle) return;

        const newCategory = this.elements.categorySelect?.value || 'general';
        const tagsText = this.elements.tagsInput?.value || '';
        const newTags = tagsText.split(',').map(t => t.trim()).filter(t => t);

        try {
            await Storage.updateArticle(this.currentArticle.id, {
                category: newCategory,
                tags: newTags
            });

            // Update current article object
            this.currentArticle.category = newCategory;
            this.currentArticle.tags = newTags;

            // Show success feedback
            const btn = this.elements.saveMetadataBtn;
            btn.classList.add('saved');
            btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Saved!
            `;

            setTimeout(() => {
                btn.classList.remove('saved');
                btn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Save Changes
                `;
            }, 2000);

            // Refresh the article list if UI is available
            if (typeof UI !== 'undefined' && UI.renderArticles) {
                UI.renderArticles();
            }
        } catch (error) {
            console.error('Failed to save metadata:', error);
            alert('Failed to save changes. Please try again.');
        }
    },

    async fetchArticleContent(url) {
        this.showLoadingState();

        try {
            // Use the shared ContentFetcher which has multiple CORS proxies
            const articleData = await ContentFetcher.fetchArticle(url);

            if (articleData.content && articleData.content.trim().length > 100) {
                this.currentArticle.content = articleData.content;

                // Also update title if we got a better one
                if (articleData.title && articleData.title.length > this.currentArticle.title.length) {
                    this.currentArticle.title = articleData.title;
                    this.elements.title.textContent = articleData.title;
                    this.elements.articleTitle.textContent = articleData.title;
                }

                this.saveArticle();
                this.showArticleView(articleData.content);
            } else {
                throw new Error('Could not extract content');
            }
        } catch (error) {
            console.log('Content fetch failed:', error.message);
            this.showInputView();
        }
    },

    showLoadingState() {
        this.elements.loadingState.style.display = 'flex';
        this.elements.inputContainer.style.display = 'none';
        this.elements.articleView.style.display = 'none';

        // Start analytics session
        if (typeof ReadingAnalytics !== 'undefined' && this.currentArticle) {
            ReadingAnalytics.startSession(this.currentArticle.id);
        }
    },

    close() {
        // End analytics session before closing
        try {
            if (typeof ReadingAnalytics !== 'undefined') {
                ReadingAnalytics.endSession();
            }
        } catch (e) {
            console.error('Error ending reading session:', e);
        }

        this.elements.overlay.classList.remove('active');
        this.isOpen = false;
        document.body.style.overflow = '';
        this.hideHighlightPopup();
        this.elements.settingsDropdown.classList.remove('active');

        // Clear URL hash
        if (window.location.hash.startsWith('#read/')) {
            window.history.pushState({}, '', window.location.pathname + window.location.search);
        }
    },

    showInputView() {
        this.elements.loadingState.style.display = 'none';
        this.elements.inputContainer.style.display = 'flex';
        this.elements.articleView.style.display = 'none';
        this.elements.textarea.value = '';
        this.elements.startReadingBtn.disabled = true;
    },

    showArticleView(content) {
        this.elements.loadingState.style.display = 'none';
        this.elements.inputContainer.style.display = 'none';
        this.elements.articleView.style.display = 'block';

        // Convert content to HTML paragraphs and restore highlights
        this.renderContent(content);

        // Restore scroll position after rendering
        setTimeout(() => {
            this.restoreScrollPosition();
        }, 100);
    },

    // Calculate current scroll progress percentage
    getScrollProgress() {
        if (!this.currentArticle || !this.elements.content) return 0;

        const content = this.elements.content;
        const scrollTop = content.scrollTop;
        const scrollHeight = content.scrollHeight - content.clientHeight;

        if (scrollHeight <= 0) return 0;

        return Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
    },

    // Update visual progress bar only (called on every scroll)
    updateReadProgressVisual() {
        const progress = this.getScrollProgress();
        if (this.elements.readingProgressBar) {
            this.elements.readingProgressBar.style.width = `${progress}%`;
        }
    },

    // Save progress to storage (debounced, only if increased)
    saveReadProgress() {
        if (!this.currentArticle) return;

        const progress = this.getScrollProgress();
        if (progress > (this.currentArticle.readProgress || 0)) {
            this.currentArticle.readProgress = progress;
            this.saveArticle();
        }
    },

    // Legacy function kept for compatibility
    updateReadProgress() {
        this.updateReadProgressVisual();
        this.saveReadProgress();
    },

    restoreScrollPosition() {
        if (!this.currentArticle || !this.elements.content) return;

        const progress = this.currentArticle.readProgress || 0;
        if (progress > 0 && progress < 100) {
            const content = this.elements.content;
            const scrollHeight = content.scrollHeight - content.clientHeight;
            const scrollTop = (progress / 100) * scrollHeight;

            content.scrollTop = scrollTop;
            console.log(`Restored to ${progress}% position`);
        }
    },

    startReading() {
        const content = this.elements.textarea.value.trim();
        if (!content) return;

        // Save content to article
        this.currentArticle.content = content;
        this.saveArticle();

        this.showArticleView(content);
    },

    renderContent(content) {
        // Split into paragraphs
        const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
        let html = paragraphs.map(p => `<p>${this.escapeHtml(p.trim())}</p>`).join('');

        this.elements.body.innerHTML = html;

        // Restore highlights
        this.restoreHighlights();
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    handleTextSelection(e) {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText.length > 0 && this.elements.body.contains(selection.anchorNode)) {
            // Show highlight popup near selection
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Calculate popup position with bounds checking
            const popupWidth = 180; // Approximate width of popup
            const popupHeight = 50; // Approximate height of popup

            // Position horizontally centered on selection, but keep within viewport
            let left = rect.left + rect.width / 2 - popupWidth / 2;
            left = Math.max(10, Math.min(left, window.innerWidth - popupWidth - 10));

            // Position above selection if possible, otherwise below
            let top = rect.top - popupHeight - 10;
            if (top < 10) {
                top = rect.bottom + 10; // Show below selection instead
            }

            this.elements.highlightPopup.style.left = `${left}px`;
            this.elements.highlightPopup.style.top = `${top}px`;
            this.elements.highlightPopup.classList.add('active');

            this.pendingSelection = {
                text: selectedText,
                range: range.cloneRange()
            };
        } else {
            this.hideHighlightPopup();
        }
    },

    hideHighlightPopup() {
        this.elements.highlightPopup.classList.remove('active');
        this.pendingSelection = null;
    },

    createHighlightFromSelection(color) {
        if (!this.pendingSelection) return;

        const selection = window.getSelection();
        const range = this.pendingSelection.range;

        // Create highlight span
        const highlightId = `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const span = document.createElement('span');
        span.className = `highlight ${color}`;
        span.dataset.highlightId = highlightId;

        try {
            range.surroundContents(span);
        } catch (e) {
            // Handle partial selection across elements
            console.log('Complex selection, using alternative method');
            const contents = range.extractContents();
            span.appendChild(contents);
            range.insertNode(span);
        }

        // Add click handler for the highlight
        span.addEventListener('click', () => {
            this.openNoteModal(highlightId);
        });

        // Save highlight
        const highlight = {
            id: highlightId,
            text: this.pendingSelection.text,
            color: color,
            note: '',
            tags: [],
            timestamp: new Date().toISOString()
        };

        this.highlights.push(highlight);
        this.saveHighlights();

        // Clear selection
        selection.removeAllRanges();
        this.hideHighlightPopup();

        this.updateHighlightCount();
        this.renderHighlightsList();
    },

    restoreHighlights() {
        // For now, we store highlights but need content position tracking for restore
        // This is a simplified version - full implementation would track offsets
        this.updateHighlightCount();
        this.renderHighlightsList();
    },

    toggleSidebar() {
        this.elements.sidebar.classList.toggle('active');
        this.elements.toggleSidebarBtn.classList.toggle('active');
    },

    updateHighlightCount() {
        const count = this.highlights.length;
        this.elements.highlightCountBadge.textContent = count;
        this.elements.sidebarHighlightCount.textContent = count;

        if (count === 0) {
            this.elements.highlightsEmpty.style.display = 'flex';
        } else {
            this.elements.highlightsEmpty.style.display = 'none';
        }
    },

    renderHighlightsList() {
        const container = this.elements.highlightsList;

        // Clear existing items (except empty state)
        container.querySelectorAll('.highlight-item').forEach(el => el.remove());

        this.highlights.forEach(highlight => {
            const item = document.createElement('div');
            item.className = 'highlight-item';

            // Generate tags HTML
            const tagsHtml = highlight.tags && highlight.tags.length > 0
                ? `<div class="highlight-item-tags">${highlight.tags.map(t => `<span class="highlight-tag">${this.escapeHtml(t)}</span>`).join('')}</div>`
                : '';

            item.innerHTML = `
                <span class="highlight-item-color" style="background: ${this.getColorValue(highlight.color)}"></span>
                <div class="highlight-item-text">${this.escapeHtml(highlight.text)}</div>
                ${highlight.note ? `<div class="highlight-item-note">${this.escapeHtml(highlight.note)}</div>` : ''}
                ${tagsHtml}
                <div class="highlight-item-actions">
                    <button class="btn-highlight-action" data-action="note" data-id="${highlight.id}">
                        ${highlight.note ? 'Edit Note' : 'Add Note'}
                    </button>
                    <button class="btn-highlight-action delete" data-action="delete" data-id="${highlight.id}">Delete</button>
                </div>
            `;

            item.querySelector('[data-action="note"]').addEventListener('click', () => {
                this.openNoteModal(highlight.id);
            });

            item.querySelector('[data-action="delete"]').addEventListener('click', () => {
                this.deleteHighlight(highlight.id);
            });

            container.appendChild(item);
        });
    },

    getColorValue(color) {
        const colors = {
            yellow: '#fef08a',
            green: '#86efac',
            blue: '#93c5fd',
            pink: '#f9a8d4',
            orange: '#fed7aa'
        };
        return colors[color] || colors.yellow;
    },

    openNoteModal(highlightId) {
        const highlight = this.highlights.find(h => h.id === highlightId);
        if (!highlight) return;

        this.currentEditingHighlightId = highlightId;
        this.elements.noteHighlightPreview.textContent = highlight.text;
        this.elements.noteTextarea.value = highlight.note || '';
        // Populate tags input
        this.elements.noteTagsInput.value = (highlight.tags || []).join(', ');
        this.elements.noteModalOverlay.classList.add('active');
        this.elements.noteTextarea.focus();
    },

    closeNoteModal() {
        this.elements.noteModalOverlay.classList.remove('active');
        this.elements.noteTagsInput.value = '';
        this.currentEditingHighlightId = null;
    },

    saveNote() {
        if (!this.currentEditingHighlightId) return;

        const highlight = this.highlights.find(h => h.id === this.currentEditingHighlightId);
        if (highlight) {
            highlight.note = this.elements.noteTextarea.value.trim();
            // Parse and save tags
            const tagsRaw = this.elements.noteTagsInput.value.trim();
            highlight.tags = tagsRaw
                ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(t => t)
                : [];
            this.saveHighlights();
            this.renderHighlightsList();
        }

        this.closeNoteModal();
    },

    deleteHighlight(highlightId) {
        // Remove from DOM
        const span = document.querySelector(`[data-highlight-id="${highlightId}"]`);
        if (span) {
            const text = span.textContent;
            span.replaceWith(text);
        }

        // Remove from array
        this.highlights = this.highlights.filter(h => h.id !== highlightId);
        this.saveHighlights();

        this.updateHighlightCount();
        this.renderHighlightsList();
    },

    saveHighlights() {
        this.currentArticle.highlights = this.highlights;
        this.saveArticle();
    },

    async saveArticle() {
        // Update article in storage
        await Storage.updateArticle(this.currentArticle.id, {
            content: this.currentArticle.content,
            highlights: this.highlights
        });
    },

    exportHighlights() {
        if (this.highlights.length === 0) {
            alert('No highlights to export');
            return;
        }

        let exportText = `Highlights from: ${this.currentArticle.title}\n`;
        exportText += `URL: ${this.currentArticle.url}\n`;
        exportText += `${'='.repeat(50)}\n\n`;

        this.highlights.forEach((h, i) => {
            exportText += `${i + 1}. "${h.text}"\n`;
            if (h.note) {
                exportText += `   Note: ${h.note}\n`;
            }
            exportText += '\n';
        });

        // Copy to clipboard
        navigator.clipboard.writeText(exportText).then(() => {
            alert('Highlights copied to clipboard!');
        }).catch(() => {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = exportText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('Highlights copied to clipboard!');
        });
    },

    // Export highlights to PDF via print dialog
    exportHighlightsToPDF() {
        if (this.highlights.length === 0) {
            alert('No highlights to export');
            return;
        }

        // Create print-friendly HTML
        const articleTitle = this.currentArticle?.title || 'Untitled';
        const articleUrl = this.currentArticle?.url || '';
        const date = new Date().toLocaleDateString();

        let html = `
<!DOCTYPE html>
<html>
<head>
    <title>Highlights - ${articleTitle}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Georgia, serif; line-height: 1.6; padding: 40px; max-width: 800px; margin: 0 auto; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { font-size: 24px; margin-bottom: 8px; }
        .header .meta { color: #666; font-size: 14px; }
        .header a { color: #2563eb; }
        .highlight-item { margin-bottom: 24px; page-break-inside: avoid; }
        .highlight-text { background: #fef3c7; padding: 12px 16px; border-left: 4px solid #f59e0b; font-size: 16px; }
        .highlight-note { color: #666; font-style: italic; margin-top: 8px; padding-left: 20px; font-size: 14px; }
        .highlight-tags { margin-top: 8px; padding-left: 20px; }
        .highlight-tag { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 4px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px; text-align: center; }
        @media print { 
            body { padding: 20px; }
            .footer { position: fixed; bottom: 0; left: 0; right: 0; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Highlights</h1>
        <div class="meta">
            <strong>${articleTitle}</strong><br>
            <a href="${articleUrl}">${articleUrl}</a><br>
            Exported: ${date}
        </div>
    </div>
    <div class="highlights">
`;

        this.highlights.forEach((h, i) => {
            html += `
        <div class="highlight-item">
            <div class="highlight-text">${this.escapeHtml(h.text)}</div>
            ${h.note ? `<div class="highlight-note">📝 ${this.escapeHtml(h.note)}</div>` : ''}
            ${h.tags && h.tags.length ? `<div class="highlight-tags">${h.tags.map(t => `<span class="highlight-tag">${t}</span>`).join('')}</div>` : ''}
        </div>`;
        });

        html += `
    </div>
    <div class="footer">
        Generated by Margins • ${this.highlights.length} highlights
    </div>
</body>
</html>`;

        // Open in new window for printing
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(html);
        printWindow.document.close();

        // Wait for content to load then trigger print
        printWindow.onload = () => {
            printWindow.print();
        };
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Reader.init();
});
