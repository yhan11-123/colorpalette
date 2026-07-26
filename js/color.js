// color.js — all color math for the project.
//
// This is the ONLY file that imports culori. Everything else imports this file.
// Colors cross this boundary as plain objects: { l, a, b } and { l, c, h }.
// culori's tagged objects ({ mode: 'oklab', … }) never leave here.
//
// Store and search in OKLab (cartesian). Edit in OKLCh (polar).
// Hex is a derived value for display and copying — never the source of truth.

import {
	converter,
	formatHex,
	parse,
	inGamut,
	wcagContrast,
} from 'https://esm.sh/culori@4';

const toOklab = converter('oklab');
const toOklch = converter('oklch');

const inSrgb = inGamut('rgb');

// Below this chroma, a color is achromatic and its hue angle is meaningless.
// culori reports h: undefined for these. OKLCh chroma tops out near 0.37,
// so this is a small fraction of the range.
const ACHROMATIC = 0.005;


/* ---------- hex ↔ OKLab ---------- */

export function hexToOklab(hex) {
	const parsed = parse(hex);
	if (!parsed) throw new Error(`hexToOklab: cannot parse "${hex}"`);

	const { l, a, b } = toOklab(parsed);
	return { l, a, b };
}

export function oklabToHex({ l, a, b }) {
	return formatHex({ mode: 'oklab', l, a, b });
}

// Straight from canvas pixel data. Image extraction runs this thousands of
// times, and routing each pixel through a hex string first would mean building
// and re-parsing thousands of strings for no reason.
export function rgb255ToOklab(r, g, b) {
	const { l, a, b: bb } = toOklab({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 });
	return { l, a, b: bb };
}


/* ---------- OKLab ↔ OKLCh ---------- */

export function oklabToOklch({ l, a, b }) {
	const lch = toOklch({ mode: 'oklab', l, a, b });

	// culori leaves h undefined for achromatic colors. Callers editing a gray
	// need a number to put in a slider, so settle on 0 — but note that any
	// hue is equally correct here, which is why hue spread ignores these.
	return { l: lch.l, c: lch.c, h: lch.h ?? 0 };
}

export function oklchToOklab({ l, c, h }) {
	const lab = toOklab({ mode: 'oklch', l, c, h });
	return { l: lab.l, a: lab.a, b: lab.b };
}


/* ---------- distance ---------- */

// Euclidean distance in OKLab ≈ ΔEok. Never do this in RGB or HSL:
// the same numeric gap reads much larger in greens than in blues there.
export function distance(c1, c2) {
	const dl = c1.l - c2.l;
	const da = c1.a - c2.a;
	const db = c1.b - c2.b;
	return Math.sqrt(dl * dl + da * da + db * db);
}


/* ---------- spread ---------- */

// How far apart a set of colors sits on each axis.
// Shown at all times on the make screen; also drives image extraction,
// which selects candidates for spread rather than frequency.
export function spread(colors) {
	if (!colors.length) return { lightness: 0, chroma: 0, hue: 0 };

	const lch = colors.map(oklabToOklch);

	const ls = lch.map(c => c.l);
	const cs = lch.map(c => c.c);

	return {
		lightness: Math.max(...ls) - Math.min(...ls),
		chroma: Math.max(...cs) - Math.min(...cs),
		hue: hueSpread(lch.filter(c => c.c >= ACHROMATIC).map(c => c.h)),
	};
}

// Hue is an angle, so max - min is wrong: hues of 350 and 10 are 20 apart,
// not 340. Find the largest empty arc instead; what's left is the arc the
// colors actually occupy.
function hueSpread(hues) {
	if (hues.length < 2) return 0;

	const sorted = [...hues].sort((x, y) => x - y);

	let largestGap = 0;
	for (let i = 0; i < sorted.length; i++) {
		const next = sorted[(i + 1) % sorted.length];
		// the last-to-first step crosses 0/360, so add a turn to keep it positive
		const gap = i === sorted.length - 1
			? next + 360 - sorted[i]
			: next - sorted[i];

		if (gap > largestGap) largestGap = gap;
	}

	return 360 - largestGap;
}


/* ---------- contrast and gamut ---------- */

// WCAG 2 contrast ratio, 1 to 21. Used to decide whether a hex label
// printed on a swatch should be black or white.
export function contrastRatio(hex1, hex2) {
	return wcagContrast(hex1, hex2);
}

// True when an OKLCh color has no sRGB equivalent — its chroma is beyond
// what the display can show. The precision panel needs to warn about this
// instead of silently clipping the color.
export function isOutOfGamut({ l, c, h }) {
	return !inSrgb({ mode: 'oklch', l, c, h });
}
