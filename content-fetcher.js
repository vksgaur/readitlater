/**
 * Content Fetcher - Fetches and extracts article content from URLs
 * Uses multiple CORS proxies for reliability
 */

const ContentFetcher = {
    // Multiple CORS proxies for fallback
    corsProxies: [
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ],

    /**
     * Fetch HTML content from a URL using CORS proxies
     */
    async fetchHTML(url) {
        for (let i = 0; i < this.corsProxies.length; i++) {
            try {
                const proxyUrl = this.corsProxies[i](url);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(proxyUrl, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();

                // Check if we got actual HTML content
                if (html && html.includes('<') && html.length > 500) {
                    console.log(`✓ Fetched via proxy ${i + 1}`);
                    return html;
                }

                throw new Error('Invalid response');
            } catch (error) {
                console.log(`Proxy ${i + 1} failed:`, error.message);
                // Continue to next proxy
            }
        }

        throw new Error('All proxies failed');
    },

    /**
     * Extract article metadata (title, description, image)
     */
    extractMetadata(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Extract title (try multiple sources)
        let title = '';

        // 1. Open Graph title
        const ogTitle = doc.querySelector('meta[property="og:title"]');
        if (ogTitle) title = ogTitle.getAttribute('content');

        // 2. Twitter title
        if (!title) {
            const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
            if (twitterTitle) title = twitterTitle.getAttribute('content');
        }

        // 3. Article title in common selectors
        if (!title) {
            const articleTitle = doc.querySelector('article h1, .article-title, .post-title, .entry-title, h1.title');
            if (articleTitle) title = articleTitle.textContent;
        }

        // 4. Document title (last resort)
        if (!title) {
            title = doc.title || '';
        }

        // Clean up title
        title = title.trim()
            .replace(/\s*[\|–—-]\s*[^|–—-]+$/, '') // Remove site name suffix
            .replace(/\s+/g, ' ')
            .trim();

        // Extract description
        let description = '';
        const ogDesc = doc.querySelector('meta[property="og:description"]');
        if (ogDesc) description = ogDesc.getAttribute('content');

        if (!description) {
            const metaDesc = doc.querySelector('meta[name="description"]');
            if (metaDesc) description = metaDesc.getAttribute('content');
        }

        // Extract image
        let image = '';
        const ogImage = doc.querySelector('meta[property="og:image"]');
        if (ogImage) image = ogImage.getAttribute('content');

        return { title, description, image };
    },

    /**
     * Extract main article content from HTML
     */
    extractContent(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Remove unwanted elements
        const removeSelectors = [
            'script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside',
            '.nav', '.navigation', '.menu', '.sidebar', '.widget',
            '.advertisement', '.ads', '.ad', '.advert', '.sponsor',
            '.social', '.share', '.sharing', '.social-share',
            '.comments', '.comment-section', '#comments', '.disqus',
            '.related', '.recommended', '.more-articles', '.read-more',
            '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
            '.cookie', '.popup', '.modal', '.overlay', '.newsletter',
            'iframe', 'form', 'button', 'input', 'select',
            '.author-bio', '.author-box', '.byline-block',
            '.tags', '.categories', '.meta-box',
            '.breadcrumb', '.breadcrumbs',
            '.pagination', '.pager'
        ];

        removeSelectors.forEach(selector => {
            try {
                doc.querySelectorAll(selector).forEach(el => el.remove());
            } catch (e) { /* ignore invalid selectors */ }
        });

        // Try to find main content using common selectors (ordered by specificity)
        const contentSelectors = [
            'article[role="main"]',
            'article.post-content',
            'article.article-content',
            '.post-content',
            '.article-content',
            '.article-body',
            '.entry-content',
            '.story-body',
            '.story-content',
            '.post-body',
            '.content-body',
            'article .content',
            'article',
            '[role="main"]',
            'main',
            '.content',
            '#content',
            '#main',
            '.post',
            '.article'
        ];

        let contentEl = null;
        for (const selector of contentSelectors) {
            try {
                const el = doc.querySelector(selector);
                if (el && el.textContent.trim().length > 300) {
                    contentEl = el;
                    console.log(`Found content with selector: ${selector}`);
                    break;
                }
            } catch (e) { /* ignore */ }
        }

        // Fallback to body
        if (!contentEl) {
            contentEl = doc.body;
        }

        if (!contentEl) return '';

        // Extract text content preserving structure
        const paragraphs = [];

        // Get all text-containing elements
        const textElements = contentEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th');

        textElements.forEach(el => {
            let text = el.textContent.trim();

            // Skip very short paragraphs (likely navigation or UI text)
            if (text.length < 30) return;

            // Skip if contains common non-content patterns
            if (/^(share|tweet|pin|email|print|comments?|reply|subscribe|sign up|log in|menu|search)/i.test(text)) return;

            // Add heading markers
            const tagName = el.tagName.toLowerCase();
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                text = `\n## ${text}`;
            }

            paragraphs.push(text);
        });

        // If we got too little content, try a different approach
        if (paragraphs.join(' ').length < 500) {
            // Get all text from the content element and split by sentences
            const allText = contentEl.textContent
                .replace(/\s+/g, ' ')
                .trim();

            // Split into paragraphs by multiple spaces or sentence patterns
            const sentences = allText.split(/(?<=[.!?])\s+(?=[A-Z])/);
            const chunks = [];
            let currentChunk = '';

            sentences.forEach(sentence => {
                if (sentence.length < 20) return;
                currentChunk += sentence + ' ';
                if (currentChunk.length > 200) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
            });

            if (currentChunk.length > 50) {
                chunks.push(currentChunk.trim());
            }

            return chunks.join('\n\n');
        }

        return paragraphs.join('\n\n');
    },

    /**
     * Calculate reading time based on content
     * Average reading speed: 200 words per minute
     */
    calculateReadingTime(content) {
        if (!content) return 1;
        const words = content.trim().split(/\s+/).length;
        const minutes = Math.ceil(words / 200);
        return Math.max(1, minutes); // At least 1 minute
    },

    /**
     * Fetch and extract both metadata and content
     */
    async fetchArticle(url) {
        const html = await this.fetchHTML(url);

        const metadata = this.extractMetadata(html);
        const content = this.extractContent(html);
        const readingTime = this.calculateReadingTime(content);

        return {
            title: metadata.title,
            description: metadata.description,
            image: metadata.image,
            content: content,
            readingTime: readingTime
        };
    },

    /**
     * Quick fetch just for metadata (title, etc.)
     */
    async fetchMetadata(url) {
        const html = await this.fetchHTML(url);
        return this.extractMetadata(html);
    }
};
