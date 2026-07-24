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

  if (themeLabel) {
    themeLabel.textContent = isDark ? "DARK" : "LIGHT";
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
    clock.textContent = "MSK / UTC+3";
  }
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
const signalConstellation = document.querySelector("[data-signal-constellation]");
const signalCore = document.querySelector("[data-signal-core]");
const signalEmojis = ["🍣", "🥪", "☕", "📻", "🏂", "⚽", "🌊", "🖥️", "👋"];
const signalGlyphs = ["·", "+", "×", ":", "∙", "*"];
const signalPointCount = 1240;
let signalPointSets = [];
let signalContext = null;
let signalMetrics = { width: 0, height: 0, dpr: 1 };
let signalFrame = 0;
let lastSignalRender = 0;
let signalStartedAt = performance.now();

const smootherStep = (value) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
};

const createEmojiPointSet = (emoji) => {
  const sampleCanvas = document.createElement("canvas");
  const sampleSize = 180;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });

  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;

  if (!sampleContext) {
    return [];
  }

  sampleContext.clearRect(0, 0, sampleSize, sampleSize);
  sampleContext.fillStyle = "#000";
  sampleContext.font = '132px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  sampleContext.textAlign = "center";
  sampleContext.textBaseline = "middle";
  sampleContext.fillText(emoji, sampleSize / 2, sampleSize / 2 + 4);

  const pixels = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data;
  const sourcePoints = [];

  for (let y = 0; y < sampleSize; y += 2) {
    for (let x = 0; x < sampleSize; x += 2) {
      const pixelIndex = (y * sampleSize + x) * 4;
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      const alpha = pixels[pixelIndex + 3];

      if (alpha > 30) {
        const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
        const saturation = (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
        const detail = 0.22 + (1 - luminance) * 0.5 + saturation * 0.34;

        sourcePoints.push({
          x,
          y,
          weight: Math.min(1, (alpha / 255) * detail),
        });
      }
    }
  }

  if (!sourcePoints.length) {
    return Array.from({ length: signalPointCount }, (_, index) => {
      const angle = (index / signalPointCount) * Math.PI * 2;

      return {
        x: Math.cos(angle) * 0.5,
        y: Math.sin(angle) * 0.5,
        weight: 0.7,
      };
    });
  }

  const minX = Math.min(...sourcePoints.map((point) => point.x));
  const maxX = Math.max(...sourcePoints.map((point) => point.x));
  const minY = Math.min(...sourcePoints.map((point) => point.y));
  const maxY = Math.max(...sourcePoints.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY) || 1;

  const normalized = sourcePoints
    .map((point) => ({
      x: (point.x - centerX) / span,
      y: (point.y - centerY) / span,
      weight: point.weight,
    }))
    .sort((pointA, pointB) => {
      const angleA = (Math.atan2(pointA.y, pointA.x) + Math.PI * 2) % (Math.PI * 2);
      const angleB = (Math.atan2(pointB.y, pointB.x) + Math.PI * 2) % (Math.PI * 2);
      const angleDelta = angleA - angleB;

      if (Math.abs(angleDelta) > 0.035) {
        return angleDelta;
      }

      return Math.hypot(pointA.x, pointA.y) - Math.hypot(pointB.x, pointB.y);
    });

  return Array.from({ length: signalPointCount }, (_, index) => {
    const position = (index / Math.max(1, signalPointCount - 1)) * (normalized.length - 1);
    const lower = normalized[Math.floor(position)];
    const upper = normalized[Math.ceil(position)] || lower;
    const mix = position - Math.floor(position);

    return {
      x: lower.x + (upper.x - lower.x) * mix,
      y: lower.y + (upper.y - lower.y) * mix,
      weight: lower.weight + (upper.weight - lower.weight) * mix,
    };
  });
};

const resizeSignalConstellation = () => {
  if (!signalConstellation || !signalField) {
    return;
  }

  const bounds = signalField.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));

  if (
    signalConstellation.width === Math.round(width * dpr)
    && signalConstellation.height === Math.round(height * dpr)
  ) {
    signalMetrics = { width, height, dpr };
    return;
  }

  signalConstellation.width = Math.round(width * dpr);
  signalConstellation.height = Math.round(height * dpr);
  signalMetrics = { width, height, dpr };
};

