// db.js — palette storage and queries.
//
// Two backends behind one interface:
//
//   config.js empty    → localStorage. Every screen works with no server.
//   config.js filled   → Supabase.
//
// Nothing else in the project knows which one is running. That is the point:
// the color filter, the gallery and the make screen are written once against
// this interface, and swapping the backend never touches them.
//
// Palette shape crossing this boundary — plain objects, no library types:
//   { id, catalogNo, colorCount, createdAt, ownerId,
//     colors: [{ position, oklab: {l,a,b}, hex, sourceMode }] }

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { distance } from './color.js';
import { seedPalettes } from './seed.js';

const MATCH_CAP = 60;   // SPEC §5: a loose threshold matches half the archive


/* ---------- identity ----------
 *
 * The archive is a catalog, and a catalog holds one entry per thing. Two
 * palettes made of the same colors in the same order are not two entries;
 * they are the same palette registered twice.
 */

// Order is part of it. The same colors in a different arrangement is a
// different palette and the site shows it as one, so the sequence is the key
// rather than the set.
//
// Hex, though OKLab is the source of truth everywhere else in this project.
// Two OKLab triples that differ in the twelfth decimal are the same palette to
// every eye and every screen, and comparing floats for equality would keep
// them apart for ever. The hex is what was actually shown.
function fingerprint(colors) {
	return colors.map(c => c.hex.toLowerCase()).join(' ');
}

// The safety net, not the fix. Palettes already in the database from before
// this rule existed still come back from a query, and this drops the repeats
// on the way to the screen — but the rows are still there. Removing those is
// a job for the SQL editor, since nothing here is allowed to delete.
//
// The oldest of a set is the one kept. Walls arrive newest first, so the newer
// twin is the one in hand; the entry that should survive is the one that was
// in the archive already.
function dedupe(palettes) {
	const oldest = new Map();

	for (const palette of palettes) {
		const key = fingerprint(palette.colors);
		const kept = oldest.get(key);

		if (!kept || palette.createdAt < kept.createdAt) oldest.set(key, palette);
	}

	// Filtered rather than rebuilt from the map, so whatever order the caller
	// asked for survives — the map is only deciding which ids live.
	const live = new Set([...oldest.values()].map(p => p.id));
	return palettes.filter(p => live.has(p.id));
}

// A configuration problem breaks every page the same way, and the pages have
// no shared place to report it. Without this the symptom is an empty screen
// and the cause is only in the console — which is a bug report of "nothing
// works" instead of one naming the setting that is off.
function announce(message) {
	console.error('[db]', message);

	const banner = document.createElement('p');
	banner.className = 'banner';
	banner.setAttribute('role', 'alert');
	banner.textContent = message;

	document.body.prepend(banner);
}


/* ================================================================
   local backend — localStorage
   ================================================================ */

const LS = {
	palettes: 'color-archive:palettes',
	saves: 'color-archive:saves',
	user: 'color-archive:user',
};

