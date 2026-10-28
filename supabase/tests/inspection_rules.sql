-- Rule tests for the inspection schema, functions and sign-up hook.
-- Design: docs/designs/inspection-database-and-umbc-sign-in.md (file #7).
--
-- Runs in ONE transaction that ends in ROLLBACK, so nothing is left in the
-- shared project. A failing case raises "TEST FAILED: <case>". No error means
-- every case passed. Run through the Supabase MCP (execute_sql) or psql as
-- postgres. Compare row counts in assets, inspections and auth.users before
-- and after the run; they must match.

begin;

-- Helpers live in a throwaway schema that the rollback removes.
create schema tests;
grant usage on schema tests to anon, authenticated;

create table tests.results (k text primary key, v jsonb);
grant all on table tests.results to anon, authenticated;

create function tests.act_as(p_uid uuid, p_email text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.act_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

-- Runs p_sql and requires it to fail with p_state and a message starting with p_prefix.
create function tests.expect_error(p_case text, p_sql text, p_state text, p_prefix text default null)
returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state or (p_prefix is not null and position(p_prefix in sqlerrm) <> 1) then
      raise exception 'TEST FAILED: % (got % "%")', p_case, sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception 'TEST FAILED: % (no error)', p_case;
end $$;

-- Setup: temporary users created only inside this transaction.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000a', 'authenticated', 'authenticated', 'test-a@umbc.edu',  now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000b', 'authenticated', 'authenticated', 'test-b@umbc.edu',  now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000c', 'authenticated', 'authenticated', 'test-c@gmail.com', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000d', 'authenticated', 'authenticated', 'test-d@umbc.edu',  null,  false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000e', 'authenticated', 'authenticated', 'test-e@umbc.edu',  now(), true,  now(), now());

-- Case 1: signed out cannot run either function or read either table.
select tests.act_as_anon();
select tests.expect_error('1 anon create_inspection',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000099', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass')$q$,
  '42501');
select tests.expect_error('1 anon my_inspections',
  $q$select * from public.my_inspections('cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101')$q$, '42501');
select tests.expect_error('1 anon select inspections', 'select * from public.inspections', '42501');
select tests.expect_error('1 anon select assets', 'select * from public.assets', '42501');
reset role;

-- Case 4: A saves on feature 101; server sets inspector and time.
select tests.act_as('00000000-0000-4000-a000-00000000000a', 'test-a@umbc.edu');
do $$
declare r record;
begin
  select * into strict r from public.create_inspection(
    'd0000000-0000-4000-8000-000000000001', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, ' 101 ',
    '  Routine ', ' PASS ', '  first note  ', '{"Facility_N": "Test pond"}');
  if r.replayed is distinct from false then raise exception 'TEST FAILED: 4 replayed should be false'; end if;
  if r.id <> 'd0000000-0000-4000-8000-000000000001' then raise exception 'TEST FAILED: 4 wrong id'; end if;
  if r.asset_id is null then raise exception 'TEST FAILED: 4 missing asset_id'; end if;
  if r.submitted_at < now() or r.submitted_at > clock_timestamp() then
    raise exception 'TEST FAILED: 4 submitted_at not server time';
  end if;
  insert into tests.results values ('case4', to_jsonb(r));
end $$;

-- Case 5: same call again replays the original row.
do $$
declare r record; first jsonb;
begin
  select v into first from tests.results where k = 'case4';
  select * into strict r from public.create_inspection(
    'd0000000-0000-4000-8000-000000000001', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, ' 101 ',
    '  Routine ', ' PASS ', '  first note  ', '{"Facility_N": "Test pond"}');
  if r.replayed is distinct from true then raise exception 'TEST FAILED: 5 replayed should be true'; end if;
  if to_jsonb(r) - 'replayed' <> first - 'replayed' then raise exception 'TEST FAILED: 5 replay returned different row'; end if;

  -- A different snapshot is not compared on replay (Alternative G).
  select * into strict r from public.create_inspection(
    'd0000000-0000-4000-8000-000000000001', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101',
    'Routine', 'pass', 'first note', '{"Facility_N": "Test pond", "extra": 1}');
  if r.replayed is distinct from true then raise exception 'TEST FAILED: 5 snapshot change should still replay'; end if;
end $$;

-- Case 6: A reuses the draft ID with a different outcome.
select tests.expect_error('6 draft reuse different outcome',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000001', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'fail', 'first note')$q$,
  '23505', 'draft_conflict');
select tests.expect_error('6 draft reuse different feature',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000001', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '102', 'Routine', 'pass', 'first note')$q$,
  '23505', 'draft_conflict');
select tests.expect_error('6 draft reuse notes removed',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000001', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass')$q$,
  '23505', 'draft_conflict');

