// Runtime layer 7/7: dynamic favicon and visibility lifecycle.
const siteFavicon = document.querySelector("#site-favicon");
const faviconCanvas = document.createElement("canvas");
const faviconContext = faviconCanvas.getContext("2d");
let faviconFrameIndex = 0;
let faviconFrameTimer = 0;
const faviconFrameCount = 36;

faviconCanvas.width = 64;
faviconCanvas.height = 64;

const faviconArc = {
  start: { x: 3, y: 56 },
  controlA: { x: 15, y: 17 },
  controlB: { x: 43, y: 7 },
  end: { x: 61, y: 35 },
};

const getFaviconArcPoint = (progress) => {
  const inverse = 1 - progress;
  return {
    x:
      inverse ** 3 * faviconArc.start.x
      + 3 * inverse ** 2 * progress * faviconArc.controlA.x
      + 3 * inverse * progress ** 2 * faviconArc.controlB.x
      + progress ** 3 * faviconArc.end.x,
    y:
      inverse ** 3 * faviconArc.start.y
      + 3 * inverse ** 2 * progress * faviconArc.controlA.y
      + 3 * inverse * progress ** 2 * faviconArc.controlB.y
      + progress ** 3 * faviconArc.end.y,
  };
};

const drawFaviconArc = ({ dash, offset, width, alpha }) => {
  faviconContext.save();
  faviconContext.beginPath();
  faviconContext.moveTo(faviconArc.start.x, faviconArc.start.y);
  faviconContext.bezierCurveTo(
    faviconArc.controlA.x,
    faviconArc.controlA.y,
    faviconArc.controlB.x,
    faviconArc.controlB.y,
    faviconArc.end.x,
    faviconArc.end.y,
  );
  faviconContext.setLineDash(dash);
  faviconContext.lineDashOffset = offset;
  faviconContext.lineCap = "square";
  faviconContext.lineJoin = "bevel";
  faviconContext.lineWidth = width;
  faviconContext.strokeStyle = "#315dff";
  faviconContext.globalAlpha = alpha;
  faviconContext.stroke();
  faviconContext.restore();
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
  faviconContext.clearRect(0, 0, 64, 64);

  drawFaviconArc({
    dash: [],
    offset: 0,
    width: 2.1,
    alpha: 0.62,
  });
  drawFaviconArc({
    dash: [3.2, 2.6],
    offset: phase * -26,
    width: 3.8,
    alpha: 1,
  });
  drawFaviconArc({
    dash: [1.2, 4.2],
    offset: phase * 14,
    width: 2,
    alpha: 0.72,
  });

  const particles = [
    [0.1, 4, false],
    [0.2, 7, true],
    [0.31, 4, false],
    [0.43, 6, true],
    [0.56, 8, true],
    [0.68, 6, true],
    [0.79, 4, false],
    [0.9, 5, true],
    [0.97, 4, false],
  ];

  particles.forEach(([baseProgress, size, cross], index) => {
    const travel = Math.sin(phase * Math.PI * 2 + index * 0.82) * 0.012;
    const point = getFaviconArcPoint(
      Math.max(0.05, Math.min(0.98, baseProgress + travel)),
    );
    const alpha = 0.72
      + (Math.sin(phase * Math.PI * 2 + index * 1.16) + 1) * 0.14;
    drawFaviconParticle(point, size, cross, alpha);
  });

  const beaconProgress = (phase * 1.08) % 1;
  [
    { lag: 0.065, size: 3, alpha: 0.34 },
    { lag: 0.038, size: 4, alpha: 0.56 },
    { lag: 0, size: 7, alpha: 1, cross: true },
  ].forEach(({ lag, size, alpha, cross = false }) => {
    drawFaviconParticle(
      getFaviconArcPoint((beaconProgress - lag + 1) % 1),
      size,
      cross,
      alpha,
    );
  });

  drawFaviconParticle({ x: 6, y: 59 }, 3, false, 0.62 + pulse * 0.08);
  drawFaviconParticle({ x: 58, y: 41 }, 3, false, 0.62 - pulse * 0.08);

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
    root.dataset.faviconMotion = "paused";
    return;
  }

  if (document.hidden) {
    drawFaviconFrame(faviconFrameIndex);
    root.dataset.faviconMotion = "paused";
    return;
  }

  root.dataset.faviconMotion = "running";
  drawFaviconFrame(faviconFrameIndex);
  faviconFrameTimer = window.setInterval(() => {
    faviconFrameIndex = (faviconFrameIndex + 1) % faviconFrameCount;
    drawFaviconFrame(faviconFrameIndex);
  }, 160);
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
