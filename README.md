# Color Archive

Build color combinations, collect them, and **navigate by color**.

The core interaction is one sentence: **pick a color inside a palette, and every other palette containing that color appears.**
Every screen exists to support that one move.

---

## What this is not

- **Not a palette generator.** What gets made stays and accumulates.
- **Not a social feed.** No authors, profiles, follows, or popularity rankings.
- **Not an image gallery.** Uploaded photos are used to extract color, then discarded.
- **Not an archive you read.** No names, no descriptions. This is an archive you look at.

---

## Stack

Plain HTML, CSS, and JavaScript. **No build step, no framework, no compiler.**
The file you read is the file that runs.

| Area | Choice |
|---|---|
| Markup | Static `.html`, one file per screen |
| Styling | Plain `.css` with custom properties |
| Logic | Vanilla JS, ES modules (`<script type="module">`) |
| Color math | [culori](https://culorijs.org) via ESM CDN |
| DB / auth | [Supabase](https://supabase.com) JS client via ESM CDN |
| Dev server | VS Code **Live Server** extension |

No npm, no `package.json`. Libraries are imported straight from a CDN:

```js
import { oklab, formatHex } from 'https://esm.sh/culori@4';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

> **You must run through Live Server.** Opening `index.html` from the file system
> (`file://`) blocks ES module imports. Right-click `index.html` → **Open with Live Server**.

**Why multi-page instead of a single-page app:** an SPA builds its DOM in JavaScript, so there is no HTML to read. Separate `.html` files keep the structure visible and editable.

---

## Folder structure

```
color-archive/
├── index.html          make screen
├── archive.html        gallery
├── palette.html        palette detail  (palette.html?id=…)
├── shelf.html          personal shelf
├── css/
│   ├── tokens.css      design system variables
│   ├── base.css        reset, typography, layout
│   └── components.css  cards, buttons, tray, panels
├── js/
│   ├── color.js        OKLab math — conversion, distance, contrast, spread
│   ├── db.js           Supabase client and queries
│   ├── card.js         palette card rendering
│   ├── make.js         make screen
│   ├── archive.js      gallery
│   ├── palette.js      detail page
│   └── shelf.js        personal shelf
├── docs/
│   ├── SPEC.md         screens, color rules, data model, discarded decisions
│   └── DESIGN.md       tokens and component rules
├── BUILD.md            step-by-step work order  ← start here
└── CONTEXT.md          paste this into Claude chat at the start of a session
```

---

## Where to start

Open `BUILD.md`. It walks through eight steps, each one small enough to finish in a sitting and each one leaving something you can look at in the browser.

---

## Rules while working

1. **All color math in OKLab/OKLCh.** Hex is for display and copying, never the source of truth.
2. **Never distort proportion data for rendering.** Enforce floors when creating, not when drawing.
3. **No hue in the UI.** Every chromatic pixel on screen should be user data.
4. **No login wall in front of making.** Building and registering work anonymously.
5. **Check "Discarded decisions" in `docs/SPEC.md` before adding a feature.** Those were considered and rejected already.
