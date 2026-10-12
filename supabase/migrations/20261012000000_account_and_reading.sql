-- Deleting an account, and the opt-in report of lines that failed to read.

-- Deletes the signed-in user and, through the foreign keys, everything synced for them
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- Lines the app couldn't read, sent only by users who turn on "Help improve reading". Item names and notes are
-- replaced before sending, and no user id is kept. Nobody can read them back through the API.
create table public.unread_lines (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('food', 'strength', 'cardio')),
  kind text not null check (kind in ('food', 'strength', 'cardio', 'steps', 'water', 'checkin', 'measure')),
  reason text not null check (reason in ('noname', 'needs', 'bad')),
  line text not null check (char_length(line) between 1 and 300),
  engine integer not null
);

alter table public.unread_lines enable row level security;
create policy "Send unread lines" on public.unread_lines for insert to authenticated with check (true);
revoke all on public.unread_lines from anon, authenticated;
grant insert (mode, kind, reason, line, engine) on public.unread_lines to authenticated;
