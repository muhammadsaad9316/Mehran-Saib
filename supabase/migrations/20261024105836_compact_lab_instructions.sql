-- Keep instruction bytes in existing private lab records; transfer metadata for app snapshots.
-- Legacy read functions remain available for existing deployments and complete backups.
create function public.labtrack_lab_metadata(lab jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(lab->'instructionFile') = 'object' and lab->'instructionFile' ? 'content' then
    (lab #- '{instructionFile,content}') || jsonb_build_object('instructionFile',
      ((lab->'instructionFile') - 'content') || jsonb_build_object('sha256', encode(sha256(decode(lab->'instructionFile'->>'content','base64')),'hex')))
    else lab end;
$$;
revoke all on function public.labtrack_lab_metadata(jsonb) from public,anon,authenticated;
grant execute on function public.labtrack_lab_metadata(jsonb) to service_role;

create function public.labtrack_read_workspace(known_revision bigint default -1)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision', m.revision, 'data', case when m.revision = known_revision then null else
    (select jsonb_object_agg(c.name, coalesce((select jsonb_agg(
      case when r.collection='labs' then public.labtrack_lab_metadata(r.document) else r.document end order by r.position,r.id)
      from public.labtrack_records r where r.collection=c.name),'[]'::jsonb))
      from (values ('users'),('labs'),('submissions'),('activity'),('sessions')) c(name)) end)
  from public.labtrack_meta m where m.id=1;
