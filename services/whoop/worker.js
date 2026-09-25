// This is a separate WHOOP application. Never import the local MCP's token set.
const API = "https://api.prod.whoop.com/developer/v2";
const TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const SCOPES = "read:recovery read:sleep read:cycles offline";
const numeric = (value, maximum) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
const timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const json = (value, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const object = (env) => env.DAY.get(env.DAY.idFromName("author"));
const internal = (path, body) => new Request(`https://internal${path}`, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export function publicDay(cycle, recovery = {}, sleep = {}, now = new Date().toISOString()) {
  const same = recovery.cycle_id != null && recovery.cycle_id === cycle.id;
  const paired = same && sleep.id != null && recovery.sleep_id === sleep.id && sleep.nap === false;
  const score = recovery.score || {};
  const value = paired && recovery.score_state === "SCORED" && !score.user_calibrating ? numeric(score.recovery_score, 100) : null;
  const stages = sleep.score?.stage_summary || {};
  const durations = ["total_light_sleep_time_milli", "total_slow_wave_sleep_time_milli", "total_rem_sleep_time_milli"].map(key => numeric(stages[key], 86400000));
  const minutes = paired && sleep.score_state === "SCORED" && durations.every(n => n !== null) ? numeric(Math.round(durations.reduce((a, b) => a + b, 0) / 60000), 1440) : null;
  const strain = cycle.score_state === "SCORED" ? numeric(cycle.score?.strain, 21) : null;
  // Construct the public object explicitly: no account IDs, physiology or tokens.
  return {
    schema: 1, source: "WHOOP", fetched_at: now,
    recovery: { value, updated_at: same ? timestamp(recovery.updated_at) : null },
    sleep: { minutes, ended_at: paired ? timestamp(sleep.end) : null },
    strain: { value: strain === null ? null : Math.round(strain * 10) / 10, updated_at: timestamp(cycle.updated_at) },
  };
}

async function authorized(request, env) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return false;
  const encoder = new TextEncoder();
  const digests = await Promise.all([request.headers.get("authorization") || "", `Bearer ${env.ADMIN_TOKEN}`]
    .map(value => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  const [a, b] = digests.map(buffer => new Uint8Array(buffer));
  return a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0) === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/privacy" && request.method === "GET") {
        return new Response("Данные WHOOP на gorokhovatsky.tech\n\nЭто личное подключение Антона Гороховатского. Сайт показывает его восстановление, продолжительность сна и дневную нагрузку, а также даты получения и обновления данных. Цвет карты зависит от восстановления и нагрузки.\n\nСервис в Cloudflare получает записи recovery, sleep и cycles из WHOOP, выбирает из них эти три показателя и заменяет предыдущую сводку. Остальные физиологические показатели не сохраняются и не публикуются. История сводок не ведётся.\n\nКлючи подключения хранятся отдельно от публичной сводки в Cloudflare. Автор может отозвать подключение в WHOOP или удалить ключи и последнюю сводку через сервис. Посетителям сайта подключать свой WHOOP не предлагается; их данные WHOOP не запрашиваются.\n\nСвязаться с автором: anton.gorokhovatsky@gmail.com\n", { headers: {
          "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff",
        } });
      }
      if (url.pathname === "/day.json" && request.method === "GET") {
        const response = await object(env).fetch(internal("/snapshot"));
        const headers = new Headers(response.headers);
        headers.set("access-control-allow-origin", env.PUBLIC_ORIGIN);
        headers.set("cache-control", "no-store");
        return new Response(response.body, { status: response.status, headers });
      }
      if (["/connect", "/disconnect", "/refresh"].includes(url.pathname) && request.method === "POST") {
        if (!await authorized(request, env)) return json({ error: "Unauthorized" }, 401);
        if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET) return json({ error: "WHOOP application is not configured" }, 503);
        return object(env).fetch(internal(url.pathname, { origin: url.origin }));
      }
      if (url.pathname === "/oauth/callback" && request.method === "GET") {
        return object(env).fetch(internal("/callback", {
          code: url.searchParams.get("code"), state: url.searchParams.get("state"), origin: url.origin,
        }));
      }
      return json({ error: "Not found" }, 404);
    } catch {
      // Do not send upstream errors, OAuth responses or request URLs to clients/logs.
      return json({ error: "WHOOP is temporarily unavailable" }, 503);
    }
  },
  async scheduled(_event, env) {
    const result = await object(env).fetch(internal("/refresh", {}));
    if (!result.ok) throw new Error("WHOOP scheduled update failed");
  },
};

