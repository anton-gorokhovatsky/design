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
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const captureMode = new URLSearchParams(window.location.search).has("og");

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
const depthGrid = document.querySelector("[data-depth-grid]");
const depthSections = depthGrid?.querySelector("[data-depth-sections]");
const depthRays = depthGrid?.querySelector("[data-depth-rays]");
const svgNamespace = "http://www.w3.org/2000/svg";

const renderPerspectiveDepthGrid = () => {
  if (!depthSections || !depthRays) {
    return;
  }

  const vanishingPoint = { x: 50, y: 54 };
  const outerFrame = {
    left: 2,
    right: 98,
    top: 1,
    bottom: 99,
  };
  const perspectiveDistance = 2.25;
  const worldDepths = [0, 0.85, 2.1, 4.6, 9.5];
  const projectAtDepth = (coordinate, origin, depth) => {
    // CSS Transforms defines w = 1 - z / d. The tunnel recedes along
    // negative z, so the screen scale after the perspective divide is
    // d / (d + depth), not an evenly spaced visual interpolation.
    const scale = perspectiveDistance / (perspectiveDistance + depth);
    return origin + (coordinate - origin) * scale;
  };

  const sectionElements = worldDepths.map((depth, index) => {
    const left = projectAtDepth(outerFrame.left, vanishingPoint.x, depth);
    const right = projectAtDepth(outerFrame.right, vanishingPoint.x, depth);
    const top = projectAtDepth(outerFrame.top, vanishingPoint.y, depth);
    const bottom = projectAtDepth(outerFrame.bottom, vanishingPoint.y, depth);
    const section = document.createElementNS(svgNamespace, "path");

    section.setAttribute(
      "d",
      `M${left.toFixed(3)} ${top.toFixed(3)}`
        + `H${right.toFixed(3)}`
        + `V${bottom.toFixed(3)}`
        + `H${left.toFixed(3)}Z`,
    );
    section.style.setProperty(
      "--depth-opacity",
      String(Math.max(0.12, 0.64 - index * 0.1)),
    );

    return section;
  });

  const rayElements = [
    [outerFrame.left, outerFrame.top],
    [outerFrame.right, outerFrame.top],
    [outerFrame.left, outerFrame.bottom],
    [outerFrame.right, outerFrame.bottom],
  ].map(([x, y]) => {
    const ray = document.createElementNS(svgNamespace, "line");

    ray.setAttribute("x1", String(x));
    ray.setAttribute("y1", String(y));
    ray.setAttribute("x2", String(vanishingPoint.x));
    ray.setAttribute("y2", String(vanishingPoint.y));

    return ray;
  });

  depthSections.replaceChildren(...sectionElements);
  depthRays.replaceChildren(...rayElements);
};

renderPerspectiveDepthGrid();
const signalEmojis = ["🍣", "🥪", "☕", "📻", "🏂", "⚽", "🌊", "🖥️", "👋", "🏃🏼‍♂️"];
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
  const signalAlphaBoost = root.dataset.theme === "dark" ? 1.28 : 0.9;
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
    const fontScale = clampSignal(0.22 + point.perspective * 0.8, 0.58, 1.42);
    const fontSize = Math.round(glyphSize * fontScale * 2) / 2;
    const depthCurve = depthTone ** 1.7;

    if (fontSize !== currentFontSize) {
      currentFontSize = fontSize;
      signalContext.font = `${fontSize}px "Golos Text", Arial, Helvetica, sans-serif`;
    }

    signalContext.globalAlpha = clampSignal(
      (0.1 + point.weight * 0.72)
        * (0.22 + depthCurve * 0.98)
        * signalAlphaBoost,
      0.05,
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
  signalConstellation.classList.add("is-dragging");

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

signalField?.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches || signalDrag.active) {
    return;
  }

  const bounds = signalField.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;

  signalField.style.setProperty("--core-x", `${x * 12}px`);
  signalField.style.setProperty("--core-y", `${y * 9}px`);
  signalField.style.setProperty("--depth-x", `${x * -4}px`);
  signalField.style.setProperty("--depth-y", `${y * -3}px`);
  signalField.style.setProperty("--layer-far-x", `${x * 2}px`);
  signalField.style.setProperty("--layer-far-y", `${y * 1.5}px`);
  signalField.style.setProperty("--layer-mid-x", `${x * 5}px`);
  signalField.style.setProperty("--layer-mid-y", `${y * 3.75}px`);
  signalField.style.setProperty("--layer-near-x", `${x * 9}px`);
  signalField.style.setProperty("--layer-near-y", `${y * 6.75}px`);
});

