# Product spec

---

## 1. What a palette is

On this site, a palette is **2 to 6 colors and the proportion of each**. That's the whole thing.

No name. No description. No public author. No tags.

What does get attached automatically at creation:

- A catalog number (for display, URLs, and references)
- Registration timestamp
- Which mode each color came in through (`picker` / `mix` / `image` / `archive`)

Why no names: the search index for this archive is **color itself**. You find by color and you move by color.
Adding a text index just creates a second, less accurate axis — and it makes people do a creative act one extra time on every submission.

---

## 2. Screens

### 2.1 Make — `index.html`

This is the landing screen. A visitor starts here with zero friction.

**Structure: tray plus modes**

The tray is the palette being built. Colors go in one at a time.
A mode is **a way of putting one color into the tray**. Switching modes leaves the tray intact.

> Important: a mode is not "a way to make a palette," it's "a way to get one color."
> That's why a single palette can mix a hand-specified color with one pulled from a photo, and why adding a new mode later costs almost nothing.

**Modes**

| Mode | What it does | Priority |
|---|---|---|
| `picker` precision | Specify a color numerically. The default surface of this screen | v1 |
| `image` image | Eyedropper on an uploaded photo, plus suggested candidates | v1 |
| `mix` mixing | Interpolate two colors by ratio in OKLCh | later |
| `archive` pull | Inherit one color from the saved list or the archive | later |

Modes are not equal-weight tabs. The precision surface is the base; the others are called up briefly to fill a slot.

**Rules**

- Don't pre-draw empty slots. Six visible boxes read as homework, and everything converges on six colors.
- Color count is not a setting — it's **when you stop**. Below 2, register is disabled. At 6, adding is disabled.
- Proportions default to equal and are user-adjustable. **Floor of 5%.**
- The tray uses the **same unit width** as gallery cards. It grows one unit to the right per color, and that exact shape is what hangs in the gallery. No separate preview needed.

**Precision panel (when one color is selected)**

- The editing model is **OKLCh only**. HSL/HSV/RGB are supported for input parsing and output notation, nothing more.
  (Lightness in HSL and lightness in OKLCh are different quantities. If different colors are tuned in different models, "these two have the same lightness" stops meaning anything.)
- Numbers are **output by default, input by option**. Drag and the numbers follow; type into the field if you want to.
  Don't bury them behind an "advanced" toggle — beginners never find it and experts have to open it every time.
- Always visible: **lightness spread / chroma spread / hue spread**.
  Most of what makes a palette good or bad is explained by these three numbers, and no tool shows them.
  A narrow lightness spread makes colors mush together no matter how different their hues are.
- Contrast check (WCAG 2 AA), color-blindness simulation, out-of-sRGB-gamut warning.

**Image mode rules**

- Auto-extraction is **a hint layer, not a button**. Mark 6–8 candidate points on the image; the user taps the ones they want. The algorithm never completes a palette.
- The eyedropper samples a **5×5 average**, not a single pixel. JPEG noise makes neighboring pixels differ noticeably. Attach a magnifier loupe to the cursor.
- On mobile, `<input type="file" accept="image/*" capture="environment">` opens the camera directly. Don't build a separate camera mode.
- **Images are never stored.** Extract color client-side and discard.

### 2.2 Gallery — `archive.html`

**A wall of variable-width cards.** This is the signature of the site.

- Card width = `color count × unit`. Height is fixed.
- The inside of the card is divided by proportion.
- Sort: **newest first** (reverse registration time).
- Layout: left-aligned wrapping. **Leave the ragged right edge alone.**
  Justifying rows to fill the width makes the unit differ per row, which breaks the premise that width means count.
  Reordering to pack rows tightly is also out — it breaks newest-first.
- Filters: **color**, color count, and (on the personal shelf) made / saved.

Why a single sort axis isn't a problem: discovery is handled by the **color filter**, not by sorting.
Newest-first is just the resting state that answers "what just arrived."

### 2.3 Palette detail — `palette.html?id=`

- Show the palette large. **In small patches, a color is contaminated by its neighbors and reads differently than it is.** There needs to be a way to see it at size.
- Per color: hex, OKLCh values, individual copy.
- **Copy the whole palette** — this is what actually gets used. Array / CSS variable block / Tailwind config / `oklch()` notation.
- Click one color → **every other palette containing it**. This is the heart of the product.
- Save button.

### 2.4 Personal shelf — `shelf.html`

Not a new screen — it's **the gallery with a filter applied**. Same cards, same unit width, same color filter.
Two tabs: made / saved.

Once a saved list reaches about 30 items, filtering it by color becomes genuinely useful. And that list becomes the source material for `archive` mode — a personal drawer of colors you reach for often.

**Saving, not liking.** No public counts.
- A popularity ranking competes with color-based exploration. People go look at the big number instead.
- A zero next to a palette reads as failure. In an anonymous archive that's a needless wound.
- "Like" is approval; "save" is use. For someone who came to copy hex codes, the second one is right.

If a social signal is ever needed, use **copy count**. It measures that something was actually used rather than that it was popular — a different kind of number, and the right one for this archive.

---

## 3. Color rules

### 3.1 Storage format

**Store the authored coordinates as the original**: OKLab `L, a, b`.
Hex is a derived value for display and copying. Storing hex alone crushes everything into 8-bit sRGB and throws away wide-gamut information — an archive keeping low-resolution photocopies instead of originals.

Edit in OKLCh (polar), store and search in OKLab (cartesian).
Hue in LCh wraps at 0/360, which makes distance math and range queries awkward.

### 3.2 Color distance

Never use RGB or HSL distance. A small difference in greens reads as much larger to the eye than the same numeric difference in blues, and RGB distance doesn't reflect that.

