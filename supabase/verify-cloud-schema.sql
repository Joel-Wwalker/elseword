-- Read-only catalog verification. This query reads no user or language rows.
-- Expected: table rls=true, force_rls=false; owner is the migration role.
-- Exactly one authenticated SELECT policy: auth.uid() = user_id.
-- anon_table_privileges=[]; authenticated_table_privileges=["SELECT"].
-- Exactly five functions, all with an empty search_path.
-- Only save_language/delete_language are SECURITY DEFINER and executable by
-- authenticated. All anon_execute=false; helper authenticated_execute=false.
-- Constraints: PK; auth.users FK ON DELETE CASCADE; version 1..1000000000;
-- document size <=1000000 bytes; active document / deleted null lifecycle.
-- Catalog checks do not replace a real signed-in, cross-account API test.

WITH target AS (
  SELECT c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='cloud_languages'
), functions AS (
  SELECT p.oid,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('save_language','delete_language','language_text_valid','language_document_valid','cloud_language_result')
)
SELECT jsonb_build_object(
  'table',(SELECT jsonb_build_object('rls',relrowsecurity,'force_rls',relforcerowsecurity,'owner',pg_get_userbyid(relowner)) FROM target),
  'policies',(SELECT jsonb_agg(jsonb_build_object('roles',roles,'command',cmd,'using',qual)) FROM pg_policies WHERE schemaname='public' AND tablename='cloud_languages'),
  'anon_table_privileges',(SELECT coalesce(jsonb_agg(priv),'[]'::jsonb) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) priv WHERE has_table_privilege('anon','public.cloud_languages',priv)),
  'authenticated_table_privileges',(SELECT coalesce(jsonb_agg(priv),'[]'::jsonb) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) priv WHERE has_table_privilege('authenticated','public.cloud_languages',priv)),
  'functions',(SELECT jsonb_agg(jsonb_build_object('name',proname,'definer',prosecdef,'settings',proconfig,'owner',owner,'anon_execute',has_function_privilege('anon',oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',oid,'EXECUTE')) ORDER BY proname) FROM functions),
  'constraints',(SELECT jsonb_object_agg(conname,pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid=(SELECT oid FROM target))
) AS cloud_schema_verification;
