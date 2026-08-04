// palette.js — the detail page, and the one interaction the whole site exists for:
// click a color inside a palette, and every other palette containing it appears.
//
// Give this file the most care. Everything else is scaffolding around it.

import { getPalette, findPalettesByColor } from './db.js';
import { renderSwatches, renderWall } from './card.js';
import { oklabToOklch } from './color.js';

// SPEC §3.2. Named, because the user reads these as focus settings rather than
// as numbers — the slider feels like focusing a lens.
const THRESHOLDS = [
	{ value: 0.02, label: 'exactly this color' },
	{ value: 0.06, label: 'default' },
	{ value: 0.12, label: 'nearby too' },
];

const el = id => document.querySelector('#' + id);

const ui = {
	detail: el('detail'), missing: el('missing'),
	catalog: el('catalog'),
	large: el('large'), track: el('track'), twin: el('twin'),
	preview: el('preview'), copied: el('copied'),
	matchChip: el('matchChip'), matchCount: el('matchCount'),
	matches: el('matches'),
	threshold: el('threshold'), thresholdLabel: el('thresholdLabel'),
};

const params = new URLSearchParams(location.search);

const id = params.get('id');

// Set by the make screen when registering found this palette already here.
const arrivedAsTwin = params.has('twin');

let palette = null;
let selected = null;      // index of the color being filtered on
let format = 'array';

// Ticket for the newest color query; anything older throws its result away.
let latestRun = 0;


init();

async function init() {
	palette = id ? await getPalette(id) : null;

	if (!palette) {
		ui.missing.hidden = false;
		return;
	}

	ui.detail.hidden = false;
	document.title = `Palette ${palette.catalogNo} — Color Archive`;

	ui.catalog.textContent = `No. ${String(palette.catalogNo).padStart(4, '0')}`;
	ui.twin.hidden = !arrivedAsTwin;

	renderSwatches(ui.large, palette.colors, { interactive: true, codes: true });
	renderTrack();
	renderCopy();

	ui.large.addEventListener('click', event => {
		const swatch = event.target.closest('.swatch');
		if (swatch) selectColor(Number(swatch.dataset.index));
	});

	// The rail is a path in pixels, and the frame is sized in --unit, which is
	// a share of the viewport below 680px. A window that changes width there
	// changes the shape the text has to travel, so the path is rebuilt — but
	// only when the frame really did change size, since this also fires once on
	// its own the moment it starts watching.
	new ResizeObserver(() => {
		const { width, height } = ui.track.parentElement.getBoundingClientRect();
		if (`${Math.round(width)}x${Math.round(height)}` !== railBuiltFor) renderTrack();
	}).observe(ui.track.parentElement);
}


/* ---------- the border of moving text ---------- */
//
// The palette's own codes set along a rounded rectangle around it, sliding
// round for ever. Text on an SVG path, because a path can turn a corner: the
// renderer places and rotates every glyph itself, and the ring comes out as
// one line with no joins rather than four sides that meet.

const SVG = 'http://www.w3.org/2000/svg';
const XML = 'http://www.w3.org/XML/1998/namespace';

// Pixels a second. The duration is worked out from this rather than the other
// way round: the loop is one palette's worth of text long, and that length
// depends on how many colors the palette has, so a fixed duration would run a
// two-color palette at a quarter the speed of a nine-color one. Speed is what
// should be the same from palette to palette.
const SPEED = 50;

const CODE = 8;               // characters in "#RRGGBB " — the same for every color

// The advance of a code in a typical monospace face, as a fraction of the font
// size. Only a starting guess for how many codes a lap holds — the exact fit is
// forced afterwards, so being a little out here costs nothing but a hair of
// letter spacing.
const CODE_EM = 0.6;

// What the rail was last built for. The frame follows --unit, which follows the
// viewport, so a resize needs a new path — but a resize that leaves the frame
// the same size does not.
let railBuiltFor = '';

function node(name, attrs = {}) {
	const el = document.createElementNS(SVG, name);
	for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
	return el;
}

