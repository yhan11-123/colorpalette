// archive.js — the gallery. A wall of palettes, newest first.
//
// Sorting is deliberately single-axis: discovery happens through the color
// filter on the detail page, not through sort options. Newest-first is just
// the resting state that answers "what just arrived".
//
// The view buttons are not a filter. They change how the same palettes are
// drawn, and nothing is ever removed from the wall by pressing one.

import { listPalettes } from './db.js';
import { renderWall } from './card.js';

const VIEWS = ['box', 'circle', 'bar'];
const VIEW_KEY = 'color-archive:view';

const wall = document.querySelector('#wall');
const count = document.querySelector('#count');
const segs = [...document.querySelectorAll('[data-view]')];

// Switching view is a CSS class swap on the wall — the cards themselves are
// identical in all three. That is why this never refetches or re-renders.
function setView(view) {
	for (const name of VIEWS) wall.classList.toggle(`wall--${name}`, name === view);

	for (const seg of segs) {
		seg.setAttribute('aria-pressed', String(seg.dataset.view === view));
	}

	localStorage.setItem(VIEW_KEY, view);
}

for (const seg of segs) {
	seg.addEventListener('click', () => setView(seg.dataset.view));
}

// A view is a way of looking, not a one-off action, so it should still be the
// way you were looking when you come back.
const saved = localStorage.getItem(VIEW_KEY);
setView(VIEWS.includes(saved) ? saved : 'box');


async function load() {
	const palettes = await listPalettes();

	renderWall(wall, palettes, { empty: emptyState() });

	count.textContent = palettes.length === 1
		? '1 palette'
		: `${palettes.length} palettes`;
}

// An empty screen is an invitation to act, not a notice that something is
// missing — so this says how to fill it rather than that it is empty.
function emptyState() {
	const el = document.createElement('p');
	el.className = 'empty';
	el.innerHTML = 'The archive starts with your first palette. <a href="index.html">Make one</a>.';
	return el;
}

load();
