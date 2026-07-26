-- seed.sql — starter palettes, for a database that is still empty.
-- Optional. Run once in the SQL editor; safe to skip if you would rather the
-- archive begin with your own first palette.
--
-- owner_id is left null: these belong to nobody, so they appear in the archive
-- but never on anyone shelf. Running here bypasses RLS, which is exactly why
-- the browser could not have inserted them.
--
-- OKLab values are computed from the hex, not typed by hand. Hex is the
-- display cache; the L/a/b columns are what the color filter searches.
--
-- The last two palettes share a near-identical green on purpose, so the color
-- filter has something to find on a fresh database.

with p as (
  insert into palettes (color_count, owner_id) values (2, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.283548::double precision, -0.009264::double precision, -0.046350::double precision, '#1b2a41'),
  (1, 0.880784::double precision, 0.009771::double precision, 0.021370::double precision, '#e3d5c8')
) as v(position, ok_l, ok_a, ok_b, hex);

with p as (
  insert into palettes (color_count, owner_id) values (3, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.347158::double precision, -0.023814::double precision, 0.010790::double precision, '#2f3e34'),
  (1, 0.682072::double precision, -0.034813::double precision, 0.045448::double precision, '#8fa07a'),
  (2, 0.911841::double precision, -0.001623::double precision, 0.020452::double precision, '#e6e2d3')
) as v(position, ok_l, ok_a, ok_b, hex);

with p as (
  insert into palettes (color_count, owner_id) values (4, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.461141::double precision, 0.055638::double precision, 0.041973::double precision, '#7a4a3c'),
  (1, 0.686871::double precision, 0.055455::double precision, 0.080002::double precision, '#c98a5e'),
  (2, 0.883036::double precision, 0.007318::double precision, 0.043998::double precision, '#e8d6b8'),
  (3, 0.442668::double precision, -0.035853::double precision, 0.003185::double precision, '#3e5a52')
) as v(position, ok_l, ok_a, ok_b, hex);

with p as (
  insert into palettes (color_count, owner_id) values (5, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.313543::double precision, 0.024912::double precision, 0.004735::double precision, '#3d2c2e'),
  (1, 0.456099::double precision, 0.039012::double precision, 0.006570::double precision, '#6b4e52'),
  (2, 0.632256::double precision, 0.043105::double precision, 0.025032::double precision, '#a67f78'),
  (3, 0.785055::double precision, 0.031096::double precision, 0.060670::double precision, '#d9b08c'),
  (4, 0.935613::double precision, 0.005803::double precision, 0.018484::double precision, '#f2e8dc')
) as v(position, ok_l, ok_a, ok_b, hex);

with p as (
  insert into palettes (color_count, owner_id) values (6, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.252161::double precision, -0.005874::double precision, -0.055925::double precision, '#14213d'),
  (1, 0.462373::double precision, -0.022953::double precision, -0.050458::double precision, '#3e5c76'),
  (2, 0.632799::double precision, -0.014095::double precision, -0.052557::double precision, '#748cab'),
  (3, 0.811899::double precision, -0.012873::double precision, -0.034574::double precision, '#b0c4d9'),
  (4, 0.907845::double precision, -0.002565::double precision, 0.004837::double precision, '#e0e1dd'),
  (5, 0.555419::double precision, 0.131613::double precision, 0.107806::double precision, '#c1440e')
) as v(position, ok_l, ok_a, ok_b, hex);

with p as (
  insert into palettes (color_count, owner_id) values (2, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.331403::double precision, -0.041569::double precision, -0.034974::double precision, '#0b3c49'),
  (1, 0.845199::double precision, 0.006964::double precision, 0.034658::double precision, '#d9cab3')
) as v(position, ok_l, ok_a, ok_b, hex);

with p as (
  insert into palettes (color_count, owner_id) values (3, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.329916::double precision, 0.041103::double precision, 0.018245::double precision, '#4a2c2a'),
  (1, 0.529592::double precision, 0.054601::double precision, 0.028471::double precision, '#8c5e58'),
  (2, 0.728005::double precision, 0.000659::double precision, 0.137981::double precision, '#c9a227')
) as v(position, ok_l, ok_a, ok_b, hex);

with p as (
  insert into palettes (color_count, owner_id) values (4, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.304926::double precision, 0.006379::double precision, -0.037376::double precision, '#2b2d42'),
  (1, 0.680424::double precision, -0.004906::double precision, -0.033601::double precision, '#8d99ae'),
  (2, 0.957933::double precision, -0.004347::double precision, -0.004119::double precision, '#edf2f4'),
  (3, 0.612240::double precision, 0.213528::double precision, 0.088917::double precision, '#ef233c')
) as v(position, ok_l, ok_a, ok_b, hex);

with p as (
  insert into palettes (color_count, owner_id) values (3, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.503666::double precision, -0.037946::double precision, 0.055972::double precision, '#5c6b3f'),
  (1, 0.785603::double precision, 0.007343::double precision, 0.026830::double precision, '#c4b7a6'),
  (2, 0.287554::double precision, 0.003028::double precision, 0.010219::double precision, '#2e2a25')
) as v(position, ok_l, ok_a, ok_b, hex);

with p as (
  insert into palettes (color_count, owner_id) values (4, null) returning id
)
insert into palette_colors (palette_id, position, ok_l, ok_a, ok_b, source_mode, hex)
select p.id, v.position, v.ok_l, v.ok_a, v.ok_b, 'picker', v.hex from p, (values
  (0, 0.503856::double precision, -0.037489::double precision, 0.054749::double precision, '#5c6b40'),
  (1, 0.911977::double precision, 0.002687::double precision, 0.017619::double precision, '#e8e1d5'),
  (2, 0.559684::double precision, 0.018206::double precision, 0.055324::double precision, '#8a6f4e'),
  (3, 0.310564::double precision, 0.001580::double precision, 0.009604::double precision, '#33302b')
) as v(position, ok_l, ok_a, ok_b, hex);

