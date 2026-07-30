#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const artifactDirectory = resolve(
  process.env.PORTFOLIO_REEL_QA_ARTIFACT_DIR
    || join(os.tmpdir(), "portfolio-reel-preview-11111"),
);
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { startStaticServer } = require("./browser-contracts.cjs");

const expected = {
  mapId: "eleven",
  index: "11 / 13",
  titleFragments: ["11 111", "Виктора Доронина"],
  meta: "ИСТОРИЯ, ЦЕЛЬ И МАСШТАБ / 00:08",
  videoPath: "/assets/reels/11111.mp4",
  posterPath: "/assets/reel-posters/11111.jpg",
  width: 900,
  height: 600,
};
const failures = [];
const runtimeErrors = [];
const normalizeText = (value) => value.replace(/\u00a0/g, " ").trim();
const { origin, server } = await startStaticServer({ projectRoot });
mkdirSync(artifactDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--force-color-profile=srgb",
    "--mute-audio",
    "--no-sandbox",
    "--no-default-browser-check",
    "--no-first-run",
  ],
});

let report;

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.route("https://mc.yandex.ru/**", (route) => route.abort());
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const intentionalMediaCancellation = request.resourceType() === "media"
      && /aborted|cancelled/i.test(failure?.errorText || "");
    const intentionalAnalyticsBlock = request.url().startsWith("https://mc.yandex.ru/");

    if (!intentionalMediaCancellation && !intentionalAnalyticsBlock) {
      runtimeErrors.push(
        `requestfailed: ${request.url()} — ${failure?.errorText || "unknown"}`,
      );
    }
  });

  await page.goto(`${origin}/?qa=reel-preview-11111`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts?.ready);
  await page.locator(`[data-map-id="${expected.mapId}"]`).hover({ force: true });
  await page.locator(".map-hover-preview.is-visible").waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.waitForFunction(() => (
    document.querySelector(".map-hover-preview")
      ?.classList.contains("is-video-ready")
  ), null, { timeout: 15000 });
  await page.waitForTimeout(350);

  report = await page.evaluate(() => {
    const preview = document.querySelector(".map-hover-preview");
    const media = preview?.querySelector(".map-hover-preview__media");
    const video = media?.querySelector("video");
    const bounds = media?.getBoundingClientRect();
    const videoStyle = video ? getComputedStyle(video) : null;

    return {
      visible: preview?.classList.contains("is-visible") || false,
      videoReady: preview?.classList.contains("is-video-ready") || false,
      ariaHidden: preview?.getAttribute("aria-hidden") || "",
      index: preview?.querySelector(".map-hover-preview__index")
        ?.textContent.trim() || "",
      title: preview?.querySelector(".map-hover-preview__readout strong")
        ?.textContent.trim() || "",
      meta: preview?.querySelector(".map-hover-preview__readout > span:last-child")
        ?.textContent.trim() || "",
      mediaRatio: bounds?.width && bounds?.height
        ? bounds.width / bounds.height
        : 0,
      objectFit: videoStyle?.objectFit || "",
      objectPosition: videoStyle?.objectPosition || "",
      currentSrc: video?.currentSrc || "",
      poster: video?.poster || "",
      readyState: video?.readyState || 0,
      videoWidth: video?.videoWidth || 0,
      videoHeight: video?.videoHeight || 0,
      duration: video?.duration || 0,
    };
  });

  const videoUrl = new URL(report.currentSrc);
  const posterUrl = new URL(report.poster);
  const durationFits = report.duration >= 7.5 && report.duration <= 8.2;

  if (!report.visible || !report.videoReady || report.ariaHidden !== "true") {
    failures.push("the decorative hover receiver is not visibly video-ready");
  }
  if (
    report.index !== expected.index
    || !expected.titleFragments.every((fragment) => report.title.includes(fragment))
    || normalizeText(report.meta) !== expected.meta
  ) {
    failures.push("the 11 111 readout identity changed");
  }
  if (
    videoUrl.pathname !== expected.videoPath
    || posterUrl.pathname !== expected.posterPath
  ) {
    failures.push("the 11 111 receiver points to the wrong video or poster");
  }
  if (
    report.videoWidth !== expected.width
    || report.videoHeight !== expected.height
    || Math.abs(report.mediaRatio - 1.5) > 0.02
    || report.objectFit !== "contain"
    || report.objectPosition !== "50% 0%"
    || !durationFits
  ) {
    failures.push("the 11 111 receiver lost its native 3:2 reel geometry");
  }
  failures.push(...runtimeErrors);

  await page.screenshot({
    path: join(artifactDirectory, "11111-hover-full.png"),
    fullPage: false,
  });
  await page.locator(".map-hover-preview").screenshot({
    path: join(artifactDirectory, "11111-hover-preview.png"),
  });
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

writeFileSync(
  join(artifactDirectory, "11111-hover-report.json"),
  `${JSON.stringify({ failures, report }, null, 2)}\n`,
);

if (failures.length > 0) {
  console.error("11 111 reel preview contract failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `11 111 reel preview passed: ${report.videoWidth}×${report.videoHeight}, `
    + `${report.duration.toFixed(2)}s, ${expected.index}; `
    + `artifacts ${artifactDirectory}`,
);
