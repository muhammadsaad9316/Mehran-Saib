create or replace function public.labtrack_write(expected_revision bigint, upserts jsonb, deletions jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint;
begin
  select revision into current_revision from public.labtrack_meta where id = 1 for update;
  if current_revision <> expected_revision then
    -- A version conflict is not transient; 40001 makes PostgREST 14 retry forever.
    raise sqlstate 'PT409' using message = 'LabTrack database revision changed';
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
