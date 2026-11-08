-- Read-only administrator checks after applying the two 20261108 migrations.
-- Expected: both tables have RLS; authenticated SELECT only; anon no access.
select c.relname as collection, c.relrowsecurity as rls_enabled,
  has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as authenticated_direct_write,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anonymous_access
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('cloud_languages','cloud_scenes')
order by c.relname;

-- Expected: one SELECT policy per collection, scoped to auth.uid() = user_id.
select tablename,policyname,roles,cmd,qual
from pg_policies
where schemaname='public' and tablename in ('cloud_languages','cloud_scenes')
order by tablename,policyname;

-- Expected: the four save/delete RPCs alone are executable by authenticated.
-- They are SECURITY DEFINER with empty search_path. Helpers deny client calls.
select p.proname,p.prosecdef as security_definer,p.proconfig,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'language_text_valid','language_document_valid','scene_document_valid',
  'cloud_language_result','cloud_scene_result',
  'save_language','delete_language','save_scene','delete_scene'
)
order by p.proname;

-- Counts only: this does not expose language or scene contents or change rows.
-- Existing v1 languages should remain v1 until explicitly saved by the editor.
select 'languages' as collection,count(*) as total,
  count(*) filter (where deleted_at is null) as active,
  count(*) filter (where deleted_at is null and document->'version'='1'::jsonb) as version_one,
  count(*) filter (where deleted_at is null and not public.language_document_valid(document)) as invalid_active
from public.cloud_languages
union all
select 'scenes',count(*),count(*) filter (where deleted_at is null),
  count(*) filter (where deleted_at is null and document->'version'='1'::jsonb),
  count(*) filter (where deleted_at is null and not public.scene_document_valid(document))
from public.cloud_scenes;
