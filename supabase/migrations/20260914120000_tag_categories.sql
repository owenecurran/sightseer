-- Group the tag vocabulary into categories, and grow it.
--
-- The original seventeen were ordered by a bare sort_order whose own comment
-- admitted what it was doing: "groups related tags together in the picker
-- without imposing a rigid category system". That reads as one long list, and
-- at forty-three tags a long list is unusable — you scroll past the thing you
-- wanted because nothing tells you where it would be.
--
-- A named category per tag, rather than continuing to imply grouping through
-- adjacency alone. The picker renders a heading per group, so the vocabulary
-- can keep growing without the list getting harder to read.
--
-- sort_order stays the single ordering key and is re-laid-out in blocks of a
-- hundred per category. That means the client needs no second column and no
-- opinion about category order: it reads the rows already sorted and starts a
-- new section whenever the category changes. A tag added later slots into its
-- block with a spare number, and there are gaps of ten for exactly that.
--
-- Still a controlled vocabulary — writes remain migration-only, which is what
-- keeps 'kid-friendly' from drifting into 'Kid Friendly' as a second filter.

alter table public.tags
  -- Not null with a default so the column is safe to add to a populated
  -- table; every existing row is given a real value immediately below, and
  -- the default only ever applies to a row inserted without one.
  add column category text not null default 'Other';

-- =========================================================================
-- categorise the existing seventeen
-- =========================================================================

update public.tags set category = 'Scenery & setting', sort_order = 100 where slug = 'perfect-sunset';
update public.tags set category = 'Scenery & setting', sort_order = 110 where slug = 'scenic-location';
update public.tags set category = 'Scenery & setting', sort_order = 120 where slug = 'open-water';
update public.tags set category = 'Scenery & setting', sort_order = 130 where slug = 'great-trails';

update public.tags set category = 'Atmosphere', sort_order = 200 where slug = 'vibe';
update public.tags set category = 'Atmosphere', sort_order = 210 where slug = 'cozy';
update public.tags set category = 'Atmosphere', sort_order = 220 where slug = 'live-music';
update public.tags set category = 'Atmosphere', sort_order = 230 where slug = 'bar';
update public.tags set category = 'Atmosphere', sort_order = 240 where slug = 'night-out';

update public.tags set category = 'Who it suits', sort_order = 300 where slug = 'young-people';
update public.tags set category = 'Who it suits', sort_order = 310 where slug = 'kid-friendly';
update public.tags set category = 'Who it suits', sort_order = 320 where slug = 'pet-friendly';

-- 'walkable' moves out of the scenery block it used to sit in: it is a fact
-- about getting around, not about the view.
update public.tags set category = 'Practical', sort_order = 500 where slug = 'walkable';
update public.tags set category = 'Practical', sort_order = 530 where slug = 'affordable';
update public.tags set category = 'Practical', sort_order = 540 where slug = 'high-end';

update public.tags set category = 'Verdict', sort_order = 600 where slug = 'local-secret';
update public.tags set category = 'Verdict', sort_order = 610 where slug = 'highlight-of-the-city';

-- =========================================================================
-- the new ones
-- =========================================================================
--
-- Chosen to answer questions the existing set could not: what the place
-- physically is (waterfront, green space), what it costs you in effort
-- (book ahead, gets crowded), and whether it was worth it in a way a numeric
-- rating does not capture (underrated, overrated).
--
-- Deliberately no tag that duplicates the rating. 'Amazing' is what the
-- score is for; these describe a place, they do not re-score it.

insert into public.tags (slug, label, category, sort_order) values
  -- Scenery & setting
  ('mountain-views',    'Mountain views',    'Scenery & setting', 140),
  ('waterfront',        'Waterfront',        'Scenery & setting', 150),
  ('green-space',       'Green space',       'Scenery & setting', 160),
  ('wildlife',          'Wildlife',          'Scenery & setting', 170),
  ('stargazing',        'Stargazing',        'Scenery & setting', 180),

  -- Atmosphere
  ('quiet',             'Quiet',             'Atmosphere', 250),
  ('lively',            'Lively',            'Atmosphere', 260),
  ('romantic',          'Romantic',          'Atmosphere', 270),
  ('historic',          'Historic',          'Atmosphere', 280),
  ('artsy',             'Artsy',             'Atmosphere', 290),

  -- Who it suits
  ('solo-friendly',     'Good solo',         'Who it suits', 330),
  ('good-for-groups',   'Good for groups',   'Who it suits', 340),
  ('accessible',        'Step-free access',  'Who it suits', 350),
  ('date-spot',         'Date spot',         'Who it suits', 360),

  -- Food & drink
  ('good-food',         'Good food',         'Food & drink', 400),
  ('good-coffee',       'Good coffee',       'Food & drink', 410),
  ('great-cocktails',   'Great cocktails',   'Food & drink', 420),
  ('local-food',        'Local specialities','Food & drink', 430),

  -- Practical
  ('easy-parking',      'Easy parking',      'Practical', 510),
  ('transit-friendly',  'Easy by transit',   'Practical', 520),
  ('free',              'Free',              'Practical', 550),
  ('gets-crowded',      'Gets crowded',      'Practical', 560),
  ('book-ahead',        'Book ahead',        'Practical', 570),
  ('rainy-day',         'Good in bad weather','Practical', 580),

  -- Verdict
  ('underrated',        'Underrated',        'Verdict', 620),
  ('overrated',         'Overrated',         'Verdict', 630),
  ('worth-the-detour',  'Worth the detour',  'Verdict', 640);

-- The picker reads the whole vocabulary in one go and groups as it walks the
-- rows, so this is the index that matters now rather than sort_order alone.
create index tags_category_sort_idx on public.tags (sort_order);
