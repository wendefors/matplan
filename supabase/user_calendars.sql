-- Flera kalendrar per användare (en rad per kalenderlänk).
create table if not exists public.user_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_ics_url text not null,
  is_active boolean not null default true,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Undvik dubbletter per användare.
create unique index if not exists uq_user_calendars_user_url
on public.user_calendars (user_id, calendar_ics_url);

-- Uppdatera updated_at automatiskt.
create or replace function public.set_user_calendars_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_calendars_updated_at on public.user_calendars;
create trigger trg_user_calendars_updated_at
before update on public.user_calendars
for each row
execute function public.set_user_calendars_updated_at();

alter table public.user_calendars enable row level security;

-- En användare får läsa/ändra sina egna kalenderlänkar.
drop policy if exists user_calendars_select_own on public.user_calendars;
create policy user_calendars_select_own
on public.user_calendars
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_calendars_insert_own on public.user_calendars;
create policy user_calendars_insert_own
on public.user_calendars
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_calendars_update_own on public.user_calendars;
create policy user_calendars_update_own
on public.user_calendars
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_calendars_delete_own on public.user_calendars;
create policy user_calendars_delete_own
on public.user_calendars
for delete
to authenticated
using (auth.uid() = user_id);
