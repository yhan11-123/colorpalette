// extract.js — image mode.
//
// The lowest-friction way in: point at a photo, take a color out of it.
//
// Two rules shape everything here.
//
// 1. The image never leaves the browser. It is drawn to a canvas, read with
//    getImageData, and dropped. Nothing is uploaded, nothing is stored.
// 2. Auto-extraction is a hint layer, not a button. It marks candidate points
//    and stops. It never fills the palette, because the moment it does, the
//    palette stops being the user's.

import { rgb255ToOklab, oklabToHex, distance } from './color.js';
import { getView, onView } from './view.js';

const MAX_EDGE = 900;      // canvas cap — plenty for color, cheap to scan
const SAMPLE_TARGET = 6000;// pixels fed to k-means
const CLUSTERS = 14;       // generous candidate set (SPEC §3.3)
const CANDIDATES = 7;      // how many survive the spread pass
const KMEANS_PASSES = 12;
const LOUPE_ZOOM = 8;


//   onPick — one color, taken by the eyedropper or by pressing a suggestion.
//            The press is the choice: there is no separate Add here, so what
//            the caller does with this is add it. Rule 2 above still holds —
//            this fires once per press, never per candidate found.
//   onOpen — called when a file arrives while some other mode is showing, so
//            the panel that reads it can be brought up
export function mountImageMode({ onPick, onOpen = () => {} }) {
	const file = document.querySelector('#file');
	const stage = document.querySelector('#stage');
	const canvas = document.querySelector('#canvas');
	const layer = document.querySelector('#candidates');
	const loupe = document.querySelector('#loupe');
	const hint = document.querySelector('#fileHint');

	const extracted = document.querySelector('#extracted');
	const row = document.querySelector('#extractedRow');

	const picked = document.querySelector('#picked');
	const pickedChip = document.querySelector('#pickedChip');
	const pickedHex = document.querySelector('#pickedHex');

	if (!file || !canvas) return;

	// Marks the exact point the current color was taken from. Lives inside the
	// candidates layer so it shares the layer's coordinate space, and survives
	// re-marking because markCandidates re-appends it.
	const marker = document.createElement('div');
	marker.className = 'pick-marker';
	marker.hidden = true;

	// The overlay is positioned in percentages of its own box, so that box has
	// to be the image and nothing else. Measuring the canvas directly makes the
	// alignment independent of how any ancestor is laid out — a stretched flex
	// item silently made the stage wider than the image once already.
	// The canvas is responsive, so re-measure whenever it is resized.
	function syncOverlay() {
		layer.style.width = `${canvas.offsetWidth}px`;
		layer.style.height = `${canvas.offsetHeight}px`;
	}

	new ResizeObserver(syncOverlay).observe(canvas);

	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const loupeCtx = loupe.getContext('2d');
	loupeCtx.imageSmoothingEnabled = false;   // show the pixels, not a blur

	let pixels = null;        // ImageData of the whole canvas
	let candidates = [];      // { x, y, hex } — what the image offered
	let taken = null;         // index of the suggestion being held, if any

	file.addEventListener('change', () => use(file.files?.[0]));


	/* ---------- taking a file ---------- */

	// One path for both ways in — the button, and a file let go of anywhere on
	// the screen.
	async function use(blob) {
		if (!blob) return;

		// The input is filtered by accept=; a drop is filtered by nobody, and
		// a folder or a PDF arrives here looking much the same as a photograph.
		if (!blob.type.startsWith('image/')) {
			hint.textContent = 'That is not an image. Try a JPEG or PNG.';
			return;
		}

		hint.textContent = 'Reading…';

		try {
			await draw(blob);
			clearPick();
			markCandidates();

			// Cleared rather than replaced with instructions. The rings, the
			// loupe following the pointer and the squares below are the whole
			// explanation; a sentence saying the same thing is one more thing
			// to read before touching anything.
			hint.textContent = '';
		} catch {
			hint.textContent = 'That file could not be read as an image. Try a JPEG or PNG.';
		}
	}


	/* ---------- dropping one ---------- */
	//
	// A file dropped on a page is, by default, a request for the browser to
	// open it — which navigates away from the site and takes the tray with it.
	// The default is refused across the whole document for that reason, so a
	// miss costs nothing.
	//
	// The target is the whole screen rather than the image panel. The panel may
	// not even be the one showing, and making someone switch modes before they
	// are allowed to let go of a file is a rule with nothing behind it.

	const zone = document.querySelector('main');

	for (const type of ['dragover', 'drop']) {
		document.addEventListener(type, event => event.preventDefault());
	}

	// Files only. Dragging a selected word across the page is a drag too, and
	// the screen should not offer to take it.
	zone.addEventListener('dragover', event => {
		if (event.dataTransfer?.types.includes('Files')) zone.classList.add('is-dropping');
	});

	// dragleave fires on the way from one child to the next as well, so leaving
	// only counts once the pointer is somewhere outside the zone entirely.
	// relatedTarget is null when it has left the window, which contains() reads
	// as outside — which it is.
	zone.addEventListener('dragleave', event => {
		if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-dropping');
	});

	zone.addEventListener('drop', event => {
		zone.classList.remove('is-dropping');

		const dropped = event.dataTransfer?.files?.[0];
		if (!dropped) return;

		onOpen();
		use(dropped);
	});


	/* ---------- load and draw ---------- */

	async function draw(blob) {
		const url = URL.createObjectURL(blob);

		try {
			const image = await loadImage(url);

			const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
			canvas.width = Math.round(image.width * scale);
			canvas.height = Math.round(image.height * scale);

			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
			pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

			stage.classList.add('has-image');
			syncOverlay();
		} finally {
			// the decoded image is released here; only canvas pixels remain,
			// and those die with the tab
			URL.revokeObjectURL(url);
		}
	}

	function loadImage(url) {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = reject;
			image.src = url;
		});
	}


	/* ---------- sampling ---------- */

	// A 5×5 average, not one pixel. JPEG compression makes neighbouring pixels
	// differ enough that a single-pixel reading of a flat wall is noticeably
	// off from what the eye reports.
	function sample(cx, cy) {
		let r = 0, g = 0, b = 0, n = 0;

		for (let y = cy - 2; y <= cy + 2; y++) {
			for (let x = cx - 2; x <= cx + 2; x++) {
				if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;

				const i = (y * canvas.width + x) * 4;
				r += pixels.data[i];
				g += pixels.data[i + 1];
				b += pixels.data[i + 2];
				n++;
			}
		}

		return rgb255ToOklab(r / n, g / n, b / n);
	}

	function toCanvasCoords(event) {
		const box = canvas.getBoundingClientRect();
		return {
			x: Math.round((event.clientX - box.left) * (canvas.width / box.width)),
			y: Math.round((event.clientY - box.top) * (canvas.height / box.height)),
		};
	}


	/* ---------- eyedropper and loupe ---------- */

	canvas.addEventListener('pointermove', event => {
		if (!pixels) return;

		const { x, y } = toCanvasCoords(event);
		const box = canvas.getBoundingClientRect();

		loupe.style.transform =
			`translate(${event.clientX - box.left}px, ${event.clientY - box.top}px)`;
		loupe.classList.add('is-on');

		const span = loupe.width / LOUPE_ZOOM;
		loupeCtx.clearRect(0, 0, loupe.width, loupe.height);
		loupeCtx.drawImage(
			canvas,
			x - span / 2, y - span / 2, span, span,
			0, 0, loupe.width, loupe.height,
		);

		// crosshair marks the 5×5 the click would actually average
		const size = 5 * LOUPE_ZOOM;
		loupeCtx.strokeStyle = '#fff';
		loupeCtx.lineWidth = 1;
		loupeCtx.strokeRect(
			(loupe.width - size) / 2 + 0.5, (loupe.height - size) / 2 + 0.5,
			size - 1, size - 1,
		);
	});

	canvas.addEventListener('pointerleave', () => loupe.classList.remove('is-on'));

	canvas.addEventListener('click', event => {
		if (!pixels) return;
		const { x, y } = toCanvasCoords(event);
		take(x, y, null);
	});


	/* ---------- picking, and showing what was picked ---------- */

	// One path for the eyedropper, the rings and the squares alike, so a color
	// taken any of the three ways reports itself the same.
	//
	// A suggestion is identified by its index rather than by the element that
	// was pressed, because two elements stand for it — the ring on the image
	// and the square below — and both have to end up saying the same thing.
	function take(x, y, index = null) {
		const oklab = sample(x, y);

		marker.hidden = false;
		marker.style.left = `${(x / canvas.width) * 100}%`;
		marker.style.top = `${(y / canvas.height) * 100}%`;

		const hex = oklabToHex(oklab);
		pickedChip.style.background = hex;
		pickedHex.textContent = hex;
		picked.hidden = false;

		taken = index;
		markTaken();

		// Last, and it is what puts the color in the palette. Everything above
		// is this function saying what it just took; this is it handing it over.
		onPick(oklab);
	}

	function markTaken() {
		for (const node of document.querySelectorAll('[data-candidate]')) {
			const on = taken !== null && Number(node.dataset.candidate) === taken;
			node.classList.toggle('is-picked', on);
			node.setAttribute('aria-pressed', String(on));
		}
	}

	function clearPick() {
		marker.hidden = true;
		picked.hidden = true;
	}


	/* ---------- candidates ---------- */

	// Found once, drawn as often as needed. Reading them out of the image is
	// k-means over several thousand samples; the shape they are drawn in is a
	// preference that can change while the picture stays where it is, and there
	// is no sense in asking the same question of the same pixels again.
	function markCandidates() {
		const samples = collectSamples();
		const clusters = kmeans(samples, CLUSTERS);

		candidates = spreadOut(clusters, CANDIDATES).map(cluster => {
			const point = nearestSample(samples, cluster.center);
			return { x: point.x, y: point.y, hex: oklabToHex(cluster.center) };
		});

		taken = null;
		drawCandidates();
	}

	function drawCandidates() {
		layer.replaceChildren();
		row.replaceChildren();

		const view = getView();

		candidates.forEach(({ x, y, hex }, index) => {
			// Where it was found, on the image.
			const dot = suggestion('candidate', hex, index, x, y);
			dot.style.left = `${(x / canvas.width) * 100}%`;
			dot.style.top = `${(y / canvas.height) * 100}%`;
			layer.append(dot);

			// What was found, off the image.
			const piece = suggestion('extract', hex, index, x, y);

			// In the bar shape the row is one length of color rather than a set
			// of samples set down side by side, so each piece carries the blend
			// into the one after it and the joins between them disappear. The
			// last runs back to the first, which is the only way a row of seven
			// can end without a step.
			if (view === 'bar' && candidates.length > 1) {
				const next = candidates[(index + 1) % candidates.length].hex;
				piece.style.background = `linear-gradient(to right, ${hex}, ${next})`;
			}

			row.append(piece);
		});

		layer.append(marker);   // replaceChildren above dropped it
		extracted.hidden = candidates.length === 0;

		markTaken();
	}

	function suggestion(className, hex, index, x, y) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = className;
		button.dataset.candidate = index;
		button.style.background = hex;
		button.setAttribute('aria-label', `Suggested color ${hex}`);
		button.setAttribute('aria-pressed', 'false');

		button.addEventListener('click', () => take(x, y, index));
		return button;
	}

	// Only the drawing, never the finding.
	onView(drawCandidates);

	function collectSamples() {
		const total = canvas.width * canvas.height;
		const step = Math.max(1, Math.floor(Math.sqrt(total / SAMPLE_TARGET)));
		const out = [];

		for (let y = 0; y < canvas.height; y += step) {
			for (let x = 0; x < canvas.width; x += step) {
				const i = (y * canvas.width + x) * 4;
				if (pixels.data[i + 3] < 250) continue;   // skip transparency

				const lab = rgb255ToOklab(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
				out.push({ x, y, ...lab });
			}
		}
		return out;
	}
}