signalField?.addEventListener("pointerleave", () => {
  signalField.style.setProperty("--core-x", "0px");
  signalField.style.setProperty("--core-y", "0px");
  signalField.style.setProperty("--depth-x", "0px");
  signalField.style.setProperty("--depth-y", "0px");
  signalField.style.setProperty("--layer-far-x", "0px");
  signalField.style.setProperty("--layer-far-y", "0px");
  signalField.style.setProperty("--layer-mid-x", "0px");
  signalField.style.setProperty("--layer-mid-y", "0px");
  signalField.style.setProperty("--layer-near-x", "0px");
  signalField.style.setProperty("--layer-near-y", "0px");
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
    kind: "project",
    accentKind: "practice",
    label: "ЧАСТНАЯ ПРАКТИКА",
    title: "ЧАСТНАЯ ПРАКТИКА",
    meta: "СЕЙЧАС / НЕБОЛЬШИЕ ЦИФРОВЫЕ ПРОЕКТЫ",
    description: "Самостоятельная работа с проектами, которым нужно быстро разобраться в задаче, придать форму и дойти до запуска.",
    kindLabel: "ПРАКТИКА / СВЯЗУЮЩИЙ УЗЕЛ",
    x: 61,
    y: 43,
    size: 38,
  },
  {
    id: "optimal",
    kind: "company",
    label: "ОПТИМАЛГРУПП",
    title: "ЦИФРОВОЕ АГЕНТСТВО «ОПТИМАЛГРУПП»",
    meta: "РАННИЙ ОПЫТ / ЦИФРОВОЕ АГЕНТСТВО",
    description: "Клиентские web-проекты, производство, коммуникация и ранний опыт работы на стыке задач и команд.",
    kindLabel: "КОМПАНИЯ / АГЕНТСТВО",
    x: 24,
    y: 18,
    size: 29,
  },
  {
    id: "ilmix",
    kind: "company",
    label: "ИЛЬМИКСГРУПП",
    title: "«ИЛЬМИКСГРУПП»",
    meta: "РАННИЙ ОПЫТ / ЦИФРОВОЕ НАПРАВЛЕНИЕ",
    description: "Digital-работа внутри фармацевтической компании и опыт развития внутренних web-направлений.",
    kindLabel: "КОМПАНИЯ / ВНУТРЕННЯЯ КОМАНДА",
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
    meta: "UX / UI / ДИЗАЙН-ИНЖИНИРИНГ / ВЕБ-МЕНЕДЖМЕНТ",
    description: "Исследование, развитие и ежедневная работа с главным цифровым продуктом Музея и его командой.",
    href: "https://garagemca.org/",
    kindLabel: "ПРОЕКТ / ГРАФ «ГАРАЖА»",
    previewVideo: "assets/reels/garage-site.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "ГЛАВНАЯ, КАЛЕНДАРЬ И МЕДИА / 00:08",
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
    meta: "ДИЗАЙН / UX / UI / ЦИФРОВОЙ ОПЫТ",
    description: "Дизайн сайта Дома Наркомфина — от интерактивной модели здания и световых состояний до календаря и цельной цифровой навигации.",
    href: "https://narkomfin.ru/",
    kindLabel: "ПРОЕКТ / ГРАФ «ГАРАЖА»",
    previewVideo: "assets/reels/narkomfin.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "ДИЗАЙН И ВЕБ-РАЗРАБОТКА / 00:08",
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
    meta: "2024 / ПРОДУКТ / ИССЛЕДОВАНИЕ / ЗАПУСК",
    description: "Запуск каталога коллекции и открытого хранения: продуктовая логика, исследования, интерфейс и координация реализации.",
    href: "https://garagemca.org/collection/catalogue",
    kindLabel: "ПРОЕКТ / ГРАФ «ГАРАЖА»",
    previewVideo: "assets/reels/garage-collection.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "КАТАЛОГ И ОТКРЫТОЕ ХРАНЕНИЕ / 00:08",
    x: 75,
    y: 19,
    size: 22,
  },
  {
    id: "garage-archives",
    parent: "garage",
    kind: "project",
    label: "АРХИВЫ",
    title: "АРХИВНЫЕ ПРОЕКТЫ",
    meta: "АРХИВ РОССИЙСКОГО ИСКУССТВА / I-M-I / NNS",
    description: "Поддержка и развитие цифровых архивов — от повседневных задач до проектирования новых сценариев доступа к материалам.",
    href: "https://russianartarchive.net/ru",
    kindLabel: "ПРОЕКТ / ГРАФ «ГАРАЖА»",
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
    meta: "ОБУЧЕНИЕ / ПРОДУКТ / ПАРТНЁРСТВА",
    description: "Бесплатные образовательные продукты: запуск курсов, улучшение сценариев и работа с партнёрами.",
    href: "https://garagemca.org/learn/online-courses",
    kindLabel: "ПРОЕКТ / ГРАФ «ГАРАЖА»",
    previewVideo: "assets/reels/garage-courses.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "КУРСЫ И УЧЕБНЫЕ СЦЕНАРИИ / 00:07",
    x: 80,
    y: 30,
    size: 17,
  },
  {
    id: "garage-app",
    parent: "garage",
    kind: "project",
    label: "Я ИДУ В МУЗЕЙ",
    title: "«Я ИДУ В МУЗЕЙ»",
    meta: "ДОСТУПНОСТЬ / МОБИЛЬНЫЙ ПРОДУКТ / ПЕРЕЗАПУСК",
    description: "Перезапуск приложения для людей с ментальными особенностями и их близких: доступность, навигация и понятный маршрут.",
    href: "https://apps.apple.com/ru/app/я-иду-в-музей/id1558275984",
    kindLabel: "ПРОЕКТ / ГРАФ «ГАРАЖА»",
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
    meta: "ИССЛЕДОВАНИЕ / ДИЗАЙН-ИНЖИНИРИНГ / КОД",
    description: "Небольшой исследовательский web-зин, собранный руками как самостоятельная цифровая форма.",
    href: "https://non-human-animals.garage.digital/index.html",
    kindLabel: "ПРОЕКТ / ГРАФ «ГАРАЖА»",
    previewVideo: "assets/reels/garage-webzine.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "ТЕМА, ТЕКСТ И ИНТЕРАКТИВ / 00:08",
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
    meta: "КОНСУЛЬТАЦИИ / ДИЗАЙН / ТЕХНИЧЕСКАЯ ПОМОЩЬ",
    description: "Знания, консультации и конкретная техническая помощь культурным институциям и НКО — с акцентом на быстрый запуск.",
    kindLabel: "ПРОЕКТ / ГРАФ «ГАРАЖА»",
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
    meta: "ПОДДЕРЖКА / РАЗВИТИЕ / КОНТЕНТ",
    description: "Поддержка и развитие отдельного цифрового продукта эндаумент-фонда Музея.",
    href: "https://endowment.garagemca.org/ru/",
    kindLabel: "ПРОЕКТ / ГРАФ «ГАРАЖА»",
    x: 53,
    y: 26,
    size: 12,
  },
  {
    id: "shirokostup",
    parent: "private-practice",
    kind: "project",
    label: "SHIROKOSTUP",
    mapLabel: "Сайт независимого куратора и исследователя Ольги Широкоступ",
    title: "SHIROKOSTUP",
    meta: "РЕДАКЦИОННЫЙ ДИЗАЙН / САЙТ / 2026",
    description: "Портфолио куратора и исследовательницы: редакционная структура, спокойный интерфейс и самостоятельный\u00a0запуск.",
    href: "https://shirokostup.site/",
    kindLabel: "ПРОЕКТ / ЧАСТНАЯ ПРАКТИКА",
    previewVideo: "assets/reels/shirokostup.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "ПОРТФОЛИО И АРХИВ ПРОЕКТОВ / 00:07",
    x: 82,
    y: 52,
    size: 22,
  },
  {
    id: "tarski",
    parent: "private-practice",
    kind: "project",
    label: "TARSKI",
    mapLabel: "Сайт среды изучения и поддержки социально ориентированного и вовлекающего искусства Tarski",
    title: "TARSKI",
    meta: "ЦИФРОВОЙ ПРОДУКТ / САЙТ",
    description: "Цифровой продукт и web-система: продуктовая логика, интерфейс и последовательное развитие.",
    href: "https://tarski.ru/",
    kindLabel: "ПРОЕКТ / ЧАСТНАЯ ПРАКТИКА",
    previewVideo: "assets/reels/tarski.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "СООБЩЕСТВО И ПРОГРАММА / 00:08",
    x: 78,
    y: 47,
    size: 23,
  },
  {
    id: "herman",
    parent: "private-practice",
    kind: "project",
    label: "HERMAN & CO",
    mapLabel: "Сайт стилиста и эксперта по уходу Германа Винокурова",
    title: "HERMAN & CO",
    meta: "СЕРВИС / САЙТ",
    description: "Сервисный сайт с живым статусом, ясной записью и одной цельной системой материалов и состояний.",
    href: "https://barberherman.ru/",
    kindLabel: "ПРОЕКТ / ЧАСТНАЯ ПРАКТИКА",
    previewVideo: "assets/reels/herman.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "СТАТУС, УСЛУГИ И ЗАПИСЬ / 00:07",
    x: 82,
    y: 58,
    size: 19,
  },
  {
    id: "dusty",
    parent: "private-practice",
    kind: "project",
    label: "DUSTY MERCH",
    mapLabel: "Интернет-магазин мерча бегового клуба Dusty\u00a0Dumbbells",
    title: "DUSTY MERCH",
    meta: "МАГАЗИН / САЙТ",
    description: "Небольшой commerce-проект с самостоятельной визуальной системой и быстрым запуском.",
    href: "https://merch.dustydumbbells.com/",
    kindLabel: "ПРОЕКТ / ЧАСТНАЯ ПРАКТИКА",
    previewVideo: "assets/reels/dusty-merch.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "КАТАЛОГ И ОФОРМЛЕНИЕ / 00:07",
    x: 73,
    y: 61,
    size: 17,
  },
  {
    id: "dd-camp",
    parent: "private-practice",
    kind: "project",
    label: "DD CAMP",
    mapLabel: "Сайт осеннего кэмпа Dusty\u00a0Dumbbells",
    title: "DUSTY DUMBBELLS CAMP",
    meta: "СОБЫТИЕ / САЙТ",
    description: "Сайт спортивного кемпа: структура программы, атмосфера события и практичная точка входа.",
    href: "https://camp.dustydumbbells.com/",
    kindLabel: "ПРОЕКТ / ЧАСТНАЯ ПРАКТИКА",
    previewVideo: "assets/reels/dusty-camp.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "ПРОГРАММА И АТМОСФЕРА / 00:07",
    x: 85,
    y: 66,
    size: 15,
  },
  {
    id: "eleven",
    parent: "private-practice",
    kind: "project",
    label: "11 111",
    mapLabel: "Сайт проекта «11 111» Виктора Доронина",
    title: "11 111",
    meta: "БРЕНД / САЙТ",
    description: "Небольшой брендовый web-проект, где цифровая форма работает как самостоятельный характер.",
    href: "https://11111.life/",
    kindLabel: "ПРОЕКТ / ЧАСТНАЯ ПРАКТИКА",
    previewVideo: "assets/reels/11111.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "ИСТОРИЯ, ЦЕЛЬ И МАСШТАБ / 00:08",
    x: 74,
    y: 72,
    size: 14,
  },
  {
    id: "ks-fish",
    parent: "private-practice",
    kind: "project",
    label: "KS FISH",
    mapLabel: "Сайт «Рыбной лавки капитана Селедкина»",
    title: "KS FISH",
    meta: "КАТАЛОГ / САЙТ",
    description: "Каталожный сайт с ясной продуктовой структурой и визуальным ощущением холодного течения.",
    href: "https://ks.fish/",
    kindLabel: "ПРОЕКТ / ЧАСТНАЯ ПРАКТИКА",
    previewVideo: "assets/reels/ks-fish.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "ВИТРИНА, ПРОДУКТ И ИСТОРИЯ / 00:08",
    x: 90,
    y: 78,
    size: 13,
  },
  {
    id: "doronin",
    parent: "private-practice",
    kind: "project",
    label: "DORONIN",
    mapLabel: "Интернет-магазин мерча Виктора Доронина",
    title: "DORONIN",
    meta: "МАГАЗИН / САЙТ",
    description: "Цифровой магазин с компактной, собранной и понятной системой взаимодействия.",
    href: "https://doronin.store/",
    kindLabel: "ПРОЕКТ / ЧАСТНАЯ ПРАКТИКА",
    previewVideo: "assets/reels/doronin.mp4?v=20260728-landscape-reels-1",
    previewOrientation: "landscape",
    previewMeta: "КОЛЛЕКЦИЯ И МЕРЧ / 00:07",
    x: 77,
    y: 81,
    size: 13,
  },
  {
    id: "running",
    kind: "personal",
    label: "БЕГ",
    title: "БЕГ",
    meta: "ЛИЧНЫЙ ЦЕНТР / ДИСТАНЦИЯ / РИТМ",
    description: "Бег — личный центр притяжения: он возвращает ритм, собранность и ощущение движения вперёд — на дистанции и вне её.",
    href: "https://www.instagram.com/stories/highlights/18054491965888038/",
    kindLabel: "ЛИЧНОЕ / ЦЕНТР ПРИТЯЖЕНИЯ",
    x: 61,
    y: 75,
    size: 60,
  },
  {
    id: "art",
    kind: "personal",
    label: "ИСКУССТВО",
    title: "ИСКУССТВО",
    meta: "КУЛЬТУРА / СМОТРЕТЬ ЗАНОВО",
    description: "Не отдельное хобби, а способ смотреть внимательнее и постоянно перенастраивать собственную оптику.",
    href: "https://garagemca.org/calendar",
    kindLabel: "ЛИЧНОЕ / ИНТЕРЕС",
    x: 53,
    y: 81,
    size: 17,
  },
  {
    id: "football",
    kind: "personal",
    label: "ФУТБОЛ",
    title: "ФУТБОЛ",
    meta: "СМОТРЕТЬ / ЧИТАТЬ / ОБСУЖДАТЬ",
    description: "Игра, в которой интересны движение, пространство, системы и исключения из них.",
    href: "https://www.sports.ru/tribuna/blogs/vadimlukomski/2249320.html",
    kindLabel: "ЛИЧНОЕ / ИНТЕРЕС",
    x: 43,
    y: 76,
    size: 14,
  },
  {
    id: "snow",
    kind: "personal",
    label: "СНЕГ",
    title: "СНЕГ",
    meta: "СНОУБОРД / ДВИЖЕНИЕ",
    description: "Способ переключить режим внимания и снова почувствовать скорость, склон и тело.",
    kindLabel: "ЛИЧНОЕ / ИНТЕРЕС",
    x: 34,
    y: 69,
    size: 13,
  },
  {
    id: "music",
    kind: "personal",
    label: "МУЗЫКА",
    title: "МУЗЫКА",
    meta: "СЛУШАТЬ / ПОВТОРЯТЬ",
    description: "Постоянный фон, источник ритма и иногда самый быстрый способ изменить состояние.",
    href: "https://open.spotify.com/track/3GVkPk8mqxz0itaAriG1L7?si=233684c3f400482d",
    kindLabel: "ЛИЧНОЕ / ИНТЕРЕС",
    x: 41,
    y: 84,
    size: 12,
  },
  {
    id: "coffee",
    kind: "personal",
    label: "КОФЕ",
    title: "КОФЕ",
    meta: "РИТУАЛ / ЧЁРНЫЙ",
    description: "Маленький ежедневный ритуал и уважительный кивок агенту Куперу.",
    href: "https://en.wikipedia.org/wiki/Dale_Cooper",
    kindLabel: "ЛИЧНОЕ / ИНТЕРЕС",
    x: 58,
    y: 84,
    size: 10,
  },
  {
    id: "wave",
    kind: "personal",
    label: "ВОЛНА",
    title: "ВОЛНА",
    meta: "МОРЕ / ГОРИЗОНТ / МАСШТАБ",
    description: "Открытый горизонт возвращает чувство масштаба и напоминает: за привычными границами всегда есть продолжение.",
    href: "https://www.instagram.com/stories/highlights/17870996476264206/",
    kindLabel: "ЛИЧНОЕ / ИНТЕРЕС",
    x: 62,
    y: 65,
    size: 12,
  },
  {
    id: "food",
    kind: "personal",
    label: "ЕДА",
    title: "ЕДА",
    meta: "ВКУС / МЕСТА / ДЕТАЛИ",
    description: "От суши до пастрами: вкус — ещё один способ замечать детали и запоминать места.",
    href: "https://daily.afisha.ru/eating/1771-luchshaya-pastrami-v-moskve/",
    kindLabel: "ЛИЧНОЕ / ИНТЕРЕС",
    x: 27,
    y: 80,
    size: 10,
  },
  {
    id: "principle-wings",
    kind: "practice",
    label: "ДОВЕРЯТЬ КРЫЛЬЯМ",
    title: "ПТИЦА ДОВЕРЯЕТ КРЫЛЬЯМ",
    meta: "НЕОПРЕДЕЛЁННОСТЬ / ГИБКОСТЬ / РЕЗУЛЬТАТ",
    description: "Когда привычные сервисы и механизмы перестают работать, не держусь за процедуру: быстро пересобираю её под новую реальность. Умею двигаться в неопределённости и получать результат при ограниченных времени и бюджете. Как птица не боится сломанной ветки, потому что доверяет крыльям, так я опираюсь на опыт, знания и упорство.",
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
    meta: "ТЕКУЩЕЕ → ЦЕЛЕВОЕ → РАЗРЫВЫ / ДЕКОМПОЗИЦИЯ",
    description: "Фиксирую текущее и целевое состояние, нахожу разрывы, раскладываю большие задачи на части и оформляю решения так, чтобы их можно было повторить и масштабировать. Планирую сроки, оцениваю риски и довожу проект до результата.",
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
    description: "Работаю самостоятельно: мне не нужен постоянный контроль. Сам прихожу с вопросами, проблемами и идеями, спокойно переживаю смену приоритетов и сохраняю работоспособность, этичность и ответственность. На меня можно положиться.",
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
    description: "Сам составляю договоры, не пропускаю детали юридических договорённостей и вовремя закрываю работы актами. Умею оценить и спланировать бюджет проекта, а затем контролировать его выполнение.",
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
    description: "Использую PMBOK, Triple Diamond, JTBD, разработку через тестирование и другие полезные методы, но не превращаю их в цель. Когда смысл и результат определены ясно, опыт и здравый смысл важнее очередной системы приоритизации или диспетчера задач.",
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
    description: "Управлял многоэтапными проектами и командой до 10 человек, соблюдая сроки и бюджет. Улучшаю процессы, осваиваю инструменты и обучаю коллег: так мы перенесли больше дизайна внутрь команды, ускорили сборку рассылок и в четыре раза снизили стоимость сервиса.",
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
    description: "Договариваюсь с внешними партнёрами и помогаю команде двигаться к результату. Умею ясно представить работу, услышать возражения и аргументировать позицию независимо от аудитории.",
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
    meta: "ЦИФРОВАЯ СРЕДА / МЕДИА / ТЕХНОЛОГИИ",
    description: "Быстро генерирую идеи и решения. Слежу за цифровыми и медиатрендами, развивающимися технологиями и платформами.",
    kindLabel: "ПРИНЦИП / 10",
    x: 15,
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
    meta: "FIGMA / NOTION / КОД / ИИ / И ДАЛЬШЕ",
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
    description: "Беру полезное новое и сразу проверяю его в повседневной работе. Для продуктов OpenAI держу два правила: нельзя игнорировать возможности ChatGPT, но его участие не должно быть заметнее качества результата.",
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
    description: "Данные помогают понять продукт и превратить наблюдения в изменения, но не заменяют замысел. Тесты способны улучшить сильное решение, однако не придумают его. Поэтому соединяю аналитику с интуицией, проектированием впечатлений, доступностью и вниманием к человеческим мотивам.",
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
    description: "Дизайн-инженер соединяет композицию и код: самостоятельно проектирует решение и доводит его до работающего прототипа. Этот подход мне близок — я одновременно вижу визуальную систему, пользовательский сценарий и технические ограничения.",
    kindLabel: "ПРИНЦИП / 15",
    x: 27,
    y: 66,
    size: 14,
  },
  {
    id: "principle-shaper",
    kind: "practice",
    label: "СКУЛЬПТОР / АРХЕОЛОГ",
    title: "СКУЛЬПТОР / АРХЕОЛОГ",
    meta: "ПРИДАТЬ ФОРМУ / УБРАТЬ ЛИШНЕЕ / НАЙТИ ЦЕННОСТЬ",
    description: "Работаю в двух режимах. Как скульптор — постепенно убираю лишнее, пока не проявится форма. Как археолог — не навязываю решение, а бережно освобождаю уже существующую ценность. В обоих случаях важно вовремя остановиться и не задеть главное.",
    kindLabel: "ПРИНЦИП / 16",
    x: 38,
    y: 64,
    size: 12,
  },
  {
    id: "principle-experiment",
    kind: "practice",
    label: "ГОСТЕПРИИМСТВО + ЗАБОТА",
    title: "ЦИФРОВОЕ ГОСТЕПРИИМСТВО И ЗАБОТА",
    meta: "CX / IXD / ИНКЛЮЗИВНОСТЬ / ГЕНЕРАТИВНЫЙ ИИ",
    description: "Исследую цифровое гостеприимство, инклюзивный веб и генеративный ИИ как инструменты заботы о пользователе. Мне интересны инициативы на стыке ролей — новые процессы и продукты, которых ещё не было. Ищу команды, где такие эксперименты являются законной частью работы.",
    kindLabel: "ПРИНЦИП / 17",
    x: 20,
    y: 77,
    size: 14,
  },
];

