-- Runs the queue drain on a schedule.
--
-- Every 5 minutes rather than nightly: the queue is already only as big as
-- real activity, so frequent small batches keep scores near-fresh without
-- ever costing much. A nightly job would leave harmony up to a day stale
-- while doing the exact same total work.
--
-- 25 per tick is a deliberate ceiling. refresh_harmony_for_user measured at
-- ~440ms, so a full batch is ~11 seconds of database work -- comfortably
-- inside the interval, with room for the queue to burn down a backlog over
-- several ticks rather than one run trying to do everything.
select cron.schedule(
  'harmony-refresh',
  '*/5 * * * *',
  $$select public.drain_harmony_refresh_queue(25)$$
);
