-- Before-user-created hook: only @umbc.edu addresses can create an account.
-- Design: docs/designs/inspection-database-and-umbc-sign-in.md (file #4).
-- Turned on separately with: supabase/scripts/configure-auth.sh hook
-- Reads only the payload; touches no tables.

create or replace function public.hook_restrict_umbc_signup(event jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if v_email like '%@umbc.edu' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Only @umbc.edu accounts can sign up.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_restrict_umbc_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_umbc_signup(jsonb) from public, anon, authenticated;