const drawSignalConstellation = (time = performance.now()) => {
  if (!signalContext || !signalPointSets.length) {
    return;
  }

  resizeSignalConstellation();

  const { width, height, dpr } = signalMetrics;

  signalContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  signalContext.clearRect(0, 0, width, height);

  const elapsed = captureMode || reducedMotion.matches ? 0 : Math.max(0, time - signalStartedAt);
  const cycleDuration = 5200;
  const cycle = elapsed / cycleDuration;
  const currentIndex = Math.floor(cycle) % signalPointSets.length;
  const nextIndex = (currentIndex + 1) % signalPointSets.length;
  const cycleProgress = cycle - Math.floor(cycle);
  const morphProgress = smootherStep((cycleProgress - 0.42) / 0.58);
  const currentPoints = signalPointSets[currentIndex];
  const nextPoints = signalPointSets[nextIndex];
  const isCompact = width < 680;
  const pointStep = isCompact ? 3 : 1;
  const fieldScale = Math.min(width * 0.82, height * 0.92);
  const rotation = (elapsed / 96000) * Math.PI * 2;
  const breathing = 1 + Math.sin(elapsed * 0.0008) * 0.018;
  const signalColor = getComputedStyle(root).getPropertyValue("--signal").trim() || "#2448ed";
  const glyphSize = Math.max(6, Math.min(10.5, fieldScale / 64));

  signalContext.save();
  signalContext.translate(width / 2, height / 2);
  signalContext.rotate(rotation);
  signalContext.scale(breathing, breathing);

  signalContext.strokeStyle = signalColor;
  signalContext.lineWidth = 0.75;
  signalContext.globalAlpha = 0.13;
  signalContext.setLineDash([1, 7]);
  signalContext.beginPath();
  signalContext.arc(0, 0, fieldScale * 0.535, -0.24, Math.PI * 1.24);
  signalContext.stroke();
  signalContext.beginPath();
  signalContext.arc(0, 0, fieldScale * 0.49, Math.PI * 0.74, Math.PI * 1.92);
  signalContext.stroke();
  signalContext.setLineDash([]);

  for (let orbitIndex = 0; orbitIndex < signalEmojis.length; orbitIndex += 1) {
    const angle = (orbitIndex / signalEmojis.length) * Math.PI * 2 - Math.PI / 2;
    const radius = fieldScale * 0.535;

    signalContext.globalAlpha = orbitIndex === currentIndex ? 0.72 : 0.2;
    signalContext.beginPath();
    signalContext.arc(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      orbitIndex === currentIndex ? 2.2 : 1.2,
      0,
      Math.PI * 2,
    );
    signalContext.fillStyle = signalColor;
    signalContext.fill();
  }

  signalContext.fillStyle = signalColor;
  signalContext.font = `${glyphSize}px "IBM Plex Mono", "SFMono-Regular", "SF Mono", monospace`;
  signalContext.textAlign = "center";
  signalContext.textBaseline = "middle";
  signalContext.shadowBlur = isCompact ? 1.5 : 2.5;
  signalContext.shadowColor = signalColor;

  for (let index = 0; index < signalPointCount; index += pointStep) {
    const start = currentPoints[index];
    const end = nextPoints[index];
    const drift = Math.sin(index * 0.73 + elapsed * 0.0012) * fieldScale * 0.0025;
    const x = (start.x + (end.x - start.x) * morphProgress) * fieldScale;
    const y = (start.y + (end.y - start.y) * morphProgress) * fieldScale;
    const weight = start.weight + (end.weight - start.weight) * morphProgress;

    const glyphIndex = Math.min(
      signalGlyphs.length - 1,
      Math.floor(weight * signalGlyphs.length),
    );

    signalContext.globalAlpha = 0.34 + weight * 0.66;
    signalContext.fillText(
      signalGlyphs[glyphIndex],
      x + drift,
      y - drift,
    );
  }

  signalContext.restore();
  signalContext.globalAlpha = 1;
};

const renderSignalConstellation = (time = performance.now()) => {
  if (time - lastSignalRender > 40 || time === 0) {
    drawSignalConstellation(time);
    lastSignalRender = time;
  }

  if (!reducedMotion.matches && !captureMode) {
    signalFrame = window.requestAnimationFrame(renderSignalConstellation);
  }
};

const initializeSignalConstellation = () => {
  if (!signalConstellation) {
    return;
  }

  signalContext = signalConstellation.getContext("2d");
  signalPointSets = signalEmojis.map(createEmojiPointSet);
  signalStartedAt = performance.now();
  resizeSignalConstellation();
  renderSignalConstellation(0);
};

initializeSignalConstellation();
document.fonts?.ready.then(() => {
  signalPointSets = signalEmojis.map(createEmojiPointSet);
  drawSignalConstellation();
});

window.addEventListener("resize", () => {
  resizeSignalConstellation();
  drawSignalConstellation();
});

new MutationObserver(() => drawSignalConstellation()).observe(root, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

signalField?.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches) {
    return;
  }

  const bounds = signalField.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;

  signalField.style.setProperty("--core-x", `${x * 12}px`);
  signalField.style.setProperty("--core-y", `${y * 9}px`);
});

signalField?.addEventListener("pointerleave", () => {
  signalField.style.setProperty("--core-x", "0px");
  signalField.style.setProperty("--core-y", "0px");
});

