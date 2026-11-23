-- Keep the ban check and require access to the review for new interactions.
alter policy comments_insert on public.comments with check (
  auth.uid() = user_id and not public.is_banned(auth.uid())
  and exists (
    select 1 from public.visits v
    where v.id = comments.visit_id and public.can_view_user_content(auth.uid(), v.user_id)
  )
);

alter policy likes_insert_own on public.likes with check (
  auth.uid() = user_id and not public.is_banned(auth.uid())
  and exists (
    select 1 from public.visits v
    where v.id = likes.visit_id and public.can_view_user_content(auth.uid(), v.user_id)
  )
);

-- The owning travel book establishes authorship for existing recaps as well.
update public.travel_book_recaps r
set author_id = b.user_id
from public.travel_books b
where r.travel_book_id = b.id and r.author_id is distinct from b.user_id;

alter policy travel_book_recaps_update_owner on public.travel_book_recaps with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.travel_books b where b.id = travel_book_id and b.user_id = auth.uid()
  )
);

revoke update on public.travel_book_recaps from public, anon, authenticated;
grant update (title, body, rating, cover_r2_key, is_published, published_at)
  on public.travel_book_recaps to authenticated;
