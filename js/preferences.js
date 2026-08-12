// Runtime module 1/7: shared preferences, typography, theme, and clock.
const root = document.documentElement;
const setFocusModality = (modality) => {
  root.dataset.focusModality = modality;
};

setFocusModality("pointer");

window.addEventListener("pointerdown", () => {
  setFocusModality("pointer");
}, { capture: true, passive: true });

window.addEventListener("touchstart", () => {
  setFocusModality("pointer");
}, { capture: true, passive: true });

window.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    setFocusModality("keyboard");
  }
}, { capture: true });

const shortRussianUiWords = [
  "а", "без", "в", "во", "для", "до", "за", "и", "из", "или",
  "к", "ко", "на", "над", "не", "ни", "но", "о", "об", "от",
  "по", "под", "при", "с", "со", "у",
].join("|");
const shortRussianUiWordPattern = new RegExp(
  `(^|[\\s([«„\"'])(${shortRussianUiWords})[\\t \\r\\n]+(?=\\S)`,
  "giu",
);
const typographUiText = (value = "") => String(value).replace(
  shortRussianUiWordPattern,
  "$1$2\u00a0",
);
const themeToggles = Array.from(document.querySelectorAll("[data-theme-toggle]"));
const themeLabels = Array.from(document.querySelectorAll("[data-theme-label]"));
const themePanelStates = Array.from(document.querySelectorAll("[data-theme-panel-state]"));
const themeColor = document.querySelector('meta[name="theme-color"]');
const motionToggles = Array.from(document.querySelectorAll("[data-motion-toggle]"));
const motionStates = Array.from(document.querySelectorAll("[data-motion-state]"));
const contrastToggles = Array.from(document.querySelectorAll("[data-contrast-toggle]"));
const contrastStates = Array.from(document.querySelectorAll("[data-contrast-state]"));
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const systemReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const systemContrast = window.matchMedia("(prefers-contrast: more)");
const captureMode = new URLSearchParams(window.location.search).has("og");
const readPreferenceFlag = (key) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const writePreferenceFlag = (key, enabled) => {
  try {
    if (enabled) {
      window.localStorage.setItem(key, "1");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // System preferences remain authoritative when storage is unavailable.
  }
};
const createEffectivePreference = ({
  mediaQuery,
  storageKey,
  rootAttribute,
  toggles,
  stateElements,
  label,
  systemLabel,
  inactiveState,
  activeState,
  systemState,
}) => {
  const preference = new EventTarget();
  let forced = readPreferenceFlag(storageKey);

  Object.defineProperty(preference, "matches", {
    get: () => mediaQuery.matches || forced,
  });

  const sync = ({ notify = false } = {}) => {
    if (preference.matches) {
      root.dataset[rootAttribute] = "true";
    } else {
      delete root.dataset[rootAttribute];
    }

    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-pressed", String(preference.matches));
      toggle.toggleAttribute("disabled", mediaQuery.matches);
      toggle.setAttribute(
        "aria-label",
        mediaQuery.matches ? systemLabel : label,
      );
    });
    stateElements.forEach((element) => {
      element.textContent = mediaQuery.matches
        ? systemState
        : forced ? activeState : inactiveState;
    });

    if (notify) {
      preference.dispatchEvent(new Event("change"));
    }
  };

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      if (mediaQuery.matches) {
        return;
      }

      forced = !forced;
      writePreferenceFlag(storageKey, forced);
      sync({ notify: true });
    });
  });

  mediaQuery.addEventListener?.("change", () => sync({ notify: true }));
  sync();

  return preference;
};
const reducedMotion = createEffectivePreference({
  mediaQuery: systemReducedMotion,
  storageKey: "anton-signal-reduced-motion",
  rootAttribute: "reduceMotion",
  toggles: motionToggles,
  stateElements: motionStates,
  label: "Меньше движения",
  systemLabel: "Меньше движения: включено в настройках системы",
  inactiveState: "ОБЫЧНОЕ",
  activeState: "МЕНЬШЕ",
  systemState: "СИСТЕМНО",
});
createEffectivePreference({
  mediaQuery: systemContrast,
  storageKey: "anton-signal-high-contrast",
  rootAttribute: "contrast",
  toggles: contrastToggles,
  stateElements: contrastStates,
  label: "Высокий контраст",
  systemLabel: "Высокий контраст: включён в настройках системы",
  inactiveState: "ОБЫЧНЫЙ",
  activeState: "ВЫСОКИЙ",
  systemState: "СИСТЕМНО",
});

const readThemeMode = () => {
  try {
    const storedMode = window.localStorage.getItem("anton-signal-theme");
    return storedMode === "light" || storedMode === "dark"
      ? storedMode
      : "system";
  } catch {
    return "system";
  }
};
let themeMode = captureMode
  ? "dark"
  : root.dataset.themeMode || readThemeMode();
const getEffectiveTheme = (mode) => (
  mode === "system"
    ? (systemTheme.matches ? "dark" : "light")
    : mode
);
const getNextThemeMode = () => {
  const systemMode = systemTheme.matches ? "dark" : "light";

  if (themeMode === "system") {
    return systemMode === "dark" ? "light" : "dark";
  }

  return themeMode === systemMode ? "system" : systemMode;
};
const setThemeMode = (mode, persist = false) => {
  themeMode = mode === "light" || mode === "dark" ? mode : "system";
  const theme = getEffectiveTheme(themeMode);
  root.dataset.theme = theme;
  root.dataset.themeMode = themeMode;
  const isDark = theme === "dark";
  const nextMode = getNextThemeMode();
  const modeLabel = themeMode === "system"
    ? "СИСТЕМА"
    : isDark ? "ТЁМНАЯ" : "СВЕТЛАЯ";
  const currentModeLabel = themeMode === "system"
    ? `системный, сейчас ${isDark ? "тёмная" : "светлая"}`
    : isDark ? "тёмный" : "светлый";
  const nextModeLabel = nextMode === "system"
    ? "системный"
    : nextMode === "dark" ? "тёмный" : "светлый";

  themeToggles.forEach((toggle) => {
    toggle.setAttribute(
      "aria-label",
      `Режим темы: ${currentModeLabel}. Переключить на ${nextModeLabel}`,
    );
  });

  themeLabels.forEach((label) => {
    label.textContent = modeLabel;
  });
  themePanelStates.forEach((state) => {
    state.textContent = themeMode === "system"
      ? `СИСТЕМНАЯ / ${isDark ? "ТЁМНАЯ" : "СВЕТЛАЯ"} СЕЙЧАС`
      : isDark ? "ТЁМНАЯ" : "СВЕТЛАЯ";
  });

  themeColor?.setAttribute("content", isDark ? "#11120f" : "#eeede7");

  if (persist) {
    try {
      if (themeMode === "system") {
        window.localStorage.removeItem("anton-signal-theme");
      } else {
        window.localStorage.setItem("anton-signal-theme", themeMode);
      }
    } catch {
      // The interface remains usable when storage is blocked.
    }
  }
};

setThemeMode(themeMode);

themeToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    setThemeMode(getNextThemeMode(), true);
  });
});

systemTheme.addEventListener?.("change", () => {
  if (themeMode === "system") {
    setThemeMode("system");
  }
});

const clock = document.querySelector("[data-clock]");
const updateClock = () => {
  if (!clock) {
    return;
  }

  clock.textContent = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
};

if (captureMode) {
  if (clock) {
    clock.textContent = "";
  }
} else {
  updateClock();
  window.setInterval(updateClock, 30000);
}

export {
  captureMode,
  reducedMotion,
  root,
  typographUiText,
};