/* ---------- k-means, in OKLab ---------- */
//
// In OKLab, equal numeric distance means roughly equal perceived difference,
// so clusters land where the eye would put them. The same algorithm in RGB
// splits greens far too finely and lumps blues together.

function kmeans(samples, k) {
	if (samples.length <= k) {
		return samples.map(s => ({ center: { l: s.l, a: s.a, b: s.b }, size: 1 }));
	}

	// k-means++ seeding: spread the starting centers out instead of taking k
	// random pixels, which in a photo of sky would all be the same blue.
	const centers = [pickRandom(samples)];
	while (centers.length < k) {
		const weights = samples.map(s => {
			const d = Math.min(...centers.map(c => distance(s, c)));
			return d * d;
		});
		centers.push(weightedPick(samples, weights));
	}

	let assignment = new Array(samples.length).fill(0);

	for (let pass = 0; pass < KMEANS_PASSES; pass++) {
		let moved = false;

		for (let i = 0; i < samples.length; i++) {
			let best = 0, bestD = Infinity;

			for (let c = 0; c < centers.length; c++) {
				const d = distance(samples[i], centers[c]);
				if (d < bestD) { bestD = d; best = c; }
			}

			if (assignment[i] !== best) { assignment[i] = best; moved = true; }
		}

		const sums = centers.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
		for (let i = 0; i < samples.length; i++) {
			const s = sums[assignment[i]];
			s.l += samples[i].l; s.a += samples[i].a; s.b += samples[i].b; s.n++;
		}

		sums.forEach((s, c) => {
			if (s.n) centers[c] = { l: s.l / s.n, a: s.a / s.n, b: s.b / s.n };
		});

		if (!moved) break;   // converged; more passes cannot change anything
	}

	const sizes = centers.map(() => 0);
	for (const a of assignment) sizes[a]++;

	return centers
		.map((center, i) => ({ center, size: sizes[i] }))
		.filter(c => c.size > 0);
}


