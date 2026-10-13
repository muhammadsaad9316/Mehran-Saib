create table public.labtrack_login_limits (
  key text primary key,
  attempts integer not null,
  reset_at timestamptz not null
);
alter table public.labtrack_login_limits enable row level security;
revoke all on public.labtrack_login_limits from public, anon, authenticated;
grant select, insert, update, delete on public.labtrack_login_limits to service_role;

create function public.labtrack_login_attempt(attempt_key text, clear_attempts boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
  if attempt_key !~ '^[a-f0-9]{64}$' then
    raise sqlstate 'PT400' using message = 'Invalid login attempt key';
  end if;
  delete from public.labtrack_login_limits where reset_at <= now();
  if clear_attempts then
    delete from public.labtrack_login_limits where key = attempt_key;
    return true;
  end if;
  insert into public.labtrack_login_limits (key, attempts, reset_at)
    values (attempt_key, 1, now() + interval '15 minutes')
    on conflict (key) do update set attempts = least(public.labtrack_login_limits.attempts + 1, 9)
    returning attempts into total;
  return total <= 8;
end;
$$;
revoke all on function public.labtrack_login_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.labtrack_login_attempt(text, boolean) to service_role;