const mapItems = [
  {
    id: "garage",
    kind: "company",
    label: "МУЗЕЙ «ГАРАЖ»",
    title: "МУЗЕЙ «ГАРАЖ»",
    meta: "ОКТ 2021—МАР 2025 / СТАРШИЙ МЕНЕДЖЕР ВЕБ-РАЗРАБОТКИ",
    description: "Самый важный профессиональный период: здесь сошлись культура, продукт, исследования, дизайн и большая веб-разработка.",
    href: "https://garagemca.org/ru",
    kindLabel: "ИНСТИТУЦИЯ / 2021—2025",
    previewVideo: "https://edge-msk-10.kinescopecdn.net/d03295ab-29f8-4426-83a9-f97c054de013/videos/563c8d41-0054-4a33-8f28-2b7359302fd4/mp4/019db582-6bd5-7ec0-8d0a-185740dd44b0.mp4",
    previewDuration: 9,
    previewMeta: "CHARMER / EXCERPT / 00:09",
    x: 46,
    y: 14,
    size: 76,
  },
  {
    id: "private-practice",
    kind: "company",
    label: "ЧАСТНАЯ ПРАКТИКА",
    title: "ЧАСТНАЯ ПРАКТИКА",
    meta: "СЕЙЧАС / НЕБОЛЬШИЕ DIGITAL-ПРОЕКТЫ",
    description: "Самостоятельная работа с проектами, которым нужно быстро разобраться в задаче, придать форму и дойти до запуска.",
    kindLabel: "РАБОТА / INDEPENDENT",
    x: 34,
    y: 30,
    size: 34,
  },
  {
    id: "optimal",
    kind: "company",
    label: "ОПТИМАЛГРУПП",
    title: "DIGITAL-АГЕНТСТВО «ОПТИМАЛГРУПП»",
    meta: "EARLIER EXPERIENCE / DIGITAL AGENCY",
    description: "Клиентские web-проекты, производство, коммуникация и ранний опыт работы на стыке задач и команд.",
    kindLabel: "КОМПАНИЯ / AGENCY",
    x: 24,
    y: 18,
    size: 29,
  },
  {
    id: "ilmix",
    kind: "company",
    label: "ИЛЬМИКСГРУПП",
    title: "«ИЛЬМИКСГРУПП»",
    meta: "EARLIER EXPERIENCE / IN-HOUSE DIGITAL",
    description: "Digital-работа внутри фармацевтической компании и опыт развития внутренних web-направлений.",
    kindLabel: "КОМПАНИЯ / IN-HOUSE",
    x: 16,
    y: 30,
    size: 24,
  },
  {
    id: "garage-site",
    parent: "garage",
    kind: "project",
    label: "САЙТ МУЗЕЯ",
    title: "САЙТ МУЗЕЯ «ГАРАЖ»",
    meta: "UX / UI / DESIGN ENGINEERING / WEB MANAGEMENT",
    description: "Исследование, развитие и ежедневная работа с главным цифровым продуктом Музея и его командой.",
    href: "https://garagemca.org/",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    x: 58,
    y: 14,
    size: 23,
  },
  {
    id: "narkomfin",
    parent: "garage",
    kind: "project",
    label: "ДОМ НАРКОМФИНА",
    title: "ДОМ НАРКОМФИНА",
    meta: "UX / UI / DESIGN ENGINEERING / WEB MANAGEMENT",
    description: "Институциональный и исследовательский проект Музея. Один из самых цельных опытов — от исследования до развития цифровой формы.",
    href: "https://narkomfin.ru/",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    x: 67,
    y: 21,
    size: 25,
  },
  {
    id: "collection",
    parent: "garage",
    kind: "project",
    label: "КОЛЛЕКЦИЯ",
    title: "КОЛЛЕКЦИЯ И ОТКРЫТОЕ ХРАНЕНИЕ",
    meta: "2024 / PRODUCT / RESEARCH / DELIVERY",
    description: "Запуск каталога коллекции и открытого хранения: продуктовая логика, исследования, интерфейс и координация реализации.",
    href: "https://garagemca.org/collection/catalogue",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    x: 75,
    y: 14,
    size: 22,
  },
  {
    id: "garage-archives",
    parent: "garage",
    kind: "project",
    label: "АРХИВЫ",
    title: "АРХИВНЫЕ ПРОЕКТЫ",
    meta: "RUSSIAN ART ARCHIVE / I-M-I / NNS",
    description: "Поддержка и развитие цифровых архивов — от повседневных задач до проектирования новых сценариев доступа к материалам.",
    href: "https://russianartarchive.net/ru",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    x: 59,
    y: 28,
    size: 18,
  },
  {
    id: "garage-courses",
    parent: "garage",
    kind: "project",
    label: "ОНЛАЙН-КУРСЫ",
    title: "ОНЛАЙН-КУРСЫ МУЗЕЯ",
    meta: "LEARNING / PRODUCT / PARTNERSHIPS",
    description: "Бесплатные образовательные продукты: запуск курсов, улучшение сценариев и работа с партнёрами.",
    href: "https://garagemca.org/learn/online-courses",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    x: 80,
    y: 25,
    size: 17,
  },
  {
    id: "garage-app",
    parent: "garage",
    kind: "project",
    label: "Я ИДУ В МУЗЕЙ",
    title: "«Я ИДУ В МУЗЕЙ»",
    meta: "ACCESSIBILITY / MOBILE PRODUCT / RELAUNCH",
    description: "Перезапуск приложения для людей с ментальными особенностями и их близких: доступность, навигация и понятный маршрут.",
    href: "https://apps.apple.com/ru/app/я-иду-в-музей/id1558275984",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    x: 84,
    y: 36,
    size: 17,
  },
  {
    id: "garage-webzine",
    parent: "garage",
    kind: "project",
    label: "ВЕБ-ЗИН",
    title: "«НЕЧЕЛОВЕЧЕСКИЕ ЖИВОТНЫЕ И ТЕХНИКА»",
    meta: "RESEARCH / DESIGN ENGINEERING / CODE",
    description: "Небольшой исследовательский web-зин, собранный руками как самостоятельная цифровая форма.",
    href: "https://non-human-animals.garage.digital/index.html",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    x: 72,
    y: 34,
    size: 15,
  },
  {
    id: "garage-institutions",
    parent: "garage",
    kind: "project",
    label: "ПОМОЩЬ ИНСТИТУЦИЯМ",
    title: "ПОМОЩЬ КУЛЬТУРНЫМ ИНСТИТУЦИЯМ",
    meta: "CONSULTING / DESIGN / TECHNICAL SUPPORT",
    description: "Знания, консультации и конкретная техническая помощь культурным институциям и НКО — с акцентом на быстрый запуск.",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    x: 55,
    y: 37,
    size: 16,
  },
  {
    id: "garage-endowment",
    parent: "garage",
    kind: "project",
    label: "ЭНДАУМЕНТ",
    title: "ЭНДАУМЕНТ-ФОНД МУЗЕЯ",
    meta: "SUPPORT / DEVELOPMENT / CONTENT",
    description: "Поддержка и развитие отдельного цифрового продукта эндаумент-фонда Музея.",
    href: "https://endowment.garagemca.org/ru/",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    x: 53,
    y: 23,
    size: 12,
  },
  {
    id: "shirokostup",
    kind: "project",
    label: "SHIROKOSTUP",
    title: "SHIROKOSTUP",
    meta: "EDITORIAL / WEB / 2026",
    description: "Портфолио куратора и исследовательницы: редакционная структура, спокойный интерфейс и самостоятельный запуск.",
    href: "https://shirokostup.site/",
    kindLabel: "ПРОЕКТ / INDEPENDENT",
    previewVideo: "assets/reels/shirokostup.mp4",
    previewMeta: "SITE REEL / 00:08",
    x: 89,
    y: 48,
    size: 22,
  },
  {
    id: "tarski",
    kind: "project",
    label: "TARSKI",
    title: "TARSKI",
    meta: "DIGITAL PRODUCT / WEB",
    description: "Цифровой продукт и web-система: продуктовая логика, интерфейс и последовательное развитие.",
    href: "https://tarski.ru/",
    kindLabel: "ПРОЕКТ / INDEPENDENT",
    previewVideo: "assets/reels/tarski.mp4",
    previewMeta: "SITE REEL / 00:08",
    x: 78,
    y: 47,
    size: 23,
  },
  {
    id: "herman",
    kind: "project",
    label: "HERMAN & CO",
    title: "HERMAN & CO",
    meta: "SERVICE / WEB",
    description: "Сервисный сайт с живым статусом, ясной записью и одной цельной системой материалов и состояний.",
    href: "https://barberherman.ru/",
    kindLabel: "ПРОЕКТ / INDEPENDENT",
    previewVideo: "assets/reels/herman.mp4",
    previewMeta: "SITE REEL / 00:08",
    x: 88,
    y: 58,
    size: 19,
  },
  {
    id: "dusty",
    kind: "project",
    label: "DUSTY MERCH",
    title: "DUSTY MERCH",
    meta: "COMMERCE / WEB",
    description: "Небольшой commerce-проект с самостоятельной визуальной системой и быстрым запуском.",
    href: "https://merch.dustydumbbells.com/",
    kindLabel: "ПРОЕКТ / INDEPENDENT",
    previewVideo: "assets/reels/dusty-merch.mp4",
    previewMeta: "SITE REEL / 00:08",
    x: 73,
    y: 61,
    size: 17,
  },
  {
    id: "dd-camp",
    kind: "project",
    label: "DD CAMP",
    title: "DUSTY DUMBBELLS CAMP",
    meta: "EXPERIENCE / WEB",
    description: "Сайт спортивного кемпа: структура программы, атмосфера события и практичная точка входа.",
    href: "https://camp.dustydumbbells.com/",
    kindLabel: "ПРОЕКТ / INDEPENDENT",
    previewVideo: "assets/reels/dusty-camp.mp4",
    previewMeta: "SITE REEL / 00:08",
    x: 84,
    y: 68,
    size: 15,
  },
  {
    id: "eleven",
    kind: "project",
    label: "11 111",
    title: "11 111",
    meta: "BRAND / WEB",
    description: "Небольшой брендовый web-проект, где цифровая форма работает как самостоятельный характер.",
    href: "https://11111.life/",
    kindLabel: "ПРОЕКТ / INDEPENDENT",
    previewVideo: "assets/reels/11111.mp4",
    previewMeta: "SITE REEL / 00:08",
    x: 68,
    y: 72,
    size: 14,
  },
  {
    id: "ks-fish",
    kind: "project",
    label: "KS FISH",
    title: "KS FISH",
    meta: "CATALOG / WEB",
    description: "Каталожный сайт с ясной продуктовой структурой и визуальным ощущением холодного течения.",
    href: "https://ks.fish/",
    kindLabel: "ПРОЕКТ / INDEPENDENT",
    previewVideo: "assets/reels/ks-fish.mp4",
    previewMeta: "SITE REEL / 00:08",
    x: 91,
    y: 75,
    size: 13,
  },
  {
    id: "doronin",
    kind: "project",
    label: "DORONIN",
    title: "DORONIN",
    meta: "COMMERCE / WEB",
    description: "Цифровой магазин с компактной, собранной и понятной системой взаимодействия.",
    href: "https://doronin.store/",
    kindLabel: "ПРОЕКТ / INDEPENDENT",
    previewVideo: "assets/reels/doronin.mp4",
    previewMeta: "SITE REEL / 00:08",
    x: 77,
    y: 81,
    size: 13,
  },
  {
    id: "art",
    kind: "personal",
    label: "ИСКУССТВО",
    title: "ИСКУССТВО",
    meta: "CULTURE / LOOK AGAIN",
    description: "Не отдельное хобби, а способ смотреть внимательнее и постоянно перенастраивать собственную оптику.",
    kindLabel: "ЛИЧНОЕ / INTEREST",
    x: 54,
    y: 84,
    size: 17,
  },
  {
    id: "football",
    kind: "personal",
    label: "ФУТБОЛ",
    title: "ФУТБОЛ",
    meta: "WATCH / READ / DISCUSS",
    description: "Игра, в которой интересны движение, пространство, системы и исключения из них.",
    href: "https://www.sports.ru/tribuna/blogs/vadimlukomski/2249320.html",
    kindLabel: "ЛИЧНОЕ / INTEREST",
    x: 43,
    y: 81,
    size: 14,
  },
  {
    id: "snow",
    kind: "personal",
    label: "СНЕГ",
    title: "СНЕГ",
    meta: "SNOWBOARD / MOVEMENT",
    description: "Способ переключить режим внимания и снова почувствовать скорость, склон и тело.",
    kindLabel: "ЛИЧНОЕ / INTEREST",
    x: 34,
    y: 72,
    size: 13,
  },
  {
    id: "music",
    kind: "personal",
    label: "МУЗЫКА",
    title: "МУЗЫКА",
    meta: "PLAY / REPEAT",
    description: "Постоянный фон, источник ритма и иногда самый быстрый способ изменить состояние.",
    href: "https://open.spotify.com/track/3GVkPk8mqxz0itaAriG1L7?si=233684c3f400482d",
    kindLabel: "ЛИЧНОЕ / INTEREST",
    x: 44,
    y: 91,
    size: 12,
  },
  {
    id: "coffee",
    kind: "personal",
    label: "КОФЕ",
    title: "КОФЕ",
    meta: "RITUAL / BLACK",
    description: "Маленький ежедневный ритуал и уважительный кивок агенту Куперу.",
    href: "https://en.wikipedia.org/wiki/Dale_Cooper",
    kindLabel: "ЛИЧНОЕ / INTEREST",
    x: 62,
    y: 89,
    size: 10,
  },
  {
    id: "wave",
    kind: "personal",
    label: "ВОЛНА",
    title: "ВОЛНА",
    meta: "WATER / BLUE HOUR",
    description: "Открытая вода, движение и возможность на время потерять привычный масштаб вещей.",
    kindLabel: "ЛИЧНОЕ / INTEREST",
    x: 68,
    y: 78,
    size: 12,
  },
  {
    id: "food",
    kind: "personal",
    label: "ЕДА",
    title: "ЕДА",
    meta: "TASTE / DETAILS",
    description: "Суши, пастрами и другие доказательства того, что детали действительно меняют всё.",
    kindLabel: "ЛИЧНОЕ / INTEREST",
    x: 31,
    y: 84,
    size: 10,
  },
  {
    id: "research",
    kind: "practice",
    label: "ИССЛЕДОВАНИЕ",
    title: "ИССЛЕДОВАНИЕ",
    meta: "CONTEXT / PEOPLE / LIMITS",
    description: "Начать с понимания реального контекста, а не с заранее выбранного решения.",
    kindLabel: "ПРАКТИКА / ROLE",
    x: 15,
    y: 35,
    size: 18,
  },
  {
    id: "shape",
    kind: "practice",
    label: "SHAPE",
    title: "ПРИДАТЬ ФОРМУ",
    meta: "CONCEPT / REQUIREMENTS / STRUCTURE",
    description: "Превратить разрозненные вводные в форму, которую можно обсуждать, проверять и делать.",
    kindLabel: "ПРАКТИКА / ROLE",
    x: 9,
    y: 48,
    size: 15,
  },
  {
    id: "prototype",
    kind: "practice",
    label: "ПРОТОТИП",
    title: "ПРОТОТИПИРОВАНИЕ",
    meta: "MAKE IT VISIBLE",
    description: "Сделать идею видимой достаточно рано, чтобы спорить уже не с воображением.",
    kindLabel: "ПРАКТИКА / ROLE",
    x: 19,
    y: 55,
    size: 14,
  },
  {
    id: "coordinate",
    kind: "practice",
    label: "КООРДИНАЦИЯ",
    title: "КООРДИНАЦИЯ",
    meta: "PEOPLE / TIME / BUDGET / DECISIONS",
    description: "Соединять команды, ограничения и решения так, чтобы проект продолжал двигаться.",
    kindLabel: "ПРАКТИКА / ROLE",
    x: 28,
    y: 63,
    size: 18,
  },
  {
    id: "design-engineering",
    kind: "practice",
    label: "DESIGN ENGINEERING",
    title: "ДИЗАЙН-ИНЖЕНЕРИЯ",
    meta: "DESIGN / CODE / BEHAVIOR",
    description: "Работать одновременно с формой и реализацией, не теряя смысл между макетом и продуктом.",
    kindLabel: "ПРАКТИКА / ROLE",
    x: 14,
    y: 68,
    size: 17,
  },
  {
    id: "code",
    kind: "practice",
    label: "КОД",
    title: "КОД",
    meta: "HANDS-ON / WHEN USEFUL",
    description: "Подключаться руками там, где это быстрее приближает проект к проверяемому результату.",
    kindLabel: "ПРАКТИКА / ROLE",
    x: 27,
    y: 76,
    size: 12,
  },
  {
    id: "delivery",
    kind: "practice",
    label: "DELIVERY",
    title: "ДОВЕСТИ ДО ЗАПУСКА",
    meta: "RELEASE / FEEDBACK / ITERATION",
    description: "Релиз — не финальная точка, а момент, когда проект начинает отвечать реальному миру.",
    kindLabel: "ПРАКТИКА / ROLE",
    x: 36,
    y: 44,
    size: 15,
  },
];