const mapNodesRoot = document.querySelector("[data-map-nodes]");
const mapLabelsRoot = document.querySelector("[data-map-labels]");
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
const mapPreviewIndex = document.querySelector("[data-map-preview-index]");
const mapPreviewTitle = document.querySelector("[data-map-preview-title]");
const mapPreviewMeta = document.querySelector("[data-map-preview-meta]");
const reelItems = mapItems.filter((item) => item.previewVideo);
const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");
const compactMapViewport = window.matchMedia("(max-width: 680px)");
const mapButtons = new Map();
const mapLabels = new Map();
let selectedMapId = null;
let rovingMapId = "garage";
let previewHideTimer = 0;
let previewShowFrame = 0;
let activePreviewItem = null;
let atmosphereMapId = null;
let searchRelationshipId = null;

const resolveMapLayout = (item) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let x = item.x;
  let y = item.y;

  if (viewportWidth >= 821 && viewportWidth <= 1100) {
    const tabletOverrides = {
      ilmix: { x: 19 },
      "principle-system": { x: 18 },
      "principle-wings": { y: 43 },
    };
    const override = tabletOverrides[item.id];

    x = override?.x ?? x;
    y = override?.y ?? y;
  } else if (viewportWidth >= 681 && viewportWidth <= 820) {
    if (item.id === "ilmix") {
      y = 33;
    }
  } else if (viewportWidth <= 680) {
    if (item.id === "garage-site") {
      x = viewportWidth <= 360 ? 63 : 60;
    }
  }

  if (viewportWidth <= 360) {
    const compactOverrides = {
      "garage-archives": { x: 62, y: 29 },
      eleven: { x: 78, y: 71 },
      art: { x: 49, y: 83 },
      "principle-autonomy": { x: 23.5, y: 38 },
      "principle-system": { x: 15 },
      "principle-goal": { y: 46 },
      "principle-communicate": { x: 26, y: 53 },
      "principle-tools": { y: 59 },
      "principle-design-engineering": { x: 26 },
      "principle-experiment": { x: 18 },
      "principle-language": { x: 23 },
    };
    const override = compactOverrides[item.id];

    x = override?.x ?? x;
    y = override?.y ?? y;
  }

  return { x, y };
};

