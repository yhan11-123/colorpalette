// test.js — scratch harness for color.js (BUILD.md step 2).
// Not part of the site. Delete once color.js is trusted.

import {
	hexToOklab,
	oklabToHex,
	oklabToOklch,
	oklchToOklab,
	distance,
	spread,
	contrastRatio,
	isOutOfGamut,
} from './color.js';

const out = [];
let failures = 0;

function check(name, passed, detail = '') {
	if (!passed) failures++;
	out.push(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}


/* ---------- 1. hex → OKLab → hex round trip ---------- */
// The whole project sits on this. Every in-gamut sRGB color must come back
// bit-identical; anything else means a conversion is lossy or wrong.

{
	const hexes = [];

	// a deterministic sweep of the sRGB cube — 6×6×6 corners plus the gray axis
	for (let r = 0; r < 256; r += 51)
		for (let g = 0; g < 256; g += 51)
			for (let b = 0; b < 256; b += 51)
				hexes.push(rgbToHex(r, g, b));

	for (let v = 0; v < 256; v += 8) hexes.push(rgbToHex(v, v, v));

	// plus awkward specific values: pure primaries, near-black, near-white
	hexes.push('#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
	           '#010101', '#fefefe', '#7f7f7f', '#c1440e', '#1b2a41');

	const bad = [];
	for (const hex of hexes) {
		const back = oklabToHex(hexToOklab(hex));
		if (back.toLowerCase() !== hex.toLowerCase()) bad.push(`${hex} → ${back}`);
	}

	check(`hex round trip (${hexes.length} colors)`, bad.length === 0,
		bad.length ? bad.slice(0, 5).join(', ') : '');
}


/* ---------- 2. OKLab ↔ OKLCh round trip ---------- */
// Polar/cartesian conversion is where an achromatic color can quietly turn
// into NaN, so gray and black are in the sample on purpose.

{
	const bad = [];
	for (const hex of ['#7A4A3C', '#3E5A52', '#808080', '#000000', '#ffffff', '#C1440E']) {
		const lab = hexToOklab(hex);
		const back = oklchToOklab(oklabToOklch(lab));

		const drift = Math.max(
			Math.abs(lab.l - back.l),
			Math.abs(lab.a - back.a),
			Math.abs(lab.b - back.b),
		);

		// floating point, so exact equality is the wrong test here —
		// but the drift should be far below anything an eye or a query cares about
		if (!(drift < 1e-9)) bad.push(`${hex} drift ${drift}`);
	}
	check('OKLab ↔ OKLCh round trip', bad.length === 0, bad.join(', '));
}


/* ---------- 3. distance ---------- */

{
	const a = hexToOklab('#ff0000');
	const b = hexToOklab('#ff0000');
	const c = hexToOklab('#00ff00');

	check('distance to self is 0', distance(a, b) === 0);
	check('distance is positive between different colors', distance(a, c) > 0);
	check('distance is symmetric', distance(a, c) === distance(c, a));

	// sanity against the thresholds in SPEC §3.2: two colors a human would
	// call "the same" should land under the 0.02 "exactly this color" setting
	const near = distance(hexToOklab('#7A4A3C'), hexToOklab('#7B4B3D'));
	check('near-identical hexes fall under the 0.02 threshold', near < 0.02,
		`got ${near.toFixed(4)}`);
}


/* ---------- 4. hue spread across the 0/360 seam ---------- */
// max - min is wrong for angles. This is the case that catches it.

{
	// two colors ~20° apart, straddling 0°
	const a = oklchToOklab({ l: 0.6, c: 0.15, h: 350 });
	const b = oklchToOklab({ l: 0.6, c: 0.15, h: 10 });

	const s = spread([a, b]);
	check('hue spread wraps at 0/360', Math.abs(s.hue - 20) < 0.5,
		`got ${s.hue.toFixed(2)}, expected ~20`);

	// same two hues far apart the other way round
	const c = oklchToOklab({ l: 0.6, c: 0.15, h: 90 });
	const d = oklchToOklab({ l: 0.6, c: 0.15, h: 270 });
	const s2 = spread([c, d]);
	check('opposite hues spread to 180', Math.abs(s2.hue - 180) < 0.5,
		`got ${s2.hue.toFixed(2)}`);
}


/* ---------- 5. spread ignores achromatic colors for hue ---------- */
// A gray has no hue. If it leaks in as 0°, adding black to a palette would
// inflate hue spread — a number that is visibly wrong but easy to miss.

{
	const colored = [
		oklchToOklab({ l: 0.6, c: 0.15, h: 30 }),
		oklchToOklab({ l: 0.6, c: 0.15, h: 60 }),
	];
	const withGray = [...colored, hexToOklab('#808080'), hexToOklab('#000000')];

	check('gray does not change hue spread',
		Math.abs(spread(colored).hue - spread(withGray).hue) < 0.5,
		`${spread(colored).hue.toFixed(1)} vs ${spread(withGray).hue.toFixed(1)}`);

	check('gray does change lightness spread',
		spread(withGray).lightness > spread(colored).lightness);
}


/* ---------- 6. spread edge cases ---------- */

{
	check('empty palette spreads to zero', spread([]).hue === 0);
	check('single color has no hue spread', spread([hexToOklab('#7A4A3C')]).hue === 0);

	const same = hexToOklab('#7A4A3C');
	const s = spread([same, same]);
	check('identical colors spread to zero',
		s.lightness === 0 && s.chroma === 0 && s.hue === 0);
}


/* ---------- 7. contrast ---------- */

{
	const bw = contrastRatio('#000000', '#ffffff');
	check('black on white is 21:1', Math.abs(bw - 21) < 0.01, `got ${bw.toFixed(2)}`);
	check('a color against itself is 1:1',
		Math.abs(contrastRatio('#7A4A3C', '#7A4A3C') - 1) < 0.01);
}


/* ---------- 8. gamut ---------- */

{
	check('a normal color is in gamut',
		!isOutOfGamut(oklabToOklch(hexToOklab('#7A4A3C'))));

	// chroma well past anything sRGB can show
	check('impossible chroma is out of gamut',
		isOutOfGamut({ l: 0.6, c: 0.4, h: 150 }));
}


/* ---------- report ---------- */

const el = document.querySelector('#results');
el.textContent = out.join('\n');
el.dataset.state = failures ? 'fail' : 'pass';

const summary = failures
	? `\n\n${failures} FAILED — stop here and fix color.js before step 3.`
	: `\n\nall ${out.length} checks passed.`;
el.textContent += summary;

console.log(el.textContent);


function rgbToHex(r, g, b) {
	return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
