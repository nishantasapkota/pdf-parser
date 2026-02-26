# Railway Deployment Guide

## Quick Deploy

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login:**
   ```bash
   railway login
   ```

3. **Link/Create Project:**
   ```bash
   railway init
   # Select "Create New Project" → give it a name (e.g., "pdf-service")
   ```

4. **Deploy:**
   ```bash
   cd pdf-service
   railway up
   ```

5. **Set Environment Variables:**
   ```bash
   railway variables set CHROMIUM_PATH=/usr/bin/chromium
   ```

6. **Get Your URL:**
   ```bash
   railway domain
   ```

---

## Alternative: Deploy via GitHub

1. Push your code to a GitHub repository
2. Go to [railway.app](https://railway.app)
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select your repository
5. Add environment variable: `CHROMIUM_PATH` = `/usr/bin/chromium`
6. Click **Deploy**

---

## Environment Variables

| Variable | Value | Required |
|----------|-------|----------|
| `CHROMIUM_PATH` | `/usr/bin/chromium` | Yes |
| `PORT` | `3000` | No (default) |
| `MAX_CONCURRENT_PAGES` | `5` | No |

---

## Pricing

| Plan | Price | Limits |
|------|-------|--------|
| **Starter (Free)** | $0 | 500 hours/month, 3 projects |

The free tier is sufficient for personal use and moderate traffic.

---

## Testing

Once deployed, test with:

```bash
curl -X POST https://your-project-name.up.railway.app/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"html": "<h1>Hello from Railway!</h1>"}' \
  -o output.pdf
```

Replace `your-project-name` with your actual Railway project name.
