# PDF Generation Service — Developer Guide

A lightweight, production-ready PDF generation microservice powered by Puppeteer and headless Chromium. Designed for easy integration into any backend application.

---

## Table of Contents

- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Integration Examples](#integration-examples)
  - [Node.js](#nodejs)
  - [Python](#python)
  - [cURL](#curl)
- [Font Support](#font-support)
  - [Google Fonts](#google-fonts)
  - [Custom/Local Fonts](#customlocal-fonts)
- [Docker Deployment](#docker-deployment)
- [Configuration](#configuration)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Start the PDF Service

```bash
cd pdf-service
npm install
CHROMIUM_PATH=/usr/bin/google-chrome node src/server.js
```

### 2. Generate a PDF

```bash
curl -X POST http://localhost:3000/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"html": "<h1>Hello World</h1>", "filename": "hello.pdf"}' \
  -o output.pdf
```

The service is now ready to accept requests from your application.

---

## API Reference

### Endpoint

```
POST /generate-pdf
```

### Request Headers

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `html` | string | Yes* | Complete HTML document to render |
| `url` | string | Yes* | Public URL to render |
| `filename` | string | No | Output filename (default: `generated.pdf`) |

*Provide either `html` OR `url`, not both.

### Response

| Status | Body |
|--------|------|
| 200 | Raw PDF bytes |
| 400 | JSON error (invalid request) |
| 500 | JSON error (generation failed) |
| 504 | JSON error (timeout) |

### Response Headers

```
Content-Type: application/pdf
Content-Disposition: inline; filename="your-file.pdf"
Content-Length: <bytes>
Cache-Control: no-store
```

---

## Integration Examples

### Node.js

```javascript
const axios = require('axios');

async function generatePDF(html, filename = 'document.pdf') {
  const response = await axios.post(
    'http://localhost:3000/generate-pdf',
    { html, filename },
    { responseType: 'arraybuffer' }
  );
  
  // response.data contains the PDF Buffer
  return response.data;
}

// Usage with dynamic data
const invoiceHTML = `
<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; padding: 40px;">
    <h1>Invoice #${invoiceId}</h1>
    <p>Amount: $${amount}</p>
    <table>
      ${items.map(item => `
        <tr>
          <td>${item.name}</td>
          <td>$${item.price}</td>
        </tr>
      `).join('')}
    </table>
  </body>
</html>
`;

const pdfBuffer = await generatePDF(invoiceHTML, `invoice-${invoiceId}.pdf`);
```

### Python

```python
import requests

def generate_pdf(html: str, filename: str = "document.pdf") -> bytes:
    response = requests.post(
        "http://localhost:3000/generate-pdf",
        json={"html": html, "filename": filename}
    )
    response.raise_for_status()
    return response.content

# Usage
pdf_bytes = generate_pdf("<h1>Hello from Python!</h1>", "hello.pdf")
with open("output.pdf", "wb") as f:
    f.write(pdf_bytes)
```

### PHP

```php
<?php
function generatePDF($html, $filename = 'document.pdf') {
    $ch = curl_init('http://localhost:3000/generate-pdf');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'html' => $html,
        'filename' => $filename
    ]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    
    $pdf = curl_exec($ch);
    curl_close($ch);
    
    return $pdf;
}

$pdf = generatePDF('<h1>Hello from PHP!</h1>', 'hello.pdf');
file_put_contents('output.pdf', $pdf);
?>
```

### cURL

```bash
# From HTML string
curl -X POST http://localhost:3000/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"html": "<h1>Hello World</h1><p>Generated via cURL.</p>"}' \
  -o output.pdf

# From URL
curl -X POST http://localhost:3000/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "filename": "example.pdf"}' \
  -o output.pdf
```

### Go

```go
package main

import (
    "bytes"
    "fmt"
    "io"
    "net/http"
    "os"
)

func generatePDF(html, filename string) ([]byte, error) {
    payload := map[string]string{
        "html":     html,
        "filename": filename,
    }
    
    body, _ := json.Marshal(payload)
    
    resp, err := http.Post(
        "http://localhost:3000/generate-pdf",
        "application/json",
        bytes.NewBuffer(body),
    )
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("PDF generation failed: %s", resp.Status)
    }
    
    return io.ReadAll(resp.Body)
}

func main() {
    pdf, _ := generatePDF("<h1>Hello from Go!</h1>", "hello.pdf")
    os.WriteFile("output.pdf", pdf, 0644)
}
```

---

## Font Support

### Google Fonts

Add the Google Fonts link in your HTML `<head>`:

```html
<head>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Poppins', sans-serif; }
  </style>
</head>
```

Chromium fetches the font at render time. Works for all Latin-script fonts.

### Custom/Local Fonts

For fonts not on Google Fonts (like Nepali/Devanagari fonts), host them on a static server:

#### 1. Start a font server (optional, or use your existing static server)

```bash
# Copy .ttf files to a fonts directory
mkdir fonts && cp /path/to/Kalimati-Regular.ttf fonts/
```

Create `font-server.js`:
```javascript
const http = require('http');
const fs   = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'fonts', path.basename(req.url));
  const ext = path.extname(filePath);
  
  res.writeHead(200, {
    'Content-Type': 'font/truetype',
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(3001, () => console.log('Font server on :3001'));
```

#### 2. Reference in HTML

```html
<head>
  <style>
    @font-face {
      font-family: 'Kalimati';
      src: url('http://localhost:3001/Kalimati-Regular.ttf') format('truetype');
    }
    body { font-family: 'Kalimati', serif; }
  </style>
</head>
```

---

## Docker Deployment

### Build & Run

```bash
# Build
docker build -t pdf-service .

# Run
docker run -p 3000:3000 pdf-service
```

### With Custom Fonts

Mount a volume containing your font files:

```bash
docker run -p 3000:3000 \
  -v /path/to/fonts:/app/fonts \
  -e FONT_SERVER_URL=http://localhost:3001 \
  pdf-service
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Service port |
| `CHROMIUM_PATH` | auto-detected | Path to Chromium binary |
| `MAX_CONCURRENT_PAGES` | 5 | Max simultaneous PDF generations |
| `PAGE_LOAD_TIMEOUT_MS` | 30000 | URL load timeout (ms) |
| `PDF_RENDER_TIMEOUT_MS` | 20000 | PDF render timeout (ms) |
| `BODY_SIZE_LIMIT` | 10mb | Max request body size |

---

## Configuration

### PDF Options

The service uses these defaults (hardcoded in `src/pdfService.js`):

```javascript
{
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margin: {
    top: '10mm',
    right: '10mm',
    bottom: '10mm',
    left: '10mm'
  }
}
```

To customize, modify `PDF_OPTIONS` in `src/pdfService.js` or add environment variables.

### Chromium Launch Flags

Optimized for containerized environments in `src/browser.js`:

```javascript
[
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--hide-scrollbars',
  '--metrics-recording-only',
  '--mute-audio',
  '--safebrowsing-disable-auto-update',
  '--disable-infobars'
]
```

---

## Error Handling

### Client-Side

Always handle errors gracefully:

```javascript
try {
  const response = await axios.post(
    'http://localhost:3000/generate-pdf',
    { html },
    { responseType: 'arraybuffer' }
  );
  // Success - response.data is PDF buffer
} catch (err) {
  if (err.response) {
    // Server returned error
    const errorData = JSON.parse(err.response.data.toString());
    console.error('PDF Error:', errorData.message);
  } else {
    // Network/connection error
    console.error('Connection Error:', err.message);
  }
}
```

### Error Responses

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Bad Request | Missing html/url, invalid URL format |
| 413 | Payload Too Large | Body exceeds BODY_SIZE_LIMIT |
| 500 | Internal Server Error | Chromium crash, render error |
| 504 | Gateway Timeout | Page load or render timeout |

---

## Troubleshooting

### PDF is blank or incomplete

- Ensure HTML is complete with `<html>`, `<head>`, `<body>` tags
- Check that external resources (images, fonts) are accessible
- Increase `PAGE_LOAD_TIMEOUT_MS`

### Font not rendering in PDF

- For Google Fonts: ensure internet access in container
- For local fonts: verify font URL is accessible from Chromium
- Check browser console (enable debugging in `browser.js`)

### Memory issues under high load

- Reduce `MAX_CONCURRENT_PAGES` (default: 5)
- Increase container memory
- Monitor with: `docker stats`

### Chromium fails to launch

- Verify `CHROMIUM_PATH` is correct
- Check required dependencies in Dockerfile are installed
- Ensure running as root or with `--no-sandbox` (required in containers)

### Request timeouts

- Increase `PAGE_LOAD_TIMEOUT_MS` for slow pages
- Increase `PDF_RENDER_TIMEOUT_MS` for complex layouts

---

## Health Check

```bash
curl http://localhost:3000/health

# Response
{"status":"ok","timestamp":"2026-02-25T10:00:00.000Z"}
```

Use this for container orchestration health probes (Kubernetes liveness/readiness).

---

## Performance Tips

1. **Reuse browser instance** — Already handled (singleton pattern)
2. **Limit concurrency** — Set `MAX_CONCURRENT_PAGES` based on available memory
3. **Optimize HTML** — Minify before sending, remove unused CSS/JS
4. **Cache fonts** — Host fonts locally, enable `Cache-Control`
5. **Timeout tuning** — Lower timeouts to fail fast on stuck pages

---

## License

MIT
