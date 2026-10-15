-- Bring existing 8-attempt / 15-minute buckets within the new one-minute policy.
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
  -- Account keys are bounded; reset only this key to avoid cross-account cleanup locks.
  insert into public.labtrack_login_limits as limits (key, attempts, reset_at)
    values (attempt_key, 1, clock_timestamp() + interval '1 minute')
    on conflict (key) do update
      -- Also handle a row that expires while this request waits on its key lock.
      set attempts = case when limits.reset_at <= clock_timestamp() then 1 else limits.attempts + 1 end,
          reset_at = case when limits.reset_at <= clock_timestamp() or limits.attempts = 4
            then clock_timestamp() + interval '1 minute' else limits.reset_at end
      where limits.reset_at <= clock_timestamp() or limits.attempts < 5;
  -- A blocked conflict performs no update: it cannot extend the cooldown or be admitted.
  return found;
end;
$$;
revoke all on function public.labtrack_login_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.labtrack_login_attempt(text, boolean) to service_role;
