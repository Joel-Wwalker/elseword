-- A fixed catalog of 1,000 language blueprints, selected one at a time.
-- Vocabulary is expanded deterministically by the browser's language engine.
begin;

create schema if not exists oddtongue_private;
revoke all on schema oddtongue_private from public, anon, authenticated;

create table oddtongue_private.language_blueprints (
  id integer primary key check (id between 1 and 1000),
  blueprint jsonb not null
);
create unique index language_blueprint_seed_unique
  on oddtongue_private.language_blueprints ((blueprint->>'seed'));

revoke all on table oddtongue_private.language_blueprints from public, anon, authenticated;
alter table oddtongue_private.language_blueprints enable row level security;

with inventories as (
  select
    array['Ala','Bel','Cor','Dae','Elo','Fen','Gar','Hal','Iri','Jun','Kel','Lor','Mir','Nel','Ori','Per','Qal','Rin','Sor','Tal','Ura','Vel','Wen','Yar','Zel'] as names,
    array['ven','ri','san','lo','th','na','mi','dor','sha','len','kin','ra','mos','lith','wa','ren','ka','nis','vor','mel','di','rus','hal','wyn','mar','zen','nol','lir','tan','shi','ne','vos','lum','rin','kor','sil','var','no','wen','kas'] as endings,
    array[
      'm n l r p s v', 'p t k b d g s z ch', 'm n ng r l d g h w',
      'q x zh sh th v z', 'f v s h l n m', 't k s ts r n y',
      'b d g m n l w', 'sh zh ch j r l n', 'p k h m n w y',
      'd t th s z r l'
    ] as consonants,
    array['a e i o u','a e i o','a o u ə','a i y ø æ','e i u','a e o','i o u','a ə i','a e y ø','a i u'] as vowels,
    array['CV V','CVC CV','CV CVC VC','CCV CVC V','CV VC','CVC VC','CV','CCV CV','V CVC','CV V VC'] as patterns,
    array['soft','crisp','earthy','strange','soft','crisp','earthy','strange','soft','crisp'] as presets,
    array['SVO','SOV','VSO','VOS','OSV','OVS'] as orders,
    array['en','i','um','ar','esh','on','li','an','u','ir'] as plurals,
    array['ta','ke','do','mi','pa','sha','nu','ra','ve','zi'] as particles
), recipes as (
  select n + 1 as id, jsonb_build_object(
    'version', 1,
    'name', names[n / 40 + 1] || endings[n % 40 + 1],
    'seed', 'oddtongue-catalog-v1-' || lpad((n + 1)::text, 4, '0'),
    'preset', presets[n % 10 + 1],
    'sounds', jsonb_build_object(
      'consonants', string_to_array(consonants[n % 10 + 1], ' '),
      'vowels', string_to_array(vowels[n / 10 % 10 + 1], ' '),
      'patterns', string_to_array(patterns[n / 100 + 1], ' '),
      'minSyllables', case when n / 100 in (0, 6, 7) then 2 else 1 end,
      'maxSyllables', case when n / 100 in (0, 2, 6, 9) then 3 else 2 end
    ),
    'grammar', jsonb_build_object(
      'order', orders[n % 6 + 1],
      'adjective', case when n / 6 % 2 = 0 then 'before' else 'after' end,
      'plural', plurals[n / 10 % 10 + 1],
      'past', particles[n % 10 + 1],
      'future', particles[(n + 3) % 10 + 1],
      'negative', particles[(n + 6) % 10 + 1],
      'question', particles[(n + 8) % 10 + 1]
    )
  ) as blueprint
  from generate_series(0, 999) n cross join inventories
)
insert into oddtongue_private.language_blueprints(id, blueprint)
select id, blueprint from recipes;

create function public.pick_language_blueprint(excluded_seeds text[] default '{}')
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  selected jsonb;
begin
  if excluded_seeds is null or cardinality(excluded_seeds) > 25
    or coalesce(array_ndims(excluded_seeds), 1) <> 1
    or exists (select 1 from unnest(excluded_seeds) seed where seed is null or length(seed) > 128)
  then
    raise exception 'CATALOG_INVALID_EXCLUSIONS' using errcode = '22023';
  end if;

  select entry.blueprint into selected
  from oddtongue_private.language_blueprints entry
  where not (entry.blueprint->>'seed') = any(excluded_seeds)
  order by random()
  limit 1;

  if selected is null then
    raise exception 'CATALOG_UNAVAILABLE' using errcode = 'P0001';
  end if;
  return selected;
end;
$$;

revoke all on function public.pick_language_blueprint(text[]) from public;
grant execute on function public.pick_language_blueprint(text[]) to anon, authenticated;

commit;
