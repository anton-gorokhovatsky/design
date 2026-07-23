const root = document.documentElement;
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeLabel = document.querySelector("[data-theme-label]");
const themeColor = document.querySelector('meta[name="theme-color"]');
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const captureMode = new URLSearchParams(window.location.search).has("og");

const setTheme = (theme, persist = false) => {
  root.dataset.theme = theme;
  const isDark = theme === "dark";

  themeToggle?.setAttribute("aria-label", isDark ? "Включить светлую тему" : "Включить тёмную тему");
  themeLabel.textContent = isDark ? "DARK" : "LIGHT";
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
  clock.textContent = "MSK / UTC+3";
} else {
  updateClock();
  window.setInterval(updateClock, 30000);
}

const asciiCharacters = " .·:+*#%@";
const createSignal = (columns, rows, phase = 0, seed = 0) => {
  const output = [];
  const aspect = columns / rows;

  for (let row = 0; row < rows; row += 1) {
    let line = "";

    for (let column = 0; column < columns; column += 1) {
      const x = ((column / (columns - 1)) * 2 - 1) * aspect * 0.54;
      const y = (row / (rows - 1)) * 2 - 1;
      const radius = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x);
      const petal = Math.sin(angle * 5 + phase * 0.7 + seed) * 0.11;
      const orbit = 0.5 + petal + Math.sin(angle * 2 - phase) * 0.035;
      const ring = Math.max(0, 1 - Math.abs(radius - orbit) * 10.5);
      const inner = Math.max(0, 1 - Math.abs(radius - 0.24 - Math.sin(angle * 3 + phase) * 0.028) * 18);
      const ray = Math.max(0, Math.cos(angle * 7 - phase * 0.5) - 0.72) * Math.max(0, 0.88 - radius);
      const noise = (Math.sin(column * 1.73 + row * 2.17 + seed * 3.1) + 1) * 0.035;
      const fade = Math.max(0, 1 - Math.pow(radius / 0.98, 3));
      const intensity = Math.min(1, (ring * 0.72 + inner * 0.46 + ray * 0.52 + noise) * fade);
      const characterIndex = Math.floor(intensity * (asciiCharacters.length - 1));

      line += intensity > 0.07 ? asciiCharacters[characterIndex] : " ";
    }

    output.push(line.trimEnd());
  }

  return output.join("\n");
};

const signalField = document.querySelector("[data-signal-field]");
const signalAscii = document.querySelector("[data-signal-ascii]");
const signalCore = document.querySelector("[data-signal-core]");
let signalPhase = 0;
let signalFrame = 0;
let lastSignalRender = 0;

const renderHeroSignal = (time = 0) => {
  if (!signalAscii) {
    return;
  }

  const isCompact = window.innerWidth < 680;
  const columns = isCompact ? 76 : 132;
  const rows = isCompact ? 42 : 50;

  if (time - lastSignalRender > 95 || time === 0) {
    signalPhase += 0.045;
    signalAscii.textContent = createSignal(columns, rows, signalPhase, 0.3);
    lastSignalRender = time;
  }

  if (!reducedMotion.matches && !captureMode) {
    signalFrame = window.requestAnimationFrame(renderHeroSignal);
  }
};

renderHeroSignal();

signalField?.addEventListener("pointermove", (event) => {
  if (!signalCore || reducedMotion.matches) {
    return;
  }

  const bounds = signalField.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;

  signalField.style.setProperty("--core-x", `${x * 18}px`);
  signalField.style.setProperty("--core-y", `${y * 14}px`);
});

signalField?.addEventListener("pointerleave", () => {
  signalField.style.setProperty("--core-x", "0px");
  signalField.style.setProperty("--core-y", "0px");
});

const workRows = Array.from(document.querySelectorAll(".work-row"));
const workPreview = document.querySelector("[data-work-preview]");
const workAscii = document.querySelector("[data-work-ascii]");
const previewNumber = document.querySelector("[data-preview-number]");
const previewTitle = document.querySelector("[data-preview-title]");

const createPreviewAscii = (seed) => {
  const width = 58;
  const height = 25;
  const lines = [];

  for (let row = 0; row < height; row += 1) {
    let line = "";

    for (let column = 0; column < width; column += 1) {
      const x = column / width;
      const y = row / height;
      const waveA = Math.sin((x * 7.2 + y * 3.1 + seed) * Math.PI);
      const waveB = Math.cos((x * 2.3 - y * 6.4 + seed * 0.13) * Math.PI);
      const distance = Math.abs(y - 0.5 - Math.sin(x * 7 + seed) * 0.18);
      const intensity = Math.max(0, (waveA + waveB + 2) * 0.23 - distance * 1.2);
      const index = Math.min(asciiCharacters.length - 1, Math.floor(intensity * asciiCharacters.length));

      line += intensity > 0.14 ? asciiCharacters[index] : " ";
    }

    lines.push(line.trimEnd());
  }

  return lines.join("\n");
};

