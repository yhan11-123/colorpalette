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

const MAX_EDGE = 900;      // canvas cap — plenty for color, cheap to scan
const SAMPLE_TARGET = 6000;// pixels fed to k-means
const CLUSTERS = 14;       // generous candidate set (SPEC §3.3)
const CANDIDATES = 7;      // how many survive the spread pass
const KMEANS_PASSES = 12;
const LOUPE_ZOOM = 8;


export function mountImageMode({ onPick, onAdd }) {
	const file = document.querySelector('#file');
	const stage = document.querySelector('#stage');
	const canvas = document.querySelector('#canvas');
	const layer = document.querySelector('#candidates');
	const loupe = document.querySelector('#loupe');
	const hint = document.querySelector('#fileHint');

	const picked = document.querySelector('#picked');
	const pickedChip = document.querySelector('#pickedChip');
	const pickedHex = document.querySelector('#pickedHex');
	const pickedAdd = document.querySelector('#pickedAdd');

	if (!file || !canvas) return;

	// Marks the exact point the current color was taken from. Lives inside the
	// candidates layer so it shares the layer's coordinate space, and survives
	// re-marking because markCandidates re-appends it.
	const marker = document.createElement('div');
	marker.className = 'pick-marker';
	marker.hidden = true;

	pickedAdd.addEventListener('click', () => onAdd());

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

	let pixels = null;   // ImageData of the whole canvas

	file.addEventListener('change', async () => {
		const chosen = file.files?.[0];
		if (!chosen) return;

		hint.textContent = 'Reading…';

		try {
			await draw(chosen);
			clearPick();
			markCandidates();
			hint.textContent = 'Click anywhere to take that color. Marked points are suggestions.';
		} catch {
			hint.textContent = 'That file could not be read as an image. Try a JPEG or PNG.';
		}
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

	// One path for both the eyedropper and the suggestion dots, so a color
	// taken either way reports itself the same.
	function take(x, y, dot) {
		const oklab = sample(x, y);

		marker.hidden = false;
		marker.style.left = `${(x / canvas.width) * 100}%`;
		marker.style.top = `${(y / canvas.height) * 100}%`;

		const hex = oklabToHex(oklab);
		pickedChip.style.background = hex;
		pickedHex.textContent = hex;
		picked.hidden = false;

		for (const other of layer.querySelectorAll('.candidate')) {
			other.classList.toggle('is-picked', other === dot);
			other.setAttribute('aria-pressed', String(other === dot));
		}

		onPick(oklab);
	}

	function clearPick() {
		marker.hidden = true;
		picked.hidden = true;
	}


	/* ---------- candidates ---------- */

	function markCandidates() {
		layer.replaceChildren();

		const samples = collectSamples();
		const clusters = kmeans(samples, CLUSTERS);
		const chosen = spreadOut(clusters, CANDIDATES);

		for (const cluster of chosen) {
			const point = nearestSample(samples, cluster.center);

			const dot = document.createElement('button');
			dot.type = 'button';
			dot.className = 'candidate';
			dot.style.left = `${(point.x / canvas.width) * 100}%`;
			dot.style.top = `${(point.y / canvas.height) * 100}%`;
			dot.style.background = oklabToHex(cluster.center);
			dot.setAttribute('aria-label', `Suggested color ${oklabToHex(cluster.center)}`);
			dot.setAttribute('aria-pressed', 'false');

			dot.addEventListener('click', () => take(point.x, point.y, dot));
			layer.append(dot);
		}

		layer.append(marker);   // replaceChildren above dropped it
	}

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
