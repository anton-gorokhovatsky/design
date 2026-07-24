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
const signalInitialRotation = { x: -0.18, y: 0.3, z: -0.035 };
const signalRotation = { ...signalInitialRotation };
const signalAngularVelocity = { x: 0, y: 0 };
let signalLastFrameAt = performance.now();
let signalReleasedAt = signalLastFrameAt - 2200;
const signalDrag = {
  active: false,
  pointerId: null,
  x: 0,
  y: 0,
  time: 0,
};

const smootherStep = (value) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
};

const clampSignal = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const getSignalDepth = (index, x, y, weight) => {
  const noiseSeed = Math.sin(
    (index + 1) * 12.9898
    + x * 78.233
    + y * 37.719,
  ) * 43758.5453;
  const noise = (noiseSeed - Math.floor(noiseSeed)) * 2 - 1;
  const radius = Math.min(1, Math.hypot(x, y) * 2);
  const thickness = 0.12 + (1 - radius) * 0.09 + weight * 0.045;
  const relief = Math.sin(index * 0.31 + Math.atan2(y, x) * 3) * 0.024;

  return noise * thickness + relief;
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
        z: Math.sin(index * 0.37) * 0.16,
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

    const x = lower.x + (upper.x - lower.x) * mix;
    const y = lower.y + (upper.y - lower.y) * mix;
    const weight = lower.weight + (upper.weight - lower.weight) * mix;

    return {
      x,
      y,
      z: getSignalDepth(index, x, y, weight),
      weight,
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

const updateSignalRotation = (time) => {
  const delta = Math.min(50, Math.max(0, time - signalLastFrameAt));
  signalLastFrameAt = time;

  if (
    !delta
    || signalDrag.active
    || reducedMotion.matches
    || captureMode
  ) {
    return;
  }

  signalRotation.x += signalAngularVelocity.x * delta;
  signalRotation.y += signalAngularVelocity.y * delta;

  const damping = Math.pow(0.918, delta / 16.667);
  signalAngularVelocity.x *= damping;
  signalAngularVelocity.y *= damping;

  const idleBlend = smootherStep((time - signalReleasedAt - 450) / 1500);

  signalRotation.y += 0.000058 * delta * idleBlend;
  signalRotation.x += Math.sin(time * 0.00017) * 0.000004 * delta * idleBlend;
  signalRotation.z = signalInitialRotation.z + Math.sin(time * 0.00012) * 0.035;
};

const drawSignalConstellation = (time = performance.now()) => {
  if (!signalContext || !signalPointSets.length) {
    return;
  }

  resizeSignalConstellation();

  const { width, height, dpr } = signalMetrics;
  const animationTime = time === 0 ? performance.now() : time;

  signalContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  signalContext.clearRect(0, 0, width, height);
  updateSignalRotation(animationTime);

  const elapsed = captureMode || reducedMotion.matches
    ? 0
    : Math.max(0, animationTime - signalStartedAt);
  const cycleDuration = 5200;
  const cycle = elapsed / cycleDuration;
  const currentIndex = Math.floor(cycle) % signalPointSets.length;
  const nextIndex = (currentIndex + 1) % signalPointSets.length;
  const cycleProgress = cycle - Math.floor(cycle);
  const morphProgress = smootherStep((cycleProgress - 0.42) / 0.58);
  const currentPoints = signalPointSets[currentIndex];
  const nextPoints = signalPointSets[nextIndex];
  const isCompact = width < 680;
  const pointStep = isCompact ? 2 : 1;
  const fieldScale = Math.min(width * 0.82, height * 0.92);
  const breathing = 1 + Math.sin(elapsed * 0.0008) * 0.018;
  const signalColor = getComputedStyle(root).getPropertyValue("--signal").trim() || "#2448ed";
  const signalAlphaBoost = root.dataset.theme === "dark" ? 1.42 : 1;
  const glyphSize = Math.max(6, Math.min(10.5, fieldScale / 64));
  const cameraDistance = fieldScale * 1.42;
  const cosX = Math.cos(signalRotation.x);
  const sinX = Math.sin(signalRotation.x);
  const cosY = Math.cos(signalRotation.y);
  const sinY = Math.sin(signalRotation.y);
  const cosZ = Math.cos(signalRotation.z);
  const sinZ = Math.sin(signalRotation.z);

  const projectSignalPoint = (sourceX, sourceY, sourceZ = 0) => {
    const x = sourceX * breathing;
    const y = sourceY * breathing;
    const z = sourceZ * breathing;
    const yAfterX = y * cosX - z * sinX;
    const zAfterX = y * sinX + z * cosX;
    const xAfterY = x * cosY + zAfterX * sinY;
    const zAfterY = -x * sinY + zAfterX * cosY;
    const xAfterZ = xAfterY * cosZ - yAfterX * sinZ;
    const yAfterZ = xAfterY * sinZ + yAfterX * cosZ;
    const perspective = clampSignal(
      cameraDistance / Math.max(cameraDistance * 0.42, cameraDistance - zAfterY),
      0.66,
      1.58,
    );

    return {
      x: xAfterZ * perspective,
      y: yAfterZ * perspective,
      z: zAfterY,
      perspective,
    };
  };

  signalContext.save();
  signalContext.translate(width / 2, height / 2);

  signalContext.strokeStyle = signalColor;
  signalContext.lineWidth = 0.75;
  signalContext.setLineDash([1, 7]);

  const drawProjectedOrbit = (radius, startAngle, endAngle, depthWave) => {
    const segments = 96;

    signalContext.beginPath();

    for (let segment = 0; segment <= segments; segment += 1) {
      const progress = segment / segments;
      const angle = startAngle + (endAngle - startAngle) * progress;
      const point = projectSignalPoint(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        Math.sin(angle * 2.4) * depthWave,
      );

      if (segment === 0) {
        signalContext.moveTo(point.x, point.y);
      } else {
        signalContext.lineTo(point.x, point.y);
      }
    }

    signalContext.stroke();
  };

  signalContext.globalAlpha = 0.13 * signalAlphaBoost;
  drawProjectedOrbit(fieldScale * 0.535, -0.24, Math.PI * 1.24, fieldScale * 0.026);
  drawProjectedOrbit(fieldScale * 0.49, Math.PI * 0.74, Math.PI * 1.92, -fieldScale * 0.02);
  signalContext.setLineDash([]);

  for (let orbitIndex = 0; orbitIndex < signalEmojis.length; orbitIndex += 1) {
    const angle = (orbitIndex / signalEmojis.length) * Math.PI * 2 - Math.PI / 2;
    const radius = fieldScale * 0.535;
    const orbitPoint = projectSignalPoint(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      Math.sin(angle * 2.4) * fieldScale * 0.026,
    );

    signalContext.globalAlpha = clampSignal(
      (orbitIndex === currentIndex ? 0.72 : 0.2)
        * clampSignal(0.74 + orbitPoint.perspective * 0.24, 0.72, 1.12)
        * signalAlphaBoost,
      0,
      1,
    );
    signalContext.beginPath();
    signalContext.arc(
      orbitPoint.x,
      orbitPoint.y,
      (orbitIndex === currentIndex ? 2.2 : 1.2) * orbitPoint.perspective,
      0,
      Math.PI * 2,
    );
    signalContext.fillStyle = signalColor;
    signalContext.fill();
  }

  signalContext.fillStyle = signalColor;
  signalContext.textAlign = "center";
  signalContext.textBaseline = "middle";
  signalContext.shadowBlur = (isCompact ? 1.5 : 2.5) * signalAlphaBoost;
  signalContext.shadowColor = signalColor;

  const projectedPoints = [];

  for (let index = 0; index < signalPointCount; index += pointStep) {
    const start = currentPoints[index];
    const end = nextPoints[index];
    const drift = Math.sin(index * 0.73 + elapsed * 0.0012) * fieldScale * 0.0025;
    const x = (start.x + (end.x - start.x) * morphProgress) * fieldScale;
    const y = (start.y + (end.y - start.y) * morphProgress) * fieldScale;
    const z = (start.z + (end.z - start.z) * morphProgress) * fieldScale;
    const weight = start.weight + (end.weight - start.weight) * morphProgress;
    const point = projectSignalPoint(
      x + drift,
      y - drift,
      z + Math.cos(index * 0.41 + elapsed * 0.0009) * fieldScale * 0.003,
    );

    const glyphIndex = Math.min(
      signalGlyphs.length - 1,
      Math.floor(weight * signalGlyphs.length),
    );

    projectedPoints.push({
      ...point,
      glyph: signalGlyphs[glyphIndex],
      weight,
    });
  }

  projectedPoints.sort((pointA, pointB) => pointA.z - pointB.z);

  let currentFontSize = 0;

  for (const point of projectedPoints) {
    const depthTone = clampSignal(
      (point.z / (fieldScale * 0.58) + 1) / 2,
      0,
      1,
    );
    const fontScale = clampSignal(0.76 + point.perspective * 0.26, 0.86, 1.18);
    const fontSize = Math.round(glyphSize * fontScale * 2) / 2;

    if (fontSize !== currentFontSize) {
      currentFontSize = fontSize;
      signalContext.font = `${fontSize}px "IBM Plex Mono", "SFMono-Regular", "SF Mono", monospace`;
    }

    signalContext.globalAlpha = clampSignal(
      (0.22 + point.weight * 0.68)
        * (0.58 + depthTone * 0.54)
        * signalAlphaBoost,
      0.16,
      1,
    );
    signalContext.fillText(
      point.glyph,
      point.x,
      point.y,
    );
  }

  signalContext.restore();
  signalContext.globalAlpha = 1;
};

const renderSignalConstellation = (time = performance.now()) => {
  const renderInterval = signalDrag.active ? 15 : 30;

  if (time - lastSignalRender > renderInterval || time === 0) {
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
  signalLastFrameAt = signalStartedAt;
  signalReleasedAt = signalStartedAt - 2200;
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

const drawSignalAfterInteraction = () => {
  if (reducedMotion.matches || captureMode) {
    drawSignalConstellation(performance.now());
  }
};

signalConstellation?.addEventListener("pointerdown", (event) => {
  if (
    captureMode
    || (event.pointerType === "mouse" && event.button !== 0)
  ) {
    return;
  }

  const now = performance.now();

  event.preventDefault();
  signalDrag.active = true;
  signalDrag.pointerId = event.pointerId;
  signalDrag.x = event.clientX;
  signalDrag.y = event.clientY;
  signalDrag.time = now;
  signalAngularVelocity.x = 0;
  signalAngularVelocity.y = 0;
  signalLastFrameAt = now;
  signalConstellation.classList.add("is-dragging", "is-pointer-focused");
  signalConstellation.focus({ preventScroll: true });

  try {
    signalConstellation.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is an enhancement; dragging still works inside the field.
  }
});

signalConstellation?.addEventListener("pointermove", (event) => {
  if (!signalDrag.active || event.pointerId !== signalDrag.pointerId) {
    return;
  }

  const now = performance.now();
  const deltaTime = Math.max(8, now - signalDrag.time);
  const deltaX = event.clientX - signalDrag.x;
  const deltaY = event.clientY - signalDrag.y;
  const sensitivity = event.pointerType === "touch" ? 0.0062 : 0.0052;
  const rotationXDelta = -deltaY * sensitivity;
  const rotationYDelta = deltaX * sensitivity;
  const velocityMix = 0.42;

  event.preventDefault();
  signalRotation.x += rotationXDelta;
  signalRotation.y += rotationYDelta;
  signalAngularVelocity.x += (
    clampSignal(rotationXDelta / deltaTime, -0.013, 0.013)
    - signalAngularVelocity.x
  ) * velocityMix;
  signalAngularVelocity.y += (
    clampSignal(rotationYDelta / deltaTime, -0.013, 0.013)
    - signalAngularVelocity.y
  ) * velocityMix;
  signalDrag.x = event.clientX;
  signalDrag.y = event.clientY;
  signalDrag.time = now;
  drawSignalAfterInteraction();
});

const finishSignalDrag = (event, keepInertia = true) => {
  if (!signalDrag.active || event.pointerId !== signalDrag.pointerId) {
    return;
  }

  const pointerId = signalDrag.pointerId;

  signalDrag.active = false;
  signalDrag.pointerId = null;
  signalReleasedAt = performance.now();
  signalConstellation?.classList.remove("is-dragging");

  if (!keepInertia || reducedMotion.matches) {
    signalAngularVelocity.x = 0;
    signalAngularVelocity.y = 0;
  }

  try {
    if (signalConstellation?.hasPointerCapture(pointerId)) {
      signalConstellation.releasePointerCapture(pointerId);
    }
  } catch {
    // The pointer may already have been released by the browser.
  }

  drawSignalAfterInteraction();
};

signalConstellation?.addEventListener("pointerup", (event) => finishSignalDrag(event));
signalConstellation?.addEventListener("pointercancel", (event) => finishSignalDrag(event, false));
signalConstellation?.addEventListener("lostpointercapture", (event) => finishSignalDrag(event));

signalConstellation?.addEventListener("keydown", (event) => {
  signalConstellation.classList.remove("is-pointer-focused");

  if (captureMode) {
    return;
  }

  const step = event.shiftKey ? 0.24 : 0.12;
  let handled = true;

  switch (event.key) {
    case "ArrowLeft":
      signalRotation.y -= step;
      break;
    case "ArrowRight":
      signalRotation.y += step;
      break;
    case "ArrowUp":
      signalRotation.x -= step;
      break;
    case "ArrowDown":
      signalRotation.x += step;
      break;
    case "Home":
      Object.assign(signalRotation, signalInitialRotation);
      break;
    default:
      handled = false;
  }

  if (!handled) {
    return;
  }

  event.preventDefault();
  signalAngularVelocity.x = 0;
  signalAngularVelocity.y = 0;
  signalLastFrameAt = performance.now();
  signalReleasedAt = signalLastFrameAt;
  drawSignalConstellation(signalLastFrameAt);
});

signalConstellation?.addEventListener("blur", () => {
  signalConstellation.classList.remove("is-pointer-focused");
});

signalField?.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches || signalDrag.active) {
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

const principlesSourceHref = "https://app.notion.com/p/digital-web-digital-f68fc13247614ccb9738d9a85acf29b4?source=copy_link#70405c2623e342fb98d027c8634f2207";

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
    previewVideo: "assets/reels/garage-site.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:08",
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
    meta: "DESIGN / UX / UI / DIGITAL EXPERIENCE",
    description: "Дизайн сайта Дома Наркомфина — от интерактивной модели здания и световых состояний до календаря и цельной цифровой навигации.",
    href: "https://narkomfin.ru/",
    kindLabel: "ПРОЕКТ / GARAGE GRAPH",
    previewVideo: "assets/reels/narkomfin.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:07",
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
    previewVideo: "assets/reels/garage-collection.mp4?v=20260724-fullwidth-reels",
    previewMeta: "3-PAGE WALKTHROUGH / 00:08",
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
    previewVideo: "assets/reels/garage-courses.mp4?v=20260724-fullwidth-reels",
    previewMeta: "3-PAGE WALKTHROUGH / 00:07",
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
    previewVideo: "assets/reels/garage-webzine.mp4?v=20260724-fullwidth-reels",
    previewMeta: "THEME + TEXT / 00:08",
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
    previewVideo: "assets/reels/shirokostup.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:07",
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
    previewVideo: "assets/reels/tarski.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:08",
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
    previewVideo: "assets/reels/herman.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:07",
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
    previewVideo: "assets/reels/dusty-merch.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:07",
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
    previewVideo: "assets/reels/dusty-camp.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:07",
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
    previewVideo: "assets/reels/11111.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:07",
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
    previewVideo: "assets/reels/ks-fish.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:07",
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
    previewVideo: "assets/reels/doronin.mp4?v=20260724-fullwidth-reels",
    previewMeta: "SITE WALKTHROUGH / 00:07",
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
    meta: "SEA / HORIZON / MORE",
    description: "Море, горизонт и повторяющееся MORE — способ снова почувствовать масштаб и выйти за пределы привычного.",
    href: "https://www.instagram.com/stories/highlights/17870996476264206/",
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
    id: "principle-wings",
    kind: "practice",
    label: "ДОВЕРЯТЬ КРЫЛЬЯМ",
    title: "ПТИЦА ДОВЕРЯЕТ КРЫЛЬЯМ",
    meta: "НЕОПРЕДЕЛЁННОСТЬ / ГИБКОСТЬ / РЕЗУЛЬТАТ",
    description: "Несмотря на времена — стандартные вещи перестают работать, сервисы прекращают оказывать услуги, механизмы ломаются, фундаменты рушатся, то, что раньше было очевидно и не обсуждаемо, стало неочевидно и обсуждаемо — в таких условиях задача не в том, чтобы держаться процедур, а в том чтобы перепридумывать их на лету и себя заодно (это же как раз про ту самую гибкость методологии, непрерывное сотрудничество и совершенствование). Я умею двигаться в полной неопределённости и за минимальное количество времени и денег получить результат: ведь суть не в инструментах, а в опыте, навыках, знаниях и упорстве, желании делать. Мне нравится поговорка про птицу, что не боится, что ветка под ней сломается — птица доверяет крыльям.",
    kindLabel: "ПРИНЦИП / 01",
    x: 7,
    y: 41,
    size: 14,
  },
  {
    id: "principle-system",
    kind: "practice",
    label: "СИСТЕМНОСТЬ",
    title: "СИСТЕМНЫЙ ПОДХОД",
    meta: "AS IS → TO BE → GAP MAP / ДЕКОМПОЗИЦИЯ",
    description: "Всегда стремлюсь к системному подходу: декомпозирую (AS IS → TO BE → GAP MAP), раскладываю большие задачи на части, оформляю свои решения, мысли и документы в понятном виде и масштабирую лучшие практики. Умею прогнозировать проекты: выстраивать тайминг, успевать к намеченным дедлайнам, оценивать риски.",
    kindLabel: "ПРИНЦИП / 02",
    x: 14,
    y: 37,
    size: 12,
  },
  {
    id: "principle-autonomy",
    kind: "practice",
    label: "САМОСТОЯТЕЛЬНОСТЬ",
    title: "САМОСТОЯТЕЛЬНОСТЬ",
    meta: "ПРОАКТИВНОСТЬ / УСТОЙЧИВОСТЬ / НАДЁЖНОСТЬ",
    description: "У меня всё отлично с самостоятельностью — меня не нужно пушить и контролировать, я проактивно прихожу с вопросами, проблемами и идеями. Проявляю устойчивость к частой смене приоритетов и всегда сохраняю адекватность, трудоспособность, этичность и ответственность — на меня можно реально положиться и просто спокойно работать.",
    kindLabel: "ПРИНЦИП / 03",
    x: 22,
    y: 40,
    size: 11,
  },
  {
    id: "principle-terms",
    kind: "practice",
    label: "ДОКУМЕНТЫ + ФИНАНСЫ",
    title: "ДОКУМЕНТЫ И ФИНАНСЫ",
    meta: "ДОГОВОРЫ / АКТЫ / БЮДЖЕТ",
    description: "Внимателен к документам: сам составляю договоры, не пропускаю детали юридических договорённостей и вовремя закрываю все работы актами. На «ты» обращаюсь с финансами: могу оценить и спланировать бюджет проекта, а затем контролировать его выполнение.",
    kindLabel: "ПРИНЦИП / 04",
    x: 30,
    y: 43,
    size: 10,
  },
  {
    id: "principle-goal",
    kind: "practice",
    label: "ЦЕЛЬ > ФРЕЙМВОРКИ",
    title: "ЦЕЛЬ ВАЖНЕЕ ФРЕЙМВОРКОВ",
    meta: "PMBOK / TRIPLE DIAMOND / JTBD / TDD",
    description: "В работе опираюсь на фреймворки — PMBoK, Triple Diamond от Zendesk, JTBD, test-driven design и всё, что оказывается полезным в конкретный момент, — а также на опыт, здравый смысл, идеалы, принципы и ценности. Мне нравится мысль о том, что обсессия средствами производства — частый синдром отсутствия смысла своей деятельности. Когда ты чётко понимаешь цель, тебе вообще не нужны фреймворки, системы приоритизации и таск-менеджеры.",
    kindLabel: "ПРИНЦИП / 05",
    x: 10,
    y: 45,
    size: 13,
  },
  {
    id: "principle-improve",
    kind: "practice",
    label: "УПРАВЛЯТЬ + УЛУЧШАТЬ",
    title: "УПРАВЛЯТЬ И УЛУЧШАТЬ",
    meta: "ПРОЕКТЫ / КОМАНДА / ПРОЦЕССЫ",
    description: "За последние несколько лет успешно управлял, координировал и руководил проектами (и командой до 10 человек) с различной степенью сложности, включая масштабные и многоэтапные, соблюдая бюджет и сроки. Постоянно внедряю новые инструменты, технологии и методологии управления проектами, обучаю команду, проактивно инициирую и поддерживаю инициативы других по улучшению процессов и повышению эффективности, что приводит к улучшению качества, оптимизации, уменьшению сроков выполнения рутинных задач и снижению стоимости их реализации. К примеру, больше дизайна сейчас делаем сами в Figma, собирая макеты и лишь на финальном этапе обращаясь к внешним арт-директорам; сменил Mailchimp на Юнисендер для всей команды: сначала освоил сам, унифицировал все шаблоны писем, а затем обучил коллег работе в новом инструменте — по итогу письма собираем быстрее и растим OR, а затраты на сервис снизил в 4 раза.",
    kindLabel: "ПРИНЦИП / 06",
    x: 18,
    y: 43,
    size: 12,
  },
  {
    id: "principle-communicate",
    kind: "practice",
    label: "ЛИДЕР + КОММУНИКАТОР",
    title: "ЛИДЕР И КОММУНИКАТОР",
    meta: "ДОГОВАРИВАТЬСЯ / МОТИВИРОВАТЬ / АРГУМЕНТИРОВАТЬ",
    description: "Я лидер и уверенный коммуникатор — легко могу договариваться с внешними людьми и замотивировать свою команду. Коммуникабелен: могу уверенно рассказать о результате работ, работать с возражениями и аргументировать свою позицию независимо от того, с кем общаюсь.",
    kindLabel: "ПРИНЦИП / 07",
    x: 26,
    y: 55,
    size: 12,
  },
  {
    id: "principle-own",
    kind: "practice",
    label: "БРАТЬ ОТВЕТСТВЕННОСТЬ",
    title: "РЕШЕНИЕ И ОТВЕТСТВЕННОСТЬ",
    meta: "РЕШЕНИЕ / ОТВЕТСТВЕННОСТЬ / ХЛАДНОКРОВИЕ",
    description: "Не боюсь принимать решения и брать на себя ответственность за них. Понимаю, что нет нерешаемых задач, и в любой ситуации остаюсь хладнокровным.",
    kindLabel: "ПРИНЦИП / 08",
    x: 35,
    y: 54,
    size: 11,
  },
  {
    id: "principle-learn",
    kind: "practice",
    label: "УЧИТЬСЯ + ЗАМЕЧАТЬ",
    title: "УЧИТЬСЯ И ВЕРИТЬ В ДЕТАЛИ",
    meta: "УЧИТЬСЯ / НАБЛЮДАТЬ / НАХОДИТЬ",
    description: "Люблю учиться и с энтузиазмом развиваю новые умения и навыки. Оперативно нахожу нужную информацию, внимательно наблюдаю и верю в силу деталей.",
    kindLabel: "ПРИНЦИП / 09",
    x: 7,
    y: 58,
    size: 10,
  },
  {
    id: "principle-ideas",
    kind: "practice",
    label: "ИДЕИ + ТРЕНДЫ",
    title: "КРЕАТИВНЫЕ ИДЕИ И ТРЕНДЫ",
    meta: "DIGITAL / MEDIA / TECHNOLOGY",
    description: "Обладаю способностью быстро генерировать креативные идеи и решения. Слежу за цифровыми- и медиатрендами, развивающимися технологиями и платформами.",
    kindLabel: "ПРИНЦИП / 10",
    x: 14,
    y: 57,
    size: 11,
  },
  {
    id: "principle-language",
    kind: "practice",
    label: "РУССКИЙ ЯЗЫК",
    title: "ГРАМОТНЫЙ РУССКИЙ ЯЗЫК",
    meta: "ЦИФРОВОЙ ЭТИКЕТ / ПУНКТУАЦИЯ / ГРАММАТИКА",
    description: "Неустанно оттачиваю грамотный русский язык: цифровой этикет, пунктуацию и грамматику.",
    kindLabel: "ПРИНЦИП / 11",
    x: 22,
    y: 60,
    size: 9,
  },
  {
    id: "principle-tools",
    kind: "practice",
    label: "БЫСТРО НАЙТИ ПОДХОД",
    title: "БЫСТРО НАЙТИ ПОДХОД",
    meta: "FIGMA / NOTION / CODE / AI / И ДАЛЬШЕ",
    description: "На «ты» с Figma, Photoshop, Notion, Trello, Jira, MailChimp, UniSender, Tilda, Readymag, Webflow, Miro, FigJam, JSON, HTML, большими языковыми моделями и нейросетями — а с чем ещё нет, то гарантированно быстро найду к этому подход.",
    kindLabel: "ПРИНЦИП / 12",
    x: 31,
    y: 58,
    size: 10,
  },
  {
    id: "principle-now",
    kind: "practice",
    label: "НОВОЕ — СЕЙЧАС",
    title: "НОВОЕ — ПРЯМО СЕЙЧАС",
    meta: "ИННОВАЦИИ / OPENAI / ПОВСЕДНЕВНАЯ РАБОТА",
    description: "Инновации: беру всё новое и лучшее и применяю прямо сейчас в повседневных задачах — вижу именно в этом смысл своей работы. Например, с продуктами OpenAI применяю два принципа: принцип первый — нельзя не использовать ChatGPT; принцип второй — участие ChatGPT не должно быть заметно.",
    kindLabel: "ПРИНЦИП / 13",
    x: 10,
    y: 68,
    size: 11,
  },
  {
    id: "principle-data-intuition",
    kind: "practice",
    label: "ЦИФРЫ + ИНТУИЦИЯ",
    title: "АНАЛИТИКА И ИНТУИЦИЯ",
    meta: "ДАННЫЕ / ВПЕЧАТЛЕНИЯ / ДОСТУПНОСТЬ",
    description: "С одной стороны считаю, что лучшие менеджеры — это аналитики, которые лучше всех на цифрах понимают, как работает продукт, и имеют огромное желание свои исследования превратить в реальные продуктовые изменения, и стараюсь это качество в себе развить. С другой стороны не понимаю, как можно придумать классный продукт на A/B-тестах и фокус-группах. На них можно сделать классный продукт на 2% лучше, а плохой продукт не улучшат никакие тесты. Поэтому, занимаясь созданием чего-то, придумыванием, думаю не цифрами, а интуицией (Эндрю Чен пишет о том, что управлять на основе данных — сложная и часто невозможная задача) — думаю о дизайне впечатлений и снижении стоимости взаимодействия, доступности (быть дружелюбными и демократизировать технологии для людей, фокусироваться на человеческих потребностях и мотивах), идеалах, принципах и ценностях. Цифры не предскажут трепета и возбуждения, которые возникают в душе от хорошей идеи.",
    kindLabel: "ПРИНЦИП / 14",
    x: 18,
    y: 67,
    size: 13,
  },
  {
    id: "principle-design-engineering",
    kind: "practice",
    label: "ДИЗАЙН-ИНЖЕНЕР",
    title: "ДИЗАЙН-ИНЖЕНЕР",
    meta: "ДИЗАЙН / КОД / РАБОЧИЙ ПРОТОТИП",
    description: "Мехмет Байтас написал о дизайн-инженерах — универсальных специалистах, которые сочетают в себе навыки и дизайнера, и разработчика. Они могут самостоятельно спроектировать дизайн и довести его до рабочего прототипа, написав код. Вот всегда думаю и о себе в таком ключе: одновременно чувствую и композицию, и технические ограничения.",
    kindLabel: "ПРИНЦИП / 15",
    x: 27,
    y: 66,
    size: 14,
  },
  {
    id: "principle-shaper",
    kind: "practice",
    label: "SHAPER / АРХЕОЛОГ",
    title: "SHAPER / АРХЕОЛОГ",
    meta: "ПРИДАТЬ ФОРМУ / УБРАТЬ ЛИШНЕЕ / НАЙТИ ЦЕННОСТЬ",
    description: "Я встречал ещё пару метафор своего подхода к работе. Иногда такая роль называется «shaper» (придающий форму): подобно скульптору, вы постепенно откалываете лишнее, чтобы оставить суть. Ещё один вариант — сравнение с работой археолога; в отличие от скульптора, вы не принимаете творческих решений: нужная людям ценность уже хранится под толщей земли, и нужно методично убирать лишнее, не задевая важного.",
    kindLabel: "ПРИНЦИП / 16",
    x: 35,
    y: 70,
    size: 12,
  },
  {
    id: "principle-experiment",
    kind: "practice",
    label: "ГОСТЕПРИИМСТВО + ЗАБОТА",
    title: "ЦИФРОВОЕ ГОСТЕПРИИМСТВО И ЗАБОТА",
    meta: "CX / IXD / ИНКЛЮЗИВНОСТЬ / GENERATIVE AI",
    description: "Области интереса сейчас: CX и IxD — «цифровое» гостеприимство и забота, как я понимаю их, инклюзивные практики в веб-дизайне и веб-продакшне. Генеративный искусственный интеллект в контексте этих точек интереса. Мне всегда было интересно то, чем занимаются люди на позициях «продакт-проджект-гроус-хакеров» или «ченджеров» — создавать внутри компании то, чего ещё не было. Такие проекты не всегда про IT, не по должностной инструкции, не будут оплачены отдельно, но мне интересно это сделать, потому что это кажется возможным и важным, новым. Если говорить тут о «работодателе / проекте мечты», то хотелось бы быть частью компании, которая осознаёт важность экспериментов и даёт экспериментировать «легально».",
    kindLabel: "ПРИНЦИП / 17",
    x: 20,
    y: 77,
    size: 14,
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
const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");
const mapButtons = new Map();
let selectedMapId = "garage";
let previewHideTimer = 0;
let previewShowFrame = 0;
let activePreviewItem = null;

const hideMapPreview = ({ immediate = false } = {}) => {
  window.clearTimeout(previewHideTimer);
  window.cancelAnimationFrame(previewShowFrame);
  previewShowFrame = 0;

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
    || !mapPreviewVideo
    || !item.previewVideo
    || !hoverCapable.matches
    || mapInspector?.classList.contains("is-open")
  ) {
    hideMapPreview({ immediate: true });
    return;
  }

  window.clearTimeout(previewHideTimer);
  activePreviewItem = item;

  mapPreview.classList.add("has-video");

  if (mapPreviewVideo.dataset.previewId !== item.id) {
    mapPreview.classList.remove("is-video-ready");
    mapPreviewVideo.dataset.previewId = item.id;
    mapPreviewVideo.src = item.previewVideo;
  }

  if (mapPreviewVideo.readyState >= 1) {
    mapPreviewVideo.currentTime = item.previewStart || 0;
  }

  mapPreviewVideo.play().catch(() => {
    // The receiver can remain paused when autoplay is blocked.
  });

  previewShowFrame = window.requestAnimationFrame(() => {
    previewShowFrame = 0;

    if (!mapInspector?.classList.contains("is-open")) {
      mapPreview.classList.add("is-visible");
    }
  });
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
    const itemHref = item.href || (item.kind === "practice" ? principlesSourceHref : "");

    if (itemHref) {
      mapLink.hidden = false;
      mapLink.href = itemHref;
      mapLink.textContent = item.kind === "practice" ? "ИСХОДНИК В NOTION ↗" : "ОТКРЫТЬ ↗";
      mapLink.classList.remove("is-disabled");
      mapLink.removeAttribute("aria-disabled");
      mapLink.target = "_blank";
      mapLink.rel = "noreferrer";
    } else {
      mapLink.removeAttribute("href");
      mapLink.removeAttribute("target");
      mapLink.removeAttribute("rel");
      mapLink.textContent = "";
      mapLink.hidden = true;
      mapLink.classList.remove("is-disabled");
      mapLink.removeAttribute("aria-disabled");
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

    if (item.previewVideo) {
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

const floatingConsoleModules = Array.from(document.querySelectorAll("[data-floating-console]"));
const floatingConsoleMedia = window.matchMedia(
  "(min-width: 681px) and (hover: hover) and (pointer: fine)",
);
const consoleInteractiveSelector = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "form",
  "[contenteditable='true']",
].join(",");

const getConsoleOffset = (module) => ({
  x: Number.parseFloat(module.dataset.dragX || "0") || 0,
  y: Number.parseFloat(module.dataset.dragY || "0") || 0,
});

const setConsoleOffset = (module, x, y) => {
  module.dataset.dragX = x.toFixed(2);
  module.dataset.dragY = y.toFixed(2);
  module.style.setProperty("--console-drag-x", `${x.toFixed(2)}px`);
  module.style.setProperty("--console-drag-y", `${y.toFixed(2)}px`);
};

const clampConsoleOffset = (module, desiredX, desiredY, basePosition = null) => {
  const margin = 8;
  const currentOffset = getConsoleOffset(module);
  const rect = module.getBoundingClientRect();
  const baseLeft = basePosition?.left ?? rect.left - currentOffset.x;
  const baseTop = basePosition?.top ?? rect.top - currentOffset.y;
  const minimumX = margin - baseLeft;
  const maximumX = window.innerWidth - margin - baseLeft - rect.width;
  const minimumY = margin - baseTop;
  const maximumY = window.innerHeight - margin - baseTop - rect.height;

  return {
    x: Math.min(Math.max(desiredX, minimumX), Math.max(minimumX, maximumX)),
    y: Math.min(Math.max(desiredY, minimumY), Math.max(minimumY, maximumY)),
  };
};

floatingConsoleModules.forEach((module) => {
  module.addEventListener("pointerdown", (event) => {
    if (
      !floatingConsoleMedia.matches
      || event.button !== 0
      || event.target.closest(consoleInteractiveSelector)
    ) {
      return;
    }

    const startOffset = getConsoleOffset(module);
    const startRect = module.getBoundingClientRect();
    const basePosition = {
      left: startRect.left - startOffset.x,
      top: startRect.top - startOffset.y,
    };
    const startPointer = { x: event.clientX, y: event.clientY };
    let hasFinished = false;

    const finishDrag = (finishEvent) => {
      if (hasFinished || finishEvent.pointerId !== event.pointerId) {
        return;
      }

      hasFinished = true;
      module.classList.remove("is-dragging");
      module.removeEventListener("pointermove", moveModule);
      module.removeEventListener("pointerup", finishDrag);
      module.removeEventListener("pointercancel", finishDrag);
      module.removeEventListener("lostpointercapture", finishDrag);

      if (module.hasPointerCapture?.(event.pointerId)) {
        module.releasePointerCapture(event.pointerId);
      }
    };

    const moveModule = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) {
        return;
      }

      const nextOffset = clampConsoleOffset(
        module,
        startOffset.x + moveEvent.clientX - startPointer.x,
        startOffset.y + moveEvent.clientY - startPointer.y,
        basePosition,
      );

      moveEvent.preventDefault();
      setConsoleOffset(module, nextOffset.x, nextOffset.y);
    };

    event.preventDefault();
    module.classList.add("is-dragging");
    module.addEventListener("pointermove", moveModule);
    module.addEventListener("pointerup", finishDrag);
    module.addEventListener("pointercancel", finishDrag);
    module.addEventListener("lostpointercapture", finishDrag);
    module.setPointerCapture?.(event.pointerId);
  });
});

const syncFloatingConsoleBounds = () => {
  if (!floatingConsoleMedia.matches) {
    floatingConsoleModules.forEach((module) => setConsoleOffset(module, 0, 0));
    return;
  }

  floatingConsoleModules.forEach((module) => {
    const currentOffset = getConsoleOffset(module);
    const nextOffset = clampConsoleOffset(module, currentOffset.x, currentOffset.y);
    setConsoleOffset(module, nextOffset.x, nextOffset.y);
  });
};

let consoleResizeFrame = 0;
window.addEventListener("resize", () => {
  window.cancelAnimationFrame(consoleResizeFrame);
  consoleResizeFrame = window.requestAnimationFrame(syncFloatingConsoleBounds);
});
floatingConsoleMedia.addEventListener?.("change", syncFloatingConsoleBounds);

const constellationNav = document.querySelector("[data-constellation-nav]");
const constellationNavToggle = document.querySelector("[data-constellation-nav-toggle]");
const constellationNavToggleLabel = document.querySelector("[data-constellation-nav-toggle-label]");
const constellationNavOrbit = document.querySelector("[data-constellation-nav-orbit]");
const constellationNavItems = Array.from(document.querySelectorAll("[data-nav-view]"));
const constellationNavHome = document.querySelector('[data-nav-view="map"]');
const compactConstellationNav = window.matchMedia("(max-width: 680px)");
let isConstellationNavOpen = false;

const syncConstellationNavInteractivity = () => {
  if (constellationNavOrbit) {
    constellationNavOrbit.inert = compactConstellationNav.matches && !isConstellationNavOpen;
  }
};

const setConstellationNavOpen = (isOpen) => {
  isConstellationNavOpen = isOpen;
  constellationNav?.classList.toggle("is-open", isOpen);
  constellationNavToggle?.setAttribute("aria-expanded", String(isOpen));

  if (constellationNavToggleLabel) {
    constellationNavToggleLabel.textContent = isOpen ? "Закрыть навигацию" : "Открыть навигацию";
  }

  syncConstellationNavInteractivity();
};

const setConstellationNavCurrent = (view) => {
  constellationNavItems.forEach((item) => {
    const isCurrent = item.dataset.navView === view;
    item.classList.toggle("is-current", isCurrent);

    if (isCurrent) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
};

constellationNavToggle?.addEventListener("click", () => {
  setConstellationNavOpen(!isConstellationNavOpen);
});

constellationNavItems.forEach((item) => {
  item.addEventListener("click", () => {
    setConstellationNavOpen(false);
  });
});

compactConstellationNav.addEventListener("change", syncConstellationNavInteractivity);
syncConstellationNavInteractivity();

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
    title: "ПРОЕКТЫ",
  },
  approach: {
    index: "02 / HOW I WORK",
    title: "ПОДХОД",
  },
  contact: {
    index: "03 / CONTACT",
    title: "КОНТАКТ",
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
  contentPanel?.setAttribute("data-view", view);
  setConstellationNavCurrent(view);
  setConstellationNavOpen(false);
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
  contentPanel?.removeAttribute("data-view");
  setConstellationNavCurrent("map");

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
constellationNavHome?.addEventListener("click", () => {
  if (activePanelView) {
    closeContentPanel({ restoreFocus: false });
  }

  setInspectorOpen(false);
  setConstellationNavCurrent("map");
});

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

  if (isConstellationNavOpen) {
    setConstellationNavOpen(false);
    constellationNavToggle?.focus();
  } else if (activePanelView) {
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
