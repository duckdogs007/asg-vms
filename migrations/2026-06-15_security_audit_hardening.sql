-- Security audit (#16) — non-breaking hardening.
-- See SECURITY_AUDIT.md for the full findings. This migration covers only the
-- changes verified safe against current app usage; the storage-bucket fix
-- (private + signed URLs) is intentionally NOT here because it requires a
-- coordinated app change and would break existing getPublicUrl() renders.

-- 1. audit_logs: read is admin-only at the DB layer.
--    Reads only occur in the admin-only /admin/system screen; everything else
--    is INSERT. Append-only stays intact (no UPDATE/DELETE policy exists).
drop policy if exists "auth read" on public.audit_logs;
create policy "admin read audit_logs"
  on public.audit_logs for select
  to authenticated
  using (is_admin());

-- 2. admin_users: read is admin-only (stop non-admins enumerating the admin list).
--    checkIsAdmin() self-queries by auth.uid(); is_admin() is SECURITY DEFINER and
--    independent of this policy, so the admin gate keeps working.
drop policy if exists "auth_read_admin_users" on public.admin_users;
create policy "admin_read_admin_users"
  on public.admin_users for select
  to authenticated
  using (is_admin());

-- 3. check_watchlist_match(): pin search_path (advisor 0011). Trigger fn, body unchanged.
create or replace function public.check_watchlist_match()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $function$
begin
  if exists (
    select 1 from watchlist
    where lower(first_name) = lower(new.first_name)
      and lower(last_name)  = lower(new.last_name)
      and (watchlist.dob is null or watchlist.dob = new.dob)
  ) then
    new.watchlist_match := true;
  end if;
  return new;
end;
$function$;

-- 4. rls_auto_enable(): event-trigger fn — not meant to be RPC-callable. (advisors 0028/0029)
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