export class WhoopDay {
  constructor(ctx, env) {
    this.store = ctx.storage;
    this.env = env;
    this.queue = Promise.resolve();
  }

  serial(action) {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/snapshot") {
      const snapshot = await this.store.get("snapshot");
      return snapshot ? json(snapshot) : json({ error: "No daily data yet" }, 503);
    }
    return this.serial(async () => {
      try {
        if (path === "/connect") {
          const { origin } = await request.json();
          const state = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, "0")).join("");
          const redirect = `${origin}/oauth/callback`;
          await this.store.put("pending", { state, redirect, expires: Date.now() + 10 * 60000 });
          const url = new URL("https://api.prod.whoop.com/oauth/oauth2/auth");
          url.search = new URLSearchParams({ response_type: "code", client_id: this.env.WHOOP_CLIENT_ID,
            redirect_uri: redirect, scope: SCOPES, state }).toString();
          return json({ authorize_url: url.href });
        }
        if (path === "/callback") {
          const input = await request.json();
          const pending = await this.store.get("pending");
          if (!pending || pending.expires < Date.now() || !input.code || input.state !== pending.state
            || pending.redirect !== `${input.origin}/oauth/callback`) return json({ error: "Authorization expired or invalid" }, 400);
          await this.store.delete("pending"); // Single use, before exchanging the code.
          const tokens = await this.exchange({ grant_type: "authorization_code", code: input.code, redirect_uri: pending.redirect });
          await this.store.put("tokens", tokens);
          await this.store.delete("snapshot");
          // A temporary data outage must not discard a successfully stored grant.
          try { await this.update(); } catch { /* Next scheduled update retries. */ }
          return new Response("WHOOP подключён. Можно вернуться к сайту.", { headers: {
            "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer",
          } });
        }
        if (path === "/disconnect") {
          await this.store.delete(["tokens", "snapshot", "pending"]);
          return json({ disconnected: true });
        }
        if (path === "/refresh") {
          if (!await this.store.get("tokens")) return json({ connected: false });
          await this.update();
          return json({ updated: true });
        }
        return json({ error: "Not found" }, 404);
      } catch {
        return json({ error: "WHOOP update failed" }, 503);
      }
    });
  }

  async exchange(parameters) {
    const response = await fetch(TOKEN, {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...parameters, client_id: this.env.WHOOP_CLIENT_ID, client_secret: this.env.WHOOP_CLIENT_SECRET }),
    });
    if (!response.ok) {
      if (parameters.grant_type === "refresh_token" && [400, 401, 403].includes(response.status)) {
        await this.store.delete(["tokens", "snapshot"]);
      }
      throw new Error("WHOOP authorization failed");
    }
    const data = await response.json();
    if (!data.access_token || !data.refresh_token || !(Number(data.expires_in) > 0)) throw new Error("Invalid WHOOP grant");
    return { access: data.access_token, refresh: data.refresh_token, expires: Date.now() + Number(data.expires_in) * 1000 - 60000 };
  }

  async token(force = false) {
    let tokens = await this.store.get("tokens");
    if (!tokens) throw new Error("WHOOP is not connected");
    if (force || tokens.expires < Date.now()) {
      tokens = await this.exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh, scope: "offline" });
      // Persist rotation before any data request. All refreshes use one serialized owner.
      await this.store.put("tokens", tokens);
    }
    return tokens.access;
  }

  async get(path) {
    const call = async (token) => fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    let response = await call(await this.token());
    if (response.status === 401) response = await call(await this.token(true));
    if (!response.ok) throw new Error("WHOOP data request failed");
    return response.json();
  }

  async update() {
    const cycles = await this.get("/cycle?limit=1");
    const cycle = cycles.records?.[0];
    if (!cycle?.id) throw new Error("No current cycle");
    const recoveries = await this.get("/recovery?limit=7");
    const recovery = recoveries.records?.find(record => record.cycle_id === cycle.id) || {};
    const sleep = recovery.sleep_id ? await this.get(`/activity/sleep/${encodeURIComponent(recovery.sleep_id)}`) : {};
    await this.store.put("snapshot", publicDay(cycle, recovery, sleep));
  }
}
