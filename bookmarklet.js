/**
 * Margins Bookmarklet
 * 
 * Instructions:
 * 1. Create a new bookmark in your browser named "Save to Margins"
 * 2. Paste the code below as the URL
 */

// Minified bookmarklet code (copy this entire line as the bookmark URL):
// javascript:(function(){var t=encodeURIComponent(document.title),u=encodeURIComponent(location.href);window.open('https://readitlater-seven.vercel.app/?add=1&url='+u+'&title='+t,'_blank','width=500,height=450')})();

/**
 * Readable version for reference:
 */
(function () {
    const title = encodeURIComponent(document.title);
    const url = encodeURIComponent(location.href);
    const marginsUrl = 'https://readitlater-seven.vercel.app/';

    window.open(
        `${marginsUrl}?add=1&url=${url}&title=${title}`,
        '_blank',
        'width=500,height=450,scrollbars=yes'
    );
})();
