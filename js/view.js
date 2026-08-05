// view.js — the one choice that shapes the whole site.
//
// Box, circle and bar began as three ways of drawing the wall. They are now the
// shape the site is made of: colors are offered in it on the make screen, an
// image suggests them in it, and the ring travelling round a palette is built
// out of it. Choosing one is choosing how this archive draws a color.
//
// The choice lives in one place for two reasons. It has to survive leaving the
// site — a way of looking is not a one-off action — and every screen has to
// read the same answer, or the site would disagree with itself between pages.
//
// It is published as an attribute on the root element rather than as a class on
// each thing that cares. CSS can then answer for whole screens at once, and any
// rule anywhere can ask what shape it is in without being wired to anything.

export const VIEWS = ['box', 'circle', 'bar'];

const KEY = 'color-archive:view';

const listeners = new Set();

let current = stored();

publish();


function stored() {
	// Anything unrecognised — an older release's name, a hand-edited value —
	// falls back rather than leaving the site in a shape it cannot draw.
	const saved = localStorage.getItem(KEY);
	return VIEWS.includes(saved) ? saved : 'box';
}

function publish() {
	document.documentElement.dataset.view = current;
}


export function getView() {
	return current;
}

export function setView(view) {
	if (!VIEWS.includes(view) || view === current) return;

	current = view;
	localStorage.setItem(KEY, current);
	publish();

	// Told after the attribute is set, so anything a listener measures is
	// measuring the page in its new shape.
	for (const listener of listeners) listener(current);
}

// For the parts that cannot be redrawn by CSS alone — a ring of elements has to
// be rebuilt when the shape it is made of changes.
export function onView(listener) {
	listeners.add(listener);
}
