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

// A shelf with nothing on it is indistinguishable from one that failed to
// load, so it says which. A way out, and no lesson attached.
//
// The saved side no longer tells anyone to press Save: there is no Save button
// on a palette any more, and copy that names a control which is not there is
// worse than none.
function emptyState() {
	const p = document.createElement('p');
	p.className = 'empty';

	p.innerHTML = tab === 'made'
		? 'Nothing made yet. <a href="index.html">Make one</a>.'
		: 'Nothing saved yet.';

	return p;
}

load();
