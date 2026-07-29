// Runtime layer 7/7: animated variant 01 favicon and visibility lifecycle.
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
    root.dataset.faviconMotion = "static";
    return;
  }

  root.dataset.faviconMotion = "animated";
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