const applyMapLayout = () => {
  mapItems.forEach((item) => {
    const position = resolveMapLayout(item);
    const button = mapButtons.get(item.id);
    const label = mapLabels.get(item.id);

    button?.style.setProperty("--x", `${position.x}%`);
    button?.style.setProperty("--y", `${position.y}%`);
    label?.style.setProperty("--x", `${position.x}%`);
    label?.style.setProperty("--y", `${position.y}%`);

    if (item.id === atmosphereMapId && signalField) {
      signalField.style.setProperty("--focus-x", `${position.x}%`);
      signalField.style.setProperty("--focus-y", `${position.y}%`);
    }
  });
};

const syncMapRelationships = () => {
  if (!mapLinksRoot) {
    return;
  }

  const relationshipId = searchRelationshipId || atmosphereMapId;
  const activeKind = signalField?.dataset.activeKind || "all";
  const paths = Array.from(mapLinksRoot.querySelectorAll("path"));
  let hasVisibleRelationship = false;

  paths.forEach((path) => {
    const parentId = path.dataset.parentId;
    const childId = path.dataset.childId;
    const parentKind = mapButtons.get(parentId)?.dataset.mapKind;
    const childKind = mapButtons.get(childId)?.dataset.mapKind;
    const isFilterVisible = activeKind === "all"
      || (parentKind === activeKind && childKind === activeKind);
    const isActive = Boolean(
      relationshipId
      && (relationshipId === parentId || relationshipId === childId),
    );
    const isVisibleRelationship = isActive && isFilterVisible;

    path.classList.toggle("is-filter-hidden", !isFilterVisible);
    path.classList.toggle("is-active-relation", isVisibleRelationship);
    hasVisibleRelationship ||= isVisibleRelationship;
  });

  mapLinksRoot.classList.toggle("has-active-relation", hasVisibleRelationship);

  if (hasVisibleRelationship) {
    mapLinksRoot.dataset.relationshipId = relationshipId;
  } else {
    delete mapLinksRoot.dataset.relationshipId;
  }
};

const setSearchRelationshipPreview = (id = null) => {
  searchRelationshipId = id;
  syncMapRelationships();
};

const setMapAtmosphere = (item = null) => {
  if (!signalField) {
    return;
  }

  if (!item) {
    atmosphereMapId = null;
    delete signalField.dataset.focusId;
    delete signalField.dataset.focusKind;
    signalField.style.removeProperty("--focus-x");
    signalField.style.removeProperty("--focus-y");
    syncMapRelationships();
    return;
  }

  atmosphereMapId = item.id;
  const position = resolveMapLayout(item);
  signalField.dataset.focusId = item.id;
  signalField.dataset.focusKind = item.accentKind || item.kind;
  signalField.style.setProperty("--focus-x", `${position.x}%`);
  signalField.style.setProperty("--focus-y", `${position.y}%`);
  syncMapRelationships();
};

const restoreSelectedMapAtmosphere = () => {
  setMapAtmosphere(
    mapItems.find((item) => item.id === selectedMapId) || null,
  );
};

const syncMapMetaOverflow = () => {
  const track = mapMeta?.querySelector(".map-readout__meta-track");

  if (!mapMeta || !track) {
    return;
  }

  const travel = Math.max(0, track.scrollWidth - mapMeta.clientWidth + 8);
  const shouldMarquee = travel > 8;

  mapMeta.classList.toggle("is-marquee", shouldMarquee);
  mapMeta.style.setProperty("--map-meta-travel", `${-travel}px`);
  mapMeta.style.setProperty(
    "--map-meta-duration",
    `${Math.min(16, Math.max(10, 8 + travel / 48)).toFixed(2)}s`,
  );
};

const setMapMetaText = (value) => {
  if (!mapMeta) {
    return;
  }

  const text = typographUiText(value);
  const track = document.createElement("span");

  track.className = "map-readout__meta-track";
  track.textContent = text;
  mapMeta.classList.remove("is-marquee");
  mapMeta.removeAttribute("aria-label");
  mapMeta.replaceChildren(track);
  window.requestAnimationFrame(syncMapMetaOverflow);
};

const getNavigableMapItems = () => {
  const activeKind = document.querySelector("[data-practice-map]")?.dataset.activeKind || "all";

  return mapItems.filter((item) => {
    const button = mapButtons.get(item.id);

    return button
      && !button.classList.contains("is-search-miss")
      && (activeKind === "all" || item.kind === activeKind);
  });
};

const syncMapNodeAvailability = () => {
  const activeKind = document.querySelector("[data-practice-map]")?.dataset.activeKind || "all";

  mapItems.forEach((item) => {
    const button = mapButtons.get(item.id);

    if (!button) {
      return;
    }

    const isAvailable = !button.classList.contains("is-search-miss")
      && (activeKind === "all" || item.kind === activeKind);

    button.inert = !isAvailable;
    button.setAttribute("aria-hidden", String(!isAvailable));
  });
};

const setMapRovingId = (id, { focus = false } = {}) => {
  const target = mapButtons.get(id);

  if (!target) {
    return;
  }

  rovingMapId = id;
  mapButtons.forEach((button, buttonId) => {
    button.tabIndex = buttonId === rovingMapId ? 0 : -1;
  });

  if (focus) {
    target.focus();
  }
};

const getDirectionalMapItem = (id, key) => {
  const current = mapItems.find((item) => item.id === id);
  const candidates = getNavigableMapItems();

  if (!current || !candidates.length) {
    return null;
  }

  if (key === "Home") {
    return candidates.find((item) => item.id === "garage") || candidates[0];
  }

  if (key === "End") {
    return candidates[candidates.length - 1];
  }

  const isHorizontal = key === "ArrowLeft" || key === "ArrowRight";
  const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  const currentPosition = resolveMapLayout(current);

  return candidates
    .filter((item) => item.id !== id)
    .map((item) => {
      const position = resolveMapLayout(item);
      const dx = ((position.x - currentPosition.x) / 100) * window.innerWidth;
      const dy = ((position.y - currentPosition.y) / 100) * window.innerHeight;
      const primary = isHorizontal ? dx : dy;
      const cross = isHorizontal ? dy : dx;

      if (Math.sign(primary) !== direction || Math.abs(primary) < 1) {
        return null;
      }

      const distance = Math.hypot(dx, dy);
      const anglePenalty = Math.abs(cross) / Math.max(Math.abs(primary), 1);

      return {
        item,
        score: distance * (1 + anglePenalty * 1.6),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)[0]?.item || null;
};

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
    || compactMapViewport.matches
    || mapInspector?.classList.contains("is-open")
  ) {
    hideMapPreview({ immediate: true });
    return;
  }

  window.clearTimeout(previewHideTimer);
  activePreviewItem = item;
  mapPreview.style.setProperty("--reel-progress", "0");

  mapPreview.classList.add("has-video");
  mapPreview.classList.toggle(
    "is-landscape",
    item.previewOrientation === "landscape",
  );

  if (mapPreviewIndex) {
    const reelIndex = reelItems.findIndex((candidate) => candidate.id === item.id);
    mapPreviewIndex.textContent = `${String(reelIndex + 1).padStart(2, "0")} / ${String(reelItems.length).padStart(2, "0")}`;
  }

  if (mapPreviewTitle) {
    mapPreviewTitle.textContent = typographUiText(item.mapLabel || item.title);
  }

  if (mapPreviewMeta) {
    mapPreviewMeta.textContent = typographUiText(item.previewMeta);
  }

  if (mapPreviewVideo.dataset.previewId !== item.id) {
    mapPreview.classList.remove("is-video-ready");
    mapPreviewVideo.dataset.previewId = item.id;
    mapPreviewVideo.src = item.previewVideo;
  }

  if (mapPreviewVideo.readyState >= 1) {
    mapPreviewVideo.currentTime = item.previewStart || 0;
  }

  if (reducedMotion.matches) {
    mapPreviewVideo.pause();
  } else {
    mapPreviewVideo.play().catch(() => {
      // The receiver can remain paused when autoplay is blocked.
    });
  }

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

  if (reducedMotion.matches) {
    mapPreviewVideo.pause();
  }
});

mapPreviewVideo?.addEventListener("timeupdate", () => {
  if (!activePreviewItem) {
    return;
  }

  const previewStart = activePreviewItem.previewStart || 0;
  const previewDuration = activePreviewItem.previewDuration
    || mapPreviewVideo.duration
    || 1;
  const elapsed = Math.max(0, mapPreviewVideo.currentTime - previewStart);
  const progress = Math.min(1, elapsed / previewDuration);

  mapPreview?.style.setProperty("--reel-progress", String(progress));

  if (
    activePreviewItem.previewDuration
    && mapPreviewVideo.currentTime >= previewStart + activePreviewItem.previewDuration
  ) {
    mapPreviewVideo.currentTime = previewStart;
    mapPreviewVideo.play().catch(() => {
      // The preview can remain paused when playback is blocked.
    });
  }
});

