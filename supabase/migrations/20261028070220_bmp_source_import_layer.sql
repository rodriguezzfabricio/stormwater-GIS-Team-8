-- Point both functions at the BMP layer the map actually shows:
-- UMBC_BMP_ArcGIS_Import, item 5d70e438bb6045d6b3af05aee061e3cd, layer 0
-- (docs/spec/v1.md A1, A2). It replaces item cc6a7a27c267435c8f7ed95a59eb5f24
-- layer 3. Rows saved against the old layer stay unchanged (A3); after this,
-- my_inspections refuses that source like any other, so no page shows them.
-- Contract-Version 2 (supabase/CONTRACT.md). Only the constants and the
-- my_inspections source check change; everything else matches
-- 20261028024553_inspection_functions.sql.

create or replace function public.create_inspection(
  p_draft_id uuid,
  p_source_item text,
  p_layer_id integer,
  p_object_id text,
  p_inspection_type text,
  p_outcome text,
  p_notes text default null,
  p_displayed_snapshot jsonb default '{}'::jsonb
)
returns table (id uuid, asset_id uuid, submitted_at timestamptz, replayed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_source_item constant text := '5d70e438bb6045d6b3af05aee061e3cd';
  c_layer_id constant integer := 0;
  c_dataset_version constant text := 'live';
  c_whitespace constant text := E' \t\r\n';
  v_uid uuid := auth.uid();
  v_type text;
  v_outcome text;
  v_notes text;
  v_snapshot jsonb;
  v_object_id text;
  v_asset_id uuid;
  v_row public.inspections%rowtype;
begin
  -- 1. Who is calling.
  if v_uid is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not private.is_umbc_user() then
    raise exception using errcode = '42501', message = 'forbidden_domain',
      detail = 'Only confirmed @umbc.edu accounts can save inspections.';
  end if;

  -- 2. Clean up the inputs.
  v_type := btrim(coalesce(p_inspection_type, ''), c_whitespace);
  v_outcome := lower(btrim(coalesce(p_outcome, ''), c_whitespace));
  v_notes := nullif(btrim(coalesce(p_notes, ''), c_whitespace), '');
  v_snapshot := coalesce(p_displayed_snapshot, '{}'::jsonb);
  v_object_id := btrim(coalesce(p_object_id, ''), c_whitespace);

  -- 3. Validate; each failure names its field.
  if p_draft_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_input:draft_id';
  end if;
  if char_length(v_type) not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'invalid_input:inspection_type';
  end if;
  if v_outcome not in ('pass', 'fail') then
    raise exception using errcode = 'P0001', message = 'invalid_input:outcome';
  end if;
  if char_length(v_notes) > 4000 then
    raise exception using errcode = 'P0001', message = 'invalid_input:notes';
  end if;
  if jsonb_typeof(v_snapshot) <> 'object' or octet_length(v_snapshot::text) > 16384 then
    raise exception using errcode = 'P0001', message = 'invalid_input:displayed_snapshot';
  end if;
  if v_object_id !~ '^[1-9][0-9]{0,18}$' then
    raise exception using errcode = 'P0001', message = 'invalid_input:object_id';
  end if;

  -- 4. Only the real BMP layer can be referenced.
  if p_source_item is distinct from c_source_item or p_layer_id is distinct from c_layer_id then
    raise exception using errcode = 'P0001', message = 'unknown_source';
  end if;

  -- 5. Find or create the asset. A concurrent insert of the same feature
  --    makes this wait, then the select sees the committed row.
  insert into public.assets as a (source_item, layer_id, source_object_id, dataset_version)
  values (c_source_item, c_layer_id, v_object_id, c_dataset_version)
  on conflict on constraint assets_feature_key do nothing
  returning a.id into v_asset_id;

  if v_asset_id is null then
    select a.id into v_asset_id
    from public.assets a
    where a.source_item = c_source_item
      and a.layer_id = c_layer_id
      and a.source_object_id = v_object_id
      and a.dataset_version = c_dataset_version;
  end if;

  -- 6. Insert the inspection; a repeated draft ID does nothing here.
  insert into public.inspections as i
    (id, asset_id, inspector_id, submitted_at, inspection_type, outcome, notes, displayed_snapshot)
  values
    (p_draft_id, v_asset_id, v_uid, clock_timestamp(), v_type, v_outcome, v_notes, v_snapshot)
  on conflict on constraint inspections_pkey do nothing
  returning i.* into v_row;

  -- 7. New record.
  if v_row.id is not null then
    return query select v_row.id, v_row.asset_id, v_row.submitted_at, false;
    return;
  end if;

  -- 8. The draft ID already exists. Same error whether the row is someone
  --    else's or the caller's with different content. Snapshot is not compared.
  select * into v_row from public.inspections i where i.id = p_draft_id;

  if not found
     or v_row.inspector_id <> v_uid
     or v_row.asset_id <> v_asset_id
     or v_row.inspection_type <> v_type
     or v_row.outcome <> v_outcome
     or v_row.notes is distinct from v_notes then
    raise exception using errcode = '23505', message = 'draft_conflict',
      detail = 'This draft ID was already used for a different inspection. Start a new draft.';
  end if;

  return query select v_row.id, v_row.asset_id, v_row.submitted_at, true;
end;
$$;

-- Still runs as the caller, so the row rules apply on top of the explicit
-- filter. Now plpgsql so it can refuse other sources with unknown_source.
create or replace function public.my_inspections(
  p_source_item text,
  p_layer_id integer,
  p_object_id text,
  p_limit integer default 50
)
returns table (
  id uuid,
  asset_id uuid,
  submitted_at timestamptz,
  inspection_type text,
  outcome text,
  notes text,
  displayed_snapshot jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_source_item is distinct from '5d70e438bb6045d6b3af05aee061e3cd' or p_layer_id is distinct from 0 then
    raise exception using errcode = 'P0001', message = 'unknown_source';
  end if;

  return query
  select i.id, i.asset_id, i.submitted_at, i.inspection_type, i.outcome, i.notes, i.displayed_snapshot
  from public.inspections i
  join public.assets a on a.id = i.asset_id
  where a.source_item = p_source_item
    and a.layer_id = p_layer_id
    and a.source_object_id = btrim(p_object_id, E' \t\r\n')
    and a.dataset_version = 'live'
    and i.inspector_id = (select auth.uid())
  order by i.submitted_at desc, i.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 50);
end;
$$;

-- create or replace keeps the grants; restated so this file reads on its own.
revoke all on function public.create_inspection(uuid, text, integer, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_inspection(uuid, text, integer, text, text, text, text, jsonb) to authenticated;

revoke all on function public.my_inspections(text, integer, text, integer) from public, anon;
grant execute on function public.my_inspections(text, integer, text, integer) to authenticated;
