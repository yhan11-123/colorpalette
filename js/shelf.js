// shelf.js — a personal place.
//
// Not a new screen: the gallery with a filter applied. Same card, same unit,
// same wall. Two tabs — what you made, what you saved.
//
// Saving is private. There is no public count anywhere in this file, and that
// is deliberate: a popularity number competes with color for attention, and
// people go look at the number.

import { listMade, listSaved } from './db.js';
import { renderWall } from './card.js';

const wall = document.querySelector('#wall');
const count = document.querySelector('#count');

let tab = 'made';

bind('[data-tab]', button => { tab = button.dataset.tab; });

function bind(selector, apply) {
	const group = [...document.querySelectorAll(selector)];

	for (const button of group) {
		button.addEventListener('click', () => {
			apply(button);
			for (const other of group) {
				other.setAttribute('aria-pressed', String(other === button));
			}
			load();
		});
	}
}

async function load() {
	const palettes = tab === 'made' ? await listMade() : await listSaved();

	renderWall(wall, palettes, { empty: emptyState() });

	count.textContent = palettes.length === 1
		? '1 palette'
		: `${palettes.length} palettes`;
}

// Not "no saved palettes" — how to get one. An empty screen is an invitation.
function emptyState() {
	const p = document.createElement('p');
	p.className = 'empty';

	p.innerHTML = tab === 'made'
		? 'Nothing made yet. <a href="index.html">Build a palette</a> — two colors is enough.'
		: 'Nothing saved yet. Open any palette in the <a href="archive.html">archive</a> and press Save.';

	return p;
}

load();
