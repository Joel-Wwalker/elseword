import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createLanguage, validateLanguage } from '../src/engine.js';

const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
const initialURL = new URL('../supabase/migrations/202611070001_cloud_languages.sql', import.meta.url);
const extensionURL = new URL('../supabase/migrations/202611080001_language_tools.sql', import.meta.url);
let db;

function legacyDocument() {
  const doc = createLanguage({ seed: 'database-tools', name: 'Old kept language' });
  doc.version = 1;
  delete doc.phrases;
  delete doc.sounds.rules;
  for (const word of doc.words) delete word.family;
  return doc;
}

function extendedDocument() {
  const doc = legacyDocument();
  doc.version = 2;
  doc.words = [
    { id: 'bread', english: 'bread', word: 'poma', pos: 'noun', category: 'Food', locked: true, notes: '' },
    { id: 'loaves', english: 'loaves', word: 'pomaen', pos: 'noun', category: 'Food', locked: false, notes: '', family: { rootId: 'bread', kind: 'plural' } },
    { id: 'eat', english: 'eat', word: 'mali', pos: 'verb', category: 'Action', locked: false, notes: '' },
    { id: 'feast', english: 'feast', word: 'pomamali', pos: 'noun', category: 'Food', locked: false, notes: '', family: { rootId: 'bread', kind: 'compound', otherRootId: 'eat' } },
    { id: 'meal', english: 'meal', word: 'kept-meal', pos: 'noun', category: 'Food', locked: true, notes: '', family: { rootId: 'feast', kind: 'alias' } },
  ];
  doc.sounds.rules = { initial: ['p'], final: ['a'], forbidden: ['vv'], weights: { p: 2, a: 0.25 } };
  doc.phrases = [{ id: 'dinner', name: 'Dinner', options: { subject: 'meal', verb: 'eat', object: 'bread', adjective: '', tense: 'present', plural: false, negative: false, question: true } }];
  return doc;
}

