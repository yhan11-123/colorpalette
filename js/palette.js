// palette.js — the detail page, and the one interaction the whole site exists for:
// click a color inside a palette, and every other palette containing it appears.
//
// Give this file the most care. Everything else is scaffolding around it.

import { getPalette, findPalettesByColor } from './db.js';
import { renderSwatches, renderWall, renderCodes } from './card.js';
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
	single: el('single'),
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

	renderSwatches(ui.large, palette.colors, { interactive: true, labelled: true });
	renderTrack();
	renderCopy();
	renderSingle();

	ui.large.addEventListener('click', event => {
		// A drag across the hex printed on a band is someone taking the number
		// by hand, not asking for the archive to be filtered.
		if (dragged(event.target)) return;

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

// Laps of text written for a ring one lap around, and the reason the ring is
// never caught half empty.
//
// Two was the obvious number — one lap on the path and one queued behind it —
// but two leaves nothing to spare: at the start of the cycle the first lap has
// just gone off the front, and the ring is standing on the second one alone.
// Any shortfall in the fit, and the far side of the ring has nothing on it
// until the animation has carried the rest round.
//
// Three keeps a whole lap in hand at each end. The path is covered at every
// offset the animation passes through, from the first frame on.
const LAPS = 3;

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

	// Where in the gutter the rail runs. Falls back to the middle of it if the
	// value cannot be read, which is the one position that needs no knowledge
	// of anything but the frame's own padding.
	const inset = parseFloat(style.getPropertyValue('--rail-inset'))
		|| parseFloat(style.paddingTop) / 2;

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

	const stream = node('textPath', { href: '#rail' });

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

	const perLap = whole(lap / codeWidth, palette.colors.length);

	stream.replaceChildren();
	write(stream, perLap * LAPS);

	// The exact fit, and the whole reason the ring can be endless.
	//
	// Left at its natural width the text lands a few pixels short of the corner
	// it set out from, or a few past it — and since the path is closed, that
	// corner is where the end of the line and the start of it are the same
	// point. The mismatch sits there for ever, and every restart of the loop
	// jumps by it. Forcing the length instead makes one lap of text exactly one
	// lap of path, so the last code meets the first and the seam closes.
	//
	// Set on the textPath rather than on the text around it: the glyphs are
	// laid out here, against the path, and this is the element every engine
	// agrees the measurement belongs to.
	//
	// lengthAdjust: spacing puts the correction between the glyphs rather than
	// inside them — the codes keep their shape, the gaps take up the slack.
	stream.setAttribute('textLength', lap * LAPS);
	stream.setAttribute('lengthAdjust', 'spacing');

	// Where the animation begins, stated on the element as well, so the first
	// frame drawn is already the frame the loop keeps returning to rather than
	// a lap's worth of text sitting in a different place for one paint.
	stream.setAttribute('startOffset', -lap);

	// Exactly one lap per cycle. Sliding by the full circumference lands the
	// next lap of text precisely where the last one was, so the moment the
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


/* ---------- one color, in the panel ---------- */
// The palette is the picker. There is no second row of chips to choose from,
// because the colors are already on the page at full size and choosing one of
// them is already what a band does — a control beside the palette offering the
// same colors again would be the palette drawn twice.
//
// So one selection drives both things a color can do here: the archive is
// filtered by it, and its full reading appears in the panel. On the band
// itself there is only the hex, which is a caption rather than a copy of this.

function renderSingle() {
	const color = selected === null ? null : palette.colors[selected];

	if (!color) {
		ui.single.replaceChildren();
		return;
	}

	renderCodes(ui.single, color.hex);
}


// True when the click that just happened was the end of a drag across text
// inside this element. Someone who went to the trouble of highlighting four of
// the six digits did not mean to press anything.
//
// Scoped to the element rather than to the page: a selection left lying
// somewhere else is not a reason to swallow a press here.
function dragged(target) {
	const selection = window.getSelection();

	return Boolean(selection)
		&& !selection.isCollapsed
		&& target.contains?.(selection.anchorNode);
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

function selectColor(index) {
	selected = selected === index ? null : index;

	[...ui.large.children].forEach((node, i) => {
		node.classList.toggle('is-selected', i === selected);
	});

	// One selection, both of the things a color does on this page: it filters
	// the archive below, and it is the color the copy panel is reading out.
	renderSingle();

	if (selected === null) {
		// Back to nothing said. The slider stays where it is, so releasing a
		// color does not collapse the page either — what was here is simply
		// not here any more, which is the whole account of it.
		latestRun++;                       // abandon any query still in flight
		ui.matchChip.classList.add('is-hidden');
		ui.matchCount.className = 'label';
		ui.matchCount.textContent = '';
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

	// No empty state. The count above already says a color is the only one of
	// its kind, and a second sentence underneath saying it again — with advice
	// about the slider attached — was the same fact twice and a lesson on top.
	renderWall(ui.matches, palettes);
}

function describe(total, capped, hex) {
	if (total === 0) return `${hex} — this is the only palette with this color`;

	const shown = capped ? ` (showing the closest 60)` : '';
	return total === 1
		? `1 other palette contains ${hex}`
		: `${total} other palettes contain ${hex}${shown}`;
}

