-- Bound source before transfer; full source/download RPCs remain unchanged.
-- UTF-8 byte limits match analysis-budget.ts and are conservative for non-ASCII source.
create function public.labtrack_analysis_projects(expected_submissions jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  requested jsonb; metadata jsonb; payload jsonb; source_file jsonb;
  files jsonb; result jsonb := '[]'::jsonb;
  total_bytes integer := 0; project_bytes integer; file_bytes integer; file_number integer;
  limited boolean;
begin
  if expected_submissions is null or jsonb_typeof(expected_submissions) <> 'array' then
    raise sqlstate 'PT400' using message = 'Expected an analysis project array';
  end if;
  if jsonb_array_length(expected_submissions) > 200 then
    raise sqlstate 'PT400' using message = 'Too many analysis projects';
  end if;
  if (select count(distinct e->>'id') from jsonb_array_elements(expected_submissions) e) <> jsonb_array_length(expected_submissions) then
    raise sqlstate 'PT400' using message = 'Duplicate or invalid analysis project IDs';
  end if;
  for requested in select value from jsonb_array_elements(expected_submissions) loop
    select r.document, p.payload into metadata, payload
      from public.labtrack_records r join public.labtrack_payloads p using(collection,id)
      where r.collection = 'submissions' and r.id = requested->>'id'
        and (r.document->>'revision')::bigint = (requested->>'revision')::bigint;
    if not found then return null; end if;
    if jsonb_typeof(payload->'files') is distinct from 'array' then return null; end if;
    files := '[]'::jsonb;
    project_bytes := 0;
    file_number := 0;
    limited := false;
    for source_file in select value from jsonb_array_elements(payload->'files') loop
      if jsonb_typeof(source_file->'path') is distinct from 'string' or jsonb_typeof(source_file->'content') is distinct from 'string' then return null; end if;
      file_number := file_number + 1;
      file_bytes := octet_length(source_file->>'content');
      if limited or file_number > 40 or project_bytes + file_bytes > 200000 or total_bytes + file_bytes > 2000000 then
        limited := true;
        files := files || jsonb_build_array(jsonb_build_object('path', source_file->>'path', 'content', ''));
      else
        project_bytes := project_bytes + file_bytes;
        total_bytes := total_bytes + file_bytes;
        files := files || jsonb_build_array(source_file);
      end if;
    end loop;
    result := result || jsonb_build_array((metadata - 'sourceOmitted') || jsonb_build_object('files', files, 'analysisSourceLimited', limited));
  end loop;
  return result;
end;
$$;
revoke all on function public.labtrack_analysis_projects(jsonb) from public, anon, authenticated;
grant execute on function public.labtrack_analysis_projects(jsonb) to service_role;

create function public.labtrack_demo_analysis_projects(expected_submissions jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  requested jsonb; metadata jsonb; payload jsonb; source_file jsonb;
  files jsonb; result jsonb := '[]'::jsonb;
  total_bytes integer := 0; project_bytes integer; file_bytes integer; file_number integer;
  limited boolean;
begin
  if expected_submissions is null or jsonb_typeof(expected_submissions) <> 'array' then
    raise sqlstate 'PT400' using message = 'Expected an analysis project array';
  end if;
  if jsonb_array_length(expected_submissions) > 200 then
    raise sqlstate 'PT400' using message = 'Too many analysis projects';
  end if;
  if (select count(distinct e->>'id') from jsonb_array_elements(expected_submissions) e) <> jsonb_array_length(expected_submissions) then
    raise sqlstate 'PT400' using message = 'Duplicate or invalid analysis project IDs';
  end if;
  for requested in select value from jsonb_array_elements(expected_submissions) loop
    select r.document, p.payload into metadata, payload
      from public.labtrack_demo_records r join public.labtrack_demo_payloads p using(collection,id)
      where r.collection = 'submissions' and r.id = requested->>'id'
        and (r.document->>'revision')::bigint = (requested->>'revision')::bigint;
    if not found then return null; end if;
    if jsonb_typeof(payload->'files') is distinct from 'array' then return null; end if;
    files := '[]'::jsonb;
    project_bytes := 0;
    file_number := 0;
    limited := false;
    for source_file in select value from jsonb_array_elements(payload->'files') loop
      if jsonb_typeof(source_file->'path') is distinct from 'string' or jsonb_typeof(source_file->'content') is distinct from 'string' then return null; end if;
      file_number := file_number + 1;
      file_bytes := octet_length(source_file->>'content');
      if limited or file_number > 40 or project_bytes + file_bytes > 200000 or total_bytes + file_bytes > 2000000 then
        limited := true;
        files := files || jsonb_build_array(jsonb_build_object('path', source_file->>'path', 'content', ''));
      else
        project_bytes := project_bytes + file_bytes;
        total_bytes := total_bytes + file_bytes;
        files := files || jsonb_build_array(source_file);
      end if;
    end loop;
    result := result || jsonb_build_array((metadata - 'sourceOmitted') || jsonb_build_object('files', files, 'analysisSourceLimited', limited));
  end loop;
  return result;
end;
$$;
revoke all on function public.labtrack_demo_analysis_projects(jsonb) from public, anon, authenticated;
grant execute on function public.labtrack_demo_analysis_projects(jsonb) to service_role;