reducedMotion.addEventListener?.("change", () => {
  if (!mapPreviewVideo || !activePreviewItem) {
    return;
  }

  if (reducedMotion.matches) {
    mapPreviewVideo.pause();
  } else if (mapPreview?.classList.contains("is-visible")) {
    mapPreviewVideo.play().catch(() => {
      // The preview can remain paused when autoplay is blocked.
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
  mapButtons.forEach((button, buttonId) => {
    button.setAttribute("aria-expanded", String(isOpen && buttonId === selectedMapId));
  });
};

const clearMapSelection = () => {
  selectedMapId = null;
  delete signalField.dataset.selectedKind;
  delete signalField.dataset.selectedId;
  setMapAtmosphere(null);

  if (mapInspector) {
    delete mapInspector.dataset.selectedMapId;
    delete mapInspector.dataset.mobilePlacement;
  }

  mapButtons.forEach((button) => {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-expanded", "false");
  });
  setInspectorOpen(false);
};

const selectMapItem = (id, { reveal = false } = {}) => {
  const item = mapItems.find((candidate) => candidate.id === id);

  if (!item) {
    return;
  }

  selectedMapId = id;
  signalField.dataset.selectedKind = item.kind;
  signalField.dataset.selectedId = item.id;
  setMapAtmosphere(item);

  if (mapInspector) {
    const position = resolveMapLayout(item);
    mapInspector.dataset.selectedMapId = item.id;
    mapInspector.dataset.mobilePlacement = position.y >= 48 ? "top" : "bottom";
  }

  mapButtons.forEach((button, buttonId) => {
    const isSelected = buttonId === selectedMapId;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.setAttribute(
      "aria-expanded",
      String(isSelected && mapInspector?.classList.contains("is-open")),
    );
  });
  setMapRovingId(id);

  if (mapKind) {
    mapKind.textContent = typographUiText(item.kindLabel);
  }

  if (mapTitle) {
    mapTitle.textContent = typographUiText(item.title);
  }

  if (mapMeta) {
    setMapMetaText(item.meta);
  }

  if (mapDescription) {
    mapDescription.textContent = typographUiText(item.description);
  }

  if (mapLink) {
    const itemHref = item.href || (item.kind === "practice" ? principlesSourceHref : "");

    if (itemHref) {
      mapLink.hidden = false;
      mapLink.href = itemHref;
      mapLink.textContent = item.kind === "practice" ? "ИСХОДНИК В\u00a0NOTION" : "ОТКРЫТЬ";
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
    button.tabIndex = -1;
    button.className = `map-node map-node--${item.kind}`;
    button.dataset.mapId = item.id;
    button.dataset.mapKind = item.kind;
    button.dataset.mapAccent = item.accentKind || item.kind;
    button.dataset.mapParent = item.parent || "";
    const position = resolveMapLayout(item);
    button.style.setProperty("--x", `${position.x}%`);
    button.style.setProperty("--y", `${position.y}%`);
    button.style.setProperty("--size", `${item.size}px`);
    const accessibleMapLabel = item.mapLabel || item.label;
    const glyphScale = item.id === "running"
      ? 0.72
      : item.kind === "personal"
        ? 0.48
        : 1;
    const glyphDiameter = Math.max(10, item.size * glyphScale);
    button.setAttribute("aria-label", typographUiText(`${accessibleMapLabel}. ${item.meta}`));
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "map-inspector");

    if (item.id === "garage") {
      button.classList.add("map-node--garage");
    }

    if (item.id === "running") {
      button.classList.add("map-node--running");
    }

    if (item.parent === "garage") {
      button.classList.add("map-node--garage-child");
    }

    if (item.x >= 72) {
      button.classList.add("map-node--label-west");
    }

    glyph.className = "map-node__glyph";
    glyph.setAttribute("aria-hidden", "true");
    label.className = `map-node-label map-node-label--${item.kind}`;
    label.dataset.mapLabelId = item.id;
    label.dataset.materialSurface = "map-node-label";
    label.dataset.materialActive = "always";
    label.textContent = typographUiText(item.label);
    label.style.setProperty("--x", `${position.x}%`);
    label.style.setProperty("--y", `${position.y}%`);
    label.style.setProperty("--label-offset", `${glyphDiameter / 2 + 7}px`);
    label.style.setProperty("--garage-label-offset", `${glyphDiameter / 2 + 18}px`);

    if (item.id === "garage") {
      label.classList.add("map-node-label--garage");
    }

    if (item.id === "running") {
      label.classList.add("map-node-label--running");
    }

    if (item.id === "private-practice") {
      label.classList.add("map-node-label--private-practice");
    }

    if (item.x >= 72) {
      label.classList.add("map-node-label--west");
    }

    const showLabel = () => {
      mapLabels.forEach((candidate) => {
        candidate.classList.remove("is-visible");
      });

      if (!compactMapViewport.matches) {
        label.classList.add("is-visible");
      }
    };
    const hideLabel = () => label.classList.remove("is-visible");

    button.append(glyph);
    mapLabelsRoot?.append(label);
    button.addEventListener("pointerenter", () => {
      showLabel();
      setMapAtmosphere(item);
    });
    button.addEventListener("pointerleave", () => {
      if (document.activeElement === button) {
        return;
      }

      hideLabel();

      const focusedMapId = document.activeElement?.dataset?.mapId;
      if (!compactMapViewport.matches && focusedMapId) {
        mapLabels.get(focusedMapId)?.classList.add("is-visible");
      }

      restoreSelectedMapAtmosphere();
    });
    button.addEventListener("click", () => {
      hideLabel();
      hideMapPreview({ immediate: true });
      selectMapItem(item.id, { reveal: true });
    });
    button.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        button.click();
        return;
      }

      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        return;
      }

      const nextItem = getDirectionalMapItem(item.id, event.key);

      if (!nextItem) {
        return;
      }

      event.preventDefault();
      setMapRovingId(nextItem.id, { focus: true });
    });
    button.addEventListener("focus", () => {
      showLabel();
      selectMapItem(item.id);
    });
    button.addEventListener("blur", hideLabel);

    if (item.previewVideo) {
      button.addEventListener("pointerenter", () => showMapPreview(item));
      button.addEventListener("pointerleave", () => hideMapPreview());
      button.addEventListener("focus", () => showMapPreview(item));
      button.addEventListener("blur", () => hideMapPreview());
    }

    mapButtons.set(item.id, button);
    mapLabels.set(item.id, label);
    mapNodesRoot.append(button);
  });

  applyMapLayout();

  compactMapViewport.addEventListener("change", (event) => {
    if (!event.matches) {
      return;
    }

    mapLabels.forEach((label) => label.classList.remove("is-visible"));
    hideMapPreview({ immediate: true });
  });
}