const mapNodesRoot = document.querySelector("[data-map-nodes]");
const mapSpecksRoot = document.querySelector("[data-map-specks]");
const mapLinksRoot = document.querySelector("[data-map-links]");
const mapKind = document.querySelector("[data-map-kind]");
const mapTitle = document.querySelector("[data-map-title]");
const mapMeta = document.querySelector("[data-map-meta]");
const mapDescription = document.querySelector("[data-map-description]");
const mapLink = document.querySelector("[data-map-link]");
const mapInspector = document.querySelector("[data-map-inspector]");
const inspectorClose = document.querySelector("[data-close-inspector]");
const mapPreview = document.querySelector("[data-map-preview]");
const mapPreviewVideo = document.querySelector("[data-map-preview-video]");
const mapPreviewAscii = document.querySelector("[data-map-preview-ascii]");
const mapPreviewKind = document.querySelector("[data-map-preview-kind]");
const mapPreviewTitle = document.querySelector("[data-map-preview-title]");
const mapPreviewMeta = document.querySelector("[data-map-preview-meta]");
const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");
const mapButtons = new Map();
let selectedMapId = "garage";
let previewHideTimer = 0;
let activePreviewItem = null;

const hideMapPreview = ({ immediate = false } = {}) => {
  window.clearTimeout(previewHideTimer);

  const hide = () => {
    mapPreview?.classList.remove("is-visible");
    mapPreview?.setAttribute("aria-hidden", "true");
    mapPreviewVideo?.pause();
    activePreviewItem = null;
  };

  if (immediate) {
    hide();
  } else {
    previewHideTimer = window.setTimeout(hide, 90);
  }
};

