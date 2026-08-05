// archive.js — the gallery. A wall of palettes, newest first.
//
// Sorting is deliberately single-axis: discovery happens through the color
// filter on the detail page, not through sort options. Newest-first is just
// the resting state that answers "what just arrived".
//
// The view buttons are not a filter. They change how the same palettes are
// drawn, and nothing is ever removed from the wall by pressing one.
//
// They are also no longer only about this wall. What is chosen here is the
// shape the whole site draws colors in — see view.js — so these three buttons
// are the site's one setting, and this page is where it is kept.

import { listPalettes } from './db.js';
import { renderWall } from './card.js';
import { getView, setView, onView } from './view.js';

const wall = document.querySelector('#wall');
const count = document.querySelector('#count');
const segs = [...document.querySelectorAll('[data-view]')];

// The wall itself is not touched. Every view draws the same cards from the same
// data, and which one is showing is answered by the attribute view.js keeps on
// the root element — so switching is a CSS question, never a re-render.
function markPressed() {
	for (const seg of segs) {
		seg.setAttribute('aria-pressed', String(seg.dataset.view === getView()));
	}
}

for (const seg of segs) {
	seg.addEventListener('click', () => setView(seg.dataset.view));
}

onView(markPressed);
markPressed();


async function load() {
	const palettes = await listPalettes();

	renderWall(wall, palettes, { empty: emptyState() });

	count.textContent = palettes.length === 1
		? '1 palette'
		: `${palettes.length} palettes`;
}

// The one place a sentence is still worth its space: a wall with nothing on it
// is indistinguishable from a wall that failed to load. A way out, and no
// lesson attached.
function emptyState() {
	const el = document.createElement('p');
	el.className = 'empty';
	el.innerHTML = 'Nothing here yet. <a href="index.html">Make one</a>.';
	return el;
}

load();