if (mapLinksRoot) {
  const itemById = new Map(mapItems.map((item) => [item.id, item]));
  const childrenByParent = new Map();

  mapItems.forEach((item) => {
    if (!item.parent || !itemById.has(item.parent)) {
      return;
    }

    const siblings = childrenByParent.get(item.parent) || [];
    siblings.push(item);
    childrenByParent.set(item.parent, siblings);
  });

  const renderMapLinks = () => {
    const bounds = mapLinksRoot.getBoundingClientRect();

    if (!bounds.width || !bounds.height) {
      return;
    }

    const linkElements = [];
    const getNodeGeometry = (item) => {
      const glyph = mapButtons.get(item.id)?.querySelector(".map-node__glyph");
      const rect = glyph?.getBoundingClientRect();

      if (!rect?.width || !rect?.height) {
        const position = resolveMapLayout(item);

        return {
          centerX: (position.x / 100) * bounds.width,
          centerY: (position.y / 100) * bounds.height,
          radius: item.size / 2,
        };
      }

      return {
        centerX: rect.left + rect.width / 2 - bounds.left,
        centerY: rect.top + rect.height / 2 - bounds.top,
        radius: Math.max(rect.width, rect.height) / 2,
      };
    };

    childrenByParent.forEach((children, parentId) => {
      const parent = itemById.get(parentId);
      const parentGeometry = getNodeGeometry(parent);
      const measuredChildren = children
        .map((item) => {
          const geometry = getNodeGeometry(item);
          const deltaX = geometry.centerX - parentGeometry.centerX;
          const deltaY = geometry.centerY - parentGeometry.centerY;

          return {
            item,
            geometry,
            angle: Math.atan2(deltaY, deltaX),
          };
        })
        .sort((left, right) => (
          left.angle - right.angle
          || left.geometry.centerY - right.geometry.centerY
          || left.geometry.centerX - right.geometry.centerX
        ));
      const firstAngle = measuredChildren[0]?.angle || 0;
      const lastAngle = measuredChildren.at(-1)?.angle || firstAngle;
      const portPadding = (parentId === "garage" ? 3 : 4) * (Math.PI / 180);
      const portStart = firstAngle - portPadding;
      const portEnd = lastAngle + portPadding;

      measuredChildren.forEach(({ item, geometry }, index) => {
        const portProgress = measuredChildren.length > 1
          ? index / (measuredChildren.length - 1)
          : 0.5;
        const portAngle = portStart + (portEnd - portStart) * portProgress;
        const parentRadius = parentGeometry.radius + 3;
        const childRadius = geometry.radius + 2;
        const path = document.createElementNS(svgNamespace, "path");
        const parentCenterX = parentGeometry.centerX;
        const parentCenterY = parentGeometry.centerY;
        const childCenterX = geometry.centerX;
        const childCenterY = geometry.centerY;
        const sourcePixelX = parentCenterX + Math.cos(portAngle) * parentRadius;
        const sourcePixelY = parentCenterY + Math.sin(portAngle) * parentRadius;
        const childToSourceX = sourcePixelX - childCenterX;
        const childToSourceY = sourcePixelY - childCenterY;
        const childToSourceLength = Math.hypot(childToSourceX, childToSourceY) || 1;
        const targetPixelX = childCenterX
          + (childToSourceX / childToSourceLength) * childRadius;
        const targetPixelY = childCenterY
          + (childToSourceY / childToSourceLength) * childRadius;
        const deltaX = targetPixelX - sourcePixelX;
        const deltaY = targetPixelY - sourcePixelY;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const targetDirectionX = deltaX / distance;
        const targetDirectionY = deltaY / distance;
        const sourceLead = Math.min(48, Math.max(18, distance * 0.24));
        const targetLead = Math.min(38, Math.max(14, distance * 0.2));
        const control1PixelX = sourcePixelX + Math.cos(portAngle) * sourceLead;
        const control1PixelY = sourcePixelY + Math.sin(portAngle) * sourceLead;
        const control2PixelX = targetPixelX - targetDirectionX * targetLead;
        const control2PixelY = targetPixelY - targetDirectionY * targetLead;
        const toViewBoxX = (value) => (value / bounds.width) * 100;
        const toViewBoxY = (value) => (value / bounds.height) * 100;
        const sourceX = toViewBoxX(sourcePixelX);
        const sourceY = toViewBoxY(sourcePixelY);
        const targetX = toViewBoxX(targetPixelX);
        const targetY = toViewBoxY(targetPixelY);
        const control1X = toViewBoxX(control1PixelX);
        const control1Y = toViewBoxY(control1PixelY);
        const control2X = toViewBoxX(control2PixelX);
        const control2Y = toViewBoxY(control2PixelY);

        path.setAttribute(
          "d",
          `M${sourceX.toFixed(3)} ${sourceY.toFixed(3)}`
            + `C${control1X.toFixed(3)} ${control1Y.toFixed(3)}`
            + ` ${control2X.toFixed(3)} ${control2Y.toFixed(3)}`
            + ` ${targetX.toFixed(3)} ${targetY.toFixed(3)}`,
        );

        if (parentId === "garage") {
          path.classList.add("is-garage-link");
        }

        if (parentId === "private-practice") {
          path.classList.add("is-private-practice-link");
        }

        path.dataset.parentId = parentId;
        path.dataset.childId = item.id;
        linkElements.push(path);
      });
    });

    mapLinksRoot.replaceChildren(...linkElements);
    syncMapRelationships();
  };

  let mapLinksResizeFrame = 0;
  let mapLinksSettleTimer = 0;
  const scheduleMapLinksRender = () => {
    window.cancelAnimationFrame(mapLinksResizeFrame);
    window.clearTimeout(mapLinksSettleTimer);
    mapLinksResizeFrame = window.requestAnimationFrame(() => {
      applyMapLayout();
      renderMapLinks();
    });
    mapLinksSettleTimer = window.setTimeout(() => {
      applyMapLayout();
      renderMapLinks();
    }, 940);
  };

  renderMapLinks();
  mapLinksRoot.addEventListener("transitionend", (event) => {
    if (event.target === mapLinksRoot && event.propertyName === "transform") {
      renderMapLinks();
    }
  });
  window.addEventListener("resize", scheduleMapLinksRender, { passive: true });
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

  let speckClearanceFrame = 0;

  const syncMapSpeckClearance = () => {
    const glyphs = Array.from(
      mapNodesRoot?.querySelectorAll(".map-node__glyph") || [],
    ).map((glyph) => {
      const bounds = glyph.getBoundingClientRect();

      return {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
        radius: Math.max(bounds.width, bounds.height) / 2,
      };
    });

    mapSpecksRoot.querySelectorAll(".map-speck").forEach((speck) => {
      const bounds = speck.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const radius = Math.max(bounds.width, bounds.height) / 2;
      const isNodeAdjacent = glyphs.some((glyph) => (
        Math.hypot(glyph.x - x, glyph.y - y)
        < glyph.radius + radius + 10
      ));

      speck.classList.toggle("is-node-adjacent", isNodeAdjacent);
    });
  };

  const scheduleMapSpeckClearance = () => {
    window.cancelAnimationFrame(speckClearanceFrame);
    speckClearanceFrame = window.requestAnimationFrame(syncMapSpeckClearance);
  };

  scheduleMapSpeckClearance();
  window.addEventListener("resize", scheduleMapSpeckClearance, {
    passive: true,
  });
  mapNodesRoot?.addEventListener("transitionend", (event) => {
    if (
      event.target instanceof Element
      && event.target.matches(".map-node, .map-node__glyph")
    ) {
      scheduleMapSpeckClearance();
    }
  });
}

setMapRovingId("garage");

if (mapMeta && "ResizeObserver" in window) {
  new ResizeObserver(syncMapMetaOverflow).observe(mapMeta);
}

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

  syncMapNodeAvailability();
  syncMapRelationships();
  const navigableItems = getNavigableMapItems();
  const selectedItemIsAvailable = navigableItems.some(
    (item) => item.id === selectedMapId,
  );

  if (selectedMapId && !selectedItemIsAvailable) {
    clearMapSelection();
  }

  if (!navigableItems.some((item) => item.id === rovingMapId) && navigableItems[0]) {
    setMapRovingId(navigableItems[0].id);
  }
};

mapFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMapFilter(button.dataset.mapFilter || "all");
  });
});

const positionDetachedCommandResults = () => {
  const dock = document.querySelector("[data-command-form]");
  const results = document.querySelector("[data-command-results]");
  const status = document.querySelector("[data-command-status]");

  if (!dock || !results) {
    return;
  }

  const bounds = dock.getBoundingClientRect();
  const gap = window.matchMedia("(max-width: 680px)").matches ? 8 : 19;

  [results, status].filter(Boolean).forEach((element) => {
    element.style.setProperty("--command-results-left", `${bounds.left.toFixed(2)}px`);
    element.style.setProperty("--command-results-width", `${bounds.width.toFixed(2)}px`);
    element.style.setProperty(
      "--command-results-bottom",
      `${(window.innerHeight - bounds.top + gap).toFixed(2)}px`,
    );
  });
};

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
      positionDetachedCommandResults();
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

  positionDetachedCommandResults();
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
  document.body.classList.toggle("has-constellation-nav", isOpen);

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
const contentPanelBody = document.querySelector(".content-panel__body");
const panelSections = Array.from(document.querySelectorAll("[data-panel-section]"));
const panelOpenButtons = Array.from(document.querySelectorAll("[data-open-panel]"));
const controlConsole = document.querySelector(".control-console");
const controlConsoleHome = document.createComment("control-console-home");
let controlConsolePanelOffset = null;

controlConsole?.before(controlConsoleHome);

const panelBackgroundRoots = [
  document.querySelector(".map-hero"),
  document.querySelector(".site-header"),
  ...document.querySelectorAll(".skip-link"),
].filter(Boolean);
let activePanelView = null;
let lastPanelTrigger = null;
const compactContentStack = window.matchMedia("(max-width: 680px)");
const contentStackGroups = {
  work: [
    document.querySelector(".work-intro"),
    ...document.querySelectorAll(".work-list .work-row"),
  ].filter(Boolean),
  approach: [
    document.querySelector(".approach-intro"),
    ...document.querySelectorAll(".approach-grid li"),
  ].filter(Boolean),
};
let contentStackFrame = 0;
let contentStackOffsets = [];

const clearContentStackState = () => {
  Object.values(contentStackGroups).flat().forEach((surface) => {
    surface.classList.remove(
      "is-content-stack-active",
      "is-content-stack-behind",
      "is-content-stack-hidden",
    );
    surface.style.removeProperty("--content-stack-order");
  });
};

const measureContentStackOffsets = (surfaces) => {
  if (!contentPanel || !contentPanelBody) {
    return [];
  }

  contentPanel.classList.add("is-measuring-content-stack");
  const bodyRect = contentPanelBody.getBoundingClientRect();
  const scrollTop = contentPanelBody.scrollTop;
  const measurements = surfaces.map((surface) => {
    const rect = surface.getBoundingClientRect();
    return {
      height: rect.height,
      offset: rect.top - bodyRect.top + scrollTop,
    };
  });
  contentPanel.classList.remove("is-measuring-content-stack");

  return measurements.map(({ offset }) => offset);
};

const syncContentStack = () => {
  contentStackFrame = 0;

  if (!compactContentStack.matches || !activePanelView) {
    clearContentStackState();
    return;
  }

  const surfaces = contentStackGroups[activePanelView] || [];

  if (contentStackOffsets.length !== surfaces.length) {
    contentStackOffsets = measureContentStackOffsets(surfaces);
  }

  const stackLead = 10;
  let activeIndex = 0;

  for (let index = 1; index < contentStackOffsets.length; index += 1) {
    const nextTop = contentStackOffsets[index] - contentPanelBody.scrollTop;
    const nextStackTop = Number.parseFloat(
      getComputedStyle(surfaces[index]).getPropertyValue("--content-stack-top"),
    ) || 8;

    if (nextTop <= nextStackTop + stackLead) {
      activeIndex = index;
    } else {
      break;
    }
  }

  surfaces.forEach((surface, index) => {
    const layer = activeIndex - index;
    const isActive = index === activeIndex;
    const isBehind = layer > 0 && layer <= 2;
    const isHidden = layer > 2;

    surface.classList.toggle("is-content-stack-active", isActive);
    surface.classList.toggle("is-content-stack-behind", isBehind);
    surface.classList.toggle("is-content-stack-hidden", isHidden);
    surface.style.setProperty("--content-stack-order", String(index));
  });
};

