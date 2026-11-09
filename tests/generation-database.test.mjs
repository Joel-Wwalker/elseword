import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createLanguage } from '../src/engine.js';
import { createSceneProject } from '../src/scene-project.js';
import { languageFromBlueprint } from '../src/language-generator.js';

let db;
let existingSave;
const owner = '10000000-0000-4000-8000-000000000001';
before(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon nologin; create role authenticated nologin;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select '${owner}'::uuid $$;
    insert into auth.users values ('${owner}');`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    if (name === '202611090003_generation_version.sql') {
      const legacy = createLanguage({ generationVersion: 1 });
      const saved = await db.query('select public.save_language($1::uuid,$2::jsonb,null,$3::uuid) as saved', [randomUUID(), JSON.stringify(legacy), randomUUID()]);
      existingSave = saved.rows[0].saved;
    }
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
  }
});
after(async () => { await db?.close(); });

test('new generation metadata survives language and embedded scene cloud saves', async () => {
  const language = createLanguage(), scene = createSceneProject(language);
  for (const [rpc, document] of [['save_language', language], ['save_scene', scene]]) {
    const result = await db.query(`select public.${rpc}($1::uuid,$2::jsonb,null,$3::uuid) as saved`, [randomUUID(), JSON.stringify(document), randomUUID()]);
    assert.deepEqual(result.rows[0].saved.document, document);
  }
  const old = createLanguage({ generationVersion: 1 });
  assert.equal((await db.query('select public.language_document_valid($1::jsonb) as valid', [JSON.stringify(old)])).rows[0].valid, true);
  for (const invalid of [null, 0, 1, 3, '2', true, {}]) {
    const document = { ...language, generationVersion: invalid };
    assert.equal((await db.query('select public.language_document_valid($1::jsonb) as valid', [JSON.stringify(document)])).rows[0].valid, false);
  }
});

test('the validator migration leaves existing saved vocabulary and versions unchanged', async () => {
  const { rows } = await db.query('select document,version,updated_at from public.cloud_languages where id=$1::uuid', [existingSave.id]);
  assert.deepEqual(rows[0].document, existingSave.document);
  assert.equal(rows[0].version, existingSave.version);
  assert.equal(new Date(rows[0].updated_at).toISOString(), new Date(existingSave.updated_at).toISOString());
});

test('every server catalog blueprint expands into deterministic clean words and linked plurals', async () => {
  const recipes = (await db.query('select blueprint from oddtongue_private.language_blueprints order by id')).rows;
  assert.equal(recipes.length, 1000);
  for (let index = 0; index < recipes.length; index++) {
    const recipe = recipes[index].blueprint, before = structuredClone(recipe);
    const language = languageFromBlueprint(recipe);
    assert.equal(language.generationVersion, 2);
    const vowels = language.sounds.vowels.includes('y') ? /[aeiouyøæə]{3}/iu : /[aeiouøæə]{3}/iu;
    for (const word of language.words) {
      assert.doesNotMatch(word.word, vowels, `${recipe.seed}: ${word.english} = ${word.word}`);
      assert.doesNotMatch(word.word, /(.)\1\1/u, `${recipe.seed}: ${word.english} = ${word.word}`);
      if (word.family?.kind === 'plural') assert.equal(word.word, language.words.find(root => root.id === word.family.rootId).word + language.grammar.plural);
    }
    assert.deepEqual(recipe, before);
    if (index % 100 === 0) assert.deepEqual(languageFromBlueprint(recipe), language);
  }
});