-- Case 10: invalid input names the field (A is a valid caller).
select tests.expect_error('10 outcome needs verification',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'needs verification')$q$,
  'P0001', 'invalid_input:outcome');
select tests.expect_error('10 empty type',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', '', 'pass')$q$,
  'P0001', 'invalid_input:inspection_type');
select tests.expect_error('10 whitespace type',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', E' \n ', 'pass')$q$,
  'P0001', 'invalid_input:inspection_type');
select tests.expect_error('10 121-char type',
  format($q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', %L, 'pass')$q$, repeat('x', 121)),
  'P0001', 'invalid_input:inspection_type');
select tests.expect_error('10 4001-char notes',
  format($q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass', %L)$q$, repeat('n', 4001)),
  'P0001', 'invalid_input:notes');
select tests.expect_error('10 array snapshot',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass', null, '[]')$q$,
  'P0001', 'invalid_input:displayed_snapshot');
select tests.expect_error('10 snapshot over 16 KB',
  format($q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass', null, %L)$q$,
    jsonb_build_object('big', repeat('s', 16400))),
  'P0001', 'invalid_input:displayed_snapshot');
select tests.expect_error('10 object id abc',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, 'abc', 'Routine', 'pass')$q$,
  'P0001', 'invalid_input:object_id');
select tests.expect_error('10 object id leading zero',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '042', 'Routine', 'pass')$q$,
  'P0001', 'invalid_input:object_id');
select tests.expect_error('10 null draft id',
  $q$select * from public.create_inspection(null, 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass')$q$,
  'P0001', 'invalid_input:draft_id');
select tests.expect_error('10 wrong source item',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'ffffffffffffffffffffffffffffffff', 3, '101', 'Routine', 'pass')$q$,
  'P0001', 'unknown_source');
select tests.expect_error('10 layer 2',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000010', 'cc6a7a27c267435c8f7ed95a59eb5f24', 2, '101', 'Routine', 'pass')$q$,
  'P0001', 'unknown_source');

-- Case 10 boundaries: 120-char type and 4,000-char notes are accepted; empty notes become null.
do $$
declare r record;
begin
  select * into strict r from public.create_inspection(
    'd0000000-0000-4000-8000-000000000011', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '103',
    repeat('t', 120), 'fail', repeat('n', 4000));
  select * into strict r from public.create_inspection(
    'd0000000-0000-4000-8000-000000000012', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '103',
    'Routine', 'Fail', '   ');
  if (select i.notes from public.inspections i where i.id = 'd0000000-0000-4000-8000-000000000012') is not null then
    raise exception 'TEST FAILED: 10 blank notes should be stored as null';
  end if;
end $$;

-- Case 11: A cannot write to either table directly.
select tests.expect_error('11 insert assets',
  $q$insert into public.assets (source_item, layer_id, source_object_id) values ('cc6a7a27c267435c8f7ed95a59eb5f24', 3, '999')$q$, '42501');
select tests.expect_error('11 update assets', $q$update public.assets set dataset_version = 'x'$q$, '42501');
select tests.expect_error('11 delete assets', 'delete from public.assets', '42501');
select tests.expect_error('11 truncate assets', 'truncate public.assets cascade', '42501');
select tests.expect_error('11 insert inspections',
  $q$insert into public.inspections (id, asset_id, inspector_id, inspection_type, outcome)
     select gen_random_uuid(), a.id, '00000000-0000-4000-a000-00000000000a', 'Routine', 'pass' from public.assets a limit 1$q$, '42501');
