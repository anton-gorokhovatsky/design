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
    window.requestAnimationFrame(() => analyticsAllow?.focus());
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

window[analyticsDisableKey] = analyticsPreference !== "allowed";
syncAnalyticsPreferenceUi();

if (analyticsPreference === "allowed") {
  loadYandexAnalytics();
} else if (!analyticsPreference && !captureMode && !analyticsQaSuppressed) {
  window.requestAnimationFrame(() => openAnalyticsConsent({ focus: false }));
}
