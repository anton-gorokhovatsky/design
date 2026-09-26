// Public, allowlisted daily snapshot. OAuth and the WHOOP API stay on the publisher.
const hour = 3600000;
const finite = (value, max) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
const timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;

export function normalizeDay(data, now = Date.now()) {
  if (data?.schema !== 1 || data.source !== "WHOOP" || !timestamp(data.fetched_at)
    || Date.parse(data.fetched_at) > now + 5 * 60000) throw new Error("Invalid daily snapshot");
  const ended = timestamp(data.sleep?.ended_at);
  const recovery = finite(data.recovery?.value, 100);
  const sleep = finite(data.sleep?.minutes, 1440);
  const strain = finite(data.strain?.value, 21);
  const stale = now - Date.parse(data.fetched_at) > 2 * hour
    || !ended || now - Date.parse(ended) > 36 * hour;
  return {
    recovery, sleep: sleep === null ? null : Math.round(sleep), strain,
    ended, fetched: data.fetched_at, strainUpdated: timestamp(data.strain?.updated_at),
    stale, colour: !stale && recovery !== null,
  };
}

export function dayPalette(recovery) {
  // WHOOP's recovery zones, rounded exactly like the visible score.
  const score = Math.round(recovery);
  if (score < 34) return { rgb: "185,101,83", label: "Низкое" };
  if (score < 67) return { rgb: "175,143,60", label: "Среднее" };
  return { rgb: "83,142,103", label: "Высокое" };
}

function startDay() {
  const snapshotUrl = document.querySelector('meta[name="whoop-feed"]')?.content;
  if (!snapshotUrl) return;
  const root = document.documentElement;
  const readout = document.querySelector("[data-whoop-readout]");
  if (!readout || new URLSearchParams(location.search).has("og")) return;
  const select = (name) => document.querySelector(`[data-whoop-${name}]`);
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const number = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const preference = "anton-whoop-colour-disabled";
  let enabled = true;
  let snapshot = null;
  let fetching = false;
  let lastAttempt = 0;
  try { enabled = localStorage.getItem(preference) !== "1"; } catch { /* Keep a usable session without storage. */ }

  function render() {
    const day = snapshot ? normalizeDay(snapshot) : null;
    const palette = dayPalette(day?.recovery ?? 50);
    root.style.setProperty("--day-rgb", palette.rgb);
    root.style.setProperty("--day-enabled", enabled && day?.colour ? "1" : "0");
    select("toggle").setAttribute("aria-pressed", String(enabled));
    select("toggle-label").textContent = enabled ? "ВКЛЮЧЁН" : "ВЫКЛЮЧЕН";
    readout.dataset.stale = String(Boolean(day?.stale));
    select("recovery").innerHTML = day?.recovery != null ? `${Math.round(day.recovery)}<small> %</small><span class="whoop-level">${palette.label}</span>` : "—";
    select("sleep").innerHTML = day?.sleep != null ? `${Math.floor(day.sleep / 60)}<small> ч </small>${String(day.sleep % 60).padStart(2, "0")}<small> м</small>` : "—";
    select("strain").innerHTML = day?.strain != null ? `${number.format(day.strain)}<small> / 21</small>` : "—";
    select("date").textContent = day?.ended ? date.format(new Date(day.ended)) : "WHOOP";
    if (day?.ended) select("date").dateTime = day.ended;
    else select("date").removeAttribute("datetime");
    const dayLabel = day?.ended ? `Данные за ${date.format(new Date(day.ended))}` : "WHOOP пока недоступен";
    select("status").textContent = day ? (day.stale ? "WHOOP · последние данные" : "WHOOP") : "WHOOP пока недоступен";
    select("stamp").textContent = dayLabel;
    readout.dataset.unavailable = String(!day);
    if (!day) {
      select("provenance").textContent = "Данные пока недоступны. Карта сохраняет исходное оформление.";
    } else {
      const stamp = value => {
        const instant = new Date(value), label = date.format(instant);
        const key = value => new Date(value).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
        return `${day.ended && key(value) === key(day.ended) ? "" : `${label} `}в ${time.format(instant)} мск`;
      };
      const strainDate = day.strainUpdated ? `обновлена ${stamp(day.strainUpdated)}` : "ещё не рассчитана";
      select("provenance").textContent = `${dayLabel}. Получены ${stamp(day.fetched)}. Нагрузка в WHOOP ${strainDate}. Обновления поступают после синхронизации браслета с WHOOP.${day.stale ? " Новых данных пока нет, поэтому карта сохраняет исходную палитру." : ""}`;
    }
    select("readout").querySelector(".whoop-compact-trigger").setAttribute("aria-label", `${dayLabel}. Показатели WHOOP и цвет дня`);
  }

  select("toggle").addEventListener("click", () => {
    enabled = !enabled;
    try {
      if (enabled) localStorage.removeItem(preference);
      else localStorage.setItem(preference, "1");
    } catch { /* The control still works for this visit. */ }
    render();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === preference) { enabled = event.newValue !== "1"; render(); }
  });

  async function refresh() {
    if (fetching || document.hidden || Date.now() - lastAttempt < 60000) return;
    fetching = true;
    lastAttempt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(snapshotUrl, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
      if (!response.ok) throw new Error("Snapshot unavailable");
      const next = await response.json();
      normalizeDay(next);
      snapshot = next;
    } catch { /* Preserve the last honest, dated snapshot on transient failure. */ }
    finally {
      clearTimeout(timeout);
      fetching = false;
      render();
    }
  }

  readout.hidden = false;
  root.classList.add("has-whoop-day");
  render();
  refresh();
  setInterval(() => { if (!document.hidden) { render(); refresh(); } }, 5 * 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { render(); refresh(); } });
}

if (typeof document !== "undefined") startDay();
