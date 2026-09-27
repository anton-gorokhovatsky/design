// Short-lived, anonymous presence; deliberately separate from WHOOP storage.
const ttl = 90_000;
const reply = (value, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });

export async function presenceRequest(request, env) {
  const headers = { "access-control-allow-origin": env.PUBLIC_ORIGIN, "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (!["GET", "POST"].includes(request.method)) return new Response(null, { status: 405, headers });
  if (request.method === "POST" && request.headers.get("origin") !== env.PUBLIC_ORIGIN) return new Response(null, { status: 403, headers });
  let body;
  if (request.method === "POST") {
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400, headers });
    let text = "";
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > 200) { await reader.cancel(); return new Response(null, { status: 413, headers }); }
    }
    try { body = JSON.parse(text); } catch { return new Response(null, { status: 400, headers }); }
    if (!/^[\da-f-]{36}$/.test(body?.id) || !["beat", "leave"].includes(body?.action)) return new Response(null, { status: 400, headers });
  }
  const object = env.PRESENCE.get(env.PRESENCE.idFromName("site"));
  const response = await object.fetch(new Request("https://internal/presence", {
    method: request.method, ...(body ? { body: JSON.stringify({ id: body.id, action: body.action }) } : {}),
  }));
  return new Response(response.body, { status: response.status, headers: { ...headers, "content-type": "application/json" } });
}

export class Presence {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)");
  }
  prune() { this.sql.exec("DELETE FROM visitors WHERE expires <= ?", Date.now()); }
  count() { return this.sql.exec("SELECT COUNT(*) AS count FROM visitors").one().count; }
  async fetch(request) {
    const body = request.method === "POST" ? await request.json() : null;
    this.prune();
    if (body?.action === "leave") this.sql.exec("DELETE FROM visitors WHERE id = ?", body.id);
    if (body?.action === "beat") {
      if (this.count() >= 10000 && !this.sql.exec("SELECT id FROM visitors WHERE id = ?", body.id).toArray().length) return reply({ error: "Unavailable" }, 503);
      this.sql.exec("INSERT INTO visitors (id, expires) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET expires = excluded.expires", body.id, Date.now() + ttl);
      if (await this.storage.getAlarm() === null) await this.storage.setAlarm(Date.now() + ttl);
    }
    return reply({ count: this.count(), ttl: ttl / 1000 });
  }
  async alarm() {
    this.prune();
    if (this.count()) await this.storage.setAlarm(this.sql.exec("SELECT MIN(expires) AS next FROM visitors").one().next);
  }
}