// SPEC §3.3: select for spread, not frequency. Taking the most common colors
// out of a forest photo gives five greens. Farthest-point selection instead:
// keep the biggest cluster, then repeatedly take whichever remaining cluster
// is furthest from everything already chosen.
function spreadOut(clusters, count) {
	if (clusters.length <= count) return clusters;

	const pool = [...clusters].sort((a, b) => b.size - a.size);
	const chosen = [pool.shift()];

	while (chosen.length < count && pool.length) {
		let bestIndex = 0, bestDistance = -1;

		pool.forEach((candidate, i) => {
			const d = Math.min(...chosen.map(c => distance(candidate.center, c.center)));
			if (d > bestDistance) { bestDistance = d; bestIndex = i; }
		});

		chosen.push(pool.splice(bestIndex, 1)[0]);
	}

	return chosen;
}


function nearestSample(samples, center) {
	let best = samples[0], bestD = Infinity;

	for (const s of samples) {
		const d = distance(s, center);
		if (d < bestD) { bestD = d; best = s; }
	}
	return best;
}

function pickRandom(list) {
	const s = list[Math.floor(Math.random() * list.length)];
	return { l: s.l, a: s.a, b: s.b };
}

function weightedPick(samples, weights) {
	const total = weights.reduce((a, b) => a + b, 0);
	if (total <= 0) return pickRandom(samples);

	let r = Math.random() * total;
	for (let i = 0; i < samples.length; i++) {
		r -= weights[i];
		if (r <= 0) return { l: samples[i].l, a: samples[i].a, b: samples[i].b };
	}
	return pickRandom(samples);
}
