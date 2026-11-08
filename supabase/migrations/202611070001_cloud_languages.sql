-- Private, versioned copies of the existing language JSON format.
-- Authentication is managed by Supabase; this table stores no passwords.
create table public.cloud_languages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document jsonb,
  version bigint not null default 1 check (version between 1 and 1000000000),
  last_mutation_id uuid not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cloud_document_size check (octet_length(document::text) <= 1000000),
  constraint cloud_document_lifecycle check (
    (deleted_at is null and document is not null)
    or (deleted_at is not null and document is null)
  )
);
create index cloud_languages_owner_updated on public.cloud_languages(user_id, updated_at desc);

alter table public.cloud_languages enable row level security;
create policy "Read your own languages" on public.cloud_languages
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.cloud_languages from public, anon, authenticated;
grant select on table public.cloud_languages to authenticated;

-- A bounded canonical document is checked again in PostgreSQL. Browser
-- validation improves feedback; it cannot authorize a database operation.
create function public.language_text_valid(value jsonb, maximum integer, allow_empty boolean default false, multiline boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(value) = 'string'
    and char_length(value #>> '{}') <= maximum
    and (allow_empty or char_length(btrim(value #>> '{}')) > 0)
    and case when multiline
      then translate(value #>> '{}', chr(9) || chr(10) || chr(13), '') !~ '[[:cntrl:]]'
      else (value #>> '{}') !~ '[[:cntrl:]]' end, false);
$$;

create function public.language_document_valid(doc jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  entry record;
  sounds jsonb;
  grammar jsonb;
  script jsonb;
  min_syllables integer;
  max_syllables integer;
  longest_consonant integer := 0;
  longest_vowel integer := 0;
  longest_syllable integer := 0;
  pattern text;
begin
  if doc is null or jsonb_typeof(doc) <> 'object' or octet_length(doc::text) > 1000000 then return false; end if;
  if exists (select 1 from jsonb_object_keys(doc) k where k not in ('version','id','name','seed','preset','sounds','grammar','script','words','revision')) then return false; end if;
  if doc->'version' is distinct from '1'::jsonb
    or not public.language_text_valid(doc->'id',80) or (doc->>'id') !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
    or not public.language_text_valid(doc->'name',60)
    or not public.language_text_valid(doc->'seed',128)
    or (doc->>'preset') is null or (doc->>'preset') not in ('soft','crisp','earthy','strange')
    or jsonb_typeof(doc->'revision') is distinct from 'number'
    or (doc->>'revision') !~ '^[0-9]+$' or length(doc->>'revision') > 7 then return false; end if;
  if (doc->>'revision')::integer > 1000000 then return false; end if;

  sounds := doc->'sounds';
  if jsonb_typeof(sounds) is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(sounds) k where k not in ('consonants','vowels','patterns','minSyllables','maxSyllables')) then return false; end if;
  if jsonb_typeof(sounds->'consonants') is distinct from 'array'
    or jsonb_typeof(sounds->'vowels') is distinct from 'array'
    or jsonb_typeof(sounds->'patterns') is distinct from 'array' then return false; end if;
  if jsonb_array_length(sounds->'consonants') > 40 or jsonb_array_length(sounds->'vowels') not between 1 and 40
    or jsonb_array_length(sounds->'patterns') not between 1 and 20 then return false; end if;
  for item in select value from jsonb_array_elements(sounds->'consonants') loop
    if not public.language_text_valid(item,8) then return false; end if;
    longest_consonant := greatest(longest_consonant,char_length(item #>> '{}'));
  end loop;
  for item in select value from jsonb_array_elements(sounds->'vowels') loop
    if not public.language_text_valid(item,8) then return false; end if;
    longest_vowel := greatest(longest_vowel,char_length(item #>> '{}'));
  end loop;
  if jsonb_typeof(sounds->'minSyllables') is distinct from 'number'
    or jsonb_typeof(sounds->'maxSyllables') is distinct from 'number'
    or (sounds->>'minSyllables') !~ '^[1-5]$' or (sounds->>'maxSyllables') !~ '^[1-5]$' then return false; end if;
  min_syllables := (sounds->>'minSyllables')::integer;
  max_syllables := (sounds->>'maxSyllables')::integer;
  if min_syllables > max_syllables then return false; end if;
  for item in select value from jsonb_array_elements(sounds->'patterns') loop
    if jsonb_typeof(item) <> 'string' then return false; end if;
    pattern := item #>> '{}';
    if pattern not in ('CV','CVC','V','VC','CCV') then return false; end if;
    if position('C' in pattern) > 0 and longest_consonant = 0 then return false; end if;
    longest_syllable := greatest(longest_syllable,
      (length(pattern)-length(replace(pattern,'C',''))) * longest_consonant
      + (length(pattern)-length(replace(pattern,'V',''))) * longest_vowel);
  end loop;
  if longest_syllable * max_syllables > 80 then return false; end if;

  grammar := doc->'grammar';
  if jsonb_typeof(grammar) is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(grammar) k where k not in ('order','adjective','plural','past','future','negative','question')) then return false; end if;
  if (grammar->>'order') is null or (grammar->>'order') not in ('SVO','SOV','VSO','VOS','OSV','OVS')
    or (grammar->>'adjective') is null or (grammar->>'adjective') not in ('before','after') then return false; end if;
  foreach pattern in array array['plural','past','future','negative','question'] loop
    if not public.language_text_valid(grammar->pattern,20,true) then return false; end if;
  end loop;

  script := doc->'script';
  if jsonb_typeof(script) is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(script) k where k not in ('style','direction','glyphs')) then return false; end if;
  if (script->>'style') is null or (script->>'style') not in ('latin','runes','custom')
    or (script->>'direction') is null or (script->>'direction') not in ('ltr','rtl')
    or jsonb_typeof(script->'glyphs') is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(script->'glyphs')) > 128 then return false; end if;
  for entry in select key,value from jsonb_each(script->'glyphs') loop
    if not public.language_text_valid(to_jsonb(entry.key),8) or lower(entry.key) in ('__proto__','constructor','prototype')
      or not public.language_text_valid(entry.value,16) then return false; end if;
  end loop;

  if jsonb_typeof(doc->'words') is distinct from 'array' then return false; end if;
  if jsonb_array_length(doc->'words') > 2000 then return false; end if;
  for item in select value from jsonb_array_elements(doc->'words') loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(item) k where k not in ('id','english','word','pos','category','locked','notes')) then return false; end if;
    if not public.language_text_valid(item->'id',80) or (item->>'id') !~ '^[[:alnum:]][[:alnum:]_-]*$'
      or not public.language_text_valid(item->'english',80)
      or not public.language_text_valid(item->'word',80)
      or not public.language_text_valid(item->'pos',30)
      or not public.language_text_valid(item->'category',60)
      or not public.language_text_valid(item->'notes',500,true,true)
      or jsonb_typeof(item->'locked') is distinct from 'boolean' then return false; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(doc->'words') w group by w->>'id' having count(*)>1)
    or exists (select 1 from jsonb_array_elements(doc->'words') w group by lower(regexp_replace(btrim(normalize(w->>'english',NFC)), '\s+', ' ', 'g')) having count(*)>1)
    then return false; end if;
  return true;
exception when others then
  -- Malformed JSON shapes and numeric casts are validation failures, not
  -- database details to expose to visitors.
  return false;
end;
$$;

create function public.cloud_language_result(row_value public.cloud_languages)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',row_value.id,'document',row_value.document,
    'version',row_value.version,'updated_at',row_value.updated_at,'deleted_at',row_value.deleted_at);
$$;

create function public.save_language(p_id uuid, p_document jsonb, p_expected_version bigint, p_mutation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.cloud_languages;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  if p_id is null or p_mutation_id is null or not public.language_document_valid(p_document)
    or (p_expected_version is not null and p_expected_version not between 1 and 999999999)
    then raise exception 'INVALID_DOCUMENT' using errcode='22023'; end if;
  -- Serialize this owner's writes: the quota and optimistic version check are
  -- both made in the same transaction as the actual change.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select * into existing from public.cloud_languages where id=p_id and user_id=owner_id for update;
  if found then
    if existing.deleted_at is null and existing.last_mutation_id=p_mutation_id and existing.document=p_document
      and ((p_expected_version is null and existing.version=1) or existing.version=p_expected_version+1)
      then return public.cloud_language_result(existing); end if;
    if existing.last_mutation_id=p_mutation_id then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
    if existing.deleted_at is not null or p_expected_version is null or existing.version<>p_expected_version
      then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
    update public.cloud_languages set document=p_document,version=version+1,last_mutation_id=p_mutation_id,updated_at=clock_timestamp()
      where id=p_id and user_id=owner_id returning * into existing;
  else
    if p_expected_version is not null then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
    if (select count(*) from public.cloud_languages where user_id=owner_id and deleted_at is null)>=50
      then raise exception 'CLOUD_LIMIT' using errcode='P0001'; end if;
    insert into public.cloud_languages(id,user_id,document,last_mutation_id)
      values(p_id,owner_id,p_document,p_mutation_id) on conflict(id) do nothing returning * into existing;
    if not found then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
  end if;
  return public.cloud_language_result(existing);
end;
$$;

create function public.delete_language(p_id uuid, p_expected_version bigint, p_mutation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.cloud_languages;
begin
  if owner_id is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  if p_id is null or p_mutation_id is null or p_expected_version is null or p_expected_version not between 1 and 999999999
    then raise exception 'INVALID_DOCUMENT' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select * into existing from public.cloud_languages where id=p_id and user_id=owner_id for update;
  if not found then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
  if existing.deleted_at is not null and existing.last_mutation_id=p_mutation_id and existing.version=p_expected_version+1
    then return public.cloud_language_result(existing); end if;
  if existing.last_mutation_id=p_mutation_id then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
  if existing.deleted_at is not null or existing.version<>p_expected_version
    then raise exception 'CLOUD_CONFLICT' using errcode='P0001'; end if;
  update public.cloud_languages set document=null,version=version+1,last_mutation_id=p_mutation_id,
    updated_at=clock_timestamp(),deleted_at=clock_timestamp()
    where id=p_id and user_id=owner_id returning * into existing;
  return public.cloud_language_result(existing);
end;
$$;

-- Only these two constrained write paths are exposed to signed-in clients.
revoke all on function public.language_text_valid(jsonb,integer,boolean,boolean) from public,anon,authenticated;
revoke all on function public.language_document_valid(jsonb) from public,anon,authenticated;
revoke all on function public.cloud_language_result(public.cloud_languages) from public,anon,authenticated;
revoke all on function public.save_language(uuid,jsonb,bigint,uuid) from public,anon,authenticated;
revoke all on function public.delete_language(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.save_language(uuid,jsonb,bigint,uuid) to authenticated;
grant execute on function public.delete_language(uuid,bigint,uuid) to authenticated;
