# Stock Drawdown Monitor — Cloudflare Pages

## $0. No separate Workers dashboard. No API keys. Just git push.

```
stock-alert-cf/
├── src/                    ← React app (Vite)
├── functions/
│   └── api/
│       └── quote.js        ← CORS proxy (auto-deployed with site)
├── index.html
├── vite.config.js
└── package.json
```

---

## Deploy in 3 steps

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "init"
gh repo create stock-alert --public --push
```

### 2. Connect to Cloudflare Pages
1. Go to https://dash.cloudflare.com → **Workers & Pages → Create → Pages**
2. Click **Connect to Git** → select your repo
3. Set build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Click **Save and Deploy**

### 3. Done!
Your app is live at `https://stock-alert.pages.dev` (or a custom domain).

Every `git push` to `main` auto-deploys. No extra config ever needed.

---

## Local dev
```bash
npm install
npm run dev    # Vite dev server at http://localhost:5173
```

For testing the function locally, install Wrangler:
```bash
npm install -D wrangler
npx wrangler pages dev dist --compatibility-date=2024-01-01
```

---

## Free tier limits (Cloudflare Pages)
| Resource          | Limit                  |
|-------------------|------------------------|
| Bandwidth         | **Unlimited**          |
| Requests          | Unlimited              |
| Functions calls   | 100,000 / day          |
| Build minutes     | 500 / month            |

For personal use checking stocks a few times a day, you'll use less than 1% of limits.

## Cost: $0/month. Forever.