async function setupDatabase() {
  const instance = new PGlite();
  await instance.exec(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public,auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${alice}'),('${bob}');
  `);
  await instance.exec(await readFile(initialURL, 'utf8'));
  return instance;
}

async function asUser(instance, id, role = 'authenticated') {
  await instance.exec('reset role');
  await instance.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
  await instance.exec(`set role ${role}`);
}

async function save(document, { instance = db, id = randomUUID(), version = null, mutation = randomUUID() } = {}) {
  const result = await instance.query('select public.save_language($1::uuid,$2::jsonb,$3::bigint,$4::uuid) as result', [id, JSON.stringify(document), version, mutation]);
  return result.rows[0].result;
}

const rejected = (action, message = 'INVALID_DOCUMENT') => assert.rejects(action, error => {
  assert.ok(error.message.includes(message), `Expected ${message}, received ${error.message}`);
  return true;
});

before(async () => {
  db = await setupDatabase();
  await db.exec(await readFile(extensionURL, 'utf8'));
});
beforeEach(async () => {
  await db.exec('reset role; truncate public.cloud_languages;');
  await asUser(db, alice);
});
after(async () => { await db?.close(); });

test('language-tool migration upgrades an already saved v1 language without changing its kept spellings or metadata', async () => {
  const instance = await setupDatabase();
  try {
    const old = legacyDocument();
    old.words[0].word = 'My-kept-spelling';
    old.words[0].locked = true;
    await asUser(instance, alice);
    const originalMutation = randomUUID();
    const saved = await save(old, { instance, mutation: originalMutation });
    assert.equal(saved.document.version, 1);
    await rejected(() => save(extendedDocument(), { instance }));
    await instance.exec('reset role');
    await instance.exec(await readFile(extensionURL, 'utf8'));
    await asUser(instance, alice);
    const preserved = (await instance.query('select document,version,updated_at,last_mutation_id from public.cloud_languages where id=$1', [saved.id])).rows[0];
    assert.deepEqual(preserved.document, old);
    assert.equal(preserved.version, 1);
    assert.equal(preserved.last_mutation_id, originalMutation);
    assert.equal(new Date(preserved.updated_at).toISOString(), new Date(saved.updated_at).toISOString());
    const upgraded = validateLanguage(old);
    assert.equal(upgraded.version, 2);
    assert.equal(upgraded.words[0].word, 'My-kept-spelling');
    const mutation = randomUUID();
    const next = await save(upgraded, { instance, id: saved.id, version: 1, mutation });
    assert.equal(next.version, 2);
    assert.deepEqual(next.document, upgraded);
    assert.deepEqual(await save(upgraded, { instance, id: saved.id, version: 1, mutation }), next);
    await rejected(() => save(old, { instance, id: saved.id, version: 1 }), 'CLOUD_CONFLICT');
  } finally { await instance.close(); }
});

test('canonical sound rules, related words and phrasebook survive cloud storage unchanged', async () => {
  const doc = extendedDocument();
  const saved = await save(doc);
  assert.deepEqual(saved.document, doc);
  const normalized = validateLanguage(saved.document);
  assert.deepEqual(normalized, doc);
  const withOldVersion = structuredClone(doc); withOldVersion.version = 1;
  assert.deepEqual((await save(withOldVersion)).document, withOldVersion);
  const plain = legacyDocument(); plain.version = 2;
  assert.deepEqual((await save(plain)).document, plain);
});

test('sound rules reject malformed structures, excessive bounds and unknown inventory weights', async () => {
  for (const mutate of [
    d => { d.sounds.rules = null; },
    d => { d.sounds.rules = []; },
    d => { d.sounds.rules.initial = 'p'; },
    d => { d.sounds.rules.final = {}; },
    d => { d.sounds.rules.forbidden = [false]; },
    d => { d.sounds.rules.initial = ['']; },
    d => { d.sounds.rules.initial = [' ']; },
    d => { d.sounds.rules.initial = ['x'.repeat(17)]; },
    d => { d.sounds.rules.initial = ['p!']; },
    d => { d.sounds.rules.initial = ['Ⅷ']; },
    d => { d.sounds.rules.initial = ['ⓐ']; },
    d => { d.sounds.rules.initial = ['p\n']; },
    d => { d.sounds.rules.initial = Array.from({ length: 41 }, (_, i) => 'p' + 'a'.repeat(i % 16)); },
    d => { d.sounds.rules.weights = []; },
    d => { d.sounds.rules.weights = { p: '2' }; },
    d => { d.sounds.rules.weights = { p: 0 }; },
    d => { d.sounds.rules.weights = { p: -1 }; },
    d => { d.sounds.rules.weights = { p: 101 }; },
    d => { d.sounds.rules.weights = { missing: 1 }; },
    d => { d.sounds.rules.extra = true; },
    d => { d.sounds.rules.weights = JSON.parse('{"__proto__":1}'); },
    d => { d.sounds.rules = JSON.parse('{"initial":[],"final":[],"forbidden":[],"weights":{},"constructor":{}}'); },
  ]) {
    const doc = extendedDocument(); mutate(doc);
    await rejected(() => save(doc));
  }
  assert.equal((await db.query('select count(*)::int as count from public.cloud_languages')).rows[0].count, 0);
});

test('sound rule bounds allow phonetic sequences and fractional weights', async () => {
  const doc = extendedDocument();
  doc.sounds.rules = { initial: ['p', 'ə', 'é', 'a\u0301', 'ʔ', "a'", 'a’', 'किर'], final: ['a'.repeat(16)], forbidden: [], weights: { p: 100, a: 0.00001 } };
  assert.deepEqual((await save(doc)).document.sounds.rules, doc.sounds.rules);
});

test('word families reject missing references, illegal kinds, extra keys and every cycle shape', async () => {
  for (const mutate of [
    d => { d.words[1].family = null; },
    d => { d.words[1].family = []; },
    d => { d.words[1].family = {}; },
    d => { d.words[1].family.rootId = 'missing'; },
    d => { d.words[1].family.rootId = 1; },
    d => { d.words[1].family.rootId = 'loaves'; },
    d => { d.words[1].family.kind = 'past'; },
    d => { d.words[1].family.otherRootId = 'bread'; },
    d => { delete d.words[3].family.otherRootId; },
    d => { d.words[3].family.otherRootId = 'missing'; },
    d => { d.words[3].family.otherRootId = 'feast'; },
    d => { d.words[0].family = { rootId: 'loaves', kind: 'alias' }; },
    d => { d.words[0].family = { rootId: 'meal', kind: 'alias' }; },
    d => { d.words[1].family.extra = {}; },
    d => { d.words[1].family = JSON.parse('{"rootId":"bread","kind":"plural","prototype":{}}'); },
  ]) {
    const doc = extendedDocument(); mutate(doc);
    await rejected(() => save(doc));
  }
});

test('family validation resolves a deep compound graph without expanding every ancestry path', async () => {
  const doc = extendedDocument();
  doc.phrases = [];
  doc.words = Array.from({ length: 120 }, (_, i) => ({
    id: `node-${String(i).padStart(3, '0')}`, english: `entry ${i}`, word: 'kept', pos: 'noun', category: 'Custom', locked: true, notes: '',
    ...(i < 118 ? { family: { rootId: `node-${String(i + 1).padStart(3, '0')}`, otherRootId: `node-${String(i + 2).padStart(3, '0')}`, kind: 'compound' } } : {}),
  }));
  assert.equal((await save(doc)).document.words.length, 120);
  doc.words[119].family = { rootId: 'node-000', kind: 'alias' };
  await rejected(() => save(doc));
});

test('phrasebook rejects invalid nested types, options, references, duplicate IDs and overflow', async () => {
  for (const mutate of [
    d => { d.phrases = {}; },
    d => { d.phrases = null; },
    d => { d.phrases = [null]; },
    d => { d.phrases[0].id = '<script>'; },
    d => { d.phrases[0].name = ''; },
    d => { d.phrases[0].name = 'x'.repeat(81); },
    d => { d.phrases[0].extra = 1; },
    d => { d.phrases[0].options = []; },
    d => { d.phrases[0].options = null; },
    d => { d.phrases[0].options.subject = ['bread']; },
    d => { d.phrases[0].options.object = 'missing'; },
    d => { d.phrases[0].options.adjective = 'x'.repeat(81); },
    d => { d.phrases[0].options.tense = 'yesterday'; },
    d => { d.phrases[0].options.plural = 'false'; },
    d => { d.phrases[0].options.negative = 0; },
    d => { d.phrases[0].options.question = null; },
    d => { d.phrases[0].options.extra = true; },
    d => { d.phrases[0].options = JSON.parse('{"constructor":{}}'); },
    d => { d.phrases.push(structuredClone(d.phrases[0])); },
    d => { d.phrases = Array.from({ length: 51 }, (_, i) => ({ ...d.phrases[0], id: `phrase-${i}` })); },
  ]) {
    const doc = extendedDocument(); mutate(doc);
    await rejected(() => save(doc));
  }
});

test('phrasebook accepts its upper bound and references word IDs or normalized English', async () => {
  const doc = extendedDocument();
  doc.words[0].id = 'word-bread';
  doc.words[1].family.rootId = 'word-bread';
  doc.words[3].family.rootId = 'word-bread';
  doc.phrases = Array.from({ length: 50 }, (_, i) => ({ id: `phrase-${i}`, name: 'x'.repeat(80), options: { subject: 'word-bread', verb: 'eat', object: 'bread', adjective: '', tense: 'future', plural: true, negative: true, question: false } }));
  assert.deepEqual((await save(doc)).document.phrases, doc.phrases);
});

test('extension saves retain owner isolation, stale-version protection and idempotent acknowledgment', async () => {
  const doc = extendedDocument();
  const id = randomUUID(), mutation = randomUUID();
  const saved = await save(doc, { id, mutation });
  assert.deepEqual(await save(doc, { id, mutation }), saved);
  const changed = structuredClone(doc); changed.phrases[0].name = 'Changed phrase';
  await rejected(() => save(changed, { id, mutation }), 'CLOUD_CONFLICT');
  await save(changed, { id, version: 1 });
  await rejected(() => save(doc, { id, version: 1 }), 'CLOUD_CONFLICT');
  await asUser(db, bob);
  assert.deepEqual((await db.query('select id from public.cloud_languages')).rows, []);
  await rejected(() => save(doc, { id, version: 2 }), 'CLOUD_CONFLICT');
  await rejected(() => db.query('select public.language_document_valid($1::jsonb)', [JSON.stringify(doc)]), 'permission denied');
  await rejected(() => db.query('update public.cloud_languages set document=$1', [JSON.stringify(doc)]), 'permission denied');
  await asUser(db, null, 'anon');
  await rejected(() => save(doc), 'permission denied');
});
