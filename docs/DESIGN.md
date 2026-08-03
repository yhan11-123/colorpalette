# Design system

Minimal — but that means **carried by precision in spacing, type, and alignment**, not by leaving things out.
There is nothing decorative to hide behind, so a misplaced 4px shows.

---

## Principles

### 1. The UI is achromatic

**Every chromatic pixel on screen should be user data.**

No accent color, no brand color, no status colors (blue links, green success, red error).
When the UI uses color on a screen built for looking at color, two things break at once: attention gets pulled away, and the surrounding color contaminates how the user's color is perceived.

Express state with **lightness, weight, border, and position** instead of hue.

### 2. Neutral grays only

Warm grays (stone, warm gray) make adjacent colors read cooler than they are, which muddies color judgment.
Use **grays with near-zero hue**.

### 3. Swatches have square corners

Rounded corners eat into the color area and let background bleed between adjacent colors, creating a bright seam along the boundary.
Colors need to meet flush for the eye to compare them.

**Any surface filled with color gets `radius: 0`.** Containers and controls get 2px.

### 4. No shadows

A shadow lays a dark layer over color. Separate layers with a 1px line instead.

---

## Tokens

```css
:root {
  /* achromatic — zero hue */
  --bg:            #ffffff;
  --surface:       #f5f5f5;
  --surface-sunk:  #ebebeb;
  --line:          #e0e0e0;
  --line-strong:   #c2c2c2;
  --text:          #171717;
  --text-muted:    #757575;

  /* neutral field for judging color accurately (large view on detail) */
  --neutral-field: #808080;

  /* type */
  --font-ui:   ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-num:  "JetBrains Mono", ui-monospace, monospace;

  /* spacing — multiples of 4 only */
  --s1: 4px;  --s2: 8px;  --s3: 12px; --s4: 16px;
  --s5: 24px; --s6: 32px; --s7: 48px; --s8: 64px;

  /* corners */
  --r-swatch: 0;
  --r-ui:     2px;

  /* palette card unit width */
  --unit:        96px;
  --card-height: 128px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:           #0d0d0d;
    --surface:      #1a1a1a;
    --surface-sunk: #242424;
    --line:         #2e2e2e;
    --line-strong:  #4a4a4a;
    --text:         #f0f0f0;
    --text-muted:   #8f8f8f;
  }
}
```

`--neutral-field` stays the same in dark mode. It's a reference surface for judging color, so it must not shift with the theme.

---

## Type

Two roles only.

| Role | Font | Used for |
|---|---|---|
| UI | system stack | Labels, buttons, guidance |
| Numeric | mono (tabular figures) | Hex, OKLCh values, proportion %, catalog numbers |

The mono is functional, not stylistic. Hex codes and values align vertically so digits can be compared, and it gives the precision tool the character of an instrument.
Always enable `font-variant-numeric: tabular-nums`.

```
size:    11 / 13 / 15 / 20    (four steps, no more)
weight:  400 / 500            (two steps, never 600+)
leading: body 1.6 / labels 1.2
```

Sentence case everywhere. No ALL CAPS, no Title Case.

---

## Component rules

### Palette card — the signature

```
width  = color count × var(--unit)
height = var(--card-height)   fixed
```

- The inside is divided **by proportion**, never equally.
- No gap or rule between color segments. They meet flush.
- No outer border on the card. The color is the edge.
- Left-aligned wrapping, `--s3` between cards. Leave the ragged right edge alone.
- Hover: the card does not lift or scale. **Cursor change and hex reveal only.**

Mobile: `--unit = (viewport - padding × 2) / 6`. A 6-color card fills the width and a 2-color card is a third of it. The ratios hold.

### Swatch bar (tray / detail)

Same rules as the card. The tray grows one unit to the right with each color added.

### Precision panel

- Numeric inputs are mono, right-aligned.
- Slider tracks carry **actual color gradients** (hue, chroma, lightness axes). This is data visualization rather than UI color, so it doesn't violate principle 1.
- Lightness spread / chroma spread / hue spread are always visible — never collapsed or hidden.

### Buttons

- Default: 1px `--line-strong` border, no fill, `--text` label.
- Primary (register, copy): `--text` fill, `--bg` label. **Emphasis comes from inversion, not from hue.**
- Disabled: `--text-muted` plus `--line`, not reduced opacity.

### Empty states and errors

An empty screen is an invitation to act. Not "no saved palettes" but **how to save one**.
Errors don't apologize. They say what happened and how to fix it.

Zero results from a color filter is not an error. **"This is the only palette with this color"** — present it as rarity.

---

## Quality floor

Never announced, always met.

- Responsive down to mobile
- Visible keyboard focus (2px `--text` outline, not a colored ring)
- `prefers-reduced-motion` respected
- UI text contrast at WCAG AA or better
- Color is never the only carrier of information — anything color-coded also gets a value or label

---

## Motion

Almost none. Two places only.

1. **A color entering the tray** — the card growing by one unit. 120ms.
2. **A color filter applying** — the gallery narrowing. A fade under 200ms.

No hover scaling on cards, no page transitions, no scroll-triggered reveals.
On a screen built for comparing colors, movement is interference.