const showMapPreview = (item) => {
  if (
    !mapPreview
    || (item.kind !== "company" && !item.previewVideo)
    || !hoverCapable.matches
    || mapInspector?.classList.contains("is-open")
  ) {
    return;
  }

  window.clearTimeout(previewHideTimer);
  activePreviewItem = item;

  if (mapPreviewKind) {
    mapPreviewKind.textContent = item.kindLabel;
  }

  if (mapPreviewTitle) {
    mapPreviewTitle.textContent = item.title;
  }

  if (mapPreviewMeta) {
    mapPreviewMeta.textContent = item.previewMeta || item.meta;
  }

  if (mapPreviewAscii) {
    const seed = item.id.split("").reduce((total, character) => total + character.charCodeAt(0), 0);
    mapPreviewAscii.textContent = createSignal(62, 30, 0.45, seed * 0.01);
  }

  const hasVideo = Boolean(item.previewVideo && mapPreviewVideo);
  mapPreview.classList.toggle("has-video", hasVideo);

  if (hasVideo) {
    if (mapPreviewVideo.dataset.previewId !== item.id) {
      mapPreview.classList.remove("is-video-ready");
      mapPreviewVideo.dataset.previewId = item.id;
      mapPreviewVideo.src = item.previewVideo;
    }

    if (mapPreviewVideo.readyState >= 1) {
      mapPreviewVideo.currentTime = item.previewStart || 0;
    }

    mapPreviewVideo.play().catch(() => {
      // The textual preview remains available if autoplay is blocked.
    });
  } else {
    activePreviewItem = null;
    mapPreviewVideo?.pause();
    mapPreview.classList.remove("is-video-ready");
  }

  mapPreview.setAttribute("aria-hidden", "false");
  window.requestAnimationFrame(() => mapPreview.classList.add("is-visible"));
};

