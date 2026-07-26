# Build guide

Eight steps. Each one is small enough to finish in a sitting, and each one leaves something you can open in the browser and look at.

Do them in order. Don't skip ahead — step 3 depends on step 2 being correct, and a wrong color conversion is invisible until everything is built on top of it.

For each step: **Goal → Files → What it does → How to check it worked.**

---

## Step 0 — Get something on screen

**Goal:** Live Server running, ES modules loading, no build tools involved.

**Files**

```
index.html
css/tokens.css
css/base.css
js/app.js
```

`index.html` links both stylesheets and loads `js/app.js` as a module:

```html
<script type="module" src="js/app.js"></script>
```

Put one `console.log` in `app.js`.

**Check:** Right-click `index.html` → Open with Live Server. Page loads, console shows the log, no CORS error.
If you see *"Cross origin requests are only supported for HTTP"*, you opened the file directly instead of through Live Server.

---

## Step 1 — The design system, by hand

**Goal:** See the signature component before writing any logic.

**Files:** `css/tokens.css`, `css/components.css`, `index.html`

Copy every custom property from `docs/DESIGN.md` into `tokens.css`. All of them, including dark mode.

Then hand-write three or four palette cards in `index.html` with hardcoded colors. **No JavaScript.** This is the most important markup in the project, so get its shape right while it's still simple:

```html
<a class="card" href="#" style="--n:4">
  <span class="swatch" style="--p:.45; background:#7A4A3C"></span>
  <span class="swatch" style="--p:.25; background:#C98A5E"></span>
  <span class="swatch" style="--p:.20; background:#E8D6B8"></span>
  <span class="swatch" style="--p:.10; background:#3E5A52"></span>
</a>
```

```css
.card {
  display: flex;
  width: calc(var(--n) * var(--unit));
  height: var(--card-height);
  border-radius: var(--r-swatch);
  overflow: hidden;
}
.swatch { flex: var(--p) 0 0; }

.wall {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s3);
  align-content: flex-start;
}
```

`flex: var(--p) 0 0` means grow by the proportion, don't shrink, start from zero width. Because the card has a fixed width and the proportions sum to 1, each swatch lands at exactly its share. No calc, no percentages.

**Check:** Cards with different color counts are different widths. A 6-color card is three times a 2-color card. Rows wrap left-aligned with a ragged right edge — leave it ragged, that's the design.

---

## Step 2 — Color math

**Goal:** `js/color.js`, correct and verified. Nothing depends on this being pretty; everything depends on it being right.

**File:** `js/color.js`

Functions to write:

| Function | Returns |
|---|---|
| `hexToOklab(hex)` | `{ l, a, b }` |
| `oklabToHex({l,a,b})` | `"#rrggbb"` |
| `oklabToOklch` / `oklchToOklab` | polar ↔ cartesian |
| `distance(c1, c2)` | Euclidean in OKLab |
| `spread(colors)` | `{ lightness, chroma, hue }` ranges |
| `contrastRatio(hex1, hex2)` | WCAG 2 number |
| `isOutOfGamut(oklch)` | boolean, sRGB |

Formulas and reasoning are in `docs/SPEC.md` §3.

**Check:** Make a scratch page `test.html` that runs a round trip over a few hundred colors:

```js
// hex → OKLab → hex must come back identical
```

If any color fails to round-trip, stop and fix it. Everything from here sits on this file.

---

## Step 3 — Render cards from data

**Goal:** Replace the hand-written HTML from step 1 with generated cards.

**File:** `js/card.js`

One function: takes a palette object, returns a card element.

```js
{ id, colors: [{ oklab, proportion }, …] }
```

Keep a hardcoded array of eight or so palettes in `js/archive.js` for now. No database yet.

**Check:** The wall looks exactly like step 1 did. If it changed, the renderer is wrong — the hand-written version is the reference.

---

## Step 4 — Real data

**Goal:** Palettes persist.

**Files:** `js/db.js`, `archive.html`

1. Create a Supabase project. Run the SQL from `docs/SPEC.md` §4 in the SQL editor.
2. In `db.js`, create the client and call `signInAnonymously()` on load. Never put the service key in the browser — only the anon/publishable key.
3. Write `listPalettes()` and `createPalette(colors)`.
4. Point `archive.html` at `listPalettes()`.

**Check:** Insert two palettes by hand in the Supabase table editor. They appear on the wall, newest first.

---

## Step 5 — The make screen

**Goal:** Build a palette and register it.

**Files:** `index.html`, `js/make.js`

Read `docs/SPEC.md` §2.1 before starting.

- The **tray** is the palette being built. It uses the same card markup and the same `--unit`, so it grows one unit to the right per color.
- The **precision panel** opens when one color is selected. Edit in OKLCh only. Numbers are output by default and input by option.
- Show lightness / chroma / hue spread at all times.
- Register is disabled below 2 colors. Add is disabled at 6.
- Proportion floor is 5%.

Don't pre-draw empty slots — six visible boxes make everything converge on six colors.

**Check:** Make a palette, register it, find it at the top of the gallery. Reload — still there.

---

## Step 6 — Color filtering

**Goal:** The one thing that makes this site different. Give it the most care.

**Files:** `js/db.js`, `palette.html`, `js/palette.js`

On the detail page, clicking a color runs the query in `docs/SPEC.md` §5: bounding-box prefilter in SQL, exact distance in JS, group by palette, cap at 60.

Add the similarity slider (exact / default / nearby). Show the total count — *"12 palettes contain this color"*.

Zero matches is not an error. Say **"this is the only palette with this color."**

**Check:** Register two palettes that share a near-identical color. Click that color on one and the other appears. Tighten the slider until it drops out.

---

## Step 7 — Image mode

**Goal:** The lowest-friction way in.

**File:** `js/extract.js`

- `<input type="file" accept="image/*" capture="environment">` — opens the camera on phones, the file picker on desktop.
- Draw to a `<canvas>`, read pixels with `getImageData`.
- Eyedropper samples a **5×5 average**, not one pixel. JPEG noise makes neighbors differ.
- Auto-extraction marks 6–8 candidate points on the image. It never fills the palette for you.
- Select candidates for **spread, not frequency** — see `docs/SPEC.md` §3.3.
- **Never upload or store the image.** Everything happens in the browser.

**Check:** Drop in a forest photo. The candidates are not five greens.

---

## Step 8 — Saving and the shelf

**Goal:** A personal place.

**Files:** `shelf.html`, `js/shelf.js`, `js/db.js`

The shelf is the gallery with a filter. Same card, same unit, same color filter. Two tabs: made / saved.

Saving is private — no public counts.

**Check:** Save a palette, reload, it's still on the shelf. The color filter works inside the shelf too.

---

## After that

Mixing mode (OKLCh interpolation), pulling a color from the archive, real account upgrade, copy counts.
Nothing here is urgent. Steps 0–8 are the whole product.

---

## Working with Claude chat

Chat can't see your files. That changes how to ask.

**Start a session** by pasting `CONTEXT.md`, then say which step you're on.

**Paste the file you're working on**, not the whole project. One file, plus the specific problem.

**Ask for explanation, not just output.** You're reading this code, so:

> Explain how this flex-basis approach distributes the proportions before you write it.

**When something looks wrong**, paste the CSS or JS plus a description of what you see versus what you expected. Chat can't open your browser.

**Ask for one file at a time.** A response with six files in it is impossible to verify, and verifying is the point of working this way.
