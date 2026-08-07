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
import { mountImageMode } from './extract.js';
import { getView, onView } from './view.js';

// Started with the page, deliberately not awaited.
//
// db.js does not finish loading until the database is reachable: it pulls the
// client off a CDN and opens an anonymous session, both at the top level of the
// module. A plain import here would put that in front of everything below it,
// because a module body does not run until its imports have finished — so on a
// cold load the whole screen sat unpainted for as long as the network took, the
// three sliders showing their bare grey instead of the colors they are for.
//
// Nothing on this screen needs a database until Register is pressed. The
// request goes out with the page and is waited for there, by which time it has
// almost always long since landed.
const database = import('./db.js');

// No ceiling on color count. Below two there is nothing to combine, so that
// floor stays — it is what makes the thing a palette rather than a color.
const MIN_COLORS = 2;
const MAX_CHROMA = 0.37;     // roughly the top of OKLCh chroma for sRGB

// How finely the smooth gradient is sampled. Only for the bar, where the stops
// are interpolated between and the count decides accuracy rather than choice.
// Hue gets more of them because it is a full turn rather than a range.
const AXIS_STEPS = 16;
const HUE_STEPS = 24;

// How far a dot lies on the one before it, as a share of its own width.
//
// Deeper than the three tenths the archive overlaps a palette by, and for a
// reason the archive does not have: a card holds a handful of colors and the
// overlap is there to say they belong together, while an axis is a continuum
// being offered in pieces, and the more pieces it is cut into the closer it
// stays to the thing it stands for.
//
// Two fifths rather than a half, which was too close to run: at half-cover the
// row read as one thick line with scalloped edges instead of as circles lying
// on each other. This is the most that can be taken while each one is still
// plainly a circle.
const DOT_OVERLAP = 0.4;

// Fallback track height, for measuring before there is anything to measure.
const DOT = 24;


/* ---------- state ---------- */

// A color in the tray: { oklch, sourceMode }
// oklch is kept as the editing form; OKLab and hex are derived on the way out.
// There is no per-color width: one color is one unit, always.
const tray = [];

let selected = null;                                    // index in tray, or null

// The color under the sliders and not yet in the tray. Only precision mode has
// one: sliders move through every color between where they started and where
// they stopped, so there has to be somewhere to hold one that has not been
// chosen yet. Image mode picks by pressing, which is already a decision, and
// goes straight into the tray without passing through here.
//
// Every slider starts at the middle of its own range, so the first screen
// shows the picker at rest rather than at somebody's chosen color.
let draft = { l: 0.5, c: MAX_CHROMA / 2, h: 180 };

const el = id => document.querySelector('#' + id);

