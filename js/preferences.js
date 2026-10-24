// shared preferences, typography, theme, and clock.
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
  `(?<=^|[\\s([«„\"'])(${shortRussianUiWords})[\\t \\r\\n]+(?=\\S)`,
  "giu",
);
const typographUiText = (value = "") => String(value).replace(
  shortRussianUiWordPattern,
  "$1\u00a0",
);
const themeChoices = Array.from(document.querySelectorAll("[data-theme-choice]"));
const themeColor = document.querySelector('meta[name="theme-color"]');
const motionToggles = Array.from(document.querySelectorAll("[data-motion-toggle]"));
const motionStates = Array.from(document.querySelectorAll("[data-motion-system]"));
const contrastToggles = Array.from(document.querySelectorAll("[data-contrast-toggle]"));
const contrastStates = Array.from(document.querySelectorAll("[data-contrast-system]"));
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

    stateElements.forEach((element) => {
      element.hidden = !mediaQuery.matches;
    });
    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-pressed", String(preference.matches));
      const state = toggle.closest(".preference-option")?.querySelector(".preference-state");
      if (state) state.textContent = preference.matches ? "Вкл." : "Выкл.";
      toggle.toggleAttribute("disabled", mediaQuery.matches);
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
});
createEffectivePreference({
  mediaQuery: systemContrast,
  storageKey: "anton-signal-high-contrast",
  rootAttribute: "contrast",
  toggles: contrastToggles,
  stateElements: contrastStates,
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
let themePaintFrame = 0;
const paintTheme = () => {
  themePaintFrame = 0;
  const theme = getEffectiveTheme(themeMode);
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  themeColor?.setAttribute("content", theme === 'dark' ? "#11120f" : "#eeede7");
};
const setThemeMode = (mode, persist = false) => {
  themeMode = mode === "light" || mode === "dark" ? mode : "system";
  root.dataset.themeMode = themeMode;
  themeChoices.forEach((choice) => {
    choice.checked = choice.dataset.themeChoice === themeMode;
  });

  cancelAnimationFrame(themePaintFrame);
  // Paint the control's first frame before theme-dependent map canvases redraw.
  if (persist && root.dataset.focusModality !== 'keyboard' && !reducedMotion.matches) {
    themePaintFrame = requestAnimationFrame(() => {
      themePaintFrame = requestAnimationFrame(paintTheme);
    });
  } else paintTheme();

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

themeChoices.forEach((choice) => {
  choice.addEventListener("change", () => {
    if (choice.checked) setThemeMode(choice.dataset.themeChoice, true);
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
// Shared by modal controllers: layout rectangles alone include invisible controls.
export const getTabStops = (root) => Array.from(root.querySelectorAll(
  'a[href], button, input, select, textarea, iframe, [tabindex]',
)).filter(element => element.tabIndex >= 0
  && !element.matches(':disabled')
  && !element.closest('[hidden], [inert]')
  && element.getClientRects().length > 0
  && getComputedStyle(element).visibility === 'visible');
