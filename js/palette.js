// palette.js — the detail page, and the one interaction the whole site exists for:
// click a color inside a palette, and every other palette containing it appears.
//
// Give this file the most care. Everything else is scaffolding around it.

import { getPalette, findPalettesByColor, isSaved, toggleSave } from './db.js';
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
	catalog: el('catalog'), save: el('save'),
	large: el('large'), colors: el('colors'),
	preview: el('preview'), copied: el('copied'),
	matchChip: el('matchChip'), matchCount: el('matchCount'),
	matches: el('matches'),
	threshold: el('threshold'), thresholdLabel: el('thresholdLabel'),
};

const id = new URLSearchParams(location.search).get('id');

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

	renderSwatches(ui.large, palette.colors, { interactive: true });
	renderColorList();
	renderCopy();
	renderSaveButton();

	ui.large.addEventListener('click', event => {
		const swatch = event.target.closest('.swatch');
		if (swatch) selectColor(Number(swatch.dataset.index));
	});
}


/* ---------- per color ---------- */

function renderColorList() {
	ui.colors.replaceChildren();

	palette.colors.forEach((color, i) => {
		const row = document.createElement('div');
		row.className = 'color-row';

		const chip = document.createElement('button');
		chip.type = 'button';
		chip.className = 'chip chip--lg';
		chip.style.background = color.hex;
		chip.setAttribute('aria-label', `Find palettes containing ${color.hex}`);
		chip.addEventListener('click', () => selectColor(i));

		const hex = document.createElement('span');
		hex.className = 'num';
		hex.textContent = color.hex;

		const copy = document.createElement('button');
		copy.type = 'button';
		copy.className = 'btn btn--quiet';
		copy.textContent = 'Copy';
		copy.addEventListener('click', () => copyText(color.hex, `${color.hex} copied`));

		row.append(chip, hex, copy);
		ui.colors.append(row);
	});
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


/* ---------- save ---------- */
// Saving, not liking. Private, no public count: a zero next to a palette reads
// as failure, and in an anonymous archive that is a needless wound.

async function renderSaveButton() {
	const saved = await isSaved(palette.id);
	ui.save.textContent = saved ? 'Saved' : 'Save';
	ui.save.classList.toggle('btn--primary', saved);
}

ui.save.addEventListener('click', async () => {
	ui.save.disabled = true;
	await toggleSave(palette.id);
	await renderSaveButton();
	ui.save.disabled = false;
});


/* ---------- the color filter ---------- */

const PROMPT = 'Click a color above to see every other palette that contains it.';

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
