import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createLanguage, validateLanguage } from '../src/engine.js';

let db;
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
const fresh = () => createLanguage({ seed: 'cloud-database', name: 'Cloud test' });
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
    insert into auth.users values ('${alice}'),('${bob}');
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/202611070001_cloud_languages.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202611080001_language_tools.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202611090003_generation_version.sql', import.meta.url), 'utf8'));
});
beforeEach(async () => {
  await db.exec('reset role; truncate public.cloud_languages;');
  await asUser(alice);
});
after(async () => { await db?.close(); });

async function asUser(id, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
  await db.exec(`set role ${role}`);
}
async function save({ id = randomUUID(), document = fresh(), version = null, mutation = randomUUID() } = {}) {
  const result = await db.query('select public.save_language($1::uuid,$2::jsonb,$3::bigint,$4::uuid) as result', [id, JSON.stringify(document), version, mutation]);
  return result.rows[0].result;
}
async function remove(id, version, mutation = randomUUID()) {
  const result = await db.query('select public.delete_language($1::uuid,$2::bigint,$3::uuid) as result', [id, version, mutation]);
  return result.rows[0].result;
}
const rejected = (action, message) => assert.rejects(action, error => {
  assert.ok(error.message.includes(message), `Expected ${message}, received ${error.message}`);
  return true;
});

test('cloud saves preserve canonical language documents and use independent server versions', async () => {
  const document = fresh();
  document.revision = 17;
  document.words[0].notes = 'First line\nSecond line\t𐐀';
  document.words[0].id = '𐐀_λέξη';
  document.script = { style: 'custom', direction: 'rtl', glyphs: { a: '𐐀', sh: 'ʃ' } };
  const saved = await save({ document });
  assert.deepEqual(saved.document, validateLanguage(document));
  assert.equal(saved.version, 1);
  assert.equal(saved.document.revision, 17);
  assert.equal(saved.deleted_at, null);
  assert.ok(Number.isFinite(Date.parse(saved.updated_at)));
  assert.equal(Object.hasOwn(saved, 'user_id'), false);
  const changed = structuredClone(document); changed.name = 'New name';
  const updated = await save({ id: saved.id, document: changed, version: 1 });
  assert.equal(updated.version, 2);
  assert.equal(updated.document.name, 'New name');
  assert.equal(updated.document.revision, 17);
});

test('row policies isolate accounts and write RPCs never accept another owner’s IDs', async () => {
  const mine = await save();
  await asUser(bob);
  assert.deepEqual((await db.query('select id from public.cloud_languages')).rows, []);
  await rejected(() => save({ id: mine.id, version: 1 }), 'CLOUD_CONFLICT');
  await rejected(() => save({ id: mine.id }), 'CLOUD_CONFLICT');
  await rejected(() => remove(mine.id, 1), 'CLOUD_CONFLICT');
  const theirs = await save();
  assert.deepEqual((await db.query('select id from public.cloud_languages')).rows, [{ id: theirs.id }]);
  await asUser(alice);
  assert.deepEqual((await db.query('select id from public.cloud_languages')).rows, [{ id: mine.id }]);
});

test('anonymous callers and direct writes are denied even if the browser supplies a user ID', async () => {
  const record = await save();
  await rejected(() => db.query('update public.cloud_languages set version=99 where id=$1', [record.id]), 'permission denied');
  await rejected(() => db.query('delete from public.cloud_languages where id=$1', [record.id]), 'permission denied');
  await rejected(() => db.query('insert into public.cloud_languages(id,user_id,document,last_mutation_id) values($1,$2,$3,$4)', [randomUUID(), alice, JSON.stringify(fresh()), randomUUID()]), 'permission denied');
  await asUser(null);
  assert.deepEqual((await db.query('select id from public.cloud_languages')).rows, []);
  await rejected(() => save(), 'AUTH_REQUIRED');
  await rejected(() => remove(record.id,1), 'AUTH_REQUIRED');
  await asUser(null, 'anon');
  await rejected(() => db.query('select id from public.cloud_languages'), 'permission denied');
  await rejected(() => save(), 'permission denied');
});

test('stale devices cannot overwrite newer saves and creation never overwrites an existing record', async () => {
  const record = await save();
  const newer = fresh(); newer.name = 'Other device';
  await save({ id: record.id, document: newer, version: 1 });
  await rejected(() => save({ id: record.id, version: 1 }), 'CLOUD_CONFLICT');
  await rejected(() => save({ id: record.id }), 'CLOUD_CONFLICT');
  await rejected(() => save({ version: 5 }), 'CLOUD_CONFLICT');
  const row = (await db.query('select document,version from public.cloud_languages where id=$1', [record.id])).rows[0];
  assert.equal(row.document.name, 'Other device');
  assert.equal(row.version, 2);
});

test('retrying a lost acknowledgment is idempotent, but mutation IDs cannot approve different content', async () => {
  const id = randomUUID(), mutation = randomUUID(), document = fresh();
  const first = await save({ id, mutation, document });
  assert.deepEqual(await save({ id, mutation, document }), first);
  const changed = structuredClone(document); changed.name = 'Changed';
  await rejected(() => save({ id, mutation, document: changed }), 'CLOUD_CONFLICT');
  await rejected(() => save({ id, mutation, version: 1, document: changed }), 'CLOUD_CONFLICT');
  await rejected(() => remove(id,1,mutation), 'CLOUD_CONFLICT');
  const nextMutation = randomUUID();
  const next = await save({ id, version: 1, mutation: nextMutation, document: changed });
  assert.deepEqual(await save({ id, version: 1, mutation: nextMutation, document: changed }), next);
  await rejected(() => save({ id, mutation, document }), 'CLOUD_CONFLICT');
});

