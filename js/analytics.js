// explicit analytics consent and delayed counter loading.
import {
  captureMode,
  reducedMotion,
  root,
} from "./preferences.js";

const analyticsCounterId = 111107350;
const analyticsPreferenceKey = "anton-signal-analytics";
const analyticsDisableKey = `disableYaCounter${analyticsCounterId}`;
const settingsPanel = document.querySelector("[data-settings-panel]");
const settingsClose = document.querySelector("[data-close-settings]");
const settingsOpeners = Array.from(document.querySelectorAll("[data-open-settings]"));
const analyticsToggle = document.querySelector("[data-analytics-toggle]");
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
let analyticsReady = false;
let analyticsReload = 0;
let lastSettingsTrigger = null;
let settingsScrollAnchor = null;

// Native details remain the fallback. Height transitions retarget from the
// current frame, and closing content becomes inert before the visual exit.
const finishDetails = [];
settingsPanel?.querySelectorAll(".settings-details").forEach((details) => {
  const summary = details.querySelector("summary");
  const content = details.querySelector(".settings-details__body");
  let wanted = null;
  let frame = 0;
  const finish = () => {
    cancelAnimationFrame(frame);
    if (wanted !== null) details.open = wanted;
    wanted = null;
    content.style.height = "";
    content.style.overflow = "";
    content.style.transition = "";
    content.inert = false;
    summary.removeAttribute("aria-expanded");
  };
  finishDetails.push(finish);
  content.addEventListener("transitionend", event => {
    if (event.target === content && event.propertyName === "height") finish();
  });
  summary.addEventListener("click", event => {
    event.preventDefault();
    const height = details.open ? content.getBoundingClientRect().height : 0;
    wanted = !(wanted ?? details.open);
    summary.setAttribute("aria-expanded", String(wanted));
    if (reducedMotion.matches || event.detail === 0) { finish(); return; }
    cancelAnimationFrame(frame);
    details.open = true;
    content.inert = !wanted;
    content.style.transition = "none";
    content.style.height = `${height}px`;
    content.style.overflow = "hidden";
    const end = wanted ? content.scrollHeight : 0;
    getComputedStyle(content).height;
    content.style.transition = "";
    if (Math.abs(end - height) < 1) { finish(); return; }
    frame = requestAnimationFrame(() => { content.style.height = `${end}px`; });
  });
});
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) {
    settingsPanel?.removeAttribute("data-entering");
    finishDetails.forEach(finish => finish());
  }
});
for (const type of ["animationend", "animationcancel"]) {
  settingsPanel?.addEventListener(type, event => {
    if (event.target === settingsPanel && event.animationName === "window-reveal") settingsPanel.removeAttribute("data-entering");
  });
}
settingsPanel?.addEventListener("keydown", (event) => {
  if (["Tab", "Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
    root.dataset.focusModality = "keyboard";
    settingsPanel.removeAttribute("data-entering");
  }
  finishDetails.forEach(finish => finish());
});

const syncSettingsHeading = () => {
  if (!settingsPanel?.open) return;
  const header = settingsPanel.querySelector(".settings-panel__header");
  const title = settingsPanel.querySelector("[data-settings-title]");
  const scrollTitle = getComputedStyle(header).getPropertyValue("--settings-scroll-title").trim() === "1";
  settingsPanel.toggleAttribute("data-scrolling-title", scrollTitle);
  const intro = settingsPanel.querySelector(".settings-panel__intro-group");
  const body = settingsPanel.querySelector(".settings-panel__body");
  if (scrollTitle) {
    if (intro.parentElement !== body) body.prepend(intro);
    if (title.parentElement !== intro) intro.prepend(title);
  } else {
    if (title.parentElement !== header) header.prepend(title);
    if (intro.parentElement !== header) header.append(intro);
  }
};

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
const settingsResize = new ResizeObserver(() => {
  syncSettingsHeading();
  alignSettingsSection();
});
if (settingsPanel) settingsResize.observe(settingsPanel);
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
  settingsPanel?.querySelectorAll("[data-analytics-state-copy]").forEach(copy => {
    copy.setAttribute("aria-hidden", String(copy.dataset.analyticsStateCopy !== state));
  });
  analyticsToggle?.setAttribute("aria-checked", String(state === "allowed"));
};

const closeSettingsPanel = ({ restoreFocus = true } = {}) => {
  if (!settingsPanel?.open) {
    return;
  }

  finishDetails.forEach(finish => finish());
  settingsPanel.removeAttribute("data-entering");
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
  restore = false,
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
  if (section === "whoop") {
    settingsPanel.querySelector("[data-whoop-details]").open = true;
  }
  settingsPanel.toggleAttribute("data-restoring", restore);
  if (!settingsPanel.open) {
    settingsPanel.toggleAttribute("data-entering", !restore && !reducedMotion.matches && root.dataset.focusModality !== "keyboard");
    document.body.classList.add("has-settings-panel");
    settingsPanel.hidden = false;
    settingsPanel.inert = false;
    settingsPanel.showModal();
    settingsPanel.classList.add("is-open");
  }
  syncSettingsHeading();
  settingsPanel.dataset.focusSection = section;
  settingsScrollAnchor = null;

  const body = settingsPanel.querySelector(".settings-panel__body");
  const target = section === "settings" ? settingsClose : settingsPanel.querySelector({
    analytics: "[data-analytics-toggle]",
    motion: "[data-motion-toggle]",
    contrast: "[data-contrast-toggle]",
    whoop: "[data-whoop-toggle]",
  }[section] || "[data-theme-choice]:checked") || settingsClose;

  if (body) body.scrollTop = 0;
  if (target !== settingsClose) {
    const destination = settingsPanel.querySelector(`[data-settings-section="${section}"]`)
      || target.closest(".settings-panel__row");
    settingsScrollAnchor = { destination, control: target };
    alignSettingsSection();
  }
  if (focus) {
    const control = target?.disabled ? settingsClose : target;
    control?.focus({ preventScroll: true });
    if (control !== settingsClose) control?.scrollIntoView({ block: "nearest", behavior: "instant" });
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
    script.addEventListener("load", () => { analyticsReady = true; }, { once: true });
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
  if (allow) {
    clearTimeout(analyticsReload);
    try { sessionStorage.removeItem("anton-settings-return"); } catch {}
    loadYandexAnalytics();
  }
  if (analyticsStatus) analyticsStatus.textContent = allow
    ? "Аналитика разрешена." : "Аналитика выключена.";
  // Reload after revoking consent to stop the already loaded third-party code.
  // Return to the same setting, with the saved off state and visible focus.
  if (!allow && wasLoaded) {
    // Destruct immediately; the short visual exit never extends consent.
    // https://yandex.ru/support/metrica/ru/code/counter-spa-setup
    window.ym?.(analyticsCounterId, "destruct");
    analyticsLoaded = false;
    try { sessionStorage.setItem("anton-settings-return", "analytics"); } catch {}
    const duration = !analyticsReady || reducedMotion.matches || root.dataset.focusModality === "keyboard" ? 0
      : parseFloat(getComputedStyle(analyticsToggle.querySelector(".preference-switch"), "::before").transitionDuration) * 1000;
    clearTimeout(analyticsReload);
    if (duration > 0) analyticsReload = setTimeout(() => window.location.reload(), duration);
    else window.location.reload();
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
if (returnToAnalytics) window.requestAnimationFrame(() => openAnalyticsConsent({ restore: true }));

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
