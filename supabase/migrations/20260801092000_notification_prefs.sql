-- Notification preferences for the new Settings page. Explicit booleans
-- rather than a jsonb blob, matching the app's actual current notifiable
-- events (likes on a visit, comments on a visit, new follow/follow request)
-- rather than an open-ended schema for events that don't exist yet. No push
-- infrastructure exists yet — these are stored preferences only, not wired
-- to anything that sends a notification today. Default true (opt-out), the
-- standard expectation for this kind of toggle.
alter table public.users
  add column notify_likes boolean not null default true,
  add column notify_comments boolean not null default true,
  add column notify_follows boolean not null default true;
