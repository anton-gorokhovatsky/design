// Runtime layer 6/6: dynamic favicon and visibility lifecycle.
const siteFavicon = document.querySelector("#site-favicon");
const faviconCanvas = document.createElement("canvas");
const faviconContext = faviconCanvas.getContext("2d");
let faviconFrameIndex = 0;
let faviconFrameTimer = 0;
const faviconFrameCount = 36;
const faviconAxisTilt = -18 * Math.PI / 180;

faviconCanvas.width = 64;
faviconCanvas.height = 64;

const tiltFaviconPoint = ({ x, y }) => {
  const offsetX = x - 32;
  const offsetY = y - 32;

  return {
    x: 32
      + offsetX * Math.cos(faviconAxisTilt)
      - offsetY * Math.sin(faviconAxisTilt),
    y: 32
      + offsetX * Math.sin(faviconAxisTilt)
      + offsetY * Math.cos(faviconAxisTilt),
  };
};

const getFaviconSpiralPoint = (progress, arm = 0, drift = 0) => {
  const angle = -0.7 + progress * Math.PI * 2 * 0.86 + arm * Math.PI + drift;
  const radius = 2 + progress * 29;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius * 0.86;

  return tiltFaviconPoint({ x: 32 + x, y: 32 + y });
};

const drawFaviconParticle = (point, size, cross = false, alpha = 1) => {
  faviconContext.save();
  faviconContext.fillStyle = "#315dff";
  faviconContext.strokeStyle = "#315dff";
  faviconContext.globalAlpha = alpha;

  if (cross) {
    faviconContext.lineWidth = Math.max(1.4, size * 0.34);
    faviconContext.beginPath();
    faviconContext.moveTo(point.x - size / 2, point.y);
    faviconContext.lineTo(point.x + size / 2, point.y);
    faviconContext.moveTo(point.x, point.y - size / 2);
    faviconContext.lineTo(point.x, point.y + size / 2);
    faviconContext.stroke();
  } else {
    faviconContext.fillRect(
      Math.round(point.x - size / 2),
      Math.round(point.y - size / 2),
      size,
      size,
    );
  }

  faviconContext.restore();
};

const drawFaviconFrame = (frameIndex = 0) => {
  if (!siteFavicon || !faviconContext) {
    return;
  }

  const phase = (frameIndex % faviconFrameCount) / faviconFrameCount;
  const pulse = Math.sin(phase * Math.PI * 2);
  const drift = pulse * 0.055;
  faviconContext.clearRect(0, 0, 64, 64);

  [0, 1].forEach((arm) => {
    faviconContext.save();
    faviconContext.beginPath();

    for (let index = 0; index <= 44; index += 1) {
      const point = getFaviconSpiralPoint(index / 44, arm, drift);

      if (index === 0) {
        faviconContext.moveTo(point.x, point.y);
      } else {
        faviconContext.lineTo(point.x, point.y);
      }
    }

    faviconContext.lineCap = "square";
    faviconContext.lineJoin = "bevel";
    faviconContext.lineWidth = arm ? 4.2 : 4.8;
    faviconContext.strokeStyle = "#315dff";
    faviconContext.globalAlpha = arm ? 0.9 : 1;
    faviconContext.stroke();
    faviconContext.restore();
  });

  const particles = [
    [0.25, 0, 4, false],
    [0.42, 1, 4, false],
    [0.62, 0, 5, false],
    [0.8, 1, 4, false],
    [0.96, 0, 4, false],
  ];

  particles.forEach(([baseProgress, arm, size, cross], index) => {
    const travel = Math.sin(phase * Math.PI * 2 + index * 0.8) * 0.012;
    const point = getFaviconSpiralPoint(
      Math.max(0.08, Math.min(0.98, baseProgress + travel)),
      arm,
      drift,
    );
    const alpha = 0.56 + (Math.sin(phase * Math.PI * 2 + index * 1.17) + 1) * 0.22;
    drawFaviconParticle(point, size, cross, alpha);
  });

  drawFaviconParticle(tiltFaviconPoint({ x: 32, y: 32 }), 6, false, 1);
  drawFaviconParticle(
    tiltFaviconPoint({ x: 4, y: 13 }),
    3,
    false,
    0.48 + pulse * 0.12,
  );
  drawFaviconParticle(
    tiltFaviconPoint({ x: 58, y: 46 }),
    3,
    false,
    0.48 - pulse * 0.12,
  );
  drawFaviconParticle(tiltFaviconPoint({ x: 54, y: 7 }), 4, false, 0.72);
  drawFaviconParticle(tiltFaviconPoint({ x: 11, y: 52 }), 3, false, 0.62);

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
  const frameStep = document.hidden ? 2 : 1;
  const frameInterval = document.hidden ? 480 : 240;
  faviconFrameTimer = window.setInterval(() => {
    faviconFrameIndex = (faviconFrameIndex + frameStep) % faviconFrameCount;
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
