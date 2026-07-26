-- Additive (OR'd with visits_delete_own): lets an admin actually take action
-- on a report by removing the offending visit, not just view/dismiss it.
create policy "visits_delete_admin" on public.visits
  for delete using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));