const scheduleContentStackSync = () => {
  if (contentStackFrame) {
    return;
  }

  contentStackFrame = window.requestAnimationFrame(syncContentStack);
};

const invalidateContentStack = () => {
  contentStackOffsets = [];
  scheduleContentStackSync();
};

const panelViews = {
  work: {
    index: "01 / ПРОЕКТЫ",
    title: "ПРОЕКТЫ",
  },
  approach: {
    index: "02 / ПОДХОД",
    title: "ПОДХОД",
  },
  contact: {
    index: "03 / СВЯЗАТЬСЯ",
    title: "СВЯЗАТЬСЯ",
  },
};

const setPanelOpen = (isOpen) => {
  if (isOpen && contentPanel && controlConsole && !contentPanel.contains(controlConsole)) {
    controlConsolePanelOffset = getConsoleOffset(controlConsole);
    setConsoleOffset(controlConsole, 0, 0);
    contentPanel.append(controlConsole);
  }

  contentPanel?.classList.toggle("is-open", isOpen);
  contentPanel?.setAttribute("aria-hidden", String(!isOpen));

  if (contentPanel) {
    contentPanel.inert = !isOpen;
  }

  panelBackgroundRoots.forEach((element) => {
    element.inert = isOpen;
  });

  panelScrim?.classList.toggle("is-visible", isOpen);
  panelScrim?.setAttribute("aria-hidden", String(!isOpen));
  panelOpenButtons.forEach((button) => {
    button.setAttribute(
      "aria-expanded",
      String(isOpen && button.dataset.openPanel === activePanelView),
    );
  });
  document.body.classList.toggle("has-content-panel", isOpen);

  if (!isOpen && controlConsole && controlConsoleHome.parentNode) {
    controlConsoleHome.parentNode.insertBefore(controlConsole, controlConsoleHome.nextSibling);

    if (controlConsolePanelOffset) {
      setConsoleOffset(
        controlConsole,
        controlConsolePanelOffset.x,
        controlConsolePanelOffset.y,
      );
      controlConsolePanelOffset = null;
    }
  }
};

const openContentPanel = (view, trigger = null) => {
  const config = panelViews[view];

  if (!config) {
    return;
  }

  activePanelView = view;
  contentStackOffsets = [];
  lastPanelTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
  contentPanel?.setAttribute("data-view", view);
  signalField?.setAttribute("data-camera-view", view);
  setConstellationNavCurrent(view);
  setConstellationNavOpen(false);
  panelSections.forEach((section) => {
    section.hidden = section.dataset.panelSection !== view;
  });
  contentPanelBody?.scrollTo({ top: 0, behavior: "auto" });

  if (panelTitle) {
    panelTitle.textContent = typographUiText(config.title);
  }

  if (panelIndex) {
    panelIndex.textContent = config.index;
  }

  hideMapPreview({ immediate: true });
  clearMapSelection();
  setPanelOpen(true);
  window.requestAnimationFrame(() => {
    scheduleContentStackSync();
    panelClose?.focus();
  });
};

const closeContentPanel = ({ restoreFocus = true } = {}) => {
  if (!activePanelView) {
    return;
  }

  setPanelOpen(false);
  clearContentStackState();
  activePanelView = null;
  contentPanel?.removeAttribute("data-view");
  signalField?.removeAttribute("data-camera-view");
  setConstellationNavCurrent("map");

  if (restoreFocus && lastPanelTrigger instanceof HTMLElement) {
    const triggerIsInCompactNavigation = compactConstellationNav.matches
      && Boolean(lastPanelTrigger.closest("[data-constellation-nav-orbit]"));

    if (triggerIsInCompactNavigation) {
      setConstellationNavOpen(true);
    }

    lastPanelTrigger.focus({ preventScroll: true });
  }
};

panelOpenButtons.forEach((button) => {
  button.setAttribute("aria-controls", "content-panel");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "dialog");
  button.addEventListener("click", () => {
    openContentPanel(button.dataset.openPanel, button);
  });
});

contentPanel?.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || !activePanelView) {
    return;
  }

  const focusableElements = Array.from(contentPanel.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => (
    !element.hidden
    && !element.closest("[hidden]")
    && !element.closest("[inert]")
    && element.getClientRects().length > 0
  ));
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements.at(-1);

  if (!firstFocusable || !lastFocusable) {
    event.preventDefault();
    panelClose?.focus();
    return;
  }

  if (event.shiftKey && document.activeElement === firstFocusable) {
    event.preventDefault();
    lastFocusable.focus();
  } else if (!event.shiftKey && document.activeElement === lastFocusable) {
    event.preventDefault();
    firstFocusable.focus();
  }
});

contentPanelBody?.addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) {
    return;
  }

  const maximumScroll = contentPanelBody.scrollHeight - contentPanelBody.clientHeight;
  const step = event.key.startsWith("Page")
    ? contentPanelBody.clientHeight * 0.82
    : 48;
  let nextScroll = contentPanelBody.scrollTop;

  if (event.key === "Home") {
    nextScroll = 0;
  } else if (event.key === "End") {
    nextScroll = maximumScroll;
  } else {
    nextScroll += ["ArrowDown", "PageDown"].includes(event.key) ? step : -step;
  }

  event.preventDefault();
  contentPanelBody.scrollTo({
    top: Math.max(0, Math.min(maximumScroll, nextScroll)),
    behavior: reducedMotion.matches ? "auto" : "smooth",
  });
});

panelClose?.addEventListener("click", () => closeContentPanel());
panelScrim?.addEventListener("click", () => closeContentPanel());
contentPanelBody?.addEventListener("scroll", scheduleContentStackSync, { passive: true });

if (typeof compactContentStack.addEventListener === "function") {
  compactContentStack.addEventListener("change", invalidateContentStack);
} else {
  compactContentStack.addListener(invalidateContentStack);
}

window.addEventListener("resize", invalidateContentStack, { passive: true });
window.addEventListener("pageshow", invalidateContentStack, { passive: true });
window.visualViewport?.addEventListener("resize", invalidateContentStack, { passive: true });
document.fonts?.ready.then(invalidateContentStack);

contentPanelBody?.addEventListener("focusin", (event) => {
  if (!compactContentStack.matches) {
    return;
  }

  const focusedCard = event.target.closest(".work-row");

  if (!focusedCard) {
    return;
  }

  focusedCard.scrollIntoView({
    block: "start",
    behavior: reducedMotion.matches ? "auto" : "smooth",
  });
  scheduleContentStackSync();
});
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
const commandStatus = document.querySelector("[data-command-status]");
const syncCommandPlaceholder = () => {
  if (commandInput) {
    commandInput.placeholder = compactConstellationNav.matches
      ? "Найти…"
      : "Найти или\u00a0открыть…";
  }
};

compactConstellationNav.addEventListener("change", syncCommandPlaceholder);
syncCommandPlaceholder();

let currentCommandResults = [];
let activeCommandIndex = -1;

const setCommandStatus = (message = "") => {
  if (!commandStatus) {
    return;
  }

  commandStatus.textContent = message;
  commandStatus.hidden = !message;
  commandStatus.classList.toggle("is-open", Boolean(message));

  if (message) {
    positionDetachedCommandResults();
  }
};

const normalizeSearch = (value) => value
  .toLocaleLowerCase("ru")
  .replaceAll("ё", "е")
  .replace(/[^a-zа-я0-9]+/gi, " ")
  .trim();

const commandViews = [
  {
    type: "panel",
    id: "work",
    title: "НЕДАВНИЕ ПРОЕКТЫ",
    meta: "8 ПРОЕКТОВ / 2023—2026",
    keywords: "проекты работы портфолио недавние последние текущие сайты",
  },
  {
    type: "panel",
    id: "approach",
    title: "КАК Я РАБОТАЮ",
    meta: "ИССЛЕДОВАНИЕ → ФОРМА → КООРДИНАЦИЯ → РЕАЛИЗАЦИЯ",
    keywords: "подход метод процесс принципы работа approach how",
  },
  {
    type: "panel",
    id: "contact",
    title: "СВЯЗАТЬСЯ",
    meta: "МОСКВА / УДАЛЁННО / ПОЧТА",
    keywords: "контакт почта написать связаться contact email",
  },
];

const setCommandOpen = (isOpen) => {
  if (isOpen) {
    setCommandStatus("");
    positionDetachedCommandResults();
  }

  commandForm?.classList.toggle("is-open", isOpen);
  commandResults?.classList.toggle("is-open", isOpen);
  commandInput?.setAttribute("aria-expanded", String(isOpen));
  commandResults?.setAttribute("aria-hidden", String(!isOpen));

  if (commandResults) {
    commandResults.inert = !isOpen;
  }

  if (!isOpen) {
    setSearchRelationshipPreview(null);
    commandInput?.removeAttribute("aria-activedescendant");
  }
};

