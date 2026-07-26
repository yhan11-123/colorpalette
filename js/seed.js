// seed.js — starter palettes, used only when the archive is empty.
//
// Written as hex because that is what a human can read and edit. hexToOklab
// runs at load, so from the moment this data enters the app it is OKLab like
// everything else. Hex stays as the display cache, per SPEC §3.1.

import { hexToOklab } from './color.js';

const RAW = [
	['#1B2A41', '#E3D5C8'],
	['#2F3E34', '#8FA07A', '#E6E2D3'],
	['#7A4A3C', '#C98A5E', '#E8D6B8', '#3E5A52'],
	['#3D2C2E', '#6B4E52', '#A67F78', '#D9B08C', '#F2E8DC'],
	['#14213D', '#3E5C76', '#748CAB', '#B0C4D9', '#E0E1DD', '#C1440E'],
	['#0B3C49', '#D9CAB3'],
	['#4A2C2A', '#8C5E58', '#C9A227'],
	['#2B2D42', '#8D99AE', '#EDF2F4', '#EF233C'],
	// two palettes sharing a near-identical color, so the color filter has
	// something to find on a fresh install (BUILD.md step 6 check)
	['#5C6B3F', '#C4B7A6', '#2E2A25'],
	['#5C6B40', '#E8E1D5', '#8A6F4E', '#33302B'],
];

export function seedPalettes() {
	return RAW.map((hexes, i) => ({
		id: `seed-${i + 1}`,
		catalogNo: i + 1,
		colorCount: hexes.length,

		// spaced a minute apart so "newest first" has a stable order to sort by
		createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),

		colors: hexes.map((hex, position) => ({
			position,
			hex,
			oklab: hexToOklab(hex),
			sourceMode: 'picker',
		})),
	}));
}
