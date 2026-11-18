# Pinterest to Plate (P2P)

> **Stop collecting. Start cooking.**  
> An app designed to turn saved Pinterest recipe pins into actionable meal plans and 1-click shoppable supermarket baskets across the UK's leading grocers (**Tesco, Sainsbury's, Asda, Aldi, and Lidl**).

## Features Built in Prototype

1. **Board Sync & Ingestion:** Pre-connected to `@shalom_x/food` (with 650+ pins) and pre-loaded with decoded visual recipes (Honey Chipotle Sliders, Fondant Leeks, Cabbage Egg Stir-Fry, Korean Spinach, McDonald's Nuggets, Nigerian Jollof).
2. **Anti-Fatigue Decision Engine:**
   - Tap **"Pick 3 for Me"** to instantly generate a balanced weekly dinner rotation.
   - Interactive selection cards with prep times, tags, and step-by-step instructions.
3. **Smart Aisle Deduplication:**
   - Consolidates ingredients across all chosen recipes (e.g., combines garlic across 3 dishes into one purchase).
   - Groups items cleanly by UK supermarket aisle (Fresh Produce 🥬, Meat & Poultry 🍗, Dairy & Chilled 🧀, Bakery 🥖, Food Cupboard 🥫).
4. **Interactive Pantry Memory:**
   - Detects kitchen staples (flour, salt, oil, soy sauce).
   - Tap to check off items you already own in your fridge/cupboard.
   - Remembers your pantry in browser `localStorage`.
   - **"Hide Pantry Staples"** toggle to only view what you actually need to buy.
5. **UK Supermarket Deep-Linking (Tesco, Sainsbury's, Asda, Aldi, Lidl):**
   - Seamlessly switch between stores.
   - Direct 1-click **"Find in [Store]"** button beside every single ingredient.
   - **"Open All Needed Items"** button to bulk-search missing items in your chosen supermarket.
   - **"Copy for WhatsApp"** button for texting a formatted grocery checklist with emojis and quantities.

## How to Run

1. Open a terminal in this directory:
   ```bash
   node server.js
   ```
   Or double-click `start.bat`.
2. Open your browser at:
   ```
   http://localhost:3000
   ```
