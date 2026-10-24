-- Reconcile a hosted classroom that missed the original five-attempt migration.
-- Keep its historical migration entries intact. This replacement is safe to repeat.
-- Existing classroom records, payloads and revision are not modified.
update public.labtrack_login_limits
set attempts = least(attempts, 5),
    reset_at = least(reset_at, clock_timestamp() + interval '1 minute');

create or replace function public.labtrack_login_attempt(attempt_key text, clear_attempts boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if attempt_key is null or attempt_key !~ '^[a-f0-9]{64}$' then
    raise sqlstate 'PT400' using message = 'Invalid login attempt key';
  end if;
  if clear_attempts then
    delete from public.labtrack_login_limits where key = attempt_key;
    return true;
  end if;
  insert into public.labtrack_login_limits as limits (key, attempts, reset_at)
    values (attempt_key, 1, clock_timestamp() + interval '1 minute')
    on conflict (key) do update
      set attempts = case when limits.reset_at <= clock_timestamp() then 1 else limits.attempts + 1 end,
          reset_at = case when limits.reset_at <= clock_timestamp() or limits.attempts = 4
            then clock_timestamp() + interval '1 minute' else limits.reset_at end
      where limits.reset_at <= clock_timestamp() or limits.attempts < 5;
  return found;
end;
$$;
revoke all on function public.labtrack_login_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.labtrack_login_attempt(text, boolean) to service_role;
