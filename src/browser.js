'use strict';

const puppeteer = require('puppeteer-core');

/**
 * BrowserManager — singleton that owns exactly one Chromium process.
 *
 * Design decisions:
 *  - One browser, many pages: avoids the heavy cost of spawning a new
 *    Chromium process per request (~150 MB RSS each).
 *  - Lazy launch: the browser is started on the first real request, not at
 *    module load time, so the HTTP server is ready to accept /health probes
 *    immediately even if Chromium is slow to start.
 *  - Crash recovery: the 'disconnected' event triggers an automatic relaunch
 *    after a short back-off delay so the service self-heals without a pod
 *    restart.
 *  - Launch lock: a pending-launch promise is stored so that concurrent
 *    requests that arrive while Chromium is still starting up all await the
 *    same promise rather than each spawning a new browser.
 */

// Chromium flags that dramatically reduce memory and CPU in a container.
const CHROMIUM_ARGS = [
  '--no-sandbox',               // required when running as root in Docker
  '--disable-setuid-sandbox',   // belt-and-suspenders sandbox removal
  '--disable-dev-shm-usage',    // use /tmp instead of /dev/shm (avoids OOM in small containers)
  '--disable-gpu',              // no GPU in a headless container
  '--no-first-run',             // skip first-run tasks
  '--no-zygote',                // disable the zygote process (saves ~30 MB)
  '--single-process',           // run renderer in-process (saves another ~40 MB; acceptable for trusted content)
  '--disable-extensions',       // no extension loading
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--hide-scrollbars',
  '--metrics-recording-only',
  '--mute-audio',
  '--safebrowsing-disable-auto-update',
  '--disable-infobars',
  '--disable-features=site-per-process,TranslateUI',
];

const RELAUNCH_DELAY_MS = 2_000;
const LAUNCH_TIMEOUT_MS = 30_000;

class BrowserManager {
  constructor() {
    /** @type {import('puppeteer-core').Browser | null} */
    this._browser = null;

    /** @type {Promise<import('puppeteer-core').Browser> | null} */
    this._launchPromise = null;

    this._shuttingDown = false;
  }

  /**
   * Returns the live browser instance, launching it if necessary.
   * Concurrent callers share a single launch attempt.
   *
   * @returns {Promise<import('puppeteer-core').Browser>}
   */
  async getBrowser() {
    if (this._browser && this._browser.isConnected()) {
      return this._browser;
    }

    // If a launch is already in flight, wait for it.
    if (this._launchPromise) {
      return this._launchPromise;
    }

    this._launchPromise = this._launch();

    try {
      this._browser = await this._launchPromise;
      return this._browser;
    } finally {
      this._launchPromise = null;
    }
  }

  /**
   * Internal: starts Chromium and wires up crash-recovery.
   *
   * @returns {Promise<import('puppeteer-core').Browser>}
   */
  async _launch() {
    const executablePath = this._resolveChromiumPath();

    console.log(`[browser] Launching Chromium at: ${executablePath}`);

    const browser = await puppeteer.launch({
      executablePath,
      headless: 'new',       // new headless mode (smaller binary footprint)
      args: CHROMIUM_ARGS,
      timeout: LAUNCH_TIMEOUT_MS,
      // Pipe instead of WebSocket: avoids a separate DevTools HTTP server process.
      pipe: true,
    });

    console.log('[browser] Chromium launched successfully');

    // Self-heal: relaunch after crash/disconnect (unless we are shutting down).
    browser.on('disconnected', () => {
      if (this._shuttingDown) return;
      console.warn('[browser] Chromium disconnected — scheduling relaunch...');
      this._browser = null;
      setTimeout(() => {
        if (!this._shuttingDown) {
          this.getBrowser().catch((err) =>
            console.error('[browser] Relaunch failed:', err.message)
          );
        }
      }, RELAUNCH_DELAY_MS);
    });

    return browser;
  }

  /**
   * Resolve Chromium executable path.
   *
   * Priority:
   *   1. CHROMIUM_PATH env var  — set this in Docker via the Dockerfile
   *   2. Common Docker/Linux locations
   *   3. Fallback: let puppeteer-core throw a helpful error
   */
  _resolveChromiumPath() {
    if (process.env.CHROMIUM_PATH) {
      return process.env.CHROMIUM_PATH;
    }

    const candidates = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ];

    const fs = require('fs');
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }

    throw new Error(
      'Chromium executable not found. Set the CHROMIUM_PATH environment variable.'
    );
  }

  /**
   * Gracefully close the browser on process exit.
   */
  async shutdown() {
    this._shuttingDown = true;
    if (this._browser) {
      console.log('[browser] Closing Chromium...');
      await this._browser.close().catch(() => {});
      this._browser = null;
    }
  }
}

// Export a module-level singleton — Node's module cache ensures only one
// instance exists for the lifetime of the process.
module.exports = new BrowserManager();