$$;
create function public.labtrack_instructions(lab_id text,expected_revision bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision',coalesce((r.document->>'revision')::bigint,0),'instructionFile',r.document->'instructionFile')
  from public.labtrack_records r where r.collection='labs' and r.id=lab_id
    and coalesce((r.document->>'revision')::bigint,0)=expected_revision;
$$;
revoke all on function public.labtrack_read_workspace(bigint),public.labtrack_instructions(text,bigint) from public,anon,authenticated;
grant execute on function public.labtrack_read_workspace(bigint),public.labtrack_instructions(text,bigint) to service_role;

create or replace function public.labtrack_write_scoped(expected_revision bigint, upserts jsonb, deletions jsonb, expected_documents jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint; incoming_bytes bigint; u record; compact jsonb; stored_file jsonb;
begin
  select revision into current_revision from public.labtrack_meta where id = 1 for update;
  if current_revision <> expected_revision then
    if expected_documents is null then
      raise sqlstate 'PT409' using message = 'LabTrack database revision changed';
    end if;
    if exists(select 1 from jsonb_to_recordset(expected_documents) e(collection text,id text,document jsonb)
      left join public.labtrack_records r on r.collection=e.collection and r.id=e.id
      where r.document is distinct from e.document and (e.collection <> 'labs' or public.labtrack_lab_metadata(r.document) is distinct from e.document)) then
      raise sqlstate 'PT409' using message = 'LabTrack record changed';
    end if;
  end if;
  select coalesce(sum(case
    when x.collection='submissions' and not coalesce((x.document->>'sourceOmitted')::boolean,false) then
      greatest(0, octet_length(jsonb_build_object('files',coalesce(x.document->'files','[]'::jsonb),'binaryAssets',coalesce(x.document->'binaryAssets','[]'::jsonb))::text) - coalesce(octet_length(p.payload::text),0))
    when x.collection='labs' then greatest(0, coalesce(octet_length(x.document->'instructionFile'->>'content'),0)-coalesce(octet_length(r.document->'instructionFile'->>'content'),0))
    else 0 end),0) into incoming_bytes
    from jsonb_to_recordset(upserts) x(collection text,id text,document jsonb)
    left join public.labtrack_records r on r.collection=x.collection and r.id=x.id
    left join public.labtrack_payloads p on p.collection=x.collection and p.id=x.id;
  if incoming_bytes > 0 and pg_database_size(current_database()) + incoming_bytes * 2 >= 400000000 then return -1; end if;

  delete from public.labtrack_records r using jsonb_to_recordset(deletions) d(collection text,id text)
    where r.collection=d.collection and r.id=d.id;
  for u in select * from jsonb_to_recordset(upserts) x(collection text,id text,document jsonb,position integer) loop
    compact := u.document;
    if u.collection='labs' and jsonb_typeof(u.document->'instructionFile')='object' and not (u.document->'instructionFile' ? 'content') then
      select document->'instructionFile' into stored_file from public.labtrack_records where collection='labs' and id=u.id;
      if stored_file is null or public.labtrack_lab_metadata(jsonb_build_object('instructionFile',stored_file))->'instructionFile' is distinct from u.document->'instructionFile' then
        raise sqlstate 'PT409' using message='Lab instructions changed';
      end if;
      compact := jsonb_set(u.document,'{instructionFile}',stored_file);
    end if;
    if u.collection='submissions' and not coalesce((u.document->>'sourceOmitted')::boolean,false) then
      compact := (u.document - 'files' - 'binaryAssets') || jsonb_build_object('sourceOmitted',true,'files',coalesce(
        (select jsonb_agg(jsonb_build_object('path',f->>'path','content','')) from jsonb_array_elements(u.document->'files') f),'[]'::jsonb));
    end if;
    insert into public.labtrack_records(collection,id,document,position) values(u.collection,u.id,compact,
      case when not exists(select 1 from public.labtrack_records r where r.collection=u.collection and r.id=u.id)
        then coalesce((select max(position)+1 from public.labtrack_records r where r.collection=u.collection),0)
        when u.collection='labs' then (select position from public.labtrack_records r where r.collection=u.collection and r.id=u.id)
        else u.position end)
      on conflict(collection,id) do update set document=excluded.document,position=excluded.position;
    if u.collection='submissions' and not coalesce((u.document->>'sourceOmitted')::boolean,false) then
      insert into public.labtrack_payloads(collection,id,payload) values(u.collection,u.id,jsonb_build_object(
        'files',coalesce(u.document->'files','[]'::jsonb),'binaryAssets',coalesce(u.document->'binaryAssets','[]'::jsonb)))
        on conflict(collection,id) do update set payload=excluded.payload;
    end if;
  end loop;
  -- Concurrent activity insertions must not grow the bounded event list or discard newer events.
  if exists(select 1 from jsonb_array_elements(upserts) x where x->>'collection'='activity') then
    delete from public.labtrack_records where collection='activity' and id not in
      (select id from public.labtrack_records where collection='activity' order by document->>'time' desc,id limit 100);
    update public.labtrack_records r set position=x.position from
      (select id,(row_number() over(order by document->>'time' desc,id)-1)::integer as position from public.labtrack_records where collection='activity') x
      where r.collection='activity' and r.id=x.id;
  end if;
  if exists(select 1 from jsonb_array_elements(upserts) x where x->>'collection'='sessions') then
    delete from public.labtrack_records where collection='sessions' and
      (document->>'expiresAt')::numeric <= extract(epoch from now())*1000;
    delete from public.labtrack_records where collection='sessions' and id in (
      select id from (select id,row_number() over(partition by document->>'userId' order by (document->>'expiresAt')::numeric desc,id) as rank
        from public.labtrack_records where collection='sessions') x where x.rank>10);
  end if;
  update public.labtrack_meta set revision=revision+1 where id=1 returning revision into current_revision;
  return current_revision;
end;
$$;
update public.labtrack_meta set revision=revision+1 where id=1;

create function public.labtrack_demo_read_workspace(known_revision bigint default -1)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision', m.revision, 'data', case when m.revision = known_revision then null else
    (select jsonb_object_agg(c.name, coalesce((select jsonb_agg(
      case when r.collection='labs' then public.labtrack_lab_metadata(r.document) else r.document end order by r.position,r.id)
      from public.labtrack_demo_records r where r.collection=c.name),'[]'::jsonb))
      from (values ('users'),('labs'),('submissions'),('activity'),('sessions')) c(name)) end)
  from public.labtrack_demo_meta m where m.id=1;
$$;
create function public.labtrack_demo_instructions(lab_id text,expected_revision bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision',coalesce((r.document->>'revision')::bigint,0),'instructionFile',r.document->'instructionFile')
  from public.labtrack_demo_records r where r.collection='labs' and r.id=lab_id
    and coalesce((r.document->>'revision')::bigint,0)=expected_revision;
$$;
revoke all on function public.labtrack_demo_read_workspace(bigint),public.labtrack_demo_instructions(text,bigint) from public,anon,authenticated;
grant execute on function public.labtrack_demo_read_workspace(bigint),public.labtrack_demo_instructions(text,bigint) to service_role;

create or replace function public.labtrack_demo_write_scoped(expected_revision bigint, upserts jsonb, deletions jsonb, expected_documents jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint; incoming_bytes bigint; u record; compact jsonb; stored_file jsonb;
begin
  select revision into current_revision from public.labtrack_demo_meta where id = 1 for update;
  if current_revision <> expected_revision then
    if expected_documents is null then
      raise sqlstate 'PT409' using message = 'LabTrack database revision changed';
    end if;
    if exists(select 1 from jsonb_to_recordset(expected_documents) e(collection text,id text,document jsonb)
      left join public.labtrack_demo_records r on r.collection=e.collection and r.id=e.id
      where r.document is distinct from e.document and (e.collection <> 'labs' or public.labtrack_lab_metadata(r.document) is distinct from e.document)) then
      raise sqlstate 'PT409' using message = 'LabTrack record changed';
    end if;
  end if;
  select coalesce(sum(case
    when x.collection='submissions' and not coalesce((x.document->>'sourceOmitted')::boolean,false) then
      greatest(0, octet_length(jsonb_build_object('files',coalesce(x.document->'files','[]'::jsonb),'binaryAssets',coalesce(x.document->'binaryAssets','[]'::jsonb))::text) - coalesce(octet_length(p.payload::text),0))
    when x.collection='labs' then greatest(0, coalesce(octet_length(x.document->'instructionFile'->>'content'),0)-coalesce(octet_length(r.document->'instructionFile'->>'content'),0))
    else 0 end),0) into incoming_bytes
    from jsonb_to_recordset(upserts) x(collection text,id text,document jsonb)
    left join public.labtrack_demo_records r on r.collection=x.collection and r.id=x.id
    left join public.labtrack_demo_payloads p on p.collection=x.collection and p.id=x.id;
  if incoming_bytes > 0 and pg_database_size(current_database()) + incoming_bytes * 2 >= 350000000 then return -1; end if;

  -- Keep public uploads below 20 MB and preserve room for the real classroom.
  if incoming_bytes > 0 and incoming_bytes +
    coalesce((select sum(octet_length(document::text)) from public.labtrack_demo_records where collection='labs'),0) +
    coalesce((select sum(octet_length(payload::text)) from public.labtrack_demo_payloads),0) > 20000000 then return -1; end if;

  delete from public.labtrack_demo_records r using jsonb_to_recordset(deletions) d(collection text,id text)
    where r.collection=d.collection and r.id=d.id;
  for u in select * from jsonb_to_recordset(upserts) x(collection text,id text,document jsonb,position integer) loop
    compact := u.document;
    if u.collection='labs' and jsonb_typeof(u.document->'instructionFile')='object' and not (u.document->'instructionFile' ? 'content') then
      select document->'instructionFile' into stored_file from public.labtrack_demo_records where collection='labs' and id=u.id;
      if stored_file is null or public.labtrack_lab_metadata(jsonb_build_object('instructionFile',stored_file))->'instructionFile' is distinct from u.document->'instructionFile' then
        raise sqlstate 'PT409' using message='Lab instructions changed';
      end if;
      compact := jsonb_set(u.document,'{instructionFile}',stored_file);
    end if;
    if u.collection='submissions' and not coalesce((u.document->>'sourceOmitted')::boolean,false) then
      compact := (u.document - 'files' - 'binaryAssets') || jsonb_build_object('sourceOmitted',true,'files',coalesce(
        (select jsonb_agg(jsonb_build_object('path',f->>'path','content','')) from jsonb_array_elements(u.document->'files') f),'[]'::jsonb));
    end if;
    insert into public.labtrack_demo_records(collection,id,document,position) values(u.collection,u.id,compact,
      case when not exists(select 1 from public.labtrack_demo_records r where r.collection=u.collection and r.id=u.id)
        then coalesce((select max(position)+1 from public.labtrack_demo_records r where r.collection=u.collection),0)
        when u.collection='labs' then (select position from public.labtrack_demo_records r where r.collection=u.collection and r.id=u.id)
        else u.position end)
      on conflict(collection,id) do update set document=excluded.document,position=excluded.position;
    if u.collection='submissions' and not coalesce((u.document->>'sourceOmitted')::boolean,false) then
      insert into public.labtrack_demo_payloads(collection,id,payload) values(u.collection,u.id,jsonb_build_object(
        'files',coalesce(u.document->'files','[]'::jsonb),'binaryAssets',coalesce(u.document->'binaryAssets','[]'::jsonb)))
        on conflict(collection,id) do update set payload=excluded.payload;
    end if;
  end loop;
  -- Concurrent activity insertions must not grow the bounded event list or discard newer events.
  if exists(select 1 from jsonb_array_elements(upserts) x where x->>'collection'='activity') then
    delete from public.labtrack_demo_records where collection='activity' and id not in
      (select id from public.labtrack_demo_records where collection='activity' order by document->>'time' desc,id limit 100);
    update public.labtrack_demo_records r set position=x.position from
      (select id,(row_number() over(order by document->>'time' desc,id)-1)::integer as position from public.labtrack_demo_records where collection='activity') x
      where r.collection='activity' and r.id=x.id;
  end if;
  if exists(select 1 from jsonb_array_elements(upserts) x where x->>'collection'='sessions') then
    delete from public.labtrack_demo_records where collection='sessions' and
      (document->>'expiresAt')::numeric <= extract(epoch from now())*1000;
    delete from public.labtrack_demo_records where collection='sessions' and id in (
      select id from (select id,row_number() over(partition by document->>'userId' order by (document->>'expiresAt')::numeric desc,id) as rank
        from public.labtrack_demo_records where collection='sessions') x where x.rank>10);
  end if;
  update public.labtrack_demo_meta set revision=revision+1 where id=1 returning revision into current_revision;
  return current_revision;
end;
$$;
update public.labtrack_demo_meta set revision=revision+1 where id=1;