select tests.expect_error('11 update inspections', $q$update public.inspections set outcome = 'fail'$q$, '42501');
select tests.expect_error('11 delete inspections', 'delete from public.inspections', '42501');
select tests.expect_error('11 truncate inspections', 'truncate public.inspections', '42501');
select tests.expect_error('11 authenticated runs hook',
  $q$select public.hook_restrict_umbc_signup('{"user": {"email": "x@umbc.edu"}}')$q$, '42501');
reset role;

-- Case 7: B reuses A's draft ID with the same content.
select tests.act_as('00000000-0000-4000-a000-00000000000b', 'test-b@umbc.edu');
select tests.expect_error('7 other user reuses draft id',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000001', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass', 'first note')$q$,
  '23505', 'draft_conflict');

-- Case 8: B sees none of A's rows.
do $$
begin
  if exists (select 1 from public.my_inspections('cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101')) then
    raise exception 'TEST FAILED: 8 B history shows rows';
  end if;
  if exists (select 1 from public.inspections) then
    raise exception 'TEST FAILED: 8 B direct select shows rows';
  end if;
end $$;
reset role;

-- Case 9: history is per feature, newest first, and the limit is clamped.
select tests.act_as('00000000-0000-4000-a000-00000000000a', 'test-a@umbc.edu');
do $$
declare ids uuid[];
begin
  perform * from public.create_inspection('d0000000-0000-4000-8000-000000000002', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Follow-up', 'fail');
  perform * from public.create_inspection('d0000000-0000-4000-8000-000000000003', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '102', 'Routine', 'pass');

  select array_agg(h.id) into ids from public.my_inspections('cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101') h;
  if ids is distinct from array['d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001']::uuid[] then
    raise exception 'TEST FAILED: 9 history 101 wrong rows or order: %', ids;
  end if;
  if (select count(*) from public.my_inspections('cc6a7a27c267435c8f7ed95a59eb5f24', 3, '102')) <> 1 then
    raise exception 'TEST FAILED: 9 history 102 should have 1 row';
  end if;
  if (select count(*) from public.my_inspections('cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 0)) <> 1 then
    raise exception 'TEST FAILED: 9 limit 0 should clamp to 1';
  end if;
  if exists (select 1 from public.my_inspections('cc6a7a27c267435c8f7ed95a59eb5f24', 3, '555')) then
    raise exception 'TEST FAILED: 9 never-inspected feature should be empty';
  end if;
end $$;
reset role;

-- Case 2: Gmail user C is refused and reads nothing.
select tests.act_as('00000000-0000-4000-a000-00000000000c', 'test-c@gmail.com');
select tests.expect_error('2 gmail create',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000020', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass')$q$,
  '42501', 'forbidden_domain');
do $$
begin
  if exists (select 1 from public.inspections) or exists (select 1 from public.assets)
     or exists (select 1 from public.my_inspections('cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101')) then
    raise exception 'TEST FAILED: 2 gmail user reads rows';
  end if;
end $$;
reset role;

-- Case 3: unconfirmed UMBC user D is refused and reads nothing.
select tests.act_as('00000000-0000-4000-a000-00000000000d', 'test-d@umbc.edu');
select tests.expect_error('3 unconfirmed create',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000030', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass')$q$,
  '42501', 'forbidden_domain');
do $$
begin
  if exists (select 1 from public.assets) then raise exception 'TEST FAILED: 3 unconfirmed user reads assets'; end if;
end $$;
reset role;

-- Case 3b: anonymous account with a UMBC email is refused.
select tests.act_as('00000000-0000-4000-a000-00000000000e', 'test-e@umbc.edu');
select tests.expect_error('3b anonymous create',
  $q$select * from public.create_inspection('d0000000-0000-4000-8000-000000000031', 'cc6a7a27c267435c8f7ed95a59eb5f24', 3, '101', 'Routine', 'pass')$q$,
  '42501', 'forbidden_domain');
reset role;

-- Checks as owner: stored values and row counts.
do $$
begin
  if (select count(*) from public.inspections where id = 'd0000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'TEST FAILED: 5 draft 01 should exist exactly once';
  end if;
  if not exists (
    select 1 from public.inspections i join public.assets a on a.id = i.asset_id
    where i.id = 'd0000000-0000-4000-8000-000000000001'
      and i.inspector_id = '00000000-0000-4000-a000-00000000000a'
      and i.inspection_type = 'Routine' and i.outcome = 'pass' and i.notes = 'first note'
      and i.displayed_snapshot = '{"Facility_N": "Test pond"}'
      and a.source_object_id = '101' and a.layer_id = 3 and a.dataset_version = 'live'
  ) then
    raise exception 'TEST FAILED: 4 stored row not normalized as expected';
  end if;
  -- A: 01, 02, 03, 11, 12. Nobody else saved anything.
  if (select count(*) from public.inspections) <> 5 then
    raise exception 'TEST FAILED: expected 5 inspections, got %', (select count(*) from public.inspections);
  end if;
  -- Features 101, 102, 103; one asset row each.
  if (select count(*) from public.assets) <> 3 then
    raise exception 'TEST FAILED: expected 3 assets, got %', (select count(*) from public.assets);
  end if;
end $$;

-- Case 12: the sign-up hook accepts only @umbc.edu.
do $$
begin
  if public.hook_restrict_umbc_signup('{"user": {"email": "x@umbc.edu"}}') <> '{}'::jsonb then
    raise exception 'TEST FAILED: 12 x@umbc.edu rejected';
  end if;
  if public.hook_restrict_umbc_signup('{"user": {"email": "X@UMBC.EDU"}}') <> '{}'::jsonb then
    raise exception 'TEST FAILED: 12 X@UMBC.EDU rejected';
  end if;
  if public.hook_restrict_umbc_signup('{"user": {"email": "x@gmail.com"}}') -> 'error' ->> 'http_code' is distinct from '403' then
    raise exception 'TEST FAILED: 12 x@gmail.com accepted';
  end if;
  if public.hook_restrict_umbc_signup('{"user": {"email": "x@evilumbc.edu"}}') -> 'error' is null then
    raise exception 'TEST FAILED: 12 x@evilumbc.edu accepted';
  end if;
  if public.hook_restrict_umbc_signup('{"user": {"email": "x@umbc.edu.evil.com"}}') -> 'error' is null then
    raise exception 'TEST FAILED: 12 x@umbc.edu.evil.com accepted';
  end if;
  if public.hook_restrict_umbc_signup('{"user": {"phone": "+15555550100"}}') -> 'error' is null then
    raise exception 'TEST FAILED: 12 missing email accepted';
  end if;
end $$;

-- Case 13: the privilege matrix matches the design's Permissions table.
do $$
declare
  t text; p text;
begin
  foreach t in array array['public.assets', 'public.inspections'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('anon', t, p) then
        raise exception 'TEST FAILED: 13 anon has % on %', p, t;
      end if;
      if has_table_privilege('authenticated', t, p) <> (p = 'SELECT') then
        raise exception 'TEST FAILED: 13 authenticated % on % is wrong', p, t;
      end if;
    end loop;
  end loop;

  if has_function_privilege('anon', 'public.create_inspection(uuid, text, integer, text, text, text, text, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_inspection(uuid, text, integer, text, text, text, text, jsonb)', 'EXECUTE') then
    raise exception 'TEST FAILED: 13 create_inspection execute grants';
  end if;
  if has_function_privilege('anon', 'public.my_inspections(text, integer, text, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.my_inspections(text, integer, text, integer)', 'EXECUTE') then
    raise exception 'TEST FAILED: 13 my_inspections execute grants';
  end if;
  if has_function_privilege('anon', 'public.hook_restrict_umbc_signup(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.hook_restrict_umbc_signup(jsonb)', 'EXECUTE')
     or not has_function_privilege('supabase_auth_admin', 'public.hook_restrict_umbc_signup(jsonb)', 'EXECUTE') then
    raise exception 'TEST FAILED: 13 hook execute grants';
  end if;
  if has_function_privilege('anon', 'private.is_umbc_user()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'private.is_umbc_user()', 'EXECUTE') then
    raise exception 'TEST FAILED: 13 is_umbc_user execute grants';
  end if;
  if has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'TEST FAILED: 13 anon has usage on private';
  end if;
end $$;

select 'ALL TESTS PASSED' as result;

rollback;
