// make.js — the make screen.
//
// The model, in one line: the tray is the palette, and a *mode* is a way to get
// ONE color into it. Switching modes never disturbs the tray. That is why a
// palette can mix a hand-tuned color with one lifted from a photo, and why the
// next mode will cost almost nothing to add.
//
// Editing happens in OKLCh because that is where lightness, chroma and hue are
// separate axes. Storage stays OKLab. Hex is only ever an output.

import {
	hexToOklab, oklabToHex,
	oklabToOklch, oklchToOklab,
	spread, contrastRatio, isOutOfGamut,
} from './color.js';

import { renderSwatches } from './card.js';
import { createPalette } from './db.js';
import { mountImageMode } from './extract.js';

// No ceiling on color count. Below two there is nothing to combine, so that
// floor stays — it is what makes the thing a palette rather than a color.
const MIN_COLORS = 2;
const MAX_CHROMA = 0.37;     // roughly the top of OKLCh chroma for sRGB


/* ---------- state ---------- */

// A color in the tray: { oklch, sourceMode }
// oklch is kept as the editing form; OKLab and hex are derived on the way out.
// There is no per-color width: one color is one unit, always.
const tray = [];

let selected = null;                                    // index in tray, or null

// Every slider starts at the middle of its own range, so the first screen
// shows the picker at rest rather than at somebody's chosen color.
let draft = { l: 0.5, c: MAX_CHROMA / 2, h: 180 };

let draftSource = 'picker';

const el = id => document.querySelector('#' + id);

const ui = {
	tray: el('tray'), trayHint: el('trayHint'), trayCount: el('trayCount'),
	trayRemoveHint: el('trayRemoveHint'),
	add: el('add'), register: el('register'),
	spreadL: el('spreadL'), spreadC: el('spreadC'), spreadH: el('spreadH'),
	preview: el('preview'), hex: el('hex'), editing: el('editing'),
	sl: el('sl'), sc: el('sc'), sh: el('sh'),
	nl: el('nl'), nc: el('nc'), nh: el('nh'),
	contrast: el('contrast'), gamut: el('gamut'),
	pickerPanel: el('pickerPanel'), imagePanel: el('imagePanel'),
	pickedAdd: el('pickedAdd'),
};


/* ---------- the color currently under the sliders ---------- */

// Either a color already in the tray, or the draft waiting to be added.
// Everything below reads and writes through here, so there is one edit path
// rather than two that can drift apart.
function current() {
	return selected === null ? draft : tray[selected].oklch;
}

function setCurrent(next) {
	if (selected === null) draft = next;
	else tray[selected].oklch = next;
}


/* ---------- render ---------- */

function trayColors() {
	return tray.map(c => {
		const oklab = oklchToOklab(c.oklch);
		return { oklab, hex: oklabToHex(oklab), sourceMode: c.sourceMode };
	});
}

function render() {
	const colors = trayColors();

	renderSwatches(ui.tray, colors, { interactive: true, removable: true });

	// mark the selected swatch — by border and inset, never by hue
	[...ui.tray.children].forEach((node, i) => {
		node.classList.toggle('is-selected', i === selected);
	});

	ui.tray.classList.toggle('is-empty', tray.length === 0);
	ui.trayHint.classList.toggle('is-hidden', tray.length > 0);
	ui.trayCount.textContent = tray.length === 1 ? '1 color' : `${tray.length} colors`;
	ui.trayRemoveHint.textContent = tray.length > 1
		? 'drag to reorder · hover a color to remove it'
		: tray.length ? 'hover a color to remove it' : '';

	// Add is never disabled — color count is not a setting, it is when you stop.
	ui.register.disabled = tray.length < MIN_COLORS;

	renderSpread(colors);
	renderPicker();
}

function renderSpread(colors) {
	// Spread of what is in the tray. The draft is excluded on purpose: this
	// describes the palette, not the color you happen to be holding.
	if (colors.length < 2) {
		ui.spreadL.textContent = ui.spreadC.textContent = ui.spreadH.textContent = '—';
		return;
	}

	const s = spread(colors.map(c => c.oklab));
	ui.spreadL.textContent = s.lightness.toFixed(3);
	ui.spreadC.textContent = s.chroma.toFixed(3);
	ui.spreadH.textContent = `${Math.round(s.hue)}°`;
}

