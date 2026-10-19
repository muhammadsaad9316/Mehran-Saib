-- An independent workspace in the same Supabase project. No classroom rows are copied or modified.
-- RPC bodies are the reviewed classroom implementations, bound only to demo tables.
create table public.labtrack_demo_records (like public.labtrack_records including all);
create table public.labtrack_demo_meta (like public.labtrack_meta including all);
create table public.labtrack_demo_payloads (like public.labtrack_payloads including all);
alter table public.labtrack_demo_payloads add foreign key (collection,id)
  references public.labtrack_demo_records(collection,id) on delete cascade deferrable initially deferred;
create table public.labtrack_demo_login_limits (like public.labtrack_login_limits including all);
insert into public.labtrack_demo_meta(id) values (1);

alter table public.labtrack_demo_records enable row level security;
alter table public.labtrack_demo_meta enable row level security;
alter table public.labtrack_demo_payloads enable row level security;
alter table public.labtrack_demo_login_limits enable row level security;
revoke all on public.labtrack_demo_records,public.labtrack_demo_meta,public.labtrack_demo_payloads,public.labtrack_demo_login_limits from public,anon,authenticated;
grant select,insert,update,delete on public.labtrack_demo_records,public.labtrack_demo_payloads,public.labtrack_demo_login_limits to service_role;
grant select,update on public.labtrack_demo_meta to service_role;

create or replace function public.labtrack_demo_read()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision', (select revision from public.labtrack_demo_meta where id = 1),
    'data', (select jsonb_object_agg(c.name, coalesce((select jsonb_agg(
      case when r.collection = 'submissions' then (r.document - 'sourceOmitted') || coalesce(p.payload, '{}'::jsonb) else r.document end
      order by r.position, r.id) from public.labtrack_demo_records r left join public.labtrack_demo_payloads p using(collection,id)
      where r.collection = c.name), '[]'::jsonb))
      from (values ('users'), ('labs'), ('submissions'), ('activity'), ('sessions')) c(name)));
$$;
revoke all on function public.labtrack_demo_read() from public,anon,authenticated;
grant execute on function public.labtrack_demo_read() to service_role;

create function public.labtrack_demo_read_if_changed(known_revision bigint default -1)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare current_revision bigint;
begin
  select revision into current_revision from public.labtrack_demo_meta where id = 1;
  if current_revision = known_revision then
    return jsonb_build_object('revision', current_revision, 'data', null);
  end if;
  return public.labtrack_demo_read();
end;
$$;
revoke all on function public.labtrack_demo_read_if_changed(bigint) from public,anon,authenticated;
grant execute on function public.labtrack_demo_read_if_changed(bigint) to service_role;

create function public.labtrack_demo_read_compact(known_revision bigint default -1)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision', m.revision, 'data', case when m.revision = known_revision then null else
    (select jsonb_object_agg(c.name, coalesce((select jsonb_agg(r.document order by r.position,r.id)
      from public.labtrack_demo_records r where r.collection = c.name),'[]'::jsonb))
      from (values ('users'),('labs'),('submissions'),('activity'),('sessions')) c(name)) end)
  from public.labtrack_demo_meta m where m.id = 1;
$$;
revoke all on function public.labtrack_demo_read_compact(bigint) from public,anon,authenticated;
grant execute on function public.labtrack_demo_read_compact(bigint) to service_role;

create function public.labtrack_demo_project(submission_id text, expected_revision bigint, include_binary boolean default false)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case when (r.document->>'revision')::bigint <> expected_revision then null else
    case when include_binary then p.payload else p.payload - 'binaryAssets' end end
  from public.labtrack_demo_records r join public.labtrack_demo_payloads p using(collection,id)
  where r.collection = 'submissions' and r.id = submission_id;
$$;
revoke all on function public.labtrack_demo_project(text,bigint,boolean) from public,anon,authenticated;
grant execute on function public.labtrack_demo_project(text,bigint,boolean) to service_role;

create function public.labtrack_demo_projects(expected_submissions jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case when count(*) <> jsonb_array_length(expected_submissions) then null else
    jsonb_agg((r.document - 'sourceOmitted') || (p.payload - 'binaryAssets')) end
  from jsonb_to_recordset(expected_submissions) e(id text,revision bigint)
    join public.labtrack_demo_records r on r.collection='submissions' and r.id=e.id and (r.document->>'revision')::bigint=e.revision
    join public.labtrack_demo_payloads p on p.collection=r.collection and p.id=r.id;
$$;
revoke all on function public.labtrack_demo_projects(jsonb) from public,anon,authenticated;
grant execute on function public.labtrack_demo_projects(jsonb) to service_role;

create function public.labtrack_demo_asset(submission_id text,expected_revision bigint,asset_path text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision',(r.document->>'revision')::bigint,'file',
    case when (r.document->>'revision')::bigint <> expected_revision then null else coalesce(
      (select a from jsonb_array_elements(p.payload->'binaryAssets') a where a->>'path'=asset_path limit 1),
      (select f || jsonb_build_object('mimeType','text/plain') from jsonb_array_elements(p.payload->'files') f where f->>'path'=asset_path limit 1)) end)
  from public.labtrack_demo_records r join public.labtrack_demo_payloads p using(collection,id)
  where r.collection='submissions' and r.id=submission_id;
$$;
revoke all on function public.labtrack_demo_asset(text,bigint,text) from public,anon,authenticated;
grant execute on function public.labtrack_demo_asset(text,bigint,text) to service_role;

create or replace function public.labtrack_demo_write_scoped(expected_revision bigint, upserts jsonb, deletions jsonb, expected_documents jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint; incoming_bytes bigint; u record; compact jsonb;
begin
  select revision into current_revision from public.labtrack_demo_meta where id = 1 for update;
  if current_revision <> expected_revision then
    if expected_documents is null then
      raise sqlstate 'PT409' using message = 'LabTrack database revision changed';
    end if;
    if exists(select 1 from jsonb_to_recordset(expected_documents) e(collection text,id text,document jsonb)
      left join public.labtrack_demo_records r on r.collection=e.collection and r.id=e.id
      where r.document is distinct from e.document) then
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
revoke all on function public.labtrack_demo_write_scoped(bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.labtrack_demo_write_scoped(bigint,jsonb,jsonb,jsonb) to service_role;

create or replace function public.labtrack_demo_write(expected_revision bigint,upserts jsonb,deletions jsonb)
returns bigint language sql security invoker set search_path = '' as $$
  select public.labtrack_demo_write_scoped(expected_revision,upserts,deletions,null);
$$;
revoke all on function public.labtrack_demo_write(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.labtrack_demo_write(bigint,jsonb,jsonb) to service_role;

create or replace function public.labtrack_demo_login_attempt(attempt_key text, clear_attempts boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if attempt_key is null or attempt_key !~ '^[a-f0-9]{64}$' then
    raise sqlstate 'PT400' using message = 'Invalid login attempt key';
  end if;
  if clear_attempts then
    delete from public.labtrack_demo_login_limits where key = attempt_key;
    return true;
  end if;
  -- Account keys are bounded; reset only this key to avoid cross-account cleanup locks.
  insert into public.labtrack_demo_login_limits as limits (key, attempts, reset_at)
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
revoke all on function public.labtrack_demo_login_attempt(text,boolean) from public,anon,authenticated;
grant execute on function public.labtrack_demo_login_attempt(text,boolean) to service_role;
