-- articles.author_id was ON DELETE RESTRICT, which made any admin who had
-- written an article permanently undeletable — the delete would fail on the
-- foreign key rather than doing anything useful. RESTRICT was the right
-- instinct (an article should not silently vanish because its author left)
-- but the wrong mechanism: it protected the article by blocking the person.
--
-- SET NULL keeps the article and drops the authorship, which is what
-- "delete my account" should mean for content that outlives the account.
-- Every other reference to users already cascades.
alter table public.articles
  drop constraint articles_author_id_fkey;

alter table public.articles
  add constraint articles_author_id_fkey
  foreign key (author_id) references public.users (id) on delete set null;

-- The column has to accept the null it can now receive.
alter table public.articles
  alter column author_id drop not null;