mapPreviewVideo?.addEventListener("canplay", () => {
  mapPreview?.classList.add("is-video-ready");
});

mapPreviewVideo?.addEventListener("loadedmetadata", () => {
  if (!activePreviewItem) {
    return;
  }

  mapPreviewVideo.currentTime = activePreviewItem.previewStart || 0;
});

mapPreviewVideo?.addEventListener("timeupdate", () => {
  if (!activePreviewItem?.previewDuration) {
    return;
  }

  const previewStart = activePreviewItem.previewStart || 0;

  if (mapPreviewVideo.currentTime >= previewStart + activePreviewItem.previewDuration) {
    mapPreviewVideo.currentTime = previewStart;
    mapPreviewVideo.play().catch(() => {
      // The preview can remain paused when playback is blocked.
    });
  }
});

const setInspectorOpen = (isOpen) => {
  if (!mapInspector) {
    return;
  }

  mapInspector.classList.toggle("is-open", isOpen);
  mapInspector.setAttribute("aria-hidden", String(!isOpen));
  mapInspector.inert = !isOpen;
};

const selectMapItem = (id, { reveal = false } = {}) => {
  const item = mapItems.find((candidate) => candidate.id === id);

  if (!item) {
    return;
  }

  selectedMapId = id;

  mapButtons.forEach((button, buttonId) => {
    const isSelected = buttonId === selectedMapId;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  if (mapKind) {
    mapKind.textContent = item.kindLabel;
  }

  if (mapTitle) {
    mapTitle.textContent = item.title;
  }

  if (mapMeta) {
    mapMeta.textContent = item.meta;
  }

  if (mapDescription) {
    mapDescription.textContent = item.description;
  }

  if (mapLink) {
    if (item.href) {
      mapLink.href = item.href;
      mapLink.textContent = "ОТКРЫТЬ ↗";
      mapLink.classList.remove("is-disabled");
      mapLink.removeAttribute("aria-disabled");
      mapLink.target = "_blank";
      mapLink.rel = "noreferrer";
    } else {
      mapLink.removeAttribute("href");
      mapLink.removeAttribute("target");
      mapLink.removeAttribute("rel");
      mapLink.textContent = "БЕЗ ВНЕШНЕЙ ССЫЛКИ";
      mapLink.classList.add("is-disabled");
      mapLink.setAttribute("aria-disabled", "true");
    }
  }

  if (reveal) {
    setInspectorOpen(true);
  }
};

inspectorClose?.addEventListener("click", () => {
  setInspectorOpen(false);
  mapButtons.get(selectedMapId)?.focus();
});

if (mapNodesRoot) {
  mapItems.forEach((item) => {
    const button = document.createElement("button");
    const glyph = document.createElement("span");
    const label = document.createElement("span");

    button.type = "button";
    button.className = `map-node map-node--${item.kind}`;
    button.dataset.mapId = item.id;
    button.dataset.mapKind = item.kind;
    button.style.setProperty("--x", `${item.x}%`);
    button.style.setProperty("--y", `${item.y}%`);
    button.style.setProperty("--size", `${item.size}px`);
    button.setAttribute("aria-label", `${item.title}. ${item.meta}`);
    button.setAttribute("aria-pressed", "false");

    if (item.id === "garage") {
      button.classList.add("map-node--garage");
    }

    if (item.parent === "garage") {
      button.classList.add("map-node--garage-child");
    }

    glyph.className = "map-node__glyph";
    glyph.setAttribute("aria-hidden", "true");
    label.className = "map-node__label";
    label.textContent = item.label;

    button.append(glyph, label);
    button.addEventListener("click", () => {
      hideMapPreview({ immediate: true });
      selectMapItem(item.id, { reveal: true });
    });
    button.addEventListener("focus", () => selectMapItem(item.id));

    if (item.kind === "company" || item.previewVideo) {
      button.addEventListener("pointerenter", () => showMapPreview(item));
      button.addEventListener("pointerleave", () => hideMapPreview());
      button.addEventListener("focus", () => showMapPreview(item));
      button.addEventListener("blur", () => hideMapPreview());
    }

    mapButtons.set(item.id, button);
    mapNodesRoot.append(button);
  });
}

if (mapLinksRoot) {
  const itemById = new Map(mapItems.map((item) => [item.id, item]));

  mapItems.forEach((item) => {
    if (!item.parent) {
      return;
    }

    const parent = itemById.get(item.parent);

    if (!parent) {
      return;
    }

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(parent.x));
    line.setAttribute("y1", String(parent.y));
    line.setAttribute("x2", String(item.x));
    line.setAttribute("y2", String(item.y));

    if (item.parent === "garage") {
      line.classList.add("is-garage-link");
    }

    mapLinksRoot.append(line);
  });
}

const seededRandom = (seed) => {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

if (mapSpecksRoot) {
  const zones = [
    { kind: "company", count: 17, x: [10, 61], y: [8, 38], seed: 11 },
    { kind: "project", count: 22, x: [54, 94], y: [17, 82], seed: 23 },
    { kind: "personal", count: 15, x: [27, 72], y: [70, 94], seed: 37 },
    { kind: "practice", count: 18, x: [6, 40], y: [28, 80], seed: 47 },
  ];

  zones.forEach((zone) => {
    const random = seededRandom(zone.seed);

    for (let index = 0; index < zone.count; index += 1) {
      const speck = document.createElement("span");
      const x = zone.x[0] + random() * (zone.x[1] - zone.x[0]);
      const y = zone.y[0] + random() * (zone.y[1] - zone.y[0]);
      const size = 2 + random() * 3;
      const opacity = 0.18 + random() * 0.34;

      speck.className = `map-speck map-speck--${zone.kind}`;
      speck.style.setProperty("--x", `${x.toFixed(2)}%`);
      speck.style.setProperty("--y", `${y.toFixed(2)}%`);
      speck.style.setProperty("--s", `${size.toFixed(2)}px`);
      speck.style.setProperty("--o", opacity.toFixed(2));
      mapSpecksRoot.append(speck);
    }
  });
}

selectMapItem("garage");

const practiceMap = document.querySelector("[data-practice-map]");
const mapFilterButtons = Array.from(document.querySelectorAll("[data-map-filter]"));
let activeMapFilter = "all";

const setMapFilter = (kind) => {
  activeMapFilter = kind;

  if (practiceMap) {
    practiceMap.dataset.activeKind = kind;
  }

  mapFilterButtons.forEach((button) => {
    const isActive = button.dataset.mapFilter === kind;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
};

mapFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMapFilter(button.dataset.mapFilter || "all");
  });
});

