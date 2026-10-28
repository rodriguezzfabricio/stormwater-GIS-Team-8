-- Inspection schema: feature references, append-only inspections, read rules.
-- Design: docs/designs/inspection-database-and-umbc-sign-in.md (file #2).
-- Writes happen only through public.create_inspection (next migration).

-- Helpers the REST API must not expose. Only signed-in users need usage,
-- because the row rules below call private.is_umbc_user().
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- True only for a confirmed, non-anonymous @umbc.edu account. Runs as owner
-- so it can read auth.users; it only ever reveals a fact about the caller.
create or replace function private.is_umbc_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) like '%@umbc.edu'
      and u.email_confirmed_at is not null
      and coalesce(u.is_anonymous, false) = false
  );
$$;

revoke all on function private.is_umbc_user() from public, anon;
grant execute on function private.is_umbc_user() to authenticated;

-- One row per GIS feature that has at least one inspection.
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  source_item text not null
    constraint assets_source_item_check check (source_item ~ '^[0-9a-f]{32}$'),
  layer_id integer not null
    constraint assets_layer_id_check check (layer_id >= 0),
  source_object_id text not null
    constraint assets_source_object_id_check check (source_object_id ~ '^[1-9][0-9]{0,18}$'),
  dataset_version text not null default 'live',
  created_at timestamptz not null default now(),
  constraint assets_feature_key unique (source_item, layer_id, source_object_id, dataset_version)
);

-- Append-only. The id is the client's draft ID, so it has no default.
create table public.inspections (
  id uuid primary key,
  asset_id uuid not null
    references public.assets (id) on delete restrict,
  inspector_id uuid not null
    references auth.users (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  inspection_type text not null
    constraint inspections_inspection_type_check check (
      char_length(inspection_type) between 1 and 120
      and inspection_type = btrim(inspection_type, E' \t\r\n')
    ),
  outcome text not null
    constraint inspections_outcome_check check (outcome in ('pass', 'fail')),
  notes text
    constraint inspections_notes_check check (
      notes is null or char_length(notes) between 1 and 4000
    ),
  displayed_snapshot jsonb not null default '{}'::jsonb
    constraint inspections_displayed_snapshot_check check (
      jsonb_typeof(displayed_snapshot) = 'object'
      and octet_length(displayed_snapshot::text) <= 16384
    )
);

comment on column public.inspections.displayed_snapshot is
  'As displayed in the browser at submission. Not verified against ArcGIS.';

-- Matches my_inspections exactly: caller + feature, newest first.
create index inspections_history_idx
  on public.inspections (inspector_id, asset_id, submitted_at desc, id desc);

alter table public.assets enable row level security;
alter table public.inspections enable row level security;

-- Supabase grants every privilege (including TRUNCATE) to anon and
-- authenticated on new public tables. Remove all of it, grant back SELECT.
revoke all on table public.assets, public.inspections from anon, authenticated;
grant select on table public.assets, public.inspections to authenticated;

-- Sub-selects make each function run once per query, not once per row.
create policy inspections_select_own on public.inspections
  for select to authenticated
  using (
    inspector_id = (select auth.uid())
    and (select private.is_umbc_user())
  );

create policy assets_select_umbc on public.assets
  for select to authenticated
  using ((select private.is_umbc_user()));
