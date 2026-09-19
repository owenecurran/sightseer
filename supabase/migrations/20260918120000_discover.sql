-- Discover's two ranked surfaces: places worth going to, and reviews worth
-- reading from outside your own follow graph.
--
-- Replaces get_popular_places as what the Discover tab calls. That function
-- ordered by `count(v.id) desc` — raw review count — while the row it fed
-- led with the RATING STAMP, so a 5.0 with two reviews outranked a 10.0 with
-- one and the list read as broken. Both problems are the same problem: the
-- number deciding the order was not the number on screen.
--
-- get_popular_places is deliberately left in place. It is still the honest
-- answer to "which places have the most reviews", and dropping a function
-- other callers may hold is not worth the saving.

-- How many imaginary average reviews every place is credited with before its
-- own start to count.
--
-- This is the whole of the fix for a one-review place outranking everything.
-- A single 10.0 is not evidence a place is the best in the app; it is one
-- person having a good day. Blending toward the global mean says exactly
-- that, and says it less and less as real reviews accumulate: at three
-- reviews a place is half its own average, at twelve it is four fifths.
--
-- Three rather than ten because the whole app currently holds 29 visits. A
-- prior heavy enough to be statistically comfortable would flatten every
-- place in the table to the mean and rank them all by proximity instead.
-- Worth raising as the corpus grows.
create or replace function public.discover_prior_weight()
returns numeric language sql immutable as $$ select 3::numeric $$;

-- Activity's half-life. A visit posted today counts once; one posted this
-- long ago counts half as much, and so on down. Thirty days is roughly a
-- travel season — long enough that a place does not fall off Discover
-- between weekend trips, short enough that last summer stops deciding it.
create or replace function public.discover_half_life_days()
returns numeric language sql immutable as $$ select 30::numeric $$;

-- Places to go.
--
-- score = blended rating
--       + ACTIVITY  * ln(1 + recent activity)
--       + PROXIMITY * closeness to the viewer
--
-- Additive and on the rating's own 0-10 scale, so the terms can be read
-- against each other: a place can earn at most about 1.2 points for being
-- busy and 1.0 for being near you, which moves a place up the list without
-- letting either override the rating outright. A multiplicative score hides
-- that — you cannot say what a factor of 1.4 is worth.
--
-- security definer for the same reason get_popular_places is: under invoker
-- rights this is silently scoped to the caller's own visible visits, which is
-- wrong for a ranking that claims to be about the whole app. can_view_user_
-- content is still applied per visit inside the aggregation, so a private
-- account's review contributes to no total the viewer could not already see.
create or replace function public.get_discover_places(
  result_limit int default 10,
  -- Where the viewer is, when that is known. Null is the normal case rather
  -- than an error state: most accounts have no home place set and location
  -- permission is not worth prompting for on a browse screen. Null drops the
  -- proximity term to zero for every row, which leaves the ranking to the
  -- rating and the activity — a sensible global list, not a broken one.
  viewer_lat double precision default null,
  viewer_lng double precision default null
)
returns table (
  place_id uuid,
  name text,
  lat double precision,
  lng double precision,
  avg_rating numeric,
  review_count bigint,
  -- Decayed count, so the client can say "busy lately" without re-deriving it.
  recent_activity numeric,
  distance_km double precision,
  score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select v.place_id, v.rating, v.created_at, v.id
    from public.visits v
    where public.can_view_user_content(auth.uid(), v.user_id)
  ),
  -- The mean every place is blended toward. Taken over the same visible set
  -- the places themselves are scored from, so the prior and the evidence are
  -- measured on one population rather than two.
  global as (
    select coalesce(avg(rating), 5)::numeric as mean_rating from visible
  ),
  agg as (
    select
      p.id,
      p.name,
      p.lat,
      p.lng,
      avg(vis.rating)::numeric as avg_rating,
      count(vis.id) as review_count,
      count(vis.rating) as rated_count,
      sum(
        power(
          0.5,
          (extract(epoch from (now() - vis.created_at)) / 86400.0)
            / public.discover_half_life_days()
        )
      )::numeric as recent_activity,
      case
        when viewer_lat is null or viewer_lng is null or p.lat is null or p.lng is null
          then null
        else 2 * 6371 * asin(least(1, sqrt(
          power(sin(radians(p.lat - viewer_lat) / 2), 2)
          + cos(radians(viewer_lat)) * cos(radians(p.lat))
            * power(sin(radians(p.lng - viewer_lng) / 2), 2)
        )))
      end as distance_km
    from public.places p
    join visible vis on vis.place_id = p.id
    -- Restricted to poi/locality so a whole state or country never shows up
    -- as somewhere to go, same as get_popular_places.
    where p.level in ('poi', 'locality')
    group by p.id, p.name, p.lat, p.lng
  )
  select
    agg.id,
    agg.name,
    agg.lat,
    agg.lng,
    round(agg.avg_rating, 2),
    agg.review_count,
    round(agg.recent_activity, 3),
    agg.distance_km,
    round(
      -- Blended rating. rated_count rather than review_count: a visit with no
      -- rating is activity, not evidence about how good the place is, and
      -- counting it here would drag the place toward its own average on the
      -- strength of a review that never gave one.
      (
        coalesce(agg.avg_rating, global.mean_rating) * agg.rated_count
        + global.mean_rating * public.discover_prior_weight()
      ) / (agg.rated_count + public.discover_prior_weight())
      -- Busy lately. Logarithmic, so the tenth recent review is worth far
      -- less than the second — otherwise one place with a burst of activity
      -- owns the list.
      + 1.2 * ln(1 + agg.recent_activity)
      -- Near you. Falls off smoothly over a few hundred kilometres rather
      -- than at a hard radius, so a place does not blink out of Discover
      -- because you crossed a state line.
      --
      -- Cast because distance is double precision and the rest of this sum is
      -- numeric: exp() on a double returns a double, which poisons the whole
      -- expression and leaves round(double, int) — a function Postgres does
      -- not have. It fails at CREATE time, not at call time, so it would have
      -- taken the migration down with it.
      + case
          when agg.distance_km is null then 0
          else (1.0 * exp(-agg.distance_km / 400.0))::numeric
        end,
      4
    ) as score
  from agg cross join global
  order by score desc, agg.review_count desc, agg.name
  limit result_limit;