const setActiveCommandResult = (index) => {
  const resultButtons = Array.from(commandResults?.querySelectorAll(".command-result") || []);

  if (!currentCommandResults.length || !resultButtons.length) {
    activeCommandIndex = -1;
    setSearchRelationshipPreview(null);
    commandInput?.removeAttribute("aria-activedescendant");
    return;
  }

  activeCommandIndex = (index + currentCommandResults.length) % currentCommandResults.length;

  resultButtons.forEach((button, buttonIndex) => {
    const isActive = buttonIndex === activeCommandIndex;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  const activeButton = resultButtons[activeCommandIndex];

  if (activeButton) {
    commandInput?.setAttribute("aria-activedescendant", activeButton.id);
    activeButton.scrollIntoView({ block: "nearest" });
  }

  const activeResult = currentCommandResults[activeCommandIndex];
  setSearchRelationshipPreview(
    activeResult?.type === "node" ? activeResult.id : null,
  );
};

const clearSearchHighlight = () => {
  mapButtons.forEach((button) => button.classList.remove("is-search-miss"));
  syncMapNodeAvailability();
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

  syncMapNodeAvailability();
  const navigableItems = getNavigableMapItems();

  if (!navigableItems.some((item) => item.id === rovingMapId) && navigableItems[0]) {
    setMapRovingId(navigableItems[0].id);
  }
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
  activeCommandIndex = -1;
  commandInput?.removeAttribute("aria-activedescendant");
  commandResults.replaceChildren();
  setCommandStatus("");

  if (!currentCommandResults.length) {
    setSearchRelationshipPreview(null);
    setCommandOpen(false);
    setCommandStatus("Ничего не\u00a0нашлось — попробуйте другое слово");
    return;
  }

  currentCommandResults.forEach((result) => {
    const button = document.createElement("button");
    const title = document.createElement("span");
    const meta = document.createElement("span");
    const mark = document.createElement("span");

    button.type = "button";
    button.className = "command-result";
    button.id = `command-result-${result.type}-${result.id}`;
    button.tabIndex = -1;
    button.dataset.resultType = result.type;
    button.dataset.resultId = result.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");

    title.textContent = typographUiText(result.title);
    meta.textContent = typographUiText(result.meta);
    mark.className = "command-result__mark";
    mark.classList.add(
      result.type === "node"
        ? "command-result__mark--node"
        : "command-result__mark--panel",
    );
    mark.textContent = "";
    mark.setAttribute("aria-hidden", "true");

    button.append(title, meta, mark);
    commandResults.append(button);
  });

  setActiveCommandResult(0);
  setCommandOpen(true);
};

const runCommandResult = (result) => {
  if (!result) {
    return;
  }

  if (result.type === "node") {
    setMapFilter("all");
    selectMapItem(result.id, { reveal: true });
    window.requestAnimationFrame(() => inspectorClose?.focus());

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
  hideMapPreview({ immediate: true });
  setInspectorOpen(false);
  renderCommandResults(commandInput.value);
});

commandInput?.addEventListener("input", () => {
  applySearchHighlight(commandInput.value);
  renderCommandResults(commandInput.value);
});

commandInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    runCommandResult(
      currentCommandResults[activeCommandIndex]
      || currentCommandResults[0]
      || getCommandResults(commandInput.value)[0],
    );
    return;
  }

  if (!["ArrowDown", "ArrowUp"].includes(event.key)) {
    return;
  }

  event.preventDefault();

  if (!commandForm?.classList.contains("is-open")) {
    renderCommandResults(commandInput.value);
  }

  if (!currentCommandResults.length) {
    return;
  }

  setActiveCommandResult(activeCommandIndex + (event.key === "ArrowDown" ? 1 : -1));
});

commandInput?.addEventListener("blur", () => {
  window.setTimeout(() => {
    setCommandOpen(false);
    setCommandStatus("");
  }, 120);
});

commandResults?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
});

commandResults?.addEventListener("pointermove", (event) => {
  const button = event.target.closest(".command-result");

  if (!button) {
    return;
  }

  const resultButtons = Array.from(commandResults.querySelectorAll(".command-result"));
  const resultIndex = resultButtons.indexOf(button);

  if (resultIndex >= 0 && resultIndex !== activeCommandIndex) {
    setActiveCommandResult(resultIndex);
  }
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
  runCommandResult(
    currentCommandResults[activeCommandIndex]
    || currentCommandResults[0]
    || getCommandResults(commandInput?.value || "")[0],
  );
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (activePreviewItem || mapPreview?.classList.contains("is-visible")) {
    hideMapPreview({ immediate: true });
  } else if (isConstellationNavOpen) {
    setConstellationNavOpen(false);
    constellationNavToggle?.focus();
  } else if (activePanelView) {
    closeContentPanel();
  } else if (mapInspector?.classList.contains("is-open")) {
    setInspectorOpen(false);
    mapButtons.get(selectedMapId)?.focus();
  } else {
    setCommandOpen(false);
    setCommandStatus("");
    commandInput?.blur();
    clearSearchHighlight();
  }
});

if (["#work", "#approach", "#contact"].includes(window.location.hash)) {
  openContentPanel(window.location.hash.slice(1));
}

const siteFavicon = document.querySelector("#site-favicon");
const faviconCanvas = document.createElement("canvas");
const faviconContext = faviconCanvas.getContext("2d");
let faviconFrameIndex = 0;
let faviconFrameTimer = 0;

faviconCanvas.width = 64;
faviconCanvas.height = 64;

const getFaviconArcPoint = (progress) => {
  const inverse = 1 - progress;
  return {
    x: (
      (inverse ** 3 * 4)
      + (3 * inverse ** 2 * progress * 16)
      + (3 * inverse * progress ** 2 * 44)
      + (progress ** 3 * 61)
    ),
    y: (
      (inverse ** 3 * 48)
      + (3 * inverse ** 2 * progress * 24)
      + (3 * inverse * progress ** 2 * 17)
      + (progress ** 3 * 31)
    ),
  };
};

const drawFaviconFrame = (frameIndex = 0) => {
  if (!siteFavicon || !faviconContext) {
    return;
  }

  const phase = (frameIndex % 48) / 48;
  const pulse = Math.sin(phase * Math.PI * 2);
  faviconContext.clearRect(0, 0, 64, 64);

  faviconContext.save();
  faviconContext.beginPath();
  faviconContext.moveTo(4, 48);
  faviconContext.bezierCurveTo(16, 24, 44, 17, 61, 31);
  faviconContext.lineCap = "square";
  faviconContext.lineWidth = 2.6;
  faviconContext.strokeStyle = "#315dff";
  faviconContext.globalAlpha = 0.34;
  faviconContext.stroke();
  faviconContext.restore();

  faviconContext.save();
  faviconContext.beginPath();
  faviconContext.moveTo(7, 40);
  faviconContext.bezierCurveTo(20, 23, 43, 19, 58, 29);
  faviconContext.setLineDash([2, 5]);
  faviconContext.lineCap = "square";
  faviconContext.lineWidth = 2.4;
  faviconContext.strokeStyle = "#315dff";
  faviconContext.globalAlpha = 0.48;
  faviconContext.stroke();
  faviconContext.restore();

  [
    { lag: 0, size: 9, alpha: 1 },
    { lag: 0.065, size: 6, alpha: 0.58 },
    { lag: 0.13, size: 4, alpha: 0.3 },
  ].forEach(({ lag, size, alpha }) => {
    const progress = (phase - lag + 1) % 1;
    const point = getFaviconArcPoint(progress);
    faviconContext.fillStyle = "#315dff";
    faviconContext.globalAlpha = alpha;
    faviconContext.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  });

  faviconContext.fillStyle = "#315dff";
  faviconContext.globalAlpha = 0.18 + ((pulse + 1) * 0.03);
  faviconContext.beginPath();
  faviconContext.arc(34, 21, 6.5, 0, Math.PI * 2);
  faviconContext.fill();

  faviconContext.globalAlpha = 1;
  faviconContext.beginPath();
  faviconContext.arc(34, 21, 3.15 + pulse * 0.72, 0, Math.PI * 2);
  faviconContext.fill();

  faviconContext.strokeStyle = "#315dff";
  faviconContext.lineCap = "square";
  faviconContext.lineWidth = 3;
  faviconContext.beginPath();
  faviconContext.moveTo(26, 21);
  faviconContext.lineTo(42, 21);
  faviconContext.moveTo(34, 13);
  faviconContext.lineTo(34, 29);
  faviconContext.stroke();

  faviconContext.globalAlpha = 0.62 + pulse * 0.18;
  faviconContext.fillRect(12, 32, 4, 4);
  faviconContext.globalAlpha = 0.62 - pulse * 0.18;
  faviconContext.fillRect(52, 27, 4, 4);
  faviconContext.globalAlpha = 1;

  siteFavicon.href = faviconCanvas.toDataURL("image/png");
};

const stopFaviconMotion = () => {
  window.clearInterval(faviconFrameTimer);
  faviconFrameTimer = 0;
};

const syncFaviconMotion = () => {
  stopFaviconMotion();

  if (
    !siteFavicon
    || !faviconContext
    || reducedMotion.matches
    || captureMode
  ) {
    if (reducedMotion.matches || captureMode) {
      drawFaviconFrame(0);
    }
    return;
  }

  drawFaviconFrame(faviconFrameIndex);
  const frameStep = document.hidden ? 3 : 1;
  const frameInterval = document.hidden ? 240 : 80;
  faviconFrameTimer = window.setInterval(() => {
    faviconFrameIndex = (faviconFrameIndex + frameStep) % 48;
    drawFaviconFrame(faviconFrameIndex);
  }, frameInterval);
};

if (siteFavicon && faviconContext) {
  syncFaviconMotion();
  reducedMotion.addEventListener?.("change", syncFaviconMotion);
}

document.addEventListener("visibilitychange", () => {
  syncFaviconMotion();

  if (document.hidden) {
    window.cancelAnimationFrame(signalFrame);
    mapPreviewVideo?.pause();
  } else if (!reducedMotion.matches && !captureMode) {
    signalStartedAt = performance.now();
    signalFrame = window.requestAnimationFrame(renderSignalConstellation);
  }
});
