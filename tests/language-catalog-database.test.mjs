import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createLanguage, validateLanguage } from '../src/engine.js';

import { languageFromBlueprint as expand } from '../src/language-generator.js';
import { incompatibleMarkers } from '../src/generator-diagnostics.js';

let db, blueprints;
before(async () => {
  db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;');
  await db.exec(await readFile(new URL('../supabase/migrations/202611090001_language_catalog.sql', import.meta.url), 'utf8'));
  blueprints = (await db.query('select blueprint from oddtongue_private.language_blueprints order by id')).rows.map(row => row.blueprint);
});
after(async () => { await db?.close(); });

async function asRole(role) {
  await db.exec('reset role');
  await db.exec(`set role ${role}`);
}
async function pick(excluded = []) {
  return (await db.query('select public.pick_language_blueprint($1::text[]) as result', [excluded])).rows[0].result;
}
test('the fixed catalog contains 1,000 named recipes with distinct sound configurations', async () => {
  assert.equal(blueprints.length, 1000);
  assert.equal(new Set(blueprints.map(blueprint => blueprint.seed)).size, 1000);
  assert.equal(new Set(blueprints.map(blueprint => blueprint.name)).size, 1000);
  assert.equal(new Set(blueprints.map(blueprint => JSON.stringify(blueprint.sounds))).size, 1000);
  assert.equal(new Set(blueprints.map(blueprint => blueprint.grammar.order)).size, 6);
  const base = createLanguage();
  for (const blueprint of blueprints) {
    assert.equal(blueprint.version, 1);
    assert.deepEqual(validateLanguage({ ...base, ...blueprint, version: 2, words: [] }).sounds, blueprint.sounds);
  }
});

test('every catalog recipe expands into a complete editable language', () => {
  for (const blueprint of blueprints) {
    const first = expand(blueprint);
    assert.ok(first.words.length > 200);
    assert.ok(first.words.every(word => !word.locked));
    assert.equal(first.revision, 1);
    assert.equal(first.grammar.order, blueprint.grammar.order);
    assert.deepEqual(incompatibleMarkers(first), [], blueprint.seed);
    const markerKeys = ['plural', 'past', 'future', 'negative', 'question'];
    if (new Set(markerKeys.map(key => blueprint.grammar[key])).size === 5) {
      assert.equal(new Set(markerKeys.map(key => first.grammar[key])).size, 5, blueprint.seed);
    }
    assert.ok(new Set(first.words.filter(word => !word.family).map(word => word.word)).size > 180);
  }
  assert.deepEqual(expand(blueprints[0]), expand(blueprints[0]));
  assert.deepEqual(expand(blueprints[999]), expand(blueprints[999]));
});

test('guests and signed-in users receive one recipe but cannot read or modify the catalog', async () => {
  for (const role of ['anon', 'authenticated']) {
    await asRole(role);
    const selected = await pick();
    assert.ok(blueprints.some(blueprint => blueprint.seed === selected.seed));
    assert.equal(Array.isArray(selected), false);
    assert.deepEqual(Object.keys(selected).sort(), ['version', 'name', 'seed', 'preset', 'sounds', 'grammar'].sort());
    await assert.rejects(db.query('select * from oddtongue_private.language_blueprints'), /permission denied/);
    await assert.rejects(db.query('update oddtongue_private.language_blueprints set blueprint = \'{}\''), /permission denied/);
    await assert.rejects(db.query('delete from oddtongue_private.language_blueprints'), /permission denied/);
  }
});

test('recent selections are excluded and public input is bounded', async () => {
  await asRole('anon');
  const recent = [];
  for (let i = 0; i < 25; i++) {
    const selected = await pick(recent);
    assert.ok(!recent.includes(selected.seed));
    recent.push(selected.seed);
  }
  assert.ok(!recent.includes((await pick(recent)).seed));
  for (const invalid of [null, Array(26).fill('seed'), [null], ['x'.repeat(129)]]) {
    await assert.rejects(pick(invalid), /CATALOG_INVALID_EXCLUSIONS/);
  }
  await assert.rejects(db.query("select public.pick_language_blueprint(array[['a','b'],['c','d']])"), /CATALOG_INVALID_EXCLUSIONS/);
});

test('the RPC has no public grant and fixes its search path', async () => {
  await db.exec('reset role');
  const { rows } = await db.query("select prosecdef, proconfig, proacl::text from pg_proc where oid = 'public.pick_language_blueprint(text[])'::regprocedure");
  assert.equal(rows[0].prosecdef, true);
  assert.ok(rows[0].proconfig.some(value => value === 'search_path=""'));
  assert.ok(!/(^|,)=[X]/.test(rows[0].proacl));
});