```
distance = √((L₁-L₂)² + (a₁-a₂)² + (b₁-b₂)²)   // Euclidean in OKLab ≈ ΔEok
```

**The similarity threshold is user-adjustable.** It feels like focusing a lens, and it doesn't hide the fact that color similarity is inherently fuzzy.

| Setting | Value (needs tuning) |
|---|---|
| Exactly this color | 0.02 |
| Default | 0.06 |
| Nearby too | 0.12 |

**Always cap the result count** (around 60). A loose threshold matches half the archive, and half the archive is the same as nothing.

### 3.3 Automatic image extraction

**Select for spread, not frequency.** Taking the five most common colors gives you five greens from a forest photo and five browns from an interior.

1. k-means in OKLab space (not RGB)
2. Pull a generous candidate set (12–16)
3. Choose 6–8 that are **spread apart in lightness, chroma, and hue** to show as candidate points

### 3.4 Proportion

- Floor 5%. No ceiling.
- At 6 colors, the smallest segment is `unit 96px × 6 × 0.05 ≈ 29px` — comfortably visible.
- **Never enforce a minimum width at render time.** Stretching a segment makes the proportion data a lie, and that ruins the one thing this site does differently.

---

## 4. Data model

```sql
create table palettes (
  id            uuid primary key default gen_random_uuid(),
  catalog_no    bigserial unique,          -- display and reference number
  color_count   smallint not null check (color_count between 2 and 6),
  owner_id      uuid references auth.users(id),  -- includes anonymous sign-ins
  created_at    timestamptz not null default now()
);

create table palette_colors (
  id            uuid primary key default gen_random_uuid(),
  palette_id    uuid not null references palettes(id) on delete cascade,
  position      smallint not null,          -- 0..5
  ok_l          double precision not null,  -- OKLab (source of truth for search/distance)
  ok_a          double precision not null,
  ok_b          double precision not null,
  proportion    real not null check (proportion >= 0.05),
  source_mode   text not null check (source_mode in ('picker','mix','image','archive')),
  hex           text not null,              -- derived cache, for display
  unique (palette_id, position)
);

-- Color distance queries: bounding-box prefilter, then exact distance in the app
create index on palette_colors (ok_l, ok_a, ok_b);

create table saves (
  user_id       uuid not null references auth.users(id),
  palette_id    uuid not null references palettes(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, palette_id)
);
```

**Proportions must sum to 1.0.** If a DB constraint is awkward, validate server-side at registration.

**Anonymous ownership**: use Supabase `signInAnonymously()`. An anonymous user is created on first visit, and signing up later promotes that same row so made and saved items carry over. Don't roll your own session IDs.

---

## 5. Color search query

```
1. Take the reference color's OKLab (L,a,b) and threshold t
2. Prefilter palette_colors with a bounding box:
     ok_l between L-t and L+t
     ok_a between a-t and a+t
     ok_b between b-t and b+t
3. Apply exact Euclidean distance to the results, drop anything beyond t
4. Group by palette_id (one palette may have several matching colors)
5. Sort by distance or recency, cap at 60
6. Return the total match count as well → "12 palettes contain this color"
```

**Zero matches is information, not failure.** Display it as "this is the only palette with this color."
Once rarity exists, someone will go hunting for a color nobody has used.

---

## 6. A bias to be aware of

Palettes with more colors have a structural advantage. Two effects stack:

1. **Discovery paths**: a 6-color palette is reachable from six different colors. A 2-color palette from two.
2. **Visual area**: with unit-based widths, a 6-color card is three times wider than a 2-color one.

This isn't a bug to fix — more colors do carry more information, so some advantage is earned.
Just know that this is the cause when you later wonder why nobody looks at 2-color palettes.
If it becomes a real problem the unit could be made sub-linear, but then width no longer lets you count colors, so leave it as is for now.

---

## 7. Discarded decisions

These are easy to drift back toward, so the reasoning is recorded.

**Sky view (palettes scattered as stars across color coordinates)** — considered and dropped.
Spatial embedding earns its place when you can't tell what a dot represents by looking at it. Color is the opposite: **the dot is the content.** A blue palette sitting in the blue region is something you can already see, so the map just repeats what the color is already saying. On top of that, a palette is several colors plus proportions, which a single dot can't show — so the screen meant to show combinations was the one that showed them least.
→ Density and rarity are covered by a number like "12 palettes contain this color."
→ If the archive gets large enough, it could come back as a **whole-archive overview page**, not as the browsing surface.

**Connecting palettes with lines (lineage graph)** — dropped.
Every palette is similar to every other palette to some degree. Lower the threshold slightly and everything connects into a gray mesh; raise it slightly and the canvas empties. It got worse as the archive grew. The current color filter does the opposite — **more palettes make the results richer.**

**Required names** — dropped. See section 1.

**Storing images alongside palettes** — dropped.
The moment thumbnails appear in the gallery, people look at photos instead of color. Photos are visually overwhelming next to color swatches, so a site built to show combinations becomes a photo feed. Secondarily, it means moderation, copyright, and reporting from day one.

**Auto-completed palettes (an "AI extract" button)** — dropped.
If an algorithm picks five colors and hands over a finished palette, the user loses control. The algorithm proposes candidates; a person chooses.

**Locked harmony rules (complementary, triadic, handles moving together)** — dropped.
Convenient, but everyone's palettes end up identical. The point is to collect people's idiosyncratic color sense, and rules flatten that toward the average.

**Public like counts** — dropped. See section 2.4.

**Live camera mode (including hand tracking)** — dropped.
Image upload opens the camera on mobile anyway, so the same code delivers the same result. It avoids permission handling, lighting dependence, and cross-browser instability entirely.
