// explicit analytics consent and delayed counter loading.
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
const analyticsToggle = document.querySelector("[data-analytics-toggle]");
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
let settingsScrollAnchor = null;

const alignSettingsSection = () => {
  if (!settingsPanel?.open || !settingsScrollAnchor) return;
  const { destination, control } = settingsScrollAnchor;
  const body = settingsPanel.querySelector(".settings-panel__body");
  if (body && destination) {
    body.scrollTop += destination.getBoundingClientRect().top - body.getBoundingClientRect().top;
    // If text wraps onto another line, keep the decision and its explanation
    // together where possible without scrolling the focused control out of view.
    if (control) {
      const viewport = body.getBoundingClientRect();
      const overflow = destination.getBoundingClientRect().bottom - viewport.bottom;
      const room = control.getBoundingClientRect().top - viewport.top - 8;
      body.scrollTop += Math.max(0, Math.min(overflow + 1, room));
    }
  }
  control?.scrollIntoView({ block: "nearest", behavior: "instant" });
};
// Late WHOOP data and fonts can resize the preceding section in WebKit.
// Keep an explicitly requested section in view until the visitor takes over.
const settingsResize = new ResizeObserver(alignSettingsSection);
settingsPanel?.querySelectorAll(".settings-panel__body > *").forEach(
  (section) => settingsResize.observe(section),
);
for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) {
  settingsPanel?.addEventListener(event, () => { settingsScrollAnchor = null; }, { passive: true });
}

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
  root.dataset.analytics = state;
  analyticsPreferenceLabels.forEach((label) => {
    label.textContent = state === "allowed" ? "Вкл." : "Выкл.";
  });
  analyticsToggle?.setAttribute("aria-pressed", String(state === "allowed"));
};

const closeSettingsPanel = ({ restoreFocus = true } = {}) => {
  if (!settingsPanel?.open) {
    return;
  }

  settingsPanel.close();
  settingsScrollAnchor = null;
  settingsPanel.hidden = true;
  settingsPanel.inert = true;
  settingsPanel.classList.remove("is-open");
  document.body.classList.remove("has-settings-panel");
  window.dispatchEvent(new Event("reading-surface-change"));

  if (restoreFocus && lastSettingsTrigger?.isConnected) {
    // The reading surfaces release their inert state after the dialog closes.
    requestAnimationFrame(() => {
      if (!settingsPanel.open) lastSettingsTrigger.focus();
    });
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
  const sourceNavigation = lastSettingsTrigger?.closest("[data-constellation-nav]");
  const navigationToggle = sourceNavigation?.querySelector("[data-constellation-nav-toggle]");
  if (navigationToggle?.getClientRects().length
      && getComputedStyle(navigationToggle).visibility === "visible") {
    // The compact menu closes on selection. Return to its visible opener.
    lastSettingsTrigger = navigationToggle;
  }
  const sourcePopover = lastSettingsTrigger?.closest("[popover]");
  if (sourcePopover) {
    // The disclosure closes when the dialog opens; return to its visible trigger.
    lastSettingsTrigger = document.querySelector(
      `[popovertarget="${sourcePopover.id}"]:not([popovertargetaction])`,
    ) || lastSettingsTrigger;
  }
  settingsPanel.dataset.settingsMode = "settings";
  if (!settingsPanel.open) {
    document.body.classList.add("has-settings-panel");
    settingsPanel.hidden = false;
    settingsPanel.inert = false;
    settingsPanel.showModal();
    settingsPanel.classList.add("is-open");
  }
  settingsPanel.dataset.focusSection = section;
  settingsScrollAnchor = null;

  window.requestAnimationFrame(() => {
    const body = settingsPanel.querySelector(".settings-panel__body");
    const target = section === "settings"
      ? settingsClose
      : section === "analytics"
      ? analyticsToggle
      : settingsPanel.querySelector({
        motion: "[data-motion-toggle]",
        contrast: "[data-contrast-toggle]",
        whoop: "[data-whoop-toggle]",
      }[section] || "[data-theme-choice]:checked") || settingsClose;

    if (body) body.scrollTop = 0;
    if (section !== "settings") {
      const destination = ["analytics", "whoop"].includes(section)
        ? settingsPanel.querySelector(`[data-settings-section="${section}"]`)
        : target?.closest(".settings-panel__row");
      settingsScrollAnchor = { destination, control: target };
      alignSettingsSection();
    }
    if (focus) {
      const control = target?.disabled ? settingsClose : target;
      control?.focus({ preventScroll: true });
      // The general entry begins with the introduction. Only shortcuts scroll
      // to a specific preference; keyboard navigation reveals later controls.
      if (section !== "settings") control?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  });
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

analyticsToggle?.addEventListener("click", () => {
  const allow = analyticsPreference !== "allowed";
  const wasLoaded = analyticsLoaded;
  writeAnalyticsPreference(allow ? "allowed" : "denied");
  window[analyticsDisableKey] = !allow;
  syncAnalyticsPreferenceUi();
  if (allow) loadYandexAnalytics();
  if (analyticsStatus) analyticsStatus.textContent = allow
    ? "Аналитика разрешена." : "Аналитика выключена.";
  // Reload after revoking consent to stop the already loaded third-party code.
  // Return to the same setting, with the saved off state and visible focus.
  if (!allow && wasLoaded) {
    try { sessionStorage.setItem("anton-settings-return", "analytics"); } catch {}
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

let returnToAnalytics = false;
try {
  returnToAnalytics = sessionStorage.getItem("anton-settings-return") === "analytics";
  sessionStorage.removeItem("anton-settings-return");
} catch {}
if (returnToAnalytics) window.requestAnimationFrame(() => openAnalyticsConsent());

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
