import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createLanguage } from '../src/engine.js';
import { createSceneProject, validateSceneProject, compileSceneProject } from '../src/scene-project.js';
import { SCENES, getSceneEpisode } from '../src/scenes.js';

let db;
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
const charlie = '10000000-0000-4000-8000-000000000003';
const options = () => ({ subject: 'i', verb: 'want', object: 'bread', adjective: '', tense: 'present', plural: false, negative: false, question: false });
const beat = (overrides = {}) => ({ id: 'beat-one', speaker: 0, mode: 'literal', text: 'Poma!', english: 'Bread!', action: 'gesture', cue: 'start', wordIndex: 0, pauseMs: 400, ...overrides });
const fresh = () => ({ format: 'little-languages-scene', version: 1, id: 'scene-one', name: 'A quiet bakery', room: 'bakery', cast: ['moss', 'kiln'], prop: 'bread', language: createLanguage({ seed: 'scene-database' }), captions: 'both', sound: true, beats: [beat()] });

before(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public,auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${alice}'),('${bob}'),('${charlie}');
  `);
  for (const name of ['202611070001_cloud_languages.sql', '202611080001_language_tools.sql', '202611080002_cloud_scenes.sql', '202611090002_scene_draft_references.sql', '202611090003_generation_version.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
});
after(async () => { await db?.close(); });

async function asUser(id, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
  await db.exec(`set role ${role}`);
}

async function save({ id = randomUUID(), document = fresh(), version = null, mutation = randomUUID() } = {}) {
  const result = await db.query('select public.save_scene($1::uuid,$2::jsonb,$3::bigint,$4::uuid) as result', [id, JSON.stringify(document), version, mutation]);
  return result.rows[0].result;
}

async function remove(id, version, mutation = randomUUID()) {
  const result = await db.query('select public.delete_scene($1::uuid,$2::bigint,$3::uuid) as result', [id, version, mutation]);
  return result.rows[0].result;
}

const rejected = (action, message = 'INVALID_DOCUMENT') => assert.rejects(action, error => {
  assert.ok(error.message.includes(message), `Expected ${message}, received ${error.message}`);
  return true;
});

test('scene migration creates a private separate collection and preserves portable documents', async () => {
  await db.exec('reset role');
  assert.equal((await db.query("select to_regclass('public.cloud_scenes')::text as table_name")).rows[0].table_name, 'cloud_scenes');
  await asUser(alice);
  const document = fresh();
  document.beats.push(beat({ id: 'beat-two', speaker: 1, mode: 'builder', options: options(), text: undefined, english: undefined, action: 'pass', cue: 'word', wordIndex: 1, pauseMs: 0 }));
  document.beats.push(beat({ id: 'beat-three', mode: 'template', template: { sceneId: 'bakery', episodeId: 'original', lineIndex: 0 }, text: undefined, english: undefined, action: 'none', cue: 'end' }));
  const canonical = JSON.parse(JSON.stringify(document));
  const saved = await save({ document });
  assert.deepEqual(saved.document, canonical);
  assert.equal(saved.version, 1);
  assert.equal(saved.deleted_at, null);
  assert.ok(Number.isFinite(Date.parse(saved.updated_at)));
  assert.equal(Object.hasOwn(saved, 'user_id'), false);
  assert.equal((await db.query('select count(*)::int as count from public.cloud_languages')).rows[0].count, 0);
});

test('canonical builder, literal and every built-in template branch round-trip through scene SQL', async () => {
  await asUser(alice);
  const language = createLanguage({ seed: 'canonical-scene-sql' });
  const documents = [createSceneProject(language)];
  const literal = structuredClone(documents[0]);
  literal.beats = [{ ...literal.beats[0], mode: 'literal', text: 'A kept line\n𐐀 é', english: 'Two lines\nwith Unicode.' }];
  delete literal.beats[0].options;
  documents.push(validateSceneProject(literal));
  for (const room of SCENES) {
    for (const episode of room.episodes) {
      const source = getSceneEpisode(room.id, episode.id);
      for (const choiceId of source.choice?.options.map(choice => choice.id) ?? [undefined]) {
        documents.push(createSceneProject(language, { room: room.id, episodeId: episode.id, ...(choiceId ? { choiceId } : {}) }));
      }
    }
  }
  for (const document of documents) {
    const saved = await save({ document });
    assert.deepEqual(saved.document, document, `${document.room}/${document.name}`);
    assert.deepEqual(validateSceneProject(saved.document), document);
  }
});

test('cloud saves preserve missing-reference drafts for repair without treating them as playable', async () => {
  await asUser(alice);
  const document = createSceneProject(createLanguage());
  document.beats[0].options.object = 'Removed-Word-ID';
  const saved = await save({ document });
  assert.equal(saved.document.beats[0].options.object, 'Removed-Word-ID');
  const restored = validateSceneProject(saved.document);
  assert.equal(restored.beats[0].options.object, 'Removed-Word-ID');
  assert.match(compileSceneProject(restored).beats[0].error, /dictionary/i);
  restored.beats[0].options.object = 'moon';
  const repaired = await save({ id: saved.id, document: restored, version: saved.version });
  assert.deepEqual(compileSceneProject(repaired.document).errors, []);
});

test('scene writes retain owner isolation and reject direct writes and anonymous access', async () => {
  await asUser(alice);
  const saved = await save();
  await rejected(() => db.query('update public.cloud_scenes set version=99 where id=$1', [saved.id]), 'permission denied');
  await rejected(() => db.query('delete from public.cloud_scenes where id=$1', [saved.id]), 'permission denied');
  await rejected(() => db.query('insert into public.cloud_scenes(id,user_id,document,last_mutation_id) values($1,$2,$3,$4)', [randomUUID(), alice, JSON.stringify(fresh()), randomUUID()]), 'permission denied');
  await rejected(() => db.query('select public.scene_document_valid($1::jsonb)', [JSON.stringify(fresh())]), 'permission denied');
  await asUser(bob);
  assert.equal((await db.query('select id from public.cloud_scenes where id=$1', [saved.id])).rows.length, 0);
  await rejected(() => save({ id: saved.id, version: 1 }), 'CLOUD_CONFLICT');
  await rejected(() => save({ id: saved.id }), 'CLOUD_CONFLICT');
  await rejected(() => remove(saved.id, 1), 'CLOUD_CONFLICT');
  await asUser(null);
  assert.deepEqual((await db.query('select id from public.cloud_scenes')).rows, []);
  await rejected(() => save(), 'AUTH_REQUIRED');
  await rejected(() => remove(saved.id, 1), 'AUTH_REQUIRED');
  await asUser(null, 'anon');
  await rejected(() => db.query('select id from public.cloud_scenes'), 'permission denied');
  await rejected(() => save(), 'permission denied');
});

test('scene retries are idempotent and stale versions or changed mutations cannot overwrite newer work', async () => {
  await asUser(alice);
  const document = fresh(), id = randomUUID(), mutation = randomUUID();
  const saved = await save({ id, document, mutation });
  assert.deepEqual(await save({ id, document, mutation }), saved);
  const changed = structuredClone(document); changed.beats[0].text = 'Edited!';
  await rejected(() => save({ id, document: changed, mutation }), 'CLOUD_CONFLICT');
  await rejected(() => remove(id, 1, mutation), 'CLOUD_CONFLICT');
  const nextMutation = randomUUID();
  const updated = await save({ id, document: changed, version: 1, mutation: nextMutation });
  assert.equal(updated.version, 2);
  assert.deepEqual(await save({ id, document: changed, version: 1, mutation: nextMutation }), updated);
  await rejected(() => save({ id, document, version: 1 }), 'CLOUD_CONFLICT');
  await rejected(() => save({ id, document }), 'CLOUD_CONFLICT');
  const stored = (await db.query('select document,version from public.cloud_scenes where id=$1', [id])).rows[0];
  assert.equal(stored.document.beats[0].text, 'Edited!');
  assert.equal(stored.version, 2);
});

test('scene deletions are compact, versioned and idempotent without resurrecting offline copies', async () => {
  await asUser(alice);
  const saved = await save(), mutation = randomUUID();
  const deleted = await remove(saved.id, 1, mutation);
  assert.equal(deleted.document, null);
  assert.equal(deleted.version, 2);
  assert.ok(deleted.deleted_at);
  assert.deepEqual(await remove(saved.id, 1, mutation), deleted);
  await rejected(() => save({ id: saved.id, version: 2 }), 'CLOUD_CONFLICT');
  await rejected(() => remove(saved.id, 2), 'CLOUD_CONFLICT');
  await db.exec('reset role');
  await rejected(() => db.query('update public.cloud_scenes set document=$2::jsonb where id=$1', [saved.id, JSON.stringify(fresh())]), 'cloud_scene_document_lifecycle');
});

test('scene validator rejects malformed roots, enums, nested beats and embedded language data', async () => {
  await asUser(alice);
  const cases = [null, [], {}, { ...fresh(), version: 2 }, { ...fresh(), version: '1' }];
  for (const mutate of [
    d => { d.format = 'other'; },
    d => { d.id = '<bad>'; },
    d => { d.name = ''; },
    d => { d.name = 'x'.repeat(81); },
    d => { d.room = 'attacker-room'; },
    d => { d.cast = 'moss'; },
    d => { d.cast = ['moss']; },
    d => { d.cast = ['moss', 'unknown']; },
    d => { d.cast = [0, 1]; },
    d => { d.prop = '../other.svg'; },
    d => { d.captions = 'off'; },
    d => { d.sound = 'true'; },
    d => { d.language = null; },
    d => { d.language.version = 1; },
    d => { d.language.version = 3; },
    d => { d.language.words[0].family = { rootId: 'missing', kind: 'alias' }; },
    d => { d.extra = {}; },
    d => { d.beats = {}; },
    d => { d.beats = []; },
    d => { d.beats = [null]; },
    d => { d.beats = Array.from({ length: 25 }, (_, i) => beat({ id: `beat-${i}` })); },
    d => { d.beats.push(structuredClone(d.beats[0])); },
    d => { d.beats[0].id = '<bad>'; },
    d => { d.beats[0].speaker = 2; },
    d => { d.beats[0].speaker = '0'; },
    d => { d.beats[0].mode = 'script'; },
    d => { d.beats[0].text = 'x'.repeat(301); },
    d => { d.beats[0].text = ['hello']; },
    d => { d.beats[0].english = 'x'.repeat(301); },
    d => { d.beats[0].action = 'execute'; },
    d => { d.beats[0].cue = 'later'; },
    d => { d.beats[0].wordIndex = 300; },
    d => { d.beats[0].wordIndex = -1; },
    d => { d.beats[0].wordIndex = 1.5; },
    d => { d.beats[0].pauseMs = 5001; },
    d => { d.beats[0].pauseMs = -1; },
    d => { d.beats[0].pauseMs = '100'; },
    d => { d.beats[0].extra = { constructor: true }; },
    d => { d.beats[0] = JSON.parse('{"__proto__":{}}'); },
  ]) { const document = fresh(); mutate(document); cases.push(document); }
  for (const document of cases) await rejected(() => save({ document }));
});

test('scene builder options and template references use typed bounded known fields', async () => {
  await asUser(alice);
  const builder = () => ({ ...fresh(), beats: [beat({ mode: 'builder', options: options(), text: undefined, english: undefined })] });
  const template = () => ({ ...fresh(), beats: [beat({ mode: 'template', template: { sceneId: 'bakery', episodeId: 'original', lineIndex: 0 }, text: undefined, english: undefined })] });
  for (const mutate of [
    d => { delete d.beats[0].options; },
    d => { d.beats[0].options = []; },
    d => { d.beats[0].options.subject = 'x'.repeat(81); },
    d => { d.beats[0].options.object = { missing: 'reference' }; },
    d => { d.beats[0].options.object = 'bad\u0001reference'; },
    d => { d.beats[0].options.verb = 1; },
    d => { d.beats[0].options.tense = 'today'; },
    d => { d.beats[0].options.question = 'false'; },
    d => { d.beats[0].options.extra = {}; },
    d => { d.beats[0].options = JSON.parse('{"constructor":{}}'); },
  ]) { const document = builder(); mutate(document); await rejected(() => save({ document })); }
  for (const mutate of [
    d => { delete d.beats[0].template; },
    d => { d.beats[0].template = []; },
    d => { d.beats[0].template.sceneId = 'missing'; },
    d => { d.beats[0].template.episodeId = '<bad>'; },
    d => { d.beats[0].template.lineIndex = 24; },
    d => { d.beats[0].template.lineIndex = 0.5; },
    d => { d.beats[0].template.choiceId = ''; },
    d => { d.beats[0].template.extra = {}; },
  ]) { const document = template(); mutate(document); await rejected(() => save({ document })); }
  const validTemplate = template(); validTemplate.beats[0].template.choiceId = 'choice-one';
  assert.equal((await save({ document: builder() })).document.beats[0].mode, 'builder');
  assert.equal((await save({ document: validTemplate })).document.beats[0].template.choiceId, 'choice-one');
});

test('scene save accepts all bounded values and rejects oversized UTF-8 documents and missing mutation fields', async () => {
  await asUser(alice);
  const document = fresh();
  document.name = 'x'.repeat(80);
  document.cast = ['moss', 'moss'];
  document.prop = 'none';
  document.beats = Array.from({ length: 24 }, (_, i) => beat({ id: `beat-${i}`, text: '𐐀'.repeat(300), english: 'x'.repeat(300), wordIndex: 299, pauseMs: 5000 }));
  assert.equal((await save({ document })).document.beats.length, 24);
  document.language.words = Array.from({ length: 900 }, (_, i) => ({ ...document.language.words[0], id: `w${i}`, english: `word ${i}`, notes: '𐐀'.repeat(400) }));
  assert.ok(Buffer.byteLength(JSON.stringify(document), 'utf8') > 1000000);
  await rejected(() => save({ document }));
  await rejected(() => save({ id: null }));
  await rejected(() => save({ mutation: null }));
  await rejected(() => save({ version: 0 }));
  await rejected(() => remove(randomUUID(), null));
});

test('scene quota is independent of language quota and deleting a scene frees one slot', async () => {
  await asUser(charlie);
  const document = fresh();
  const saved = [];
  for (let i = 0; i < 50; i++) saved.push(await save({ document }));
  await rejected(() => save({ document }), 'CLOUD_LIMIT');
  const language = await db.query('select public.save_language($1::uuid,$2::jsonb,null,$3::uuid) as result', [randomUUID(), JSON.stringify(document.language), randomUUID()]);
  assert.equal(language.rows[0].result.version, 1);
  await remove(saved[0].id, 1);
  await save({ document });
  assert.equal((await db.query('select count(*)::int as count from public.cloud_scenes where deleted_at is null')).rows[0].count, 50);
});
