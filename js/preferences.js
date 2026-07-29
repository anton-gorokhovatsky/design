// Runtime layer 1/6: shared preferences, typography, theme, and clock.
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
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeLabel = document.querySelector("[data-theme-label]");
const themeColor = document.querySelector('meta[name="theme-color"]');
const motionToggle = document.querySelector("[data-motion-toggle]");
const contrastToggle = document.querySelector("[data-contrast-toggle]");
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
  toggle,
  activeLabel,
  systemLabel,
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

    toggle?.setAttribute("aria-pressed", String(preference.matches));
    toggle?.toggleAttribute("disabled", mediaQuery.matches);
    toggle?.setAttribute(
      "aria-label",
      mediaQuery.matches ? systemLabel : activeLabel,
    );

    if (notify) {
      preference.dispatchEvent(new Event("change"));
    }
  };

  toggle?.addEventListener("click", () => {
    if (mediaQuery.matches) {
      return;
    }

    forced = !forced;
    writePreferenceFlag(storageKey, forced);
    sync({ notify: true });
  });

  mediaQuery.addEventListener?.("change", () => sync({ notify: true }));
  sync();

  return preference;
};
const reducedMotion = createEffectivePreference({
  mediaQuery: systemReducedMotion,
  storageKey: "anton-signal-reduced-motion",
  rootAttribute: "reduceMotion",
  toggle: motionToggle,
  activeLabel: "Использовать меньше движения",
  systemLabel: "Меньше движения включено в настройках системы",
});
createEffectivePreference({
  mediaQuery: systemContrast,
  storageKey: "anton-signal-high-contrast",
  rootAttribute: "contrast",
  toggle: contrastToggle,
  activeLabel: "Использовать более высокий контраст",
  systemLabel: "Высокий контраст включён в настройках системы",
});

const setTheme = (theme, persist = false) => {
  root.dataset.theme = theme;
  const isDark = theme === "dark";

  themeToggle?.setAttribute("aria-label", isDark ? "Включить светлую тему" : "Включить тёмную тему");

  if (themeLabel) {
    themeLabel.textContent = isDark ? "ТЁМНАЯ" : "СВЕТЛАЯ";
  }

  themeColor?.setAttribute("content", isDark ? "#11120f" : "#f2f1ec");

  if (persist) {
    try {
      window.localStorage.setItem("anton-signal-theme", theme);
    } catch {
      // The interface remains usable when storage is blocked.
    }
  }
};

setTheme(root.dataset.theme || (systemTheme.matches ? "dark" : "light"));

themeToggle?.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
});

systemTheme.addEventListener?.("change", (event) => {
  let savedTheme = null;

  try {
    savedTheme = window.localStorage.getItem("anton-signal-theme");
  } catch {
    savedTheme = null;
  }

  if (!savedTheme) {
    setTheme(event.matches ? "dark" : "light");
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