const contentPanel = document.querySelector("[data-content-panel]");
const panelScrim = document.querySelector("[data-panel-scrim]");
const panelClose = document.querySelector("[data-close-panel]");
const panelTitle = document.querySelector("[data-panel-title]");
const panelIndex = document.querySelector("[data-panel-index]");
const panelSections = Array.from(document.querySelectorAll("[data-panel-section]"));
const panelOpenButtons = Array.from(document.querySelectorAll("[data-open-panel]"));
let activePanelView = null;
let lastPanelTrigger = null;

const panelViews = {
  work: {
    index: "01 / SELECTED WORK",
    title: "ИЗБРАННЫЕ ПРОЕКТЫ",
  },
  approach: {
    index: "02 / HOW I WORK",
    title: "КАК Я РАБОТАЮ",
  },
  contact: {
    index: "03 / CONTACT",
    title: "МОЖНО ПОГОВОРИТЬ",
  },
};

const setPanelOpen = (isOpen) => {
  contentPanel?.classList.toggle("is-open", isOpen);
  contentPanel?.setAttribute("aria-hidden", String(!isOpen));

  if (contentPanel) {
    contentPanel.inert = !isOpen;
  }

  panelScrim?.classList.toggle("is-visible", isOpen);
  panelScrim?.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("has-content-panel", isOpen);
};

const openContentPanel = (view, trigger = null) => {
  const config = panelViews[view];

  if (!config) {
    return;
  }

  activePanelView = view;
  lastPanelTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
  panelSections.forEach((section) => {
    section.hidden = section.dataset.panelSection !== view;
  });

  if (panelTitle) {
    panelTitle.textContent = config.title;
  }

  if (panelIndex) {
    panelIndex.textContent = config.index;
  }

  hideMapPreview({ immediate: true });
  setInspectorOpen(false);
  setPanelOpen(true);
  window.requestAnimationFrame(() => panelClose?.focus());
};

const closeContentPanel = ({ restoreFocus = true } = {}) => {
  if (!activePanelView) {
    return;
  }

  setPanelOpen(false);
  activePanelView = null;

  if (restoreFocus && lastPanelTrigger instanceof HTMLElement) {
    lastPanelTrigger.focus();
  }
};

panelOpenButtons.forEach((button) => {
  button.addEventListener("click", () => {
    openContentPanel(button.dataset.openPanel, button);
  });
});

panelClose?.addEventListener("click", () => closeContentPanel());
panelScrim?.addEventListener("click", () => closeContentPanel());

const commandForm = document.querySelector("[data-command-form]");
const commandInput = document.querySelector("[data-command-input]");
const commandResults = document.querySelector("[data-command-results]");
let currentCommandResults = [];

const normalizeSearch = (value) => value
  .toLocaleLowerCase("ru")
  .replaceAll("ё", "е")
  .replace(/[^a-zа-я0-9]+/gi, " ")
  .trim();

