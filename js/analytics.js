// Runtime module 2/7: explicit analytics consent and delayed counter loading.
import {
  captureMode,
  root,
} from "./preferences.js";

const analyticsCounterId = 111107350;
const analyticsPreferenceKey = "anton-signal-analytics";
const analyticsDisableKey = `disableYaCounter${analyticsCounterId}`;
const settingsPanel = document.querySelector("[data-settings-panel]");
const settingsClose = document.querySelector("[data-close-settings]");
const settingsOpeners = Array.from(document.querySelectorAll("[data-open-settings]"));
const analyticsAllow = document.querySelector("[data-analytics-allow]");
const analyticsDeny = document.querySelector("[data-analytics-deny]");
const analyticsSettings = Array.from(document.querySelectorAll("[data-analytics-settings]"));
const analyticsSummaries = Array.from(document.querySelectorAll("[data-analytics-summary]"));
const analyticsPreferenceLabels = Array.from(
  document.querySelectorAll("[data-analytics-preference]"),
);
const analyticsStatus = document.querySelector("[data-analytics-status]");
const analyticsQuery = new URLSearchParams(window.location.search);
const analyticsConsentRequested = analyticsQuery.get("analytics-consent") === "show";
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
let lastSettingsTrigger = null;

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
  const state = analyticsPreference || "unset";
  const stateLabel = state === "allowed"
    ? "АНАЛИТИКА ВКЛЮЧЕНА"
    : state === "denied" ? "АНАЛИТИКА ВЫКЛЮЧЕНА" : "РЕШЕНИЕ НЕ ПРИНЯТО";
  const summaryLabel = state === "allowed"
    ? "АНАЛИТИКА\u00a0—\u00a0ВКЛ."
    : state === "denied" ? "АНАЛИТИКА\u00a0—\u00a0ВЫКЛ." : "АНАЛИТИКА";
  const accessibleState = state === "allowed"
    ? "разрешена"
    : state === "denied" ? "выключена" : "не выбрана";

  root.dataset.analytics = analyticsPreference || "unset";
  analyticsSettings.forEach((button) => {
    button.removeAttribute("aria-pressed");
    button.dataset.analyticsState = state;
    button.setAttribute(
      "aria-label",
      `Аналитика и приватность: сейчас ${accessibleState}`,
    );
  });
  analyticsSummaries.forEach((summary) => {
    summary.textContent = summaryLabel;
  });
  analyticsPreferenceLabels.forEach((label) => {
    label.textContent = stateLabel;
  });
  analyticsAllow?.toggleAttribute("disabled", state === "allowed");
  analyticsDeny?.toggleAttribute("disabled", state === "denied");
};

const closeSettingsPanel = ({ restoreFocus = true } = {}) => {
  if (!settingsPanel?.open) {
    return;
  }

  settingsPanel.close();
  settingsPanel.hidden = true;
  settingsPanel.inert = true;
  settingsPanel.classList.remove("is-open");
  document.body.classList.remove("has-settings-panel");

  if (restoreFocus && lastSettingsTrigger?.isConnected) {
    lastSettingsTrigger.focus({ preventScroll: true });
  }
};

const openSettingsPanel = ({
  focus = true,
  section = "settings",
  trigger = null,
} = {}) => {
  if (!settingsPanel) {
    return;
  }

  const activeElement = document.activeElement;
  lastSettingsTrigger = trigger instanceof HTMLElement
    ? trigger
    : activeElement instanceof HTMLElement && !settingsPanel.contains(activeElement)
      ? activeElement
      : lastSettingsTrigger;
  settingsPanel.dataset.settingsMode = section === "analytics" ? "analytics" : "settings";
  if (!settingsPanel.open) {
    document.body.classList.add("has-settings-panel");
    settingsPanel.hidden = false;
    settingsPanel.inert = false;
    settingsPanel.showModal();
    settingsPanel.classList.add("is-open");
  }
  settingsPanel.dataset.focusSection = section;

  if (focus) {
    window.requestAnimationFrame(() => {
      let target = settingsPanel.querySelector("[data-theme-toggle]") || settingsClose;

      if (section === "analytics") {
        target = analyticsPreference === "allowed" ? analyticsDeny : analyticsAllow;
      } else if (section === "motion") {
        target = settingsPanel.querySelector("[data-motion-toggle]");
      } else if (section === "contrast") {
        target = settingsPanel.querySelector("[data-contrast-toggle]");
      }

      (target?.disabled ? settingsClose : target)?.focus({ preventScroll: true });
    });
  }
};

const openAnalyticsConsent = (options = {}) => openSettingsPanel({
  ...options,
  section: "analytics",
});

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
  closeSettingsPanel();

  if (analyticsStatus) {
    analyticsStatus.textContent = "Аналитика разрешена.";
  }
});

analyticsDeny?.addEventListener("click", () => {
  const wasLoaded = analyticsLoaded;
  writeAnalyticsPreference("denied");
  window[analyticsDisableKey] = true;
  syncAnalyticsPreferenceUi();
  closeSettingsPanel();

  if (analyticsStatus) {
    analyticsStatus.textContent = "Аналитика выключена.";
  }

  if (wasLoaded) {
    window.location.reload();
  }
});

settingsOpeners.forEach((opener) => {
  opener.addEventListener("click", () => {
    openSettingsPanel({
      trigger: opener,
      section: opener.dataset.settingsFocus || "settings",
    });
  });
});

settingsClose?.addEventListener("click", () => closeSettingsPanel());
settingsPanel?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeSettingsPanel();
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
} else if (!analyticsPreference && !captureMode && analyticsConsentRequested) {
  window.requestAnimationFrame(() => openAnalyticsConsent());
}

export {
  openSettingsPanel,
  openAnalyticsConsent,
  trackPortfolioEvent,
};
