import assert from "node:assert/strict";
import test from "node:test";
import worker, { WhoopDay, publicDay } from "./worker.js";

const cycle = { id: 9, score_state: "SCORED", updated_at: "2026-09-25T06:23:00Z", score: { strain: 12.852, average_heart_rate: 77 } };
const recovery = { cycle_id: 9, sleep_id: "night", score_state: "SCORED", updated_at: "2026-09-25T02:19:00Z", score: { recovery_score: 77, hrv_rmssd_milli: 90 } };
const sleep = { id: "night", nap: false, score_state: "SCORED", end: "2026-09-25T02:18:00Z", score: { stage_summary: {
  total_light_sleep_time_milli: 15000000, total_slow_wave_sleep_time_milli: 3000000,
  total_rem_sleep_time_milli: 3720000, total_awake_time_milli: 2000000, total_no_data_time_milli: 1000000,
} } };
class Storage {
  data = new Map();
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async delete(key) { for (const item of Array.isArray(key) ? key : [key]) this.data.delete(item); }
}
function service() {
  const storage = new Storage();
  const env = { ADMIN_TOKEN: "test-only-".repeat(5), WHOOP_CLIENT_ID: "test-id", WHOOP_CLIENT_SECRET: "test-secret", PUBLIC_ORIGIN: "https://gorokhovatsky.tech" };
  const instance = new WhoopDay({ storage }, env);
  env.DAY = { idFromName: () => "author", get: () => instance };
  return { storage, env, instance };
}
const request = (path, body) => new Request(`https://service.example${path}`, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("Public snapshot joins exact IDs and contains only the three authorized metrics", () => {
  const data = publicDay(cycle, recovery, sleep, "2026-09-25T17:00:00Z");
  assert.deepEqual(data, { schema: 1, source: "WHOOP", fetched_at: "2026-09-25T17:00:00Z",
    recovery: { value: 77, updated_at: recovery.updated_at }, sleep: { minutes: 362, ended_at: sleep.end },
    strain: { value: 12.9, updated_at: cycle.updated_at } });
  const unrelated = publicDay({ ...cycle, id: 10 }, recovery, sleep);
  assert.equal(unrelated.recovery.value, null);
  assert.equal(unrelated.sleep.minutes, null);
  assert.equal(unrelated.strain.value, 12.9);
  assert.equal(publicDay(cycle, recovery, { ...sleep, nap: true }).sleep.minutes, null);
  assert.equal(publicDay(cycle, { ...recovery, score_state: "PENDING_SCORE" }, sleep).recovery.value, null);
  assert.equal(publicDay(cycle, { ...recovery, score: { recovery_score: 0 } }, sleep).recovery.value, 0);
  assert.equal(publicDay(cycle, { ...recovery, score: { recovery_score: 70, user_calibrating: true } }, sleep).recovery.value, null);
});

test("Visitors cannot connect, refresh, disconnect, or read credentials", async () => {
  const { env, storage } = service();
  await storage.put("tokens", { access: "private-access", refresh: "private-refresh" });
  for (const path of ["/connect", "/refresh", "/disconnect"]) assert.equal((await worker.fetch(request(path, {}), env)).status, 401);
  assert.equal((await worker.fetch(request("/tokens"), env)).status, 404);
  assert.equal((await worker.fetch(request("/day.json"), env)).status, 503);
  await storage.put("snapshot", publicDay(cycle, recovery, sleep));
  const publicResponse = await worker.fetch(request("/day.json"), env);
  assert.equal(publicResponse.headers.get("access-control-allow-origin"), env.PUBLIC_ORIGIN);
  assert.ok(!(await publicResponse.text()).includes("private-"));
});

test("OAuth state is random, expires and cannot be replayed", async () => {
  const { instance, storage } = service();
  const response = await instance.fetch(request("/connect", { origin: "https://service.example" }));
  const url = new URL((await response.json()).authorize_url);
  assert.equal(url.searchParams.get("scope"), "read:recovery read:sleep read:cycles offline");
  assert.equal(url.searchParams.get("state").length, 64);
  assert.equal((await instance.fetch(request("/callback", { state: "wrong", code: "x", origin: "https://service.example" }))).status, 400);
  const pending = await storage.get("pending");
  await storage.put("pending", { ...pending, expires: 0 });
  assert.equal((await instance.fetch(request("/callback", { state: pending.state, code: "x", origin: "https://service.example" }))).status, 400);
  await storage.put("pending", pending);
  const originalFetch = globalThis.fetch;
  let exchanges = 0;
  globalThis.fetch = async (url) => {
    if (new URL(url).pathname.endsWith("/token")) {
      exchanges++;
      return Response.json({ access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 });
    }
    return Response.json({}, { status: 503 });
  };
  const callback = () => request("/callback", { state: pending.state, code: "x", origin: "https://service.example" });
  try {
    assert.equal((await instance.fetch(callback())).status, 200);
    assert.equal((await storage.get("tokens")).refresh, "test-refresh", "A data outage does not discard the new grant.");
    assert.equal((await instance.fetch(callback())).status, 400);
    assert.equal(exchanges, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("Revoked authorization removes stored credentials and the published snapshot", async () => {
  const { instance, storage } = service();
  await storage.put("tokens", { access: "old", refresh: "revoked", expires: 0 });
  await storage.put("snapshot", publicDay(cycle, recovery, sleep));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: "invalid_grant" }, { status: 400 });
  try {
    assert.equal((await instance.fetch(request("/refresh", {}))).status, 503);
    assert.equal(await storage.get("tokens"), undefined);
    assert.equal(await storage.get("snapshot"), undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test("Concurrent refreshes rotate once, persist first, and retain a dated snapshot on outage", async () => {
  const { instance, storage } = service();
  await storage.put("tokens", { access: "old", refresh: "first", expires: 0 });
  const originalFetch = globalThis.fetch;
  let rotations = 0;
  let outage = false;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/token")) {
      rotations++;
      assert.equal(options.body.get("refresh_token"), "first");
      return Response.json({ access_token: "new", refresh_token: "second", expires_in: 3600 });
    }
    assert.equal((await storage.get("tokens")).refresh, "second", "Rotation is durable before data fetches.");
    assert.equal(options.headers.authorization, "Bearer new");
    if (outage) return Response.json({}, { status: 503 });
    if (url.pathname.endsWith("/cycle")) return Response.json({ records: [cycle] });
    if (url.pathname.endsWith("/recovery")) return Response.json({ records: [recovery] });
    return Response.json(sleep);
  };
  try {
    const results = await Promise.all([instance.fetch(request("/refresh", {})), instance.fetch(request("/refresh", {}))]);
    assert.ok(results.every(response => response.ok));
    assert.equal(rotations, 1);
    const previous = await storage.get("snapshot");
    outage = true;
    assert.equal((await instance.fetch(request("/refresh", {}))).status, 503);
    assert.deepEqual(await storage.get("snapshot"), previous);
  } finally { globalThis.fetch = originalFetch; }
});