const commandViews = [
  {
    type: "panel",
    id: "work",
    title: "ИЗБРАННЫЕ ПРОЕКТЫ",
    meta: "8 LIVE PROJECTS / 2023—2026",
    keywords: "проекты работы портфолио selected work sites сайты",
  },
  {
    type: "panel",
    id: "approach",
    title: "КАК Я РАБОТАЮ",
    meta: "RESEARCH → SHAPE → COORDINATE → MAKE",
    keywords: "подход метод процесс принципы работа approach how",
  },
  {
    type: "panel",
    id: "contact",
    title: "КОНТАКТ",
    meta: "MOSCOW / REMOTE / EMAIL",
    keywords: "контакт почта написать связаться contact email",
  },
];

const setCommandOpen = (isOpen) => {
  commandForm?.classList.toggle("is-open", isOpen);
  commandInput?.setAttribute("aria-expanded", String(isOpen));
};

const clearSearchHighlight = () => {
  mapButtons.forEach((button) => button.classList.remove("is-search-miss"));
};

const applySearchHighlight = (query) => {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    clearSearchHighlight();
    return;
  }

  mapItems.forEach((item) => {
    const haystack = normalizeSearch([
      item.label,
      item.title,
      item.meta,
      item.kindLabel,
      item.description,
    ].join(" "));
    mapButtons.get(item.id)?.classList.toggle("is-search-miss", !haystack.includes(normalizedQuery));
  });
};

const makeNodeCommandResult = (item) => ({
  type: "node",
  id: item.id,
  title: item.label,
  meta: item.meta,
});

const getCommandResults = (query) => {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    const garage = mapItems.find((item) => item.id === "garage");
    return [
      ...(garage ? [makeNodeCommandResult(garage)] : []),
      ...commandViews,
    ];
  }

  const nodes = mapItems
    .filter((item) => normalizeSearch([
      item.label,
      item.title,
      item.meta,
      item.kindLabel,
      item.description,
    ].join(" ")).includes(normalizedQuery))
    .slice(0, 6)
    .map(makeNodeCommandResult);

  const views = commandViews.filter((view) => (
    normalizeSearch(`${view.title} ${view.meta} ${view.keywords}`).includes(normalizedQuery)
  ));

  return [...nodes, ...views].slice(0, 7);
};

const renderCommandResults = (query = "") => {
  if (!commandResults) {
    return;
  }

  currentCommandResults = getCommandResults(query);
  commandResults.replaceChildren();

  if (!currentCommandResults.length) {
    const empty = document.createElement("p");
    empty.className = "command-results__empty";
    empty.textContent = "НИЧЕГО НЕ НАШЛОСЬ — ПОПРОБУЙТЕ ДРУГОЕ СЛОВО";
    commandResults.append(empty);
    setCommandOpen(true);
    return;
  }

  currentCommandResults.forEach((result) => {
    const button = document.createElement("button");
    const title = document.createElement("span");
    const meta = document.createElement("span");
    const mark = document.createElement("span");

    button.type = "button";
    button.className = "command-result";
    button.dataset.resultType = result.type;
    button.dataset.resultId = result.id;
    button.setAttribute("role", "option");

    title.textContent = result.title;
    meta.textContent = result.meta;
    mark.textContent = result.type === "node" ? "●" : "↗";
    mark.setAttribute("aria-hidden", "true");

    button.append(title, meta, mark);
    commandResults.append(button);
  });

  setCommandOpen(true);
};

const runCommandResult = (result) => {
  if (!result) {
    return;
  }

  if (result.type === "node") {
    setMapFilter("all");
    selectMapItem(result.id, { reveal: true });

    if (commandInput) {
      commandInput.value = "";
    }

    clearSearchHighlight();
  } else {
    openContentPanel(result.id, commandInput);
  }

  setCommandOpen(false);
  commandInput?.blur();
};

commandInput?.addEventListener("focus", () => {
  renderCommandResults(commandInput.value);
});

commandInput?.addEventListener("input", () => {
  applySearchHighlight(commandInput.value);
  renderCommandResults(commandInput.value);
});

commandInput?.addEventListener("blur", () => {
  window.setTimeout(() => setCommandOpen(false), 120);
});

commandResults?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
});

commandResults?.addEventListener("click", (event) => {
  const button = event.target.closest(".command-result");

  if (!button) {
    return;
  }

  runCommandResult(currentCommandResults.find((result) => (
    result.type === button.dataset.resultType && result.id === button.dataset.resultId
  )));
});

commandForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  runCommandResult(currentCommandResults[0] || getCommandResults(commandInput?.value || "")[0]);
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "/"
    && document.activeElement !== commandInput
    && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
  ) {
    event.preventDefault();
    commandInput?.focus();
    return;
  }

  if (event.key !== "Escape") {
    return;
  }

  if (activePanelView) {
    closeContentPanel();
  } else if (mapInspector?.classList.contains("is-open")) {
    setInspectorOpen(false);
  } else {
    setCommandOpen(false);
    commandInput?.blur();
    clearSearchHighlight();
  }
});

if (["#work", "#approach", "#contact"].includes(window.location.hash)) {
  openContentPanel(window.location.hash.slice(1));
}

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
      const characterIndex = Math.min(
        asciiCharacters.length - 1,
        Math.floor(intensity * asciiCharacters.length),
      );

      line += intensity > 0.14 ? asciiCharacters[characterIndex] : " ";
    }

    lines.push(line.trimEnd());
  }

  return lines.join("\n");
};

const showWorkPreview = (row) => {
  if (!workPreview || !workAscii || !previewNumber || !previewTitle) {
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

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    window.cancelAnimationFrame(signalFrame);
    mapPreviewVideo?.pause();
  } else if (!reducedMotion.matches && !captureMode) {
    signalStartedAt = performance.now();
    signalFrame = window.requestAnimationFrame(renderSignalConstellation);
  }
});