function renderPicker() {
	const { l, c, h } = current();
	const oklab = oklchToOklab({ l, c, h });
	const hex = oklabToHex(oklab);

	ui.preview.style.background = hex;

	// don't fight the user's cursor while they are typing in the field
	if (document.activeElement !== ui.hex) ui.hex.value = hex;

	// The OKLCh coordinates are not printed as a string: the three fields
	// beside the sliders already carry them, and they are editable there.
	setRange(ui.sl, ui.nl, l);
	setRange(ui.sc, ui.nc, c);
	setRange(ui.sh, ui.nh, h);

	// Real color along each axis, so the slider shows the consequence of
	// moving it rather than a generic groove.
	ui.sl.style.background = ramp(i => `oklch(${i / 10} ${c} ${h})`, 10);
	ui.sc.style.background = ramp(i => `oklch(${l} ${(i / 10) * MAX_CHROMA} ${h})`, 10);
	ui.sh.style.background = ramp(i => `oklch(${l} ${Math.max(c, 0.08)} ${i * 30})`, 12);

	ui.editing.textContent = selected === null
		? 'Editing the next color'
		: `Editing color ${selected + 1} — click it again to release`;

	renderReadouts(hex, { l, c, h });
}

function renderReadouts(hex, oklch) {
	const onWhite = contrastRatio(hex, '#ffffff');
	const onBlack = contrastRatio(hex, '#000000');
	const best = Math.max(onWhite, onBlack);

	ui.contrast.textContent =
		`contrast  ${onWhite.toFixed(2)} on white · ${onBlack.toFixed(2)} on black` +
		`  —  ${best >= 4.5 ? 'passes AA for text' : 'text-size AA fails both'}`;

	// Warn instead of clamping. Silently pulling the color back in gamut would
	// leave the slider moving with nothing on screen changing.
	ui.gamut.textContent = isOutOfGamut(oklch)
		? 'Outside sRGB — this screen is showing the nearest color it can.'
		: '';
}

function ramp(at, steps) {
	const stops = Array.from({ length: steps + 1 }, (_, i) => at(i));
	return `linear-gradient(to right, ${stops.join(', ')})`;
}

function setRange(range, number, value) {
	if (document.activeElement !== range) range.value = value;
	if (document.activeElement !== number) number.value = Number(value.toFixed(3));
}


/* ---------- input ---------- */

function bindAxis(range, number, key, max) {
	const apply = v => {
		const next = { ...current(), [key]: Math.min(Math.max(v, 0), max) };
		setCurrent(next);
		render();
	};

	range.addEventListener('input', () => apply(Number(range.value)));
	number.addEventListener('input', () => {
		const v = Number(number.value);
		if (Number.isFinite(v)) apply(v);
	});
}

bindAxis(ui.sl, ui.nl, 'l', 1);
bindAxis(ui.sc, ui.nc, 'c', MAX_CHROMA);
bindAxis(ui.sh, ui.nh, 'h', 360);

// The hex field accepts any CSS color, not just hex. SPEC allows other models
// for input parsing and output notation — just never as the editing model.
ui.hex.addEventListener('change', () => {
	try {
		setCurrent(oklabToOklch(hexToOklab(ui.hex.value.trim())));
		render();
	} catch {
		ui.hex.value = oklabToHex(oklchToOklab(current()));
	}
});

// Only the × is handled on click. Selecting is decided on pointerup instead,
// because by then we know whether the gesture turned out to be a drag.
ui.tray.addEventListener('click', e => {
	const swatch = e.target.closest('.swatch');
	if (swatch && e.target.closest('.swatch__remove')) {
		removeColor(Number(swatch.dataset.index));
	}
});

function removeColor(index) {
	tray.splice(index, 1);

	// Selection is an index, so it has to follow the splice. Getting this
	// wrong would leave the sliders quietly editing a different color.
	if (selected === index) selected = null;
	else if (selected !== null && selected > index) selected--;

	render();
}

// Moving one color past another shifts every index in between, so the
// selection has to be carried along or the sliders end up editing a
// different color than the one that is ringed.
function moveColor(from, to) {
	if (to < 0 || to >= tray.length || to === from) return false;

	const [color] = tray.splice(from, 1);
	tray.splice(to, 0, color);

	if (selected === from) selected = to;
	else if (selected !== null) {
		if (from < selected && to >= selected) selected--;
		else if (from > selected && to <= selected) selected++;
	}

	return true;
}


