-- Color Archive — Supabase schema.
-- Paste into the SQL editor and run once. From SPEC §4.
--
-- Until this exists, leave js/config.js empty and the site runs on
-- localStorage instead.

create table palettes (
  id            uuid primary key default gen_random_uuid(),
  catalog_no    bigserial unique,          -- display and reference number
  color_count   smallint not null check (color_count >= 2),  -- no upper bound
  owner_id      uuid references auth.users(id),  -- includes anonymous sign-ins
  created_at    timestamptz not null default now()
);

create table palette_colors (
  id            uuid primary key default gen_random_uuid(),
  palette_id    uuid not null references palettes(id) on delete cascade,
  position      smallint not null,          -- 0-based order within the palette
  ok_l          double precision not null,  -- OKLab (source of truth for search/distance)
  ok_a          double precision not null,
  ok_b          double precision not null,
  source_mode   text not null check (source_mode in ('picker','mix','image','archive')),
  hex           text not null,              -- derived cache, for display
  unique (palette_id, position)
);

-- Color distance queries: bounding-box prefilter, then exact distance in the app
create index on palette_colors (ok_l, ok_a, ok_b);

create table saves (
  user_id       uuid not null references auth.users(id),
  palette_id    uuid not null references palettes(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, palette_id)
);


-- ---------------------------------------------------------------
-- Row level security
--
-- Supabase exposes these tables to the browser directly, so without RLS the
-- anon key would let anyone delete the archive. The rules below match the
-- product: the archive is public to read, you may only write your own rows,
-- and saves are private to their owner.
-- ---------------------------------------------------------------

alter table palettes       enable row level security;
alter table palette_colors enable row level security;
alter table saves          enable row level security;

-- the archive is public: anyone, signed in or not, can look
create policy "palettes are readable by everyone"
  on palettes for select using (true);

create policy "palette colors are readable by everyone"
  on palette_colors for select using (true);

-- making is anonymous but still owned — no login wall, no forged authorship
create policy "insert your own palettes"
  on palettes for insert with check (owner_id = auth.uid());

create policy "insert colors into your own palettes"
  on palette_colors for insert with check (
    exists (
      select 1 from palettes p
      where p.id = palette_id and p.owner_id = auth.uid()
    )
  );

-- no update or delete policies: palettes are permanent once registered.
-- "What gets made stays and accumulates."

-- saves are private. There are no public counts, so nobody else may read them.
create policy "read your own saves"
  on saves for select using (user_id = auth.uid());

create policy "create your own saves"
  on saves for insert with check (user_id = auth.uid());

create policy "delete your own saves"
  on saves for delete using (user_id = auth.uid());


-- ---------------------------------------------------------------
-- Note on a difference from SPEC §4.
--
-- The spec's palette_colors carries a `proportion` column with a 5% floor and
-- a sum-to-1.0 rule. This project does not: every color occupies exactly one
-- unit, so a palette is an ordered set of colors and nothing else.
--
-- That removes the whole class of constraint that would otherwise be needed
-- here — no floor check, and no deferred trigger to verify the shares of a
-- multi-row insert add up. Width still means color count; it just no longer
-- means anything else.
-- ---------------------------------------------------------------
