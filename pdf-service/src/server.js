'use strict';

const express = require('express');
const { generatePdf } = require('./pdfService');
const browserManager = require('./browser');

const PORT = parseInt(process.env.PORT || '3000', 10);

// Maximum accepted request body size. Large HTML documents can be several MB.
const BODY_SIZE_LIMIT = process.env.BODY_SIZE_LIMIT || '10mb';

// Simple URL validation — must start with http:// or https://
const URL_PATTERN = /^https?:\/\/.+/i;

// ─── App Setup ───────────────────────────────────────────────────────────────

const app = express();

// Parse JSON bodies; reject anything over BODY_SIZE_LIMIT to prevent DoS.
app.use(express.json({ limit: BODY_SIZE_LIMIT }));

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Lightweight liveness probe — does NOT touch Chromium so it responds even
 * if the browser is still starting up or is in a crash-recovery cycle.
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /generate-pdf
 *
 * Body (JSON):
 *   { "html": "<h1>Hello</h1>" }   — render raw HTML
 *   { "url":  "https://example.com" } — render a live URL
 *
 * Optional fields:
 *   { "filename": "report.pdf" }   — sets Content-Disposition filename
 *
 * Response: raw PDF bytes with appropriate headers.
 */
app.post('/generate-pdf', async (req, res) => {
  const { html, url, filename = 'generated.pdf' } = req.body ?? {};

  // ── Input validation ──────────────────────────────────────────────────────

  if (!html && !url) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Provide either "html" (string) or "url" (string) in the request body.',
    });
  }

  if (html && typeof html !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: '"html" must be a string.',
    });
  }

  if (url) {
    if (typeof url !== 'string' || !URL_PATTERN.test(url)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '"url" must be a valid http:// or https:// URL.',
      });
    }
  }

  if (typeof filename !== 'string' || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({
      error: 'Bad Request',
      message: '"filename" must be a plain filename without path separators.',
    });
  }

  // ── Generate PDF ──────────────────────────────────────────────────────────

  try {
    const pdfBuffer = await generatePdf({ html, url });

    // Sanitise the filename for the Content-Disposition header.
    const safeFilename = encodeURIComponent(filename.replace(/[^\w.\-]/g, '_'));

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeFilename}"`,
      'Content-Length': pdfBuffer.length,
      // Tell clients not to cache PDFs — content may differ per request.
      'Cache-Control': 'no-store',
    });

    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[server] PDF generation error:', err.message);

    // Distinguish timeout vs. other errors for actionable responses.
    const isTimeout = err.message.toLowerCase().includes('timeout');

    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Gateway Timeout' : 'Internal Server Error',
      message: err.message,
    });
  }
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'Route not found.' });
});

// ─── Global error handler ────────────────────────────────────────────────────

// Catches any error thrown synchronously inside a route that wasn't caught by
// try/catch (e.g. JSON parse errors from express.json middleware).
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err.message);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: `Request body exceeds the ${BODY_SIZE_LIMIT} limit.`,
    });
  }

  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ─── Start & Graceful Shutdown ────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[server] PDF microservice listening on port ${PORT}`);
  // Pre-warm the browser on startup so the first real request isn't slow.
  browserManager.getBrowser().catch((err) =>
    console.error('[server] Browser pre-warm failed:', err.message)
  );
});

/**
 * Graceful shutdown handler.
 * Stops accepting new HTTP connections, then closes Chromium cleanly.
 * Kubernetes / Docker stop send SIGTERM by default.
 */
async function shutdown(signal) {
  console.log(`[server] Received ${signal} — shutting down gracefully...`);

  server.close(async () => {
    await browserManager.shutdown();
    console.log('[server] Clean exit.');
    process.exit(0);
  });

  // Force-kill if graceful shutdown stalls after 10 s.
  setTimeout(() => {
    console.error('[server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Log unhandled promise rejections — do NOT crash the process; let the
// browser manager's disconnect handler recover instead.
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});
