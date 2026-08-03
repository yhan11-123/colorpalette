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


/* ---------- notations ---------- */
//
// The three ways a palette has to be able to leave: hex for the web, RGB for
// anything else on a screen, CMYK for anything printed.
//
// All three are read off the hex rather than out of the OKLab. The hex is what
// formatHex already brought into sRGB, so these are the numbers for the color
// actually on the screen. Taken from the OKLab instead, a palette carrying an
// out-of-gamut color would print an RGB triple no display ever showed.

export function hexToRgb255(hex) {
	const parsed = parse(hex);
	if (!parsed) throw new Error(`hexToRgb255: cannot parse "${hex}"`);

	return {
		r: Math.round(parsed.r * 255),
		g: Math.round(parsed.g * 255),
		b: Math.round(parsed.b * 255),
	};
}

// The standard sRGB → CMYK formula, in whole percent.
//
// Read what this returns as a starting point, not as press values. Real CMYK
// is defined by an ink set, a paper and an ICC profile, and a web page knows
// none of the three — so this is an arithmetic restatement of the RGB numbers
// rather than a color conversion. It is here because a palette that cannot be
// handed to a printer is only half a palette, not because it is exact.
export function hexToCmyk(hex) {
	const { r, g, b } = hexToRgb255(hex);

	const rf = r / 255, gf = g / 255, bf = b / 255;
	const k = 1 - Math.max(rf, gf, bf);

	// Pure black carries everything in K, and the other three would divide by
	// zero working it out.
	if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };

	return {
		c: Math.round(((1 - rf - k) / (1 - k)) * 100),
		m: Math.round(((1 - gf - k) / (1 - k)) * 100),
		y: Math.round(((1 - bf - k) / (1 - k)) * 100),
		k: Math.round(k * 100),
	};
}


/* ---------- contrast and gamut ---------- */

// WCAG 2 contrast ratio, 1 to 21. Used to decide whether a hex label
// printed on a swatch should be black or white.
export function contrastRatio(hex1, hex2) {
	return wcagContrast(hex1, hex2);
}

// Black or white, whichever can be read on this color. Codes printed on the
// palette sit directly on the user's own color, so the ink has to follow that
// color rather than the theme — a light theme gives no licence to use dark text
// on a dark swatch.
export function inkOn(hex) {
	return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000')
		? '#ffffff'
		: '#000000';
}

// True when an OKLCh color has no sRGB equivalent — its chroma is beyond
// what the display can show. The precision panel needs to warn about this
// instead of silently clipping the color.
export function isOutOfGamut({ l, c, h }) {
	return !inSrgb({ mode: 'oklch', l, c, h });
}
