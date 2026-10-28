-- MANUAL ROLLBACK. Never applied as a migration; run by hand only.
--
-- WARNING: this DELETES EVERY SAVED INSPECTION and every asset reference.
--
-- Before running:
--   1. Turn the sign-up hook off first:  supabase/scripts/configure-auth.sh hook-off
--      (a hook pointing at a dropped function blocks every sign-up).
--   2. Confirm with the team that the data can be thrown away.
--
-- Afterwards, record the rollback in supabase/README.md. A later re-apply is
-- a NEW migration; never edit the applied ones.

begin;

drop function if exists public.hook_restrict_umbc_signup(jsonb);
drop function if exists public.my_inspections(text, integer, text, integer);
drop function if exists public.create_inspection(uuid, text, integer, text, text, text, text, jsonb);
drop table if exists public.inspections;
drop table if exists public.assets;
drop function if exists private.is_umbc_user();
drop schema if exists private;

commit;
