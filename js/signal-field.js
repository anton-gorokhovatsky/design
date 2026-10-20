// decorative signal field and depth-grid renderer.
import {
  captureMode,
  reducedMotion,
  root,
} from "./preferences.js";
import { composeCipher } from "./cipher-field.js";

let blackHoleProjection = null;

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
  const signalStyle = getComputedStyle(root);
  const signalColor = signalStyle.getPropertyValue("--signal").trim() || "#2448ed";
  const signalFont = signalStyle.getPropertyValue("--font-ascii").trim();
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

    const point = {
      x: xAfterZ * perspective,
      y: yAfterZ * perspective,
      z: zAfterY,
      perspective,
    };
    blackHoleProjection?.(point);
    return point;
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
  signalContext.shadowBlur = 0;
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

  const renderedPoints = composeCipher(projectedPoints, fieldScale);
  renderedPoints.sort((pointA, pointB) => pointA.z - pointB.z);

  let currentFontSize = 0;

  for (const point of renderedPoints) {
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
      signalContext.font = `${fontSize}px ${signalFont}`;
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
  if (root.hasAttribute("data-celestial-paused")) { signalFrame = 0; return; }
  const renderInterval = signalDrag.active ? 15 : 30;

  if (time - lastSignalRender > renderInterval || time === 0) {
    drawSignalConstellation(time);
    lastSignalRender = time;
  }

  if (!reducedMotion.matches && !captureMode) {
    signalFrame = window.requestAnimationFrame(renderSignalConstellation);
  }
};

const pauseSignalConstellation = () => {
  window.cancelAnimationFrame(signalFrame);
  signalFrame = 0;
};

