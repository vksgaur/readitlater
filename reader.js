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
    isOpen: false,

    // DOM Elements
    elements: {},

    init() {
        this.createReaderDOM();
        this.cacheElements();
        this.bindEvents();
        this.loadSettings();
    },

    createReaderDOM() {
        const readerHTML = `
            <!-- Reader Overlay -->
            <div class="reader-overlay theme-dark font-medium" id="readerOverlay">
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
                                    <span class="settings-label">Font Size</span>
                                    <div class="settings-row">
                                        <button class="font-size-btn" data-size="small">A</button>
                                        <button class="font-size-btn active" data-size="medium">A</button>
                                        <button class="font-size-btn" data-size="large">A</button>
                                        <button class="font-size-btn" data-size="xlarge">A</button>
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
                            <button class="btn-export-highlights" id="btnExportHighlights">Export</button>
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
                    <div class="note-modal-actions">
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
            noteCloseBtn: document.getElementById('btnNoteClose'),
            noteCancelBtn: document.getElementById('btnNoteCancel'),
            noteSaveBtn: document.getElementById('btnNoteSave'),
            loadingState: document.getElementById('readerLoading')
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

        // Note modal
        this.elements.noteCloseBtn.addEventListener('click', () => this.closeNoteModal());
        this.elements.noteCancelBtn.addEventListener('click', () => this.closeNoteModal());
        this.elements.noteSaveBtn.addEventListener('click', () => this.saveNote());
        this.elements.noteModalOverlay.addEventListener('click', (e) => {
            if (e.target === this.elements.noteModalOverlay) {
                this.closeNoteModal();
            }
        });
    },

    loadSettings() {
        const savedTheme = localStorage.getItem('reader_theme') || 'dark';
        const savedFontSize = localStorage.getItem('reader_fontsize') || 'medium';
        this.setTheme(savedTheme);
        this.setFontSize(savedFontSize);
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
            .replace(/font-\w+/, `font-${size}`);

        document.querySelectorAll('.font-size-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === size);
        });

        localStorage.setItem('reader_fontsize', size);
    },

    async open(article) {
        this.currentArticle = article;
        this.highlights = article.highlights || [];

        this.elements.title.textContent = article.title;
        this.elements.articleTitle.textContent = article.title;
        this.elements.articleLink.href = article.url;

        this.elements.overlay.classList.add('active');
        this.isOpen = true;
        document.body.style.overflow = 'hidden';

        this.updateHighlightCount();
        this.renderHighlightsList();

        // Check if article already has content
        if (article.content && article.content.trim()) {
            this.showArticleView(article.content);
        } else {
            // Try to fetch content automatically
            await this.fetchArticleContent(article.url);
        }
    },

    async fetchArticleContent(url) {
        this.showLoadingState();

        try {
            // Use allorigins.win as CORS proxy
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

            const response = await fetch(proxyUrl, {
                timeout: 15000
            });

            if (!response.ok) {
                throw new Error('Failed to fetch');
            }

            const html = await response.text();

            // Parse HTML and extract main content
            const content = this.extractContent(html);

            if (content && content.trim().length > 100) {
                this.currentArticle.content = content;
                this.saveArticle();
                this.showArticleView(content);
            } else {
                throw new Error('Could not extract content');
            }
        } catch (error) {
            console.log('Content fetch failed:', error.message);
            this.showInputView();
        }
    },

    extractContent(html) {
        // Create a DOM parser
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Remove unwanted elements
        const removeSelectors = [
            'script', 'style', 'nav', 'header', 'footer', 'aside',
            '.sidebar', '.nav', '.menu', '.advertisement', '.ads', '.ad',
            '.social', '.share', '.comments', '.related', '.recommended',
            '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
            '.cookie', '.popup', '.modal', 'iframe', 'form'
        ];

        removeSelectors.forEach(selector => {
            doc.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Try to find main content using common selectors
        const contentSelectors = [
            'article',
            '[role="main"]',
            'main',
            '.post-content',
            '.article-content',
            '.entry-content',
            '.content',
            '.post',
            '.article-body',
            '.story-body',
            '#content',
            '#main'
        ];

        let contentEl = null;
        for (const selector of contentSelectors) {
            contentEl = doc.querySelector(selector);
            if (contentEl && contentEl.textContent.trim().length > 200) {
                break;
            }
        }

        // Fallback to body
        if (!contentEl) {
            contentEl = doc.body;
        }

        if (!contentEl) return '';

        // Extract text content preserving paragraphs
        const paragraphs = [];
        const walker = doc.createTreeWalker(
            contentEl,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: (node) => {
                    const tag = node.tagName.toLowerCase();
                    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tag)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text.length > 20) { // Skip very short paragraphs
                paragraphs.push(text);
            }
        }

        // If we got very little content, try getting all text
        if (paragraphs.join('').length < 500) {
            const allText = contentEl.textContent
                .replace(/\s+/g, ' ')
                .trim()
                .split(/\.\s+/)
                .filter(s => s.length > 30)
                .join('.\n\n');
            return allText;
        }

        return paragraphs.join('\n\n');
    },

    showLoadingState() {
        this.elements.loadingState.style.display = 'flex';
        this.elements.inputContainer.style.display = 'none';
        this.elements.articleView.style.display = 'none';
    },

    close() {
        this.elements.overlay.classList.remove('active');
        this.isOpen = false;
        document.body.style.overflow = '';
        this.hideHighlightPopup();
        this.elements.settingsDropdown.classList.remove('active');
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

            this.elements.highlightPopup.style.left = `${rect.left + rect.width / 2 - 80}px`;
            this.elements.highlightPopup.style.top = `${rect.top - 50}px`;
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
            item.innerHTML = `
                <span class="highlight-item-color" style="background: ${this.getColorValue(highlight.color)}"></span>
                <div class="highlight-item-text">${this.escapeHtml(highlight.text)}</div>
                ${highlight.note ? `<div class="highlight-item-note">${this.escapeHtml(highlight.note)}</div>` : ''}
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
        this.elements.noteModalOverlay.classList.add('active');
        this.elements.noteTextarea.focus();
    },

    closeNoteModal() {
        this.elements.noteModalOverlay.classList.remove('active');
        this.currentEditingHighlightId = null;
    },

    saveNote() {
        if (!this.currentEditingHighlightId) return;

        const highlight = this.highlights.find(h => h.id === this.currentEditingHighlightId);
        if (highlight) {
            highlight.note = this.elements.noteTextarea.value.trim();
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
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Reader.init();
});
