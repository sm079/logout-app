-- Sync: the server keeps what each user typed and sends it to their other devices. It never reads the text.
--
-- Every write goes through sync_push(), which stamps changed rows with the user's next version under a row lock.
-- Pushes for one user therefore commit in version order, and a device that pulls "everything after version N" never
-- misses a row. Rows are compared by the client's updated_at (ms): the newer write wins.

-- One row per user: their change counter and the newest engine version any of their devices has used
create table public.sync_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version bigint not null default 0,
  engine_version integer not null default 0
);

-- One LOG press each: { id, date, time, mode, text, units }, plus a removal mark
create table public.entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  time smallint not null check (time between 0 and 1439),
  mode text not null check (mode in ('food', 'strength', 'cardio')),
  text text not null check (char_length(text) <= 4000),
  units jsonb not null default '{"load":"kg","dist":"km"}',
  updated_at bigint not null,
  deleted boolean not null default false,
  version bigint not null
);
create index entries_user_version on public.entries (user_id, version, id);

-- Item names given new ones: 'food:chiken' -> 'chicken'. A null name is a removed alias.
create table public.aliases (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^(food|strength|cardio):.' and char_length(id) <= 200),
  name text check (char_length(name) <= 200),
  updated_at bigint not null,
  deleted boolean not null default false,
  version bigint not null,
  primary key (user_id, id)
);
create index aliases_user_version on public.aliases (user_id, version, id);

-- The profile (goals, sex, height, units) and the widget picks
create table public.settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key in ('profile', 'widgets')),
  value jsonb not null check (pg_column_size(value) <= 16384),
  updated_at bigint not null,
  version bigint not null,
  primary key (user_id, key)
);
create index settings_user_version on public.settings (user_id, version, key);

-- Each user reads only their own rows, and writes only through sync_push()
alter table public.sync_state enable row level security;
alter table public.entries enable row level security;
alter table public.aliases enable row level security;
alter table public.settings enable row level security;

create policy "Read own sync state" on public.sync_state for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own entries" on public.entries for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own aliases" on public.aliases for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own settings" on public.settings for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.sync_state, public.entries, public.aliases, public.settings from anon, authenticated;
grant select on public.sync_state, public.entries, public.aliases, public.settings to authenticated;

-- Applies a device's changes. Each argument is a JSON array of rows as the device stores them:
--   entries:  { id, date, time, mode, text, units, updatedAt, deleted }
--   aliases:  { id, name, updatedAt, deleted }
--   settings: { key, value, updatedAt }
-- A row only replaces one that isn't newer. Returns the version the changes were stamped with.
create function public.sync_push(
  p_entries jsonb default '[]',
  p_aliases jsonb default '[]',
  p_settings jsonb default '[]',
  p_engine integer default 0
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v bigint;
begin
  if uid is null then
    raise exception 'Sign in to sync' using errcode = '28000';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_typeof(p_aliases) <> 'array' or jsonb_typeof(p_settings) <> 'array' then
    raise exception 'Changes must be arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 1000 or jsonb_array_length(p_aliases) > 1000 or jsonb_array_length(p_settings) > 10 then
    raise exception 'Too many changes at once' using errcode = '54000';
  end if;

  -- The lock that orders this user's pushes
  insert into public.sync_state (user_id) values (uid) on conflict (user_id) do nothing;
  update public.sync_state
    set version = version + 1, engine_version = greatest(engine_version, coalesce(p_engine, 0))
    where user_id = uid
    returning version into v;

  insert into public.entries as t (id, user_id, date, time, mode, text, units, updated_at, deleted, version)
  select (e ->> 'id')::uuid, uid, (e ->> 'date')::date, (e ->> 'time')::smallint, e ->> 'mode', e ->> 'text',
         coalesce(e -> 'units', '{"load":"kg","dist":"km"}'), (e ->> 'updatedAt')::bigint,
         coalesce((e ->> 'deleted')::boolean, false), v
  from jsonb_array_elements(p_entries) as e
  on conflict (id) do update
    set date = excluded.date, time = excluded.time, mode = excluded.mode, text = excluded.text, units = excluded.units,
        updated_at = excluded.updated_at, deleted = excluded.deleted, version = excluded.version
    where t.user_id = uid and t.updated_at <= excluded.updated_at;

  insert into public.aliases as t (user_id, id, name, updated_at, deleted, version)
  select uid, a ->> 'id', a ->> 'name', (a ->> 'updatedAt')::bigint, coalesce((a ->> 'deleted')::boolean, false), v
  from jsonb_array_elements(p_aliases) as a
  on conflict (user_id, id) do update
    set name = excluded.name, updated_at = excluded.updated_at, deleted = excluded.deleted, version = excluded.version
    where t.updated_at <= excluded.updated_at;

  insert into public.settings as t (user_id, key, value, updated_at, version)
  select uid, s ->> 'key', s -> 'value', (s ->> 'updatedAt')::bigint, v
  from jsonb_array_elements(p_settings) as s
  on conflict (user_id, key) do update
    set value = excluded.value, updated_at = excluded.updated_at, version = excluded.version
    where t.updated_at <= excluded.updated_at;

  return v;
end;
$$;

revoke all on function public.sync_push(jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function public.sync_push(jsonb, jsonb, jsonb, integer) to authenticated;
