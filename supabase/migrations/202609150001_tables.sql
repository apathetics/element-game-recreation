create table public.game_rooms (
  code text primary key check (code ~ '^[A-Z2-9]{8}$'),
  version integer not null check (version > 0),
  member_ids uuid[] not null,
  document jsonb not null,
  creator_id uuid not null references auth.users(id) on delete cascade,
  create_request text not null,
  updated_at timestamptz not null default now(),
  unique (creator_id, create_request),
  check (cardinality(member_ids) <= 4),
  check (document->>'code' = code),
  check ((document->>'version')::integer = version)
);

alter table public.game_rooms enable row level security;
revoke all on public.game_rooms from anon, authenticated;
grant select on public.game_rooms to authenticated;
grant all on public.game_rooms to service_role;

create policy "Only seated players can read a table"
on public.game_rooms for select to authenticated
using ((select auth.uid()) = any(member_ids));

create index game_rooms_updated_at on public.game_rooms(updated_at);

comment on table public.game_rooms is
'Private Element tables. Clients can read only their tables. All writes pass through the table Edge Function with rules validation and version checks.';