/* ---------- reordering ---------- */

// Pointer events rather than the HTML5 drag-and-drop API: that API does not
// fire for touch at all, so on a phone the order could never be changed.
const DRAG_SLOP = 4;   // px of travel before a click becomes a drag

let drag = null;

// Every swatch is the same width, so the index under the cursor is arithmetic
// rather than a hit test against each element.
function indexAt(clientX) {
	if (!tray.length) return -1;

	const box = ui.tray.getBoundingClientRect();
	const step = box.width / tray.length;

	return Math.min(Math.max(Math.floor((clientX - box.left) / step), 0), tray.length - 1);
}

ui.tray.addEventListener('pointerdown', e => {
	const swatch = e.target.closest('.swatch');
	if (!swatch || e.target.closest('.swatch__remove')) return;

	drag = { index: Number(swatch.dataset.index), startX: e.clientX, moved: false };

	// Captured on the tray, not on the swatch. Reordering re-renders the
	// swatches, and capture on an element that gets replaced is capture lost
	// halfway through the gesture.
	ui.tray.setPointerCapture(e.pointerId);
});

ui.tray.addEventListener('pointermove', e => {
	if (!drag) return;

	if (!drag.moved && Math.abs(e.clientX - drag.startX) < DRAG_SLOP) return;
	drag.moved = true;

	const target = indexAt(e.clientX);
	if (target !== -1 && moveColor(drag.index, target)) {
		drag.index = target;
		render();   // the color moving under the cursor is the whole feedback
	}
});

ui.tray.addEventListener('pointerup', e => {
	if (!drag) return;

	const { index, moved } = drag;
	drag = null;
	ui.tray.releasePointerCapture(e.pointerId);

	// A gesture that never travelled was a click after all.
	if (!moved) {
		selected = selected === index ? null : index;
		render();
	}
});

ui.tray.addEventListener('pointercancel', () => { drag = null; });

// Dragging is unreachable without a pointer, so the same move is on the arrow
// keys. Focus has to be restored by hand: the swatch that was focused no
// longer exists after a re-render.
ui.tray.addEventListener('keydown', e => {
	if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

	const swatch = e.target.closest('.swatch');
	if (!swatch) return;

	const from = Number(swatch.dataset.index);
	const to = from + (e.key === 'ArrowLeft' ? -1 : 1);
	if (!moveColor(from, to)) return;

	e.preventDefault();
	render();
	ui.tray.children[to]?.querySelector('.swatch__select')?.focus();
});

ui.add.addEventListener('click', () => addColor(draft, draftSource));

function addColor(oklch, sourceMode) {
	tray.push({ oklch: { ...oklch }, sourceMode });

	selected = null;
	render();
}


/* ---------- modes ---------- */

for (const button of document.querySelectorAll('.mode')) {
	button.addEventListener('click', () => {
		const mode = button.dataset.mode;

		for (const other of document.querySelectorAll('.mode')) {
			const on = other === button;
			other.classList.toggle('is-on', on);
			other.setAttribute('aria-pressed', String(on));
		}

		ui.pickerPanel.classList.toggle('is-hidden', mode !== 'picker');
		ui.imagePanel.classList.toggle('is-hidden', mode !== 'image');
	});
}

// Image mode hands back one color at a time, exactly like the sliders do.
// It never fills the tray by itself.
mountImageMode({
	onPick(oklab) {
		draft = oklabToOklch(oklab);
		draftSource = 'image';
		selected = null;
		render();
	},

	onAdd() {
		addColor(draft, draftSource);
	},
});


/* ---------- register ---------- */

ui.register.addEventListener('click', async () => {
	if (tray.length < MIN_COLORS) return;

	ui.register.disabled = true;
	ui.register.textContent = 'Registering…';

	try {
		const palette = await createPalette(trayColors());
		location.href = `palette.html?id=${encodeURIComponent(palette.id)}`;
	} catch (error) {
		// Errors say what happened and what to do, and do not apologise.
		ui.register.textContent = 'Register';
		ui.register.disabled = false;
		ui.gamut.textContent = `Could not register: ${error.message}. The tray is untouched — try again.`;
	}
});


render();