const showWorkPreview = (row) => {
  if (!workPreview || !workAscii) {
    return;
  }

  const tone = row.dataset.tone || "#d8ff47";
  const ink = row.dataset.previewInk || "#10110f";
  const seed = Number(row.dataset.seed || 1);
  const number = row.querySelector(".work-row__number")?.textContent || "";

  row.style.setProperty("--row-tone", tone);
  row.style.setProperty("--row-ink", ink);
  workPreview.style.setProperty("--preview-tone", tone);
  workPreview.style.setProperty("--preview-ink", ink);
  workAscii.textContent = createPreviewAscii(seed);
  previewNumber.textContent = number;
  previewTitle.textContent = row.dataset.preview || "";
  workPreview.classList.add("is-visible");
};

const positionWorkPreview = (event) => {
  if (!workPreview || window.innerWidth < 681) {
    return;
  }

  const previewWidth = 292;
  const previewHeight = 204;
  const offset = 22;
  const x = Math.min(window.innerWidth - previewWidth - 12, event.clientX + offset);
  const y = Math.min(window.innerHeight - previewHeight - 12, event.clientY + offset);

  workPreview.style.setProperty("--preview-x", `${Math.max(12, x)}px`);
  workPreview.style.setProperty("--preview-y", `${Math.max(60, y)}px`);
};

workRows.forEach((row) => {
  row.style.setProperty("--row-tone", row.dataset.tone || "#d8ff47");
  row.style.setProperty("--row-ink", row.dataset.previewInk || "#10110f");

  row.addEventListener("pointerenter", (event) => {
    showWorkPreview(row);
    positionWorkPreview(event);
  });
  row.addEventListener("pointermove", positionWorkPreview);
  row.addEventListener("pointerleave", () => workPreview?.classList.remove("is-visible"));
  row.addEventListener("focus", () => {
    showWorkPreview(row);
    workPreview?.style.setProperty("--preview-x", `${Math.max(12, window.innerWidth - 320)}px`);
    workPreview?.style.setProperty("--preview-y", "92px");
  });
  row.addEventListener("blur", () => workPreview?.classList.remove("is-visible"));
});

const indexItems = Array.from(document.querySelectorAll("[data-index-item]"));
const indexEmoji = document.querySelector("[data-index-emoji]");
const indexAscii = document.querySelector("[data-index-ascii]");
const indexNumber = document.querySelector("[data-index-number]");
const indexTitle = document.querySelector("[data-index-title]");
const indexMeta = document.querySelector("[data-index-meta]");
const indexLink = document.querySelector("[data-index-link]");

const selectIndexItem = (item) => {
  indexItems.forEach((candidate) => {
    candidate.classList.toggle("is-active", candidate === item);
    candidate.setAttribute("aria-pressed", String(candidate === item));
  });

  indexEmoji.textContent = item.dataset.emoji || "✳";
  indexAscii.textContent = createSignal(62, 34, Number(item.dataset.seed || 1) * 0.04, Number(item.dataset.seed || 1));
  indexNumber.textContent = item.dataset.number || "";
  indexTitle.textContent = item.dataset.title || "";
  indexMeta.textContent = item.dataset.meta || "";

  if (item.dataset.href) {
    indexLink.href = item.dataset.href;
    indexLink.textContent = item.dataset.href.startsWith("mailto:") ? "OPEN MAIL ↗" : "OPEN SIGNAL ↗";
    indexLink.classList.remove("is-disabled");
    indexLink.removeAttribute("aria-disabled");

    if (item.dataset.href.startsWith("mailto:")) {
      indexLink.removeAttribute("target");
      indexLink.removeAttribute("rel");
    } else {
      indexLink.target = "_blank";
      indexLink.rel = "noreferrer";
    }
  } else {
    indexLink.removeAttribute("href");
    indexLink.removeAttribute("target");
    indexLink.removeAttribute("rel");
    indexLink.textContent = "NO EXTERNAL LINK";
    indexLink.classList.add("is-disabled");
    indexLink.setAttribute("aria-disabled", "true");
  }
};

indexItems.forEach((item) => {
  item.addEventListener("click", () => selectIndexItem(item));
});

if (indexItems[0]) {
  selectIndexItem(indexItems[0]);
}

const revealTargets = document.querySelectorAll(".work-row, .index-item, .contact-copy");

if ("IntersectionObserver" in window && !reducedMotion.matches) {
  root.classList.add("has-reveal");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  revealTargets.forEach((target, index) => {
    target.style.setProperty("--reveal-delay", `${Math.min(index, 8) * 24}ms`);
    observer.observe(target);
  });
}

window.addEventListener("resize", () => {
  window.cancelAnimationFrame(signalFrame);
  lastSignalRender = 0;
  renderHeroSignal();
});