test('soft deletion is versioned, idempotent and cannot resurrect an offline copy', async () => {
  const saved = await save();
  const mutation = randomUUID();
  const deleted = await remove(saved.id,1,mutation);
  assert.equal(deleted.version,2);
  assert.ok(deleted.deleted_at);
  assert.equal(deleted.document,null,'Deleted records retain only compact version metadata, not full language payloads');
  assert.equal((await db.query('select document from public.cloud_languages where id=$1',[saved.id])).rows[0].document,null);
  assert.deepEqual(await remove(saved.id,1,mutation), deleted);
  assert.deepEqual((await db.query('select id from public.cloud_languages where deleted_at is null')).rows, []);
  await rejected(() => save({ id: saved.id, version: 1 }), 'CLOUD_CONFLICT');
  await rejected(() => save({ id: saved.id, version: 2 }), 'CLOUD_CONFLICT');
  await rejected(() => remove(saved.id,2), 'CLOUD_CONFLICT');
  assert.equal((await save({ document: saved.document })).version,1);
});

test('database constraints require documents on active rows and compact metadata on deleted rows', async () => {
  const saved = await save();
  await db.exec('reset role');
  await rejected(() => db.query('update public.cloud_languages set document=null where id=$1',[saved.id]), 'cloud_document_lifecycle');
  await rejected(() => db.query('update public.cloud_languages set deleted_at=now() where id=$1',[saved.id]), 'cloud_document_lifecycle');
  await asUser(alice);
  await remove(saved.id,1);
  await db.exec('reset role');
  await rejected(() => db.query('update public.cloud_languages set document=$2::jsonb where id=$1',[saved.id,JSON.stringify(saved.document)]), 'cloud_document_lifecycle');
});

test('database validation rejects malformed documents without trusting frontend validation', async () => {
  const cases = [null, [], {}, { ...fresh(), version: 3 }, { ...fresh(), version: '2' }, { ...fresh(), words: {} }, { ...fresh(), revision: -1 }];
  for (const mutate of [
    doc => { doc.words[0].word = ''; },
    doc => { doc.words[0].id = '<invalid>'; },
    doc => { doc.words[0].locked = 'yes'; },
    doc => { doc.words[0].notes = '\u0001'; },
    doc => { doc.words[1].id = doc.words[0].id; },
    doc => { doc.words[1].english = '  ' + doc.words[0].english.toUpperCase() + '  '; },
    doc => { doc.grammar.order = 'SQL'; },
    doc => { doc.grammar.plural = 'x'.repeat(21); },
    doc => { doc.sounds.vowels = []; },
    doc => { doc.sounds.patterns = ['SELECT']; },
    doc => { doc.sounds.maxSyllables = 99; },
    doc => { doc.sounds = { consonants: ['bbbbbbbb'], vowels: ['aaaaaaaa'], patterns: ['CCV'], minSyllables: 1, maxSyllables: 5 }; },
    doc => { doc.script.direction = 'down'; },
    doc => { doc.script.glyphs = JSON.parse('{"__proto__":"x"}'); },
    doc => { doc.words[0].constructor = 'bad'; },
    doc => { doc.extra = { nested: { constructor: 'bad' } }; },
    doc => { doc.words = Array.from({length:2001},(_,i)=>({ ...doc.words[0],id:`w${i}`,english:`word ${i}` })); },
  ]) { const doc=fresh(); mutate(doc); cases.push(doc); }
  for (const document of cases) await rejected(() => save({ document }), 'INVALID_DOCUMENT');
  assert.equal((await db.query('select count(*)::int as count from public.cloud_languages')).rows[0].count,0);
});

test('UTF-8 byte bounds and required mutation/version fields are enforced at the database', async () => {
  const document = fresh();
  document.words = Array.from({length:900},(_,i)=>({ ...document.words[0],id:`w${i}`,english:`word ${i}`,notes:'𐐀'.repeat(400) }));
  assert.ok(Buffer.byteLength(JSON.stringify(document),'utf8')>1000000);
  await rejected(() => save({ document }), 'INVALID_DOCUMENT');
  await rejected(() => save({ id: null }), 'INVALID_DOCUMENT');
  await rejected(() => save({ mutation: null }), 'INVALID_DOCUMENT');
  await rejected(() => save({ version: 0 }), 'INVALID_DOCUMENT');
  await rejected(() => remove(randomUUID(),null), 'INVALID_DOCUMENT');
});

test('the per-account active-language quota is enforced and a deletion frees a slot', async () => {
  const document = fresh(); document.words=[];
  const saved=[];
  for (let i=0;i<50;i++) saved.push(await save({ document }));
  await rejected(() => save({ document }), 'CLOUD_LIMIT');
  await remove(saved[0].id,1);
  await save({ document });
  assert.equal((await db.query('select count(*)::int as count from public.cloud_languages where deleted_at is null')).rows[0].count,50);
  await asUser(bob);
  assert.equal((await save({ document })).version,1);
});
