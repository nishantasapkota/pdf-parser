'use strict';

const browserManager = require('./browser');

/**
 * PDF generation options applied to every request.
 * These are tuned for maximum compatibility with HTML content while
 * keeping output size reasonable.
 */
const PDF_OPTIONS = {
  format: 'A4',
  printBackground: true,   // render CSS backgrounds (charts, coloured cells, etc.)
  preferCSSPageSize: true,  // honour @page rules in the HTML
  margin: {
    top: '10mm',
    right: '10mm',
    bottom: '10mm',
    left: '10mm',
  },
};

/** Maximum time (ms) to wait for a URL to load or HTML to render. */
const PAGE_LOAD_TIMEOUT_MS = parseInt(process.env.PAGE_LOAD_TIMEOUT_MS || '30000', 10);

/** Maximum time (ms) to wait for pdf() to finish writing. */
const PDF_RENDER_TIMEOUT_MS = parseInt(process.env.PDF_RENDER_TIMEOUT_MS || '20000', 10);

/**
 * ConcurrencyQueue — limits the number of simultaneous Chromium pages.
 *
 * Each open page costs ~20-40 MB RSS. Under high load, naively opening one
 * page per request can exhaust container memory. The queue ensures at most
 * `maxConcurrent` pages are alive at once; additional requests wait in line.
 *
 * For 100+ req/min on a 512 MB container, a concurrency of 5-10 is safe.
 * Tune via the MAX_CONCURRENT_PAGES env var.
 */
class ConcurrencyQueue {
  constructor(maxConcurrent) {
    this._max = maxConcurrent;
    this._running = 0;
    /** @type {Array<() => void>} */
    this._queue = [];
  }

  /**
   * Run `fn` when a slot is available.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  run(fn) {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (this._running < this._max) {
          this._running++;
          fn()
            .then(resolve, reject)
            .finally(() => {
              this._running--;
              if (this._queue.length > 0) {
                const next = this._queue.shift();
                next();
              }
            });
        } else {
          this._queue.push(attempt);
        }
      };
      attempt();
    });
  }
}

const MAX_CONCURRENT_PAGES = parseInt(process.env.MAX_CONCURRENT_PAGES || '5', 10);
const queue = new ConcurrencyQueue(MAX_CONCURRENT_PAGES);

/**
 * Generate a PDF from either raw HTML or a URL.
 *
 * @param {{ html?: string, url?: string }} input
 * @returns {Promise<Buffer>} Raw PDF bytes
 */
async function generatePdf({ html, url }) {
  return queue.run(async () => {
    const browser = await browserManager.getBrowser();

    // Open a fresh page for each request — pages are cheap (~5 MB) compared
    // to the browser process itself (~120 MB). Reusing pages between requests
    // risks state leakage (cookies, localStorage, JS globals).
    const page = await browser.newPage();

    try {
      // Abort requests for resource types that don't affect PDF rendering.
      // This cuts network traffic and page load time for URL-based rendering.
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['media', 'font', 'websocket'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Emulate print media so @media print rules apply.
      await page.emulateMediaType('print');

      if (html) {
        // setContent is faster than navigating to a data: URL because it
        // bypasses the navigation stack entirely.
        await page.setContent(html, {
          waitUntil: 'networkidle0',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        });
      } else if (url) {
        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        });
      } else {
        throw new Error('Either "html" or "url" must be provided.');
      }

      // pdf() returns a Buffer of raw PDF bytes.
      const pdfBuffer = await Promise.race([
        page.pdf(PDF_OPTIONS),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('PDF render timed out')),
            PDF_RENDER_TIMEOUT_MS
          )
        ),
      ]);

      return pdfBuffer;
    } finally {
      // Always close the page to release its memory, even on error.
      await page.close().catch(() => {});
    }
  });
}

module.exports = { generatePdf };
