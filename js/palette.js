// palette.js — the detail page, and the one interaction the whole site exists for:
// click a color inside a palette, and every other palette containing it appears.
//
// Give this file the most care. Everything else is scaffolding around it.

import { getPalette, findPalettesByColor } from './db.js';
import { renderSwatches, renderWall, renderCodes } from './card.js';
import { oklabToOklch, oklabToHex } from './color.js';
import { getView, onView } from './view.js';

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

	// The ring is made of the shape the site is in, and that is a choice made on
	// another screen. CSS cannot restroke a path, so this one has to be rebuilt.
	onView(renderTrack);
}


/* ---------- the border of moving text ---------- */
//
// The palette's own codes set along a rounded rectangle around it, sliding
// round for ever. Text on an SVG path, because a path can turn a corner: the
// renderer places and rotates every glyph itself, and the ring comes out as
// one line with no joins rather than four sides that meet.

const SVG = 'http://www.w3.org/2000/svg';
// Pixels a second. The duration is worked out from this rather than the other
// way round: one cycle of the pattern is as long as the palette has colors, so
// a fixed duration would run a two-color palette at a fraction of the speed of
// a nine-color one. Speed is what should be the same from palette to palette.
const SPEED = 50;

// How the ring is made, per shape the site is in.
//
//   step    — how long one piece should be, roughly. The exact length is worked
//             out from it so that a whole number of pieces fits the ring.
//   width   — the stroke, from that length: the thickness of the band.
//   cap     — butt gives a piece with square ends that meets its neighbour
//             flush; round turns a piece of no length at all into a dot.
//   dot     — draw points rather than lengths, so the cap is the whole shape.
//   overlap — how far a piece runs past its own slot. 1 is flush.
//   steps   — how many pieces one cycle holds. The colors themselves for boxes
//             and circles; for the bar, the palette blended into far more.
const RING = {
	box: {
		step: 24,
		width: seg => seg,
		cap: 'butt',
	},
	circle: {
		step: 28,
		width: seg => seg * 1.6,     // wider than its spacing, so they overlap
		cap: 'round',
		dot: true,
	},
	bar: {
		// Fine enough that no single piece reads as a piece. At 24px a band of
		// flat color is a step in a staircase; at this size the difference from
		// one to the next is smaller than the eye separates, and the ring reads
		// as one length of color changing along itself.
		step: 9,

		width: () => 24,
		cap: 'butt',

		// A hair over its slot, so neighbours meet under each other rather than
		// against each other. Two dashes that end exactly where the next begins
		// leave a half-transparent hairline between them on a curve — the
		// antialiasing of two edges in the same place — and a ring of those
		// reads as segmented however small the color step is.
		overlap: 1.06,

		// Around 72 pieces to a cycle whatever the palette holds, so a
		// two-color palette gets a long blend between its two and a nine-color
		// one is not drawn three hundred times over.
		steps: colors => blend(colors, Math.max(4, Math.round(72 / colors.length))),
	},
};

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

	const d = railPath(width, height, inset, radius);

	const svg = node('svg', { viewBox: `0 0 ${width} ${height}` });
	ui.track.replaceChildren(svg);

	// The ring is drawn as one path, stroked several times over with a dashed
	// pattern — not as a row of shapes placed along it.
	//
	// Shapes placed one by one leave wedges of daylight on the outside of every
	// corner: a straight thing tangent to a curve cannot meet the next straight
	// thing. A dash follows the path itself, so it bends round the corner and
	// meets its neighbour there as flush as it does on the straight.
	//
	// Each color gets its own copy of the path, dashed to show one piece in
	// every n and phased so it lands in its own slot. Together they tile the
	// ring with nothing between them.
	const spec = RING[getView()] ?? RING.box;
	const colors = spec.steps ? spec.steps(palette.colors) : palette.colors.map(c => c.hex);
	const n = colors.length;

	// One measurement, from a path that is thrown away — a stroke of zero
	// length still has a length to report.
	const probe = node('path', { d, fill: 'none' });
	svg.append(probe);
	const lap = probe.getTotalLength();
	probe.remove();

	if (!lap) return;

	// The whole reason the ring can be endless. The pattern has to divide the
	// circumference exactly, or the piece that meets the start of the path is a
	// part-piece and the join shows at that one corner for ever. So the piece
	// length is not chosen — the number of them is, and the length follows.
	const cycles = Math.max(1, Math.round(lap / (n * spec.step)));
	const seg = lap / (cycles * n);
	const period = seg * n;

	// A dot has no length: the round cap is the whole of it. A box or a band is
	// the length itself, or a little more where the pieces are meant to close
	// over each other rather than meet.
	//
	// The pattern still repeats every period whatever the dash does, so a piece
	// running long borrows from the empty run behind it and the tiling holds.
	const dash = spec.dot ? 0.01 : seg * (spec.overlap ?? 1);

	svg.style.setProperty('--n', n);
	svg.style.setProperty('--travel', `${-period}px`);
	svg.style.setProperty('--lap', `${(period / SPEED).toFixed(3)}s`);

	colors.forEach((hex, i) => {
		const run = node('path', {
			class: 'ring-run',
			d,
			fill: 'none',
			stroke: hex,
			'stroke-width': spec.width(seg),
			'stroke-linecap': spec.cap,
			'stroke-dasharray': `${dash} ${period - dash}`,
		});

		// Which slot this color occupies. CSS turns it into a delay, which is
		// the same thing as a head start along the path — so the phase and the
		// motion are one animation instead of two numbers to keep in step.
		run.style.setProperty('--i', i);

		svg.append(run);
	});
}

// The palette blended into far more colors than it has, wrapping from the last
// back to the first so the ring closes on itself rather than meeting a hard
// edge where the sequence restarts.
//
// Mixed in OKLab, like everything else here: the midpoint between two colors
// has to be the one the eye would call the midpoint, and in RGB it is not.
function blend(colors, steps) {
	const out = [];

	for (let i = 0; i < colors.length; i++) {
		const from = colors[i].oklab;
		const to = colors[(i + 1) % colors.length].oklab;

		for (let s = 0; s < steps; s++) {
			const t = s / steps;

			out.push(oklabToHex({
				l: from.l + (to.l - from.l) * t,
				a: from.a + (to.a - from.a) * t,
				b: from.b + (to.b - from.b) * t,
			}));
		}
	}

	return out;
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