const ui = {
	tray: el('tray'), trayCount: el('trayCount'),
	add: el('add'), register: el('register'), registerNote: el('registerNote'),
	spreadL: el('spreadL'), spreadC: el('spreadC'), spreadH: el('spreadH'),
	preview: el('preview'), hex: el('hex'), editing: el('editing'),
	sl: el('sl'), sc: el('sc'), sh: el('sh'),
	nl: el('nl'), nc: el('nc'), nh: el('nh'),
	contrast: el('contrast'), gamut: el('gamut'),
	pickerPanel: el('pickerPanel'), imagePanel: el('imagePanel'),
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
	ui.trayCount.textContent = tray.length === 1 ? '1 color' : `${tray.length} colors`;

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
	// moving it rather than a generic groove — and in whatever shape the site
	// is in, so what an axis offers and what the archive is made of are the
	// same thing.
	axis(ui.sl, t => `oklch(${t} ${c} ${h})`, AXIS_STEPS);
	axis(ui.sc, t => `oklch(${l} ${t * MAX_CHROMA} ${h})`, AXIS_STEPS);
	axis(ui.sh, t => `oklch(${l} ${Math.max(c, 0.08)} ${t * 360})`, HUE_STEPS);

	// Which color the sliders are holding, and nothing about how to let go of
	// it. Empty when it is a new one, because then there is nothing to name.
	ui.editing.textContent = selected === null ? '' : `Color ${selected + 1}`;

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

// Paints one axis, and decides what may be taken from it.
//
// The two go together. A bar of unbroken color has to be pickable anywhere, or
// it is showing colors it will not give; a row of squares has to snap, or the
// squares are decoration over a continuum. So the picture and the step are set
// in the same breath and cannot come apart.
function axis(range, at, sampled) {
	const view = getView();

	const width = range.getBoundingClientRect().width;

	// A square fills the track: it is the groove, drawn in color, and its side
	// is the whole height including the border it is painted under.
	const square = range.getBoundingClientRect().height || DOT;

	// A circle sits in the track instead. Made the full height it meets the
	// border at the top and at the bottom, and a line drawn straight across
	// both ends of a circle is a circle with its ends cut off. clientHeight is
	// the inside of the groove, and it comes down a further hair so there is
	// daylight above and below rather than a join.
	const dot = Math.max(8, (range.clientHeight || DOT) - 2);

	// Circles sit closer together than they are wide, so they lie on each
	// other; squares sit exactly as far apart as they are wide, so they meet.
	const pitch = view === 'circle' ? dot * (1 - DOT_OVERLAP) : square;

	const steps = view === 'bar' ? sampled : cellsAcross(width, pitch, sampled);
	const span = Number(range.max) - Number(range.min);

	// Fine enough to be continuous at any width the slider can have. Restored
	// on the way back from a stepped shape, not left where that shape put it.
	range.step = view === 'bar' ? span / 1000 : span / steps;

	range.style.background = track(at, steps, view, dot / 2);
}

// A square is as wide as it is tall, so how many an axis holds is not a number
// to choose — it is however many fit. The count follows the track, which is why
// it is measured rather than set: a fixed count would draw squares at one
// window width and rectangles at every other.
function cellsAcross(width, pitch, fallback) {
	// Before layout, or on a hidden panel. Nothing to divide.
	if (!width || !pitch) return fallback;

	// Neither so few that the axis stops being an axis, nor so many that the
	// track is being asked to draw more than it can show. The ceiling is high
	// because overlapping circles are spaced far closer than they are wide —
	// what has to stay legible is the circle, not the step between two.
	return Math.min(96, Math.max(6, Math.round(width / pitch)));
}

// t runs 0 to 1 across the axis, so the same callback serves every shape and
// the number of colors is the only thing that changes.
function track(at, steps, view, radius) {
	const colors = Array.from({ length: steps + 1 }, (_, i) => at(i / steps));

	if (view === 'bar') {
		return `linear-gradient(to right, ${colors.join(', ')})`;
	}

	if (view === 'circle') {
		// One dot per color, centred where the thumb comes to rest, each lying
		// on the one before it — the same overlap the archive draws a palette
		// with when it is in this shape.
		//
		// The radius is stated rather than left to closest-side. Closest-side
		// measures to the nearest edge of the box, and for the dot sitting at
		// one end of the track that edge is the end itself: radius nothing, dot
		// gone. The first and last colors of every axis were missing.
		const dots = colors.map((color, i) => {
			const at = ((i / steps) * 100).toFixed(3);
			return `radial-gradient(circle ${radius}px at ${at}% 50%, ${color} 96%, transparent 100%)`;
		});

		// Reversed, because the first layer in the list is the one painted on
		// top. Left as written, each dot would be covered by the one to its
		// left and the row would read backwards against the axis it describes.
		dots.reverse();

		// Underneath everything, so what shows between the dots is the groove
		// they are lying in rather than the panel behind it.
		return `${dots.join(', ')}, var(--surface-sunk)`;
	}

	// Squares, meeting flush. Each color holds the strip nearest to it rather
	// than the strip between it and the next, so a square is the ground the
	// thumb lands on and its middle is where the thumb sits. The two on the
	// ends are half that width, being the ends.
	const edge = i => `${(((i + 0.5) / steps) * 100).toFixed(3)}%`;

	const cells = colors.map((color, i) => {
		const from = i === 0 ? '0%' : edge(i - 1);
		const to = i === steps ? '100%' : edge(i);
		return `${color} ${from} ${to}`;
	});

	return `linear-gradient(to right, ${cells.join(', ')})`;
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

// The one place a slider-tuned color is declared finished. Image mode has no
// equivalent because pressing a point on a photograph already is one.
ui.add.addEventListener('click', () => addColor(draft, 'picker'));

function addColor(oklch, sourceMode) {
	tray.push({ oklch: { ...oklch }, sourceMode });

	selected = null;
	render();
}


/* ---------- modes ---------- */

// Lifted out of the click handler because switching modes is not only
// something a button does: a photograph dropped on the page has to bring the
// panel that reads photographs with it.
function setMode(mode) {
	for (const button of document.querySelectorAll('.mode')) {
		const on = button.dataset.mode === mode;
		button.classList.toggle('is-on', on);
		button.setAttribute('aria-pressed', String(on));
	}

	ui.pickerPanel.classList.toggle('is-hidden', mode !== 'picker');
	ui.imagePanel.classList.toggle('is-hidden', mode !== 'image');
}

for (const button of document.querySelectorAll('.mode')) {
	button.addEventListener('click', () => setMode(button.dataset.mode));
}

// Image mode hands back one color at a time, and each one goes straight into
// the tray. Rule 2 of extract.js still holds — the photograph never fills the
// palette by itself; every color in here was pressed for.
//
// It does not become the selected color. Selecting hands the sliders to it, and
// the sliders are on the other panel: a press on the photograph would silently
// re-aim a set of controls that is not on screen, and the next visit to
// precision mode would open on a color the user thought they had finished with.
mountImageMode({
	onPick(oklab) {
		addColor(oklabToOklch(oklab), 'image');
	},

	onOpen() {
		setMode('image');
	},
});


/* ---------- register ---------- */

ui.register.addEventListener('click', async () => {
	if (tray.length < MIN_COLORS) return;

	ui.register.disabled = true;
	ui.register.textContent = 'Registering…';
	ui.registerNote.textContent = '';

	try {
		// Where the wait for the database actually belongs: at the one moment
		// something is being asked of it, with the button already saying so.
		const { createPalette } = await database;

		const palette = await createPalette(trayColors());

		// The archive already held this exact palette, so nothing was written
		// and this is the entry that was there. Say so on arrival: landing on
		// a catalog number from months ago with no explanation reads as the
		// button having gone wrong.
		const twin = palette.existing ? '&twin=1' : '';

		location.href = `palette.html?id=${encodeURIComponent(palette.id)}${twin}`;
	} catch (error) {
		// Errors say what happened and what to do, and do not apologise. Beside
		// the button that failed, not inside the precision panel: that panel is
		// hidden whenever image mode is open, and this went unread there.
		ui.register.textContent = 'Register';
		ui.register.disabled = false;
		ui.registerNote.textContent =
			`Could not register: ${error.message}. The tray is untouched — try again.`;
	}
});


// The axes are painted in the shape the site is in, and that shape is chosen on
// another screen — so a visit that begins here has to be able to change under
// it. Nothing about the color being held changes; only what the axis offers.
onView(render);

// A square axis is measured against its own track, so a track that changes
// width has to be counted again — otherwise the squares stretch into rectangles
// the moment the window does.
new ResizeObserver(() => renderPicker()).observe(ui.sl);

render();