function createLocalBackend() {
	let userId = localStorage.getItem(LS.user);
	if (!userId) {
		userId = crypto.randomUUID();
		localStorage.setItem(LS.user, userId);
	}

	if (!localStorage.getItem(LS.palettes)) {
		write(LS.palettes, seedPalettes());
	}

	function read(key, fallback) {
		try {
			return JSON.parse(localStorage.getItem(key)) ?? fallback;
		} catch {
			return fallback;
		}
	}

	function write(key, value) {
		localStorage.setItem(key, JSON.stringify(value));
	}

	function all() {
		// newest first, the resting state of every wall in the site
		return read(LS.palettes, [])
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	return {
		name: 'local',

		async listPalettes({ colorCount } = {}) {
			const rows = all();
			return colorCount ? rows.filter(p => p.colorCount === colorCount) : rows;
		},

		async getPalette(id) {
			return all().find(p => p.id === id) ?? null;
		},

		async listMade() {
			return all().filter(p => p.ownerId === userId);
		},

		async createPalette(colors) {
			const rows = read(LS.palettes, []);

			// Already catalogued → hand back the entry that exists and write
			// nothing. Registering is asking for the palette to be in the
			// archive, and it is; a second row would only be a second name for
			// the same thing.
			const key = fingerprint(colors);
			const twin = rows.find(p => fingerprint(p.colors) === key);
			if (twin) return { ...twin, existing: true };

			const catalogNo = rows.reduce((max, p) => Math.max(max, p.catalogNo), 0) + 1;

			const palette = {
				id: crypto.randomUUID(),
				catalogNo,
				colorCount: colors.length,
				ownerId: userId,
				createdAt: new Date().toISOString(),
				colors: colors.map((c, position) => ({ ...c, position })),
			};

			rows.push(palette);
			write(LS.palettes, rows);
			return palette;
		},

		async listSaved() {
			const ids = new Set(read(LS.saves, []));
			return all().filter(p => ids.has(p.id));
		},

		async isSaved(id) {
			return read(LS.saves, []).includes(id);
		},

		async toggleSave(id) {
			const ids = read(LS.saves, []);
			const at = ids.indexOf(id);

			if (at === -1) ids.push(id);
			else ids.splice(at, 1);

			write(LS.saves, ids);
			return at === -1;
		},

		async candidatesNear(oklab, threshold) {
			// the bounding-box prefilter that SQL does in the other backend
			const { l, a, b } = oklab;
			const out = [];

			for (const palette of all()) {
				for (const color of palette.colors) {
					const c = color.oklab;
					if (Math.abs(c.l - l) <= threshold &&
					    Math.abs(c.a - a) <= threshold &&
					    Math.abs(c.b - b) <= threshold) {
						out.push({ paletteId: palette.id, oklab: c });
					}
				}
			}
			return out;
		},

		async getPalettes(ids) {
			const set = new Set(ids);
			return all().filter(p => set.has(p.id));
		},
	};
}


/* ================================================================
   supabase backend
   ================================================================ */

const SELECT = `
	id, catalog_no, color_count, owner_id, created_at,
	palette_colors ( position, ok_l, ok_a, ok_b, hex, source_mode )
`;

async function createSupabaseBackend() {
	const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
	const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

	// SPEC §4: anonymous ownership — and here it is the ONLY kind. There is no
	// sign-in anywhere in this site. A row in auth.users appears on the first
	// visit and is what owns the palettes you register and the ones you save;
	// nobody is ever asked for an address, so nothing gates making.
	//
	// The cost, accepted deliberately: a shelf belongs to a browser. Clear the
	// site's data or move to another device and it is gone. Carrying a shelf
	// between devices is exactly what an account was for.
	let { data: { session } } = await sb.auth.getSession();

	if (!session) {
		const { data, error } = await sb.auth.signInAnonymously();
		session = data?.session ?? null;

		// Anonymous sign-ins are off in a new Supabase project. Left unreported,
		// the failure surfaces much later as an RLS violation on the first
		// insert — a message that names the wrong problem entirely.
		if (error) {
			announce(
				`Not signed in — ${error.message}. ` +
				'Turn on Authentication → Sign In / Providers → Anonymous sign-ins ' +
				'in the Supabase dashboard, then reload. Until then nothing can be registered.'
			);
		}
	}

	// Mutable, and kept in step with the session. Signing in or out swaps the
	// user underneath us; a value captured once here would keep writing rows
	// as whoever happened to be signed in when the page loaded.
	let userId = session?.user?.id ?? null;

	sb.auth.onAuthStateChange((_event, next) => {
		userId = next?.user?.id ?? null;
	});

	function unwrap({ data, error }) {
		if (error) throw error;
		return data;
	}

	function toPalette(row) {
		return {
			id: row.id,
			catalogNo: row.catalog_no,
			colorCount: row.color_count,
			ownerId: row.owner_id,
			createdAt: row.created_at,
			colors: [...row.palette_colors]
				.sort((x, y) => x.position - y.position)
				.map(c => ({
					position: c.position,
					oklab: { l: c.ok_l, a: c.ok_a, b: c.ok_b },
					hex: c.hex,
					sourceMode: c.source_mode,
				})),
		};
	}

	// Everything that starts on the same color, compared in full afterwards.
	// Position 0 is a cheap first cut and a very selective one, and it is a
	// single round trip: asking the database for "this list, in this order"
	// directly would be a condition per position.
	async function findTwin(colors) {
		const rows = unwrap(await sb.from('palette_colors')
			.select('palette_id')
			.eq('position', 0)
			.eq('hex', colors[0].hex));

		if (!rows.length) return null;

		const key = fingerprint(colors);
		const ids = [...new Set(rows.map(r => r.palette_id))];

		const twins = unwrap(await sb.from('palettes').select(SELECT).in('id', ids))
			.map(toPalette)
			.filter(p => fingerprint(p.colors) === key)
			.sort((x, y) => x.createdAt.localeCompare(y.createdAt));

		return twins[0] ?? null;
	}

	return {
		name: 'supabase',

		async listPalettes({ colorCount, limit = 200 } = {}) {
			let q = sb.from('palettes').select(SELECT)
				.order('created_at', { ascending: false })
				.limit(limit);

			if (colorCount) q = q.eq('color_count', colorCount);
			return unwrap(await q).map(toPalette);
		},

		async getPalette(id) {
			const rows = unwrap(await sb.from('palettes').select(SELECT).eq('id', id));
			return rows.length ? toPalette(rows[0]) : null;
		},

		async listMade() {
			if (!userId) return [];
			return unwrap(await sb.from('palettes').select(SELECT)
				.eq('owner_id', userId)
				.order('created_at', { ascending: false })).map(toPalette);
		},

		async createPalette(colors) {
			// Without a session, RLS rejects the insert and reports a policy
			// violation — true, but it points at the schema instead of at the
			// setting that actually needs changing.
			if (!userId) {
				throw new Error(
					'No session, so this palette has no owner. Turn on Authentication → ' +
					'Sign In / Providers → Anonymous sign-ins in the Supabase dashboard.'
				);
			}

			// Already catalogued → hand back the entry that exists and write
			// nothing. This is a check and then an insert, so two people
			// registering the same palette in the same second can still both
			// get through; a unique constraint in the schema is the only thing
			// that would close that, and it would need a stored fingerprint
			// column to be unique on.
			const twin = await findTwin(colors);
			if (twin) return { ...twin, existing: true };

			const palette = unwrap(await sb.from('palettes')
				.insert({ color_count: colors.length, owner_id: userId })
				.select('id')
				.single());

			unwrap(await sb.from('palette_colors').insert(
				colors.map((c, position) => ({
					palette_id: palette.id,
					position,
					ok_l: c.oklab.l,
					ok_a: c.oklab.a,
					ok_b: c.oklab.b,
					hex: c.hex,
					source_mode: c.sourceMode,
				}))
			));

			return this.getPalette(palette.id);
		},

		async listSaved() {
			if (!userId) return [];
			const rows = unwrap(await sb.from('saves')
				.select(`created_at, palettes ( ${SELECT} )`)
				.eq('user_id', userId)
				.order('created_at', { ascending: false }));

			return rows.map(r => toPalette(r.palettes));
		},

		async isSaved(id) {
			if (!userId) return false;
			const rows = unwrap(await sb.from('saves').select('palette_id')
				.eq('user_id', userId).eq('palette_id', id));
			return rows.length > 0;
		},

		async toggleSave(id) {
			if (await this.isSaved(id)) {
				unwrap(await sb.from('saves').delete()
					.eq('user_id', userId).eq('palette_id', id));
				return false;
			}
			unwrap(await sb.from('saves').insert({ user_id: userId, palette_id: id }));
			return true;
		},

		async candidatesNear({ l, a, b }, t) {
			// SPEC §5 step 2. The index on (ok_l, ok_a, ok_b) makes this cheap;
			// the exact distance in step 3 happens in JS because the true test
			// is a sphere and this is only the cube around it.
			const rows = unwrap(await sb.from('palette_colors')
				.select('palette_id, ok_l, ok_a, ok_b')
				.gte('ok_l', l - t).lte('ok_l', l + t)
				.gte('ok_a', a - t).lte('ok_a', a + t)
				.gte('ok_b', b - t).lte('ok_b', b + t));

			return rows.map(r => ({
				paletteId: r.palette_id,
				oklab: { l: r.ok_l, a: r.ok_a, b: r.ok_b },
			}));
		},

		async getPalettes(ids) {
			if (!ids.length) return [];
			return unwrap(await sb.from('palettes').select(SELECT).in('id', ids))
				.map(toPalette);
		},
	};
}


/* ================================================================
   the shared surface
   ================================================================ */

const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Top-level await: this module finishes loading only once the backend is up,
// so every page that imports db.js is already authenticated by its first line.
const backend = usingSupabase ? await createSupabaseBackend() : createLocalBackend();

export const backendName = backend.name;

// The archive wall, with any repeat already in the database collapsed to the
// one entry. Only here: the shelf is a personal list and shows what its owner
// made or saved, and the color filter counts palettes before it fetches them,
// so hiding one there would leave the count disagreeing with the cards.
export const listPalettes = async (...args) => dedupe(await backend.listPalettes(...args));
export const getPalette = (...args) => backend.getPalette(...args);
export const createPalette = (...args) => backend.createPalette(...args);
export const listMade = (...args) => backend.listMade(...args);
export const listSaved = (...args) => backend.listSaved(...args);
export const isSaved = (...args) => backend.isSaved(...args);
export const toggleSave = (...args) => backend.toggleSave(...args);


// SPEC §5, steps 3–6. The bounding box above is a cube; the real question is a
// sphere inside it, so the corners have to be dropped here. Grouping by palette
// matters because one palette can match on several of its colors.
export async function findPalettesByColor(oklab, threshold, { excludeId } = {}) {
	const candidates = await backend.candidatesNear(oklab, threshold);

	const best = new Map();
	for (const c of candidates) {
		if (c.paletteId === excludeId) continue;

		const d = distance(oklab, c.oklab);
		if (d > threshold) continue;

		const prev = best.get(c.paletteId);
		if (prev === undefined || d < prev) best.set(c.paletteId, d);
	}

	const ranked = [...best.entries()].sort((x, y) => x[1] - y[1]);
	const capped = ranked.slice(0, MATCH_CAP);

	const palettes = await backend.getPalettes(capped.map(([id]) => id));
	const order = new Map(capped.map(([id], i) => [id, i]));

	return {
		// total is the honest count before the cap — the UI says
		// "12 palettes contain this color", and that number must not lie
		total: ranked.length,
		capped: ranked.length > MATCH_CAP,
		palettes: palettes.sort((x, y) => order.get(x.id) - order.get(y.id)),
	};
}
