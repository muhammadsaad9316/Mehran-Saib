-- New uploads are hashed by server validation; legacy attachments retain the fallback.
create or replace function public.labtrack_lab_metadata(lab jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(lab->'instructionFile') = 'object' and lab->'instructionFile' ? 'content' then
    (lab #- '{instructionFile,content}') || jsonb_build_object('instructionFile',
      ((lab->'instructionFile') - 'content') || jsonb_build_object('sha256',
        case when jsonb_typeof(lab->'instructionFile'->'sha256') = 'string'
          and lab->'instructionFile'->>'sha256' ~ '^[a-f0-9]{64}$'
        then lab->'instructionFile'->>'sha256'
        else encode(sha256(decode(lab->'instructionFile'->>'content','base64')),'hex') end))
    else lab end;
$$;
revoke all on function public.labtrack_lab_metadata(jsonb) from public,anon,authenticated;
grant execute on function public.labtrack_lab_metadata(jsonb) to service_role;
