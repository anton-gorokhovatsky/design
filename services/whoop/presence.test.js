import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Presence, presenceRequest } from './presence.js';

function service() {
  const db = new DatabaseSync(':memory:');
  let alarm = null;
  const storage = {
    sql: { exec(query, ...params) {
      const rows = db.prepare(query).all(...params);
      return { one: () => rows[0], toArray: () => rows };
    } },
    getAlarm: async () => alarm,
    setAlarm: async time => { alarm = time; },
  };
  const object = new Presence({ storage });
  const env = { PUBLIC_ORIGIN: 'https://gorokhovatsky.tech', PRESENCE: { idFromName: () => 'site', get: () => object } };
  const call = (body, origin = env.PUBLIC_ORIGIN) => presenceRequest(new Request('https://service.example/presence', {
    method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body), headers: { origin } } : {}),
  }), env);
  return { call, db, object, storage };
}
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';

test('Presence renews one visit, counts another, expires and leaves without history', async t => {
  const s = service();
  t.after(() => s.db.close());
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  assert.deepEqual(await (await s.call()).json(), { count: 0, ttl: 90 });
  await s.call({ id: a, action: 'beat' });
  now += 20000;
  assert.equal((await (await s.call({ id: a, action: 'beat' })).json()).count, 1);
  assert.equal((await (await s.call({ id: b, action: 'beat' })).json()).count, 2);
  assert.equal((await (await s.call({ id: a, action: 'leave' })).json()).count, 1);
  now += 90000;
  await s.object.alarm();
  assert.equal((await (await s.call()).json()).count, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM visitors').get().n, 0);
});
test('Presence rejects foreign writes, invalid IDs and oversized bodies; returns only a count', async t => {
  const s = service(); t.after(() => s.db.close());
  assert.equal((await s.call({ id: a, action: 'beat' }, 'https://other.example')).status, 403);
  assert.equal((await s.call({ id: 'invalid', action: 'beat' })).status, 400);
  assert.equal((await s.call({ id: a, action: 'unknown' })).status, 400);
  assert.equal((await s.call({ id: a, action: 'beat', excess: 'x'.repeat(300) })).status, 413);
  const response = await s.call({ id: a, action: 'beat' });
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://gorokhovatsky.tech');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { count: 1, ttl: 90 });
});
