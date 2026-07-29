// Runtime layer 2/7: explicit analytics consent and delayed counter loading.
const analyticsCounterId = 111107350;
const analyticsPreferenceKey = "anton-signal-analytics";
const analyticsDisableKey = `disableYaCounter${analyticsCounterId}`;
const analyticsConsent = document.querySelector("[data-analytics-consent]");
const analyticsAllow = document.querySelector("[data-analytics-allow]");
const analyticsDeny = document.querySelector("[data-analytics-deny]");
const analyticsSettings = document.querySelector("[data-analytics-settings]");
const analyticsStatus = document.querySelector("[data-analytics-status]");
const analyticsQuery = new URLSearchParams(window.location.search);
const analyticsQaSuppressed = analyticsQuery.has("qa")
  && analyticsQuery.get("analytics-consent") !== "show";
const analyticsGoalParameters = new Map([
  ["point_open", new Set(["point_id", "source"])],
  ["map_filter_change", new Set(["filters"])],
  ["chronology_toggle", new Set(["state"])],
  ["observation_start", new Set(["source"])],
  ["observation_complete", new Set(["source"])],
  ["search_success", new Set(["result_id", "result_type"])],
  ["panel_open", new Set(["panel_id", "source"])],
  ["contact_open", new Set(["channel"])],
]);
let analyticsPreference = null;
let analyticsLoaded = false;

try {
  const storedAnalyticsPreference = window.localStorage.getItem(analyticsPreferenceKey);
  analyticsPreference = ["allowed", "denied"].includes(storedAnalyticsPreference)
    ? storedAnalyticsPreference
    : null;
} catch {
  analyticsPreference = null;
}

const writeAnalyticsPreference = (preference) => {
  analyticsPreference = preference;

  try {
    window.localStorage.setItem(analyticsPreferenceKey, preference);
  } catch {
    // Consent remains valid for the current page when storage is unavailable.
  }
};

const syncAnalyticsPreferenceUi = () => {
  const isAllowed = analyticsPreference === "allowed";
  root.dataset.analytics = analyticsPreference || "unset";
  analyticsSettings?.setAttribute("aria-pressed", String(isAllowed));
  analyticsSettings?.setAttribute(
    "aria-label",
    isAllowed
      ? "Настроить аналитику: сейчас разрешена"
      : "Настроить аналитику: сейчас выключена",
  );
};

const closeAnalyticsConsent = () => {
  if (!analyticsConsent) {
    return;
  }

  analyticsConsent.hidden = true;
  analyticsConsent.inert = true;
  analyticsConsent.classList.remove("is-open");
};

const openAnalyticsConsent = ({ focus = true } = {}) => {
  if (!analyticsConsent) {
    return;
  }

  analyticsConsent.hidden = false;
  analyticsConsent.inert = false;
  analyticsConsent.classList.add("is-open");

  if (focus) {
    analyticsAllow?.focus({ preventScroll: true });
  }
};

const loadYandexAnalytics = () => {
  if (analyticsLoaded || analyticsPreference !== "allowed") {
    return;
  }

  analyticsLoaded = true;
  window[analyticsDisableKey] = false;
  window.ym = window.ym || function queueYandexMetricCall() {
    (window.ym.a = window.ym.a || []).push(arguments);
  };
  window.ym.l = Number(new Date());

  const source = `https://mc.yandex.ru/metrika/tag.js?id=${analyticsCounterId}`;
  const existingScript = Array.from(document.scripts).find((script) => (
    script.src === source
  ));

  if (!existingScript) {
    const script = document.createElement("script");
    script.async = true;
    script.src = source;
    document.head.append(script);
  }

  window.ym(analyticsCounterId, "init", {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: "dataLayer",
    referrer: document.referrer,
    url: window.location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  });
};

const normalizeAnalyticsValue = (value) => String(value)
  .toLocaleLowerCase("en")
  .replace(/[^a-z0-9_+,-]+/g, "-")
  .slice(0, 64);

const trackPortfolioEvent = (goal, parameters = {}) => {
  const allowedParameters = analyticsGoalParameters.get(goal);

  if (
    analyticsPreference !== "allowed"
    || !analyticsLoaded
    || typeof window.ym !== "function"
    || !allowedParameters
  ) {
    return false;
  }

  const safeParameters = Object.fromEntries(
    Object.entries(parameters)
      .filter(([key, value]) => (
        allowedParameters.has(key)
        && value !== null
        && value !== undefined
        && value !== ""
      ))
      .map(([key, value]) => [key, normalizeAnalyticsValue(value)]),
  );

  window.ym(analyticsCounterId, "reachGoal", goal, safeParameters);
  return true;
};

analyticsAllow?.addEventListener("click", () => {
  writeAnalyticsPreference("allowed");
  syncAnalyticsPreferenceUi();
  loadYandexAnalytics();
  closeAnalyticsConsent();

  if (analyticsStatus) {
    analyticsStatus.textContent = "Аналитика разрешена.";
  }
});

analyticsDeny?.addEventListener("click", () => {
  const wasLoaded = analyticsLoaded;
  writeAnalyticsPreference("denied");
  window[analyticsDisableKey] = true;
  syncAnalyticsPreferenceUi();
  closeAnalyticsConsent();

  if (analyticsStatus) {
    analyticsStatus.textContent = "Аналитика выключена.";
  }

  if (wasLoaded) {
    window.location.reload();
  }
});

analyticsSettings?.addEventListener("click", () => {
  openAnalyticsConsent();
});

document.addEventListener("click", (event) => {
  const link = event.target instanceof Element
    ? event.target.closest(".contact-links a")
    : null;

  if (!link) {
    return;
  }

  trackPortfolioEvent("contact_open", {
    channel: link.href.startsWith("mailto:") ? "email" : "telegram",
  });
});

window[analyticsDisableKey] = analyticsPreference !== "allowed";
syncAnalyticsPreferenceUi();

if (analyticsPreference === "allowed") {
  loadYandexAnalytics();
} else if (!analyticsPreference && !captureMode && !analyticsQaSuppressed) {
  window.requestAnimationFrame(() => openAnalyticsConsent({ focus: false }));
}
