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
//   labelled    — the color's hex is printed on it
export function renderSwatches(host, colors, { interactive = false, removable = false, labelled = false } = {}) {
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

			// The hex printed on the band is a caption, not a control — the
			// whole band does one thing. Saying what that thing is here rather
			// than reading back the number the eye already has.
			swatch.setAttribute('aria-label', labelled
				? `Find palettes containing ${color.hex}`
				: color.hex);
		}

		if (labelled) swatch.append(hexLabel(color.hex));

		host.append(swatch);
	});
}

// The color's own hex, written on it. Only the hex: the full three notations
// live in one place, and a band that carried them too would be the same lines
// printed twice on one screen.
function hexLabel(hex) {
	const label = document.createElement('span');
	label.className = 'swatch-hex num';
	label.textContent = hex.toUpperCase();

	// Set per swatch, because the surface it has to be legible on is the
	// user's color and nothing else on the page knows what that is.
	label.style.color = inkOn(hex);

	return label;
}

// Fills a host with one color's three notations, each of them a control that
// puts its own value on the clipboard.
//
// One place only: the copy panel, for whichever color the palette currently
// has selected. Printing them on the bands as well put the same three lines on
// screen twice, and gave the page two ways to ask for one color.
//
// Name and value go in as separate cells rather than as one string a line. The
// grid then holds all three values in a column of their own, so the notations
// stack as blocks to be looked down instead of as sentences to be read across.
export function renderCodes(host, hex) {
	host.replaceChildren();

	for (const [name, value] of notations(hex)) {
		const code = document.createElement('button');
		code.type = 'button';
		code.className = 'code-copy';

		// What lands on the clipboard: the value alone, without the name in
		// front of it. Nobody pastes "HEX" into a stylesheet.
		code.dataset.copy = value;
		code.setAttribute('aria-label', `Copy ${name} ${value}`);

		code.append(line(name), line(value));
		host.append(code);
	}
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
