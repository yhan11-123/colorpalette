# CONTEXT.md

Paste this at the start of a Claude chat session, then say which step you're on.
It's short on purpose — the point is to fit at the top of a conversation without crowding out the actual work.

---

I'm building a website called **Color Archive**. Here's the context.

**What it is.** A place to build color palettes, collect them, and navigate them by color. The core interaction: pick a color inside a palette, and every other palette containing that color appears. A palette is 2–6 colors with proportions — no names, no descriptions, no public authors, no likes.

**Stack.** Plain HTML, CSS, and vanilla JS ES modules. **No framework, no build step, no npm.** culori and the Supabase JS client are imported from an ESM CDN. I run it with VS Code Live Server. I read and edit the code myself, so don't introduce tooling that hides the HTML, CSS, or JS.

**Structure.** `index.html` (make), `archive.html` (gallery), `palette.html?id=` (detail), `shelf.html` (personal). CSS in `css/tokens.css`, `base.css`, `components.css`. JS in `js/` — `color.js`, `db.js`, `card.js`, plus one file per page.

**Rules that don't bend:**

1. All color math in OKLab/OKLCh. Hex is for display and copying only, never the source of truth.
2. Palette cards are `color count × unit` wide, with a fixed height, divided by proportion. Never distort a proportion to make a segment easier to see — proportion floors are enforced when creating, not when drawing.
3. No hue anywhere in the UI. No accent colors, no status colors. Emphasis comes from inversion; state from lightness, weight, and border. Every chromatic pixel on screen should be user data.
4. Swatches have square corners and meet flush — no gaps, no shadows, no rounded corners on color surfaces.
5. Rows of cards wrap left-aligned with a ragged right edge. Never justify rows to fill the width; that would break the rule that width means color count.
6. No login wall in front of making. Building and registering work anonymously.

**Already considered and rejected** — please don't propose these: a spatial "sky" view plotting palettes on color coordinates, lines connecting related palettes, required palette names, storing uploaded images, an AI button that auto-completes a palette, locked harmony rules, public like counts.

**How I want to work.** One file at a time. Explain the approach before writing it — I'm reading this code, not just running it. If something I ask for contradicts the rules above, say so instead of quietly picking a side.
