-- Private versioned scene projects, including a portable language snapshot.
-- Apply after both language migrations. Existing language rows are unchanged.
begin;

create table public.cloud_scenes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document jsonb,
  version bigint not null default 1 check (version between 1 and 1000000000),
  last_mutation_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cloud_scene_document_size check (octet_length(document::text) <= 1000000),
  constraint cloud_scene_document_lifecycle check (
    (deleted_at is null and document is not null)
    or (deleted_at is not null and document is null)
  )
);
create index cloud_scenes_owner_updated on public.cloud_scenes(user_id, updated_at desc);

alter table public.cloud_scenes enable row level security;
create policy "Read your own scenes" on public.cloud_scenes
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.cloud_scenes from public, anon, authenticated;
grant select on table public.cloud_scenes to authenticated;

create function public.scene_document_valid(doc jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  options jsonb;
  template jsonb;
  word_ids jsonb;
  english_keys jsonb;
  field text;
  reference text;
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
  select coalesce(jsonb_object_agg(word->>'id',true),'{}'::jsonb),
    coalesce(jsonb_object_agg(lower(regexp_replace(btrim(normalize(word->>'english',NFC)), '\s+', ' ', 'g')),true),'{}'::jsonb)
    into word_ids,english_keys from jsonb_array_elements(doc->'language'->'words') word;

  if jsonb_typeof(doc->'beats') is distinct from 'array' then return false; end if;
  if jsonb_array_length(doc->'beats') not between 1 and 24 then return false; end if;
  for item in select value from jsonb_array_elements(doc->'beats') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(item) k where k not in ('id','speaker','mode','options','text','english','template','action','cue','wordIndex','pauseMs')) then return false; end if;
    if not public.language_text_valid(item->'id',80) or (item->>'id') !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
      or (item->'speaker' is distinct from '0'::jsonb and item->'speaker' is distinct from '1'::jsonb)
      or (item->>'mode') is null or (item->>'mode') not in ('builder','literal','template')
      or (item->>'action') is null or (item->>'action') not in ('none','walk','turn','gesture','recoil','pass','drop')
      or (item->>'cue') is null or (item->>'cue') not in ('start','end','word')
      or jsonb_typeof(item->'wordIndex') is distinct from 'number' or (item->>'wordIndex') !~ '^[0-9]{1,3}$'
      or jsonb_typeof(item->'pauseMs') is distinct from 'number' or (item->>'pauseMs') !~ '^[0-9]{1,4}$' then return false; end if;
    if (item->>'wordIndex')::integer > 299 or (item->>'pauseMs')::integer > 5000 then return false; end if;
    foreach field in array array['text','english'] loop
      if (item ? field or item->>'mode' = 'literal')
        and not public.language_text_valid(item->field,300,true,true) then return false; end if;
    end loop;
    if item ? 'options' or item->>'mode' = 'builder' then
      options := item->'options';
      if jsonb_typeof(options) is distinct from 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(options) k where k not in ('subject','verb','object','adjective','tense','plural','negative','question')) then return false; end if;
      foreach field in array array['subject','verb','object','adjective'] loop
        if not public.language_text_valid(options->field,80,true) then return false; end if;
        reference := options->>field;
        if reference <> '' and not word_ids ? reference
          and not english_keys ? lower(regexp_replace(btrim(normalize(reference,NFC)), '\s+', ' ', 'g')) then return false; end if;
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

create function public.cloud_scene_result(row_value public.cloud_scenes)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',row_value.id,'document',row_value.document,
    'version',row_value.version,'updated_at',row_value.updated_at,'deleted_at',row_value.deleted_at);
$$;

create function public.save_scene(p_id uuid, p_document jsonb, p_expected_version bigint, p_mutation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.cloud_scenes;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  if p_id is null or p_mutation_id is null or not public.scene_document_valid(p_document)
    or (p_expected_version is not null and p_expected_version not between 1 and 999999999)
    then raise exception 'INVALID_DOCUMENT' using errcode='22023'; end if;
  -- Serialize this owner's writes: the quota and optimistic version check are
  -- both made in the same transaction as the actual change.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select * into existing from public.cloud_scenes where id=p_id and user_id=owner_id for update;
  if found then
    if existing.deleted_at is null and existing.last_mutation_id=p_mutation_id and existing.document=p_document
      and ((p_expected_version is null and existing.version=1) or existing.version=p_expected_version+1)
      then return public.cloud_scene_result(existing); end if;
    if existing.last_mutation_id=p_mutation_id then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
    if existing.deleted_at is not null or p_expected_version is null or existing.version<>p_expected_version
      then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
    update public.cloud_scenes set document=p_document,version=version+1,last_mutation_id=p_mutation_id,updated_at=clock_timestamp()
      where id=p_id and user_id=owner_id returning * into existing;
  else
    if p_expected_version is not null then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
    if (select count(*) from public.cloud_scenes where user_id=owner_id and deleted_at is null)>=50
      then raise exception 'CLOUD_LIMIT' using errcode='P0001'; end if;
    insert into public.cloud_scenes(id,user_id,document,last_mutation_id)
      values(p_id,owner_id,p_document,p_mutation_id) on conflict(id) do nothing returning * into existing;
    if not found then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
  end if;
  return public.cloud_scene_result(existing);
end;
$$;

create function public.delete_scene(p_id uuid, p_expected_version bigint, p_mutation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.cloud_scenes;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  if p_id is null or p_mutation_id is null or p_expected_version is null or p_expected_version not between 1 and 999999999
    then raise exception 'INVALID_DOCUMENT' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select * into existing from public.cloud_scenes where id=p_id and user_id=owner_id for update;
  if not found then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
  if existing.deleted_at is not null and existing.last_mutation_id=p_mutation_id and existing.version=p_expected_version+1
    then return public.cloud_scene_result(existing); end if;
  if existing.last_mutation_id=p_mutation_id then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
  if existing.deleted_at is not null or existing.version<>p_expected_version
    then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
  update public.cloud_scenes set document=null,version=version+1,last_mutation_id=p_mutation_id,
    updated_at=clock_timestamp(),deleted_at=clock_timestamp()
    where id=p_id and user_id=owner_id returning * into existing;
  return public.cloud_scene_result(existing);
end;
$$;

-- Authenticated clients can read their own rows and use only the versioned RPCs.
revoke all on function public.scene_document_valid(jsonb) from public,anon,authenticated;
revoke all on function public.cloud_scene_result(public.cloud_scenes) from public,anon,authenticated;
revoke all on function public.save_scene(uuid,jsonb,bigint,uuid) from public,anon,authenticated;
revoke all on function public.delete_scene(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.save_scene(uuid,jsonb,bigint,uuid) to authenticated;
grant execute on function public.delete_scene(uuid,bigint,uuid) to authenticated;

commit;