// Clockwise from the top left, so the stream reads left to right along the top.
function railPath(w, h, inset, r) {
	const right = w - inset;
	const bottom = h - inset;

	return [
		`M ${inset + r} ${inset}`,
		`H ${right - r}`,
		`A ${r} ${r} 0 0 1 ${right} ${inset + r}`,
		`V ${bottom - r}`,
		`A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
		`H ${inset + r}`,
		`A ${r} ${r} 0 0 1 ${inset} ${bottom - r}`,
		`V ${inset + r}`,
		`A ${r} ${r} 0 0 1 ${inset + r} ${inset}`,
		'Z',
	].join(' ');
}

function renderTrack() {
	const frame = ui.track.parentElement;
	const { width, height } = frame.getBoundingClientRect();

	// Not laid out yet, or the page is still hidden. Nothing to measure.
	if (!width || !height) return;

	railBuiltFor = `${Math.round(width)}x${Math.round(height)}`;

	const style = getComputedStyle(frame);

	// Down the middle of the gutter: clear of the page on one side, clear of
	// the color on the other. Taken from the frame's own padding rather than
	// stated again here, so the two cannot drift apart.
	const inset = parseFloat(style.paddingTop) / 2;

	const radius = Math.min(
		parseFloat(style.getPropertyValue('--rail-radius')) || inset,
		Math.min(width, height) / 2 - inset,
	);

	const rail = node('path', {
		id: 'rail',
		fill: 'none',
		d: railPath(width, height, inset, radius),
	});

	const defs = node('defs');
	defs.append(rail);

	const stream = node('textPath', { href: '#rail', startOffset: 0 });

	const text = node('text', { class: 'frame-rail' });

	// Without this the renderer collapses the space each code ends with and the
	// stream comes out as one unbroken run of hex digits.
	text.setAttributeNS(XML, 'xml:space', 'preserve');
	text.append(stream);

	const svg = node('svg', { viewBox: `0 0 ${width} ${height}` });
	svg.append(defs, text);

	ui.track.replaceChildren(svg);

	// In the document now, so the path has a length to write against.
	const lap = rail.getTotalLength();

	// One palette, purely to see how wide a code comes out in whatever font
	// the machine actually had for --font-num.
	write(stream, palette.colors.length);
	const codeWidth = measure(text, CODE) || guessCodeWidth(text);

	// Twice round: one lap of codes on the path, and a second lap queued behind
	// it so there is always something following.
	const perLap = whole(lap / codeWidth, palette.colors.length);

	stream.replaceChildren();
	write(stream, perLap * 2);

	// The exact fit, and the whole reason the ring can be endless.
	//
	// Left at its natural width the text lands a few pixels short of the corner
	// it set out from, or a few past it — and since the path is closed, that
	// corner is where the end of the line and the start of it are the same
	// point. The mismatch sits there for ever, and every restart of the loop
	// jumps by it. Forcing the length instead makes one lap of text exactly one
	// lap of path, so the last code meets the first and the seam closes.
	//
	// lengthAdjust: spacing puts the correction between the glyphs rather than
	// inside them — the codes keep their shape, the gaps take up the slack.
	text.setAttribute('textLength', lap * 2);
	text.setAttribute('lengthAdjust', 'spacing');

	// Exactly one lap per cycle. Sliding by the full circumference lands the
	// second lap of text precisely where the first one was, so the moment the
	// animation restarts is the moment nothing changes.
	if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
		stream.append(node('animate', {
			attributeName: 'startOffset',
			from: -lap,
			to: 0,
			dur: `${(lap / SPEED).toFixed(2)}s`,
			repeatCount: 'indefinite',
		}));
	}
}

function write(host, codes) {
	const { colors } = palette;

	for (let i = 0; i < codes; i++) {
		const { hex } = colors[i % colors.length];

		const code = node('tspan', { fill: hex });
		code.textContent = `${hex.toUpperCase()} `;

		host.append(code);
	}
}

// Rounded to whole palettes, at least one. A lap that ended part-way through
// the sequence would restart it mid-palette at the corner, which is the one
// place on the ring where the join can be seen.
function whole(codes, size) {
	return Math.max(1, Math.round(codes / size)) * size;
}

// How far along the path the first n characters reach. Asked of the text
// itself rather than worked out from the font size, because the font here is
// whichever of --font-num the machine actually has.
function measure(text, chars) {
	try {
		return text.getSubStringLength(0, chars) || 0;
	} catch {
		return 0;
	}
}

// Only reached if the engine refuses to measure. Being wrong here spreads the
// codes a little thin or a little tight; it cannot break the loop, because the
// fit is forced either way.
function guessCodeWidth(text) {
	return parseFloat(getComputedStyle(text).fontSize) * CODE_EM * CODE;
}


/* ---------- copy formats ---------- */
// This is what actually gets used, so the palette leaves in the shape the
// destination wants rather than as a list to retype.

const FORMATS = {
	array: p => JSON.stringify(p.colors.map(c => c.hex), null, 2),

	css: p => ':root {\n' + p.colors
		.map((c, i) => `\t--color-${i + 1}: ${c.hex};`)
		.join('\n') + '\n}',

	tailwind: p => 'colors: {\n' + p.colors
		.map((c, i) => `\t'palette-${i + 1}': '${c.hex}',`)
		.join('\n') + '\n}',

	oklch: p => p.colors.map(c => {
		const { l, c: chroma, h } = oklabToOklch(c.oklab);
		return `oklch(${l.toFixed(3)} ${chroma.toFixed(3)} ${h.toFixed(1)})`;
	}).join('\n'),
};

for (const button of document.querySelectorAll('[data-format]')) {
	button.addEventListener('click', () => {
		format = button.dataset.format;
		renderCopy();
		copyText(FORMATS[format](palette), `${button.textContent} copied`);
	});
}

function renderCopy() {
	ui.preview.textContent = FORMATS[format](palette);
}

async function copyText(text, message) {
	try {
		await navigator.clipboard.writeText(text);
		ui.copied.textContent = message;
	} catch {
		ui.copied.textContent = 'Clipboard blocked — select the text below instead.';
	}
	setTimeout(() => { ui.copied.textContent = ''; }, 2000);
}


/* ---------- the color filter ---------- */

// Must read the same as the copy sitting in palette.html — that one is what is
// on screen before this file runs, and this one replaces it when a color is
// released. Two wordings would look like the panel changed its mind.
const PROMPT = 'Click a color in the palette to see every other palette that contains it.';

function selectColor(index) {
	selected = selected === index ? null : index;

	[...ui.large.children].forEach((node, i) => {
		node.classList.toggle('is-selected', i === selected);
	});

	if (selected === null) {
		// Back to the invitation. The panel itself stays where it is, so
		// releasing a color does not collapse the page either.
		latestRun++;                       // abandon any query still in flight
		ui.matchChip.classList.add('is-hidden');
		ui.matchCount.className = 'label';
		ui.matchCount.textContent = PROMPT;
		ui.matches.replaceChildren();
		return;
	}

	runFilter();
}

// A range input fires `input` continuously while dragging, but this slider has
// only three stops — so only act when the stop actually changed. Without this
// a single drag fires a query per pointer move.
let lastStop = ui.threshold.value;

ui.threshold.addEventListener('input', () => {
	ui.thresholdLabel.textContent = THRESHOLDS[Number(ui.threshold.value)].label;

	if (ui.threshold.value === lastStop) return;
	lastStop = ui.threshold.value;

	if (selected !== null) runFilter();
});

// Queries are async, so a slower earlier one can land after a faster later one
// and overwrite it — the wall would then disagree with the slider. Each run
// takes a ticket and drops its own result if a newer run has started since.
async function runFilter() {
	const run = ++latestRun;

	const color = palette.colors[selected];
	const { value } = THRESHOLDS[Number(ui.threshold.value)];

	ui.matchChip.style.background = color.hex;
	ui.matchChip.classList.remove('is-hidden');
	ui.matchCount.className = 'num';
	ui.matchCount.textContent = 'searching…';

	const { palettes, total, capped } = await findPalettesByColor(
		color.oklab, value, { excludeId: palette.id },
	);

	if (run !== latestRun) return;

	ui.matchCount.textContent = describe(total, capped, color.hex);
	renderWall(ui.matches, palettes, { empty: onlyOne() });
}

function describe(total, capped, hex) {
	if (total === 0) return `${hex} — this is the only palette with this color`;

	const shown = capped ? ` (showing the closest 60)` : '';
	return total === 1
		? `1 other palette contains ${hex}`
		: `${total} other palettes contain ${hex}${shown}`;
}

// Zero matches is information, not failure. Presented as rarity, it turns into
// something worth hunting for.
function onlyOne() {
	const p = document.createElement('p');
	p.className = 'empty';
	p.textContent = 'Nobody else has used this color. Tighten or loosen the slider to see how close anything gets.';
	return p;
}
