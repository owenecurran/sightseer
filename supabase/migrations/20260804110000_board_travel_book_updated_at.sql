-- "Recently edited" sort for boards/travel books needs a real updated_at,
-- bumped both by editing the record itself (rename, description, cover,
-- privacy, ranking) and by adding/removing an item — the latter needs its
-- own trigger since board_items/travel_book_items are separate tables.
-- First updated_at/trigger pattern in this schema (confirmed via grep of
-- every prior migration — none exists yet).
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.boards add column updated_at timestamptz not null default now();
alter table public.travel_books add column updated_at timestamptz not null default now();

create trigger boards_set_updated_at
  before update on public.boards
  for each row execute function public.set_updated_at();

create trigger travel_books_set_updated_at
  before update on public.travel_books
  for each row execute function public.set_updated_at();

-- Item add/remove counts as "edited" too. travel_book_items can be
-- inserted/deleted by any participant (owner OR collaborator, per
-- travel_book_items_insert/_delete), but travel_books_update_own is
-- owner-only — this trigger must be security definer, or a collaborator
-- adding an item would silently fail to bump the parent's updated_at.
create function public.touch_board_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.boards set updated_at = now() where id = coalesce(new.board_id, old.board_id);
  return coalesce(new, old);
end;
$$;

create trigger board_items_touch_board
  after insert or delete on public.board_items
  for each row execute function public.touch_board_updated_at();

create function public.touch_travel_book_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.travel_books set updated_at = now() where id = coalesce(new.travel_book_id, old.travel_book_id);
  return coalesce(new, old);
end;
$$;

create trigger travel_book_items_touch_book
  after insert or delete on public.travel_book_items
  for each row execute function public.touch_travel_book_updated_at();