$$;

-- Reviews to read: what people you do NOT follow have been posting.
--
-- The feed is everyone you follow; this is deliberately its complement, so
-- the two never show the same card. Without that exclusion Discover would
-- mostly re-run the feed, which is the failure mode of every "discover" tab
-- that does not draw the line.
--
-- Invoker rights, unlike the places function above. visits' own RLS is
-- can_view_user_content, so invoker rights already return exactly the set
-- this wants — someone else's review that the viewer is allowed to see. A
-- security definer here would be choosing to re-implement that check by
-- hand, which is how the two drift apart.
--
-- Returns ids and scores rather than rows: the client hydrates them through
-- the same getVisitsByIds path the feed and boards use, so a Discover card
-- is the same postcard with the same likes, tags and photographs rather than
-- a second shape that drifts.
create or replace function public.get_discover_reviews(result_limit int default 10)
returns table (visit_id uuid, score numeric)
language sql
stable
set search_path = public
as $$
  select
    v.id,
    round(
      -- Liked. Logarithmic for the same reason as activity above.
      --
      -- Cast because count() is bigint, and ln() over a bigint resolves to
      -- the double-precision overload rather than the numeric one — which
      -- makes this whole sum a double and leaves round(double, int), which
      -- does not exist. See the same cast in get_discover_places.
      ln((1 + count(l.visit_id))::numeric)
      -- Recent. Weighted heavily, because a discovery surface that shows the
      -- same well-liked review for months is a dead end however good it is.
      + 2.0 * power(
          0.5,
          (extract(epoch from (now() - v.created_at)) / 86400.0)
            / public.discover_half_life_days()
        ),
      4
    ) as score
  from public.visits v
  left join public.likes l on l.visit_id = v.id
  where v.user_id <> auth.uid()
    and not exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.followee_id = v.user_id
        and f.status = 'accepted'
    )
  group by v.id, v.created_at
  order by score desc, v.created_at desc
  limit result_limit;
$$;

grant execute on function public.discover_prior_weight() to authenticated;
grant execute on function public.discover_half_life_days() to authenticated;
grant execute on function public.get_discover_places(int, double precision, double precision) to authenticated;
grant execute on function public.get_discover_reviews(int) to authenticated;
