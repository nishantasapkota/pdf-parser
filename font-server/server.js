'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = parseInt(process.env.FONT_PORT || '3001', 10);
const FONTS_DIR = path.join(__dirname, 'fonts');

const MIME = {
  '.ttf':   'font/truetype',
  '.otf':   'font/opentype',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  // Only serve GET requests
  if (req.method !== 'GET') {
    res.writeHead(405); res.end('Method Not Allowed'); return;
  }

  // Strip query string, decode URI, prevent path traversal
  const reqPath  = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(FONTS_DIR, path.basename(reqPath));

  // Must stay inside FONTS_DIR
  if (!filePath.startsWith(FONTS_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext      = path.extname(filePath).toLowerCase();
  const mimeType = MIME[ext];

  if (!mimeType) {
    res.writeHead(415); res.end('Unsupported font type'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Font not found'); return;
    }

    res.writeHead(200, {
      'Content-Type':                mimeType,
      'Content-Length':              data.length,
      'Access-Control-Allow-Origin': '*',   // allow Chromium (pdf-service) to fetch
      'Cache-Control':               'public, max-age=86400',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[font-server] Serving fonts at http://localhost:${PORT}/`);
  fs.readdirSync(FONTS_DIR).forEach(f => console.log(`  → http://localhost:${PORT}/${f}`));
});
