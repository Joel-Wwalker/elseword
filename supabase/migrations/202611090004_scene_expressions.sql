-- Allow optional character expressions in portable scene lines.
begin;

create or replace function public.scene_document_valid(doc jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  options jsonb;
  template jsonb;
  field text;
  rooms constant text[] := array['bakery','market','busstop','library','cafe','tickets','rooftop','apothecary'];
  residents constant text[] := array['moss','kiln','vesper','slate','rook','brine','shard','hush'];
begin
  if doc is null or jsonb_typeof(doc) <> 'object' or octet_length(doc::text) > 1000000 then return false; end if;
  if exists (select 1 from jsonb_object_keys(doc) k where k not in ('format','version','id','name','room','cast','prop','language','captions','sound','beats')) then return false; end if;
  if doc->'format' is distinct from '"little-languages-scene"'::jsonb or doc->'version' is distinct from '1'::jsonb
    or not public.language_text_valid(doc->'id',80) or (doc->>'id') !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
    or not public.language_text_valid(doc->'name',80)
    or (doc->>'room') is null or not (doc->>'room') = any(rooms)
    or (doc->>'prop') is null or (doc->>'prop') not in ('none','bread','basket','umbrella','book','cup','ticket','star','bottle')
    or (doc->>'captions') is null or (doc->>'captions') not in ('both','language','english')
    or jsonb_typeof(doc->'sound') is distinct from 'boolean' then return false; end if;
  if jsonb_typeof(doc->'cast') is distinct from 'array' then return false; end if;
  if jsonb_array_length(doc->'cast') <> 2 then return false; end if;
  for item in select value from jsonb_array_elements(doc->'cast') loop
    if jsonb_typeof(item) <> 'string' or not (item #>> '{}') = any(residents) then return false; end if;
  end loop;
  -- A saved scene carries the normalized v2 snapshot, independent of the
  -- editor's language or any subsequently deleted cloud-language record.
  if doc->'language'->'version' is distinct from '2'::jsonb
    or not public.language_document_valid(doc->'language') then return false; end if;

  if jsonb_typeof(doc->'beats') is distinct from 'array' then return false; end if;
  if jsonb_array_length(doc->'beats') not between 1 and 24 then return false; end if;
  for item in select value from jsonb_array_elements(doc->'beats') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(item) k where k not in ('id','speaker','mode','options','text','english','template','action','cue','wordIndex','pauseMs','expression')) then return false; end if;
    if not public.language_text_valid(item->'id',80) or (item->>'id') !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
      or (item->'speaker' is distinct from '0'::jsonb and item->'speaker' is distinct from '1'::jsonb)
      or (item->>'mode') is null or (item->>'mode') not in ('builder','literal','template')
      or (item->>'action') is null or (item->>'action') not in ('none','walk','turn','gesture','recoil','pass','drop')
      or (item->>'cue') is null or (item->>'cue') not in ('start','end','word')
      or jsonb_typeof(item->'wordIndex') is distinct from 'number' or (item->>'wordIndex') !~ '^[0-9]{1,3}$'
      or jsonb_typeof(item->'pauseMs') is distinct from 'number' or (item->>'pauseMs') !~ '^[0-9]{1,4}$' then return false; end if;
    if (item->>'wordIndex')::integer > 299 or (item->>'pauseMs')::integer > 5000 then return false; end if;
    if item ? 'expression' and (jsonb_typeof(item->'expression') is distinct from 'string'
      or (item->>'expression') not in ('auto','neutral','curious','annoyed','pleased','worried','startled')) then return false; end if;
    foreach field in array array['text','english'] loop
      if (item ? field or item->>'mode' = 'literal')
        and not public.language_text_valid(item->field,300,true,true) then return false; end if;
    end loop;
    if item ? 'options' or item->>'mode' = 'builder' then
      options := item->'options';
      if jsonb_typeof(options) is distinct from 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(options) k where k not in ('subject','verb','object','adjective','tense','plural','negative','question')) then return false; end if;
      -- Missing dictionary references are repairable draft choices, not unsafe data.
      -- Their text remains bounded; the editor blocks playback until repaired.
      foreach field in array array['subject','verb','object','adjective'] loop
        if not public.language_text_valid(options->field,80,true) then return false; end if;

      end loop;
      if (options->>'tense') is null or (options->>'tense') not in ('present','past','future') then return false; end if;
      foreach field in array array['plural','negative','question'] loop
        if jsonb_typeof(options->field) is distinct from 'boolean' then return false; end if;
      end loop;
    end if;
    if item ? 'template' or item->>'mode' = 'template' then
      template := item->'template';
      if jsonb_typeof(template) is distinct from 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(template) k where k not in ('sceneId','episodeId','lineIndex','choiceId')) then return false; end if;
      if (template->>'sceneId') is null or not (template->>'sceneId') = any(rooms)
        or not public.language_text_valid(template->'episodeId',80) or (template->>'episodeId') !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
        or jsonb_typeof(template->'lineIndex') is distinct from 'number' or (template->>'lineIndex') !~ '^[0-9]{1,2}$' then return false; end if;
      if (template->>'lineIndex')::integer > 23 then return false; end if;
      if template ? 'choiceId' and (not public.language_text_valid(template->'choiceId',80)
        or (template->>'choiceId') !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$') then return false; end if;
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(doc->'beats') beat group by beat->>'id' having count(*)>1) then return false; end if;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.scene_document_valid(jsonb) from public, anon, authenticated;

commit;