const resumeSignalConstellation = () => {
  if (
    !signalConstellation
    || document.hidden
    || root.hasAttribute("data-celestial-paused")
    || reducedMotion.matches
    || captureMode
  ) {
    return;
  }

  pauseSignalConstellation();
  signalStartedAt = performance.now();
  signalLastFrameAt = signalStartedAt;
  signalFrame = window.requestAnimationFrame(renderSignalConstellation);
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

const resetSignalParallax = () => {
  [
    "--core-x",
    "--core-y",
    "--depth-x",
    "--depth-y",
    "--layer-far-x",
    "--layer-far-y",
    "--layer-mid-x",
    "--layer-mid-y",
    "--layer-near-x",
    "--layer-near-y",
  ].forEach((property) => signalField?.style.setProperty(property, "0px"));
};

reducedMotion.addEventListener?.("change", () => {
  pauseSignalConstellation();
  signalAngularVelocity.x = 0;
  signalAngularVelocity.y = 0;

  if (reducedMotion.matches || captureMode) {
    resetSignalParallax();
    drawSignalConstellation(0);
    return;
  }

  if (!document.hidden) {
    resumeSignalConstellation();
  }
});

window.addEventListener("resize", () => {
  resizeSignalConstellation();
  drawSignalConstellation();
});

new MutationObserver(() => drawSignalConstellation()).observe(root, {
  attributes: true,
  attributeFilter: ["data-theme", "data-contrast"],
});

new MutationObserver(() => {
  if (root.hasAttribute("data-celestial-paused")) pauseSignalConstellation();
  else resumeSignalConstellation();
}).observe(root, { attributes: true, attributeFilter: ["data-celestial-paused"] });

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

// Accepted screen-space lens: shared projection for grid, axes and signal field.
// It tracks existing layout transitions; no idle animation loop is introduced.
const initializeBlackHoleLens = () => {
  const model = { strength: 0, cx: 0, cy: 0, core: 0, signalBounds: null };
  // A softened point-lens displacement with compact C2 support. R = 7 core radii;
  // p' = c + (p-c) [1 + E²/(r²+s²) (1-r²/R²)^3], for r<R.
  // E=1.35a, s=.9a. Finite at the centre; displacement and two derivatives
  // vanish at R. This is an illustrative screen mapping, not a GR simulation.
  const warp = (x, y) => {
    if (!model.core || !model.strength) return { x, y };
    const dx=x-model.cx,dy=y-model.cy,r2=dx*dx+dy*dy,a2=model.core*model.core,R2=49*a2;
    if(r2>=R2)return {x,y};
    const envelope=1-r2/R2;
    const gain=model.strength*1.8225*a2/(r2+.81*a2)*envelope*envelope*envelope;
    return {x:x+dx*gain,y:y+dy*gain};
  };
  const project=(point)=>{
    const {x,y}=point;
    const box=model.signalBounds;
    if(!box)return;
    const p=warp(box.x+(x+box.width/2)*box.sx,box.y+(y+box.height/2)*box.sy);
    point.x=(p.x-box.x)/box.sx-box.width/2;point.y=(p.y-box.y)/box.sy-box.height/2;
  };
  const garage=document.querySelector('[data-map-id="garage"]'),field=document.querySelector('.map-grid'),signal=document.querySelector('.signal-constellation');
  if(!garage||!field)return;
  const ns=svgNamespace,forced=matchMedia('(forced-colors: active)'),map=document.querySelector('[data-practice-map]');
  const available=()=>!document.hidden&&!forced.matches&&!root.hasAttribute('data-celestial-paused')&&!map.hasAttribute('data-time-view')&&garage.getAttribute('aria-hidden')!=='true';
  let signalState='';
  let grid,gridPath;
  {
    grid=document.createElementNS(ns,'svg');grid.setAttribute('aria-hidden','true');
    grid.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
    gridPath=document.createElementNS(ns,'path');gridPath.setAttribute('fill','none');gridPath.setAttribute('stroke-width','1');
    grid.append(gridPath);field.append(grid);field.style.backgroundImage='none';
  }
  const line=(x1,y1,x2,y2,b,w,h)=>{
    const steps=Math.max(2,Math.ceil(Math.hypot(x2-x1,y2-y1)/4));let d='';
    for(let i=0;i<=steps;i++){
      const t=i/steps,p=warp(b.x+(x1+(x2-x1)*t)*b.width/w,b.y+(y1+(y2-y1)*t)*b.height/h);
      d+=(i?'L':'M')+((p.x-b.x)*w/b.width).toFixed(2)+' '+((p.y-b.y)*h/b.height).toFixed(2);
    }
    return d;
  };
  const axes=[...document.querySelectorAll('.map-axis')].map(el=>{
    const svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
    svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
    path.setAttribute('fill','none');path.setAttribute('stroke-width','1');svg.append(path);el.append(svg);
    el.style.background='none';
    return {el,svg,path};
  });
  // Fade only Garage relations near the visible shadow. Keeping one mask
  // preserves the existing keyed paths, their curves and hover morphs.
  const links=document.querySelector('[data-map-links]');
  let rayMask,rayFade;
  if(links){
    const defs=document.createElementNS(ns,'defs');
    const gradient=document.createElementNS(ns,'radialGradient');
    gradient.id='garage-ray-fade';
    for(let i=0;i<=8;i++){
      const stop=document.createElementNS(ns,'stop'),t=i/8,light=t*t*(3-2*t);
      stop.setAttribute('stop-color',`rgb(${light*255} ${light*255} ${light*255})`);
      gradient.append(stop);
    }
    rayMask=document.createElementNS(ns,'mask');rayMask.id='garage-ray-mask';
    rayMask.setAttribute('maskUnits','userSpaceOnUse');rayMask.setAttribute('maskContentUnits','userSpaceOnUse');
    rayMask.setAttribute('x','0');rayMask.setAttribute('y','0');rayMask.setAttribute('width','100');rayMask.setAttribute('height','100');
    rayMask.style.maskType='luminance';
    const background=document.createElementNS(ns,'rect');
    background.setAttribute('width','100');background.setAttribute('height','100');background.setAttribute('fill','white');
    rayFade=document.createElementNS(ns,'ellipse');rayFade.setAttribute('fill','url(#garage-ray-fade)');
    rayMask.append(background,rayFade);defs.append(gradient,rayMask);links.prepend(defs);
  }
  const updateRayFade=()=>{
    if(!rayMask)return;
    const b=links.getBoundingClientRect();if(!b.width||!b.height)return;
    const inner=model.core+3,outer=inner+Math.min(18,Math.max(8,model.core*.75));
    rayFade.setAttribute('cx',(model.cx-b.x)*100/b.width);rayFade.setAttribute('cy',(model.cy-b.y)*100/b.height);
    rayFade.setAttribute('rx',outer*100/b.width);rayFade.setAttribute('ry',outer*100/b.height);
    links.querySelectorAll('#garage-ray-fade stop').forEach((stop,i)=>stop.setAttribute('offset',(inner+(outer-inner)*i/8)/outer));
    links.querySelectorAll('path[data-parent-id="garage"]').forEach(path=>{
      if(!path.hasAttribute('mask'))path.setAttribute('mask','url(#garage-ray-mask)');
    });
  };
  const update=()=>{
    const canvas=garage.querySelector('.celestial-volume--garage');
    if(!canvas)return;
    const c=canvas.getBoundingClientRect();model.cx=c.x+c.width/2;model.cy=c.y+c.height/2;model.core=c.width*.434/2.7;
    if(!available())model.core=0;
    if(signal&&signal.clientWidth&&signal.clientHeight){const b=signal.getBoundingClientRect();model.signalBounds={x:b.x,y:b.y,width:signal.clientWidth,height:signal.clientHeight,sx:b.width/signal.clientWidth,sy:b.height/signal.clientHeight};}
    if(grid&&field.clientWidth&&field.clientHeight){
      const b=field.getBoundingClientRect(),w=field.clientWidth,h=field.clientHeight;
      grid.setAttribute('viewBox',`0 0 ${w} ${h}`);
      let d='';
      // Match the phase and spacing of the existing centred CSS grid.
      for(let i=-1;i<=8;i++){const x=w*.0625+i*w*.125;d+=line(x,0,x,h,b,w,h);}
      for(let i=-1;i<=4;i++){const y=h*.125+i*h*.25;d+=line(0,y,w,y,b,w,h);}
      gridPath.setAttribute('d',d);gridPath.setAttribute('stroke',getComputedStyle(document.documentElement).getPropertyValue('--line-soft').trim());
      axes.forEach(({el,svg,path})=>{
        const b=el.getBoundingClientRect(),w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;
        svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
        path.setAttribute('d',w>h?line(0,.5,w,.5,b,w,h):line(.5,0,.5,h,b,w,h));
        path.setAttribute('stroke',getComputedStyle(document.documentElement).getPropertyValue('--line').trim());
      });
    }
    updateRayFade();
    blackHoleProjection=model.strength&&model.core?project:null;
    const state=[model.cx,model.cy,model.core,model.strength,signal?.clientWidth,signal?.clientHeight].join(',');
    if(state!==signalState&&(reducedMotion.matches||captureMode||root.hasAttribute('data-celestial-paused')))drawSignalConstellation();
    signalState=state;
  };
  let frame=0,until=0,hovered=false;
  let tween={from:0,to:0,start:0,duration:0};
  const reduceMotion=()=>reducedMotion.matches;
  const sample=time=>{
    const t=tween.duration?Math.min(1,Math.max(0,(time-tween.start)/tween.duration)):1;
    model.strength=tween.from+(tween.to-tween.from)*(1-(1-t)**3);
  };
  const tick=time=>{frame=0;sample(time);update();if(time<until&&!document.hidden)frame=requestAnimationFrame(tick)};
  const schedule=(duration=1000)=>{until=Math.max(until,performance.now()+duration);if(!frame)frame=requestAnimationFrame(tick)};
  const syncInteraction=()=>{
    const now=performance.now(),target=available()&&(hovered||garage.matches(':focus-visible'))?1:0;
    sample(now);
    if(target!==tween.to||reduceMotion()){
      tween={from:model.strength,to:target,start:now,duration:reduceMotion()?0:target?320:260};
      sample(now);
      if(reduceMotion())update();
    }
    schedule();
  };
  new ResizeObserver(()=>schedule()).observe(field);
  new MutationObserver(records=>{
    if(records.some(record=>['data-reduce-motion','data-celestial-paused'].includes(record.attributeName)))syncInteraction();
    else schedule();
  }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-celestial-volume','data-reduce-motion','data-celestial-paused']});
  reducedMotion.addEventListener('change',syncInteraction);
  forced.addEventListener('change',syncInteraction);
  new MutationObserver(syncInteraction).observe(map,{attributes:true,attributeFilter:['data-time-view','data-active-kind']});
  new MutationObserver(syncInteraction).observe(garage,{attributes:true,attributeFilter:['aria-hidden']});
  document.querySelector('.map-camera').addEventListener('transitionrun',event=>{
    if(event.propertyName==='transform'&&event.target.matches('.map-camera,.map-grid,.map-nodes,.map-links,[data-map-id="garage"],[data-map-id="garage"] .map-node__glyph'))schedule(1100);
  });
  garage.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'){hovered=true;syncInteraction()}});
  const leave=()=>{hovered=false;syncInteraction()};
  garage.addEventListener('pointerleave',leave);garage.addEventListener('pointercancel',leave);
  garage.addEventListener('focus',syncInteraction);garage.addEventListener('blur',syncInteraction);
  addEventListener('resize',()=>schedule());
  const suspend=()=>{
    cancelAnimationFrame(frame);frame=0;until=0;hovered=false;
    tween={from:0,to:0,start:0,duration:0};model.strength=0;blackHoleProjection=null;
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else syncInteraction()});
  addEventListener('pagehide',suspend);addEventListener('pageshow',syncInteraction);
  schedule(1100);
};

export {
  initializeBlackHoleLens,
  pauseSignalConstellation,
  resumeSignalConstellation,
  signalField,
  svgNamespace,
};
