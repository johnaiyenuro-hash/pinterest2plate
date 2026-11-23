# Pin2Plate (P2P)

Turn Pinterest recipe **videos and images** into clear **step-by-step cooking plans** and consolidated **UK supermarket shopping baskets** (Tesco, Sainsbury's, Asda, Aldi, Lidl).

## Key Features
- **Pinterest Board & Pin Importer:** Paste any public Pinterest board URL, single pin URL (`pinterest.com/pin/...` or `pin.it/...`), recipe blog URL, drag the 1-click **Send to Plate** bookmarklet, or connect your Pinterest account via **OAuth v5** (for private & 500+ pin boards).
- **Gemini Multimodal Extraction (`@google/genai`):**
  - **Tier 0 (`gemini-decision-1`):** Automatically filters out non-recipe food infographics (like storage charts) into a reviewable *Skipped Pins* drawer.
  - **Tier 1 (`schema.org/Recipe` + `gemini-3.5-flash-lite`):** Instant structured normalization for pins linking to recipe blogs.
  - **Tier 2 (`gemini-4-hydrogen`):** Reads recipe infographic images, handwritten lists, and multi-slide carousels.
  - **Tier 3 (`gemini-4-hydrogen` + Files API):** Watches cooking video pins (visuals, on-screen captions, and spoken audio) to output normalized UK ingredients and timestamped step-by-step plans.
- **Interactive Cooking Mode:** Serving scaler, checkable ingredients, 1-click live kitchen timers with audio chime, distraction-free full-screen Cook Mode (Wake Lock + arrow keys), and inline recipe editing.
- **Smart UK Supermarket Basket:** True unit-aware quantity summation (`125g + 60g → 185g`, `600g + 500g → 1.1kg`), aisle grouping, pantry staple memory, WhatsApp export, and direct search links across 5 UK supermarkets.

## Local Development

```bash
npm install
cp .env.example .env.local
# Add GEMINI_API_KEY in .env.local to enable video/image pin extraction
npm run dev
```

## Environment Variables

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | For extraction | Powers Gemini multimodal video & image recipe parsing |
| `DATABASE_URL` | Optional | Postgres URL (Supabase / Neon / Vercel Postgres); falls back to local JSON + browser cache |
| `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET` | Optional | Enables Pinterest OAuth v5 for private & large boards |
| `PINTEREST_REDIRECT_URI` | Optional | OAuth callback URL (`https://<domain>/api/pinterest/callback`) |
| `SESSION_SECRET` | Optional | Secret used to encrypt OAuth session cookies |
