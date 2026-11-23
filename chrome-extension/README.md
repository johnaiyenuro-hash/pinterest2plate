# Pin2Plate Companion Chrome Extension

This Manifest V3 Chrome Extension gives Pin2Plate two superpowers that browser bookmarklets and third-party websites can't do on their own:

1. **Auto-Scroll 600+ Pin Pinterest Boards (No CSP Blocking):** Automatically scrolls down your logged-in Pinterest board, harvests a diverse shuffled sample across all loaded pins, and sends them straight to `pinterest-to-plate.vercel.app` for Gemini extraction.
2. **1-Click UK Supermarket Trolley Auto-Fill:** Syncs your consolidated Pin2Plate weekly basket and steps through every ingredient inside **Tesco, Sainsbury's, Ocado, or Asda**, highlighting each match and clicking **Add** automatically (with Pause, Skip, and Stop controls).

## Install in Chrome / Edge / Brave (30 seconds)

1. Open `chrome://extensions` in your browser.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select this `chrome-extension` folder (`C:\Users\johna\.gemini\antigravity\scratch\pinterest2plate\chrome-extension`).
4. Pin **Pin2Plate Companion** to your toolbar.

## How to Use

### Grab Diverse Pins from a 600+ Pin Board
1. Open your Pinterest board (e.g., `https://uk.pinterest.com/shalom_x/food/`).
2. Click the **Pin2Plate Companion** icon in Chrome.
3. Choose **Scroll depth** (e.g., *Deep* or *Full Board*) and **Send diverse mix** (`6`, `12`, `20`, or `30` pins).
4. Click **Auto-Scroll & Grab Pins** — it scrolls, collects a diverse random mix, opens Pin2Plate, and starts extracting automatically.

### Auto-Fill Your Supermarket Trolley
1. Select your weekly meals on `https://pinterest-to-plate.vercel.app/` (the extension stays synced automatically).
2. Click **Shop All → Auto-Fill Trolley** (or click the extension icon → **Fill Tesco / Sainsbury's / Ocado / Asda Trolley**).
3. Make sure you're signed into your supermarket account; the floating **Trolley Assistant** will add items one by one in a single tab.
