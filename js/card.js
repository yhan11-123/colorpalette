// card.js — the palette card, and the swatch bar it is built from.
//
// The hand-written markup in step 1 is the reference. This file reproduces it
// exactly; if the wall changes appearance, this file is wrong, not the markup.
//
//   width  = color count × --unit     (width is the data: it means color count)
//   height = --card-height            (fixed)
//   inside = divided equally          (one color is always one unit)

import { hexToRgb255, hexToCmyk, inkOn } from './color.js';

const HEX_FOR_LABEL = 6;


// Fills any element with swatches. Used by the card, the tray on the make
// screen, and the large view on the detail page — same geometry every time,
// which is why the tray needs no separate preview.
//
// Only --n is set here. The equal division is CSS's job (.swatch has a fixed
// flex grow), so there is no per-swatch number that could disagree with it.
//
//   interactive — the swatch can be clicked (select a color)
//   removable   — it also carries a dismiss control, for the tray
//   codes       — the color's own notations are printed inside it
export function renderSwatches(host, colors, { interactive = false, removable = false, codes = false } = {}) {
	host.replaceChildren();
	host.style.setProperty('--n', colors.length);

	colors.forEach((color, i) => {
		const swatch = document.createElement(
			removable ? 'div' : interactive ? 'button' : 'span'
		);

		swatch.className = 'swatch';
		swatch.style.background = color.hex;
		swatch.dataset.index = i;

		if (removable) {
			// Two controls means the swatch cannot be a button itself —
			// a button inside a button is invalid and browsers drop it.
			swatch.append(control('swatch__select', `Select ${color.hex}`, ''));
			swatch.append(control('swatch__remove', `Remove ${color.hex}`, '×'));
		} else if (interactive) {
			swatch.type = 'button';

			// The codes are revealed by moving a pointer onto the band, which
			// is not an act available to everyone. Where they are printed, the
			// label carries the same three notations rather than the hex alone,
			// so the palette says the same thing either way it is read.
			swatch.setAttribute('aria-label', codes
				? notations(color.hex).map(([name, value]) => `${name} ${value}`).join(', ')
				: color.hex);
		}

		if (codes) swatch.append(codeBlock(color.hex));

		host.append(swatch);
	});
}

// The codes live on the color rather than in a list beside it, so a number is
// never one column away from the thing it names — and so reading the palette
// and reading its values are the same act.
//
// Plain text, no controls: this goes inside a swatch that is itself a button
// on the detail page, and a button inside a button is dropped by the browser.
function codeBlock(hex) {
	const box = document.createElement('span');
	box.className = 'swatch-codes num';

	// Set per swatch, because the surface it has to be legible on is the
	// user's color and nothing else on the page knows what that is.
	box.style.color = inkOn(hex);

	// Name and value go in as separate cells rather than as one string a line.
	// The grid then holds all three values in a column of their own, so the
	// notations stack as blocks to be looked down instead of as three
	// sentences to be read across.
	for (const [name, value] of notations(hex)) {
		box.append(line(name), line(value));
	}

	return box;
}

// Hex for the web, RGB for anything else on a screen, CMYK for anything
// printed. One source for both the printed block and the label, so the two
// cannot drift apart.
function notations(hex) {
	const { r, g, b } = hexToRgb255(hex);
	const { c, m, y, k } = hexToCmyk(hex);

	return [
		['HEX', hex.toUpperCase()],
		['RGB', `${r} ${g} ${b}`],
		['CMYK', `${c} ${m} ${y} ${k}`],
	];
}

function line(text) {
	const span = document.createElement('span');
	span.textContent = text;
	return span;
}

function control(className, label, text) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = className;
	button.textContent = text;
	button.setAttribute('aria-label', label);
	return button;
}


export function createCard(palette, { href } = {}) {
	const card = document.createElement(href ? 'a' : 'div');
	card.className = 'card';
	if (href) card.href = href;

	card.dataset.paletteId = palette.id;
	renderSwatches(card, palette.colors);

	// A card is a link with no text. Without this it is unreachable by screen
	// reader, and color would be the only carrier of the information.
	card.setAttribute('aria-label', describe(palette));

	return card;
}


function describe(palette) {
	const hexes = palette.colors.slice(0, HEX_FOR_LABEL).map(c => c.hex).join(', ');

	// Color count is unbounded, so the label lists a readable number of them
	// and says how many it left out rather than reciting twenty hex codes.
	const rest = palette.colorCount - HEX_FOR_LABEL;
	const more = rest > 0 ? `, and ${rest} more` : '';

	return `Palette ${palette.catalogNo}, ${palette.colorCount} colors: ${hexes}${more}`;
}


// Rendering a whole wall. Empty is not an error state — SPEC calls for an
// invitation to act, so the caller supplies what the empty case should say.
export function renderWall(host, palettes, { href = id => `palette.html?id=${id}`, empty } = {}) {
	host.replaceChildren();

	if (!palettes.length) {
		if (empty) host.append(empty);
		return;
	}

	const frag = document.createDocumentFragment();
	for (const palette of palettes) {
		frag.append(createCard(palette, { href: href(palette.id) }));
	}
	host.append(frag);
}
