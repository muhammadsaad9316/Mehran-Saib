-- Private document records preserve the existing account and submission contract.
create table if not exists public.labtrack_records (
  collection text not null check (collection in ('users', 'labs', 'submissions', 'activity', 'sessions')),
  id text not null,
  document jsonb not null check (jsonb_typeof(document) = 'object' and document ? 'id' and jsonb_typeof(document->'id') = 'string' and document->>'id' = id),
  position integer not null check (position >= 0),
  primary key (collection, id)
);
create table if not exists public.labtrack_meta (
  id smallint primary key check (id = 1),
  revision bigint not null default 0 check (revision >= 0)
);
insert into public.labtrack_meta (id) values (1) on conflict do nothing;

alter table public.labtrack_records enable row level security;
alter table public.labtrack_meta enable row level security;
revoke all on public.labtrack_records, public.labtrack_meta from public, anon, authenticated;
grant select, insert, update, delete on public.labtrack_records to service_role;
grant select, update on public.labtrack_meta to service_role;

create or replace function public.labtrack_read()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'revision', (select revision from public.labtrack_meta where id = 1),
    'data', (select jsonb_object_agg(c.name, coalesce(
      (select jsonb_agg(r.document order by r.position, r.id)
       from public.labtrack_records r where r.collection = c.name), '[]'::jsonb))
      from (values ('users'), ('labs'), ('submissions'), ('activity'), ('sessions')) c(name))
  );
$$;

create or replace function public.labtrack_write(expected_revision bigint, upserts jsonb, deletions jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint;
begin
  select revision into current_revision from public.labtrack_meta where id = 1 for update;
  if current_revision <> expected_revision then
    raise exception 'LabTrack database revision changed' using errcode = '40001';
  end if;
  delete from public.labtrack_records r
    using jsonb_to_recordset(deletions) d(collection text, id text)
    where r.collection = d.collection and r.id = d.id;
  insert into public.labtrack_records (collection, id, document, position)
    select u.collection, u.id, u.document, u.position
    from jsonb_to_recordset(upserts) u(collection text, id text, document jsonb, position integer)
    on conflict (collection, id) do update
      set document = excluded.document, position = excluded.position;
  update public.labtrack_meta set revision = revision + 1 where id = 1
    returning revision into current_revision;
  return current_revision;
end;
$$;

revoke all on function public.labtrack_read() from public, anon, authenticated;
revoke all on function public.labtrack_write(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.labtrack_read() to service_role;
grant execute on function public.labtrack_write(bigint, jsonb, jsonb) to service_role;
