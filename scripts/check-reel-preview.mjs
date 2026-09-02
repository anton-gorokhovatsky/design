#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const reelId = process.argv[2] || "eleven";
const expectedById = new Map([
  ["eleven", {
    mapId: "eleven",
    artifactId: "11111",
    index: "15 / 17",
    titleFragments: ["11 111", "Виктора Доронина"],
    meta: "ИСТОРИЯ, ЦЕЛЬ И МАСШТАБ / 00:12",
    videoPath: "/assets/reels/11111.mp4",
    posterPath: "/assets/reel-posters/11111.jpg",
    chapterPaths: [
      "/assets/reel-chapters/11111-01.mp4",
      "/assets/reel-chapters/11111-02.mp4",
    ],
    width: 900,
    height: 600,
    duration: { min: 11.5, max: 12.1 },
  }],
  ["narkomfin", {
    mapId: "narkomfin",
    artifactId: "narkomfin",
    index: "02 / 17",
    titleFragments: ["ДОМ НАРКОМФИНА"],
    meta: "МОДЕЛЬ, РАЗДЕЛЫ И ТЕМЫ / 00:13",
    videoPath: "/assets/reels/narkomfin.mp4",
    posterPath: "/assets/reel-posters/narkomfin.jpg",
    chapterPaths: [
      "/assets/reel-chapters/narkomfin-01.mp4",
      "/assets/reel-chapters/narkomfin-02.mp4",
    ],
    width: 900,
    height: 600,
    duration: { min: 12.9, max: 13.5 },
  }],
  ["garage-archives", {
    mapId: "garage-archives",
    artifactId: "garage-archives",
    index: "04 / 17",
    titleFragments: ["АРХИВНЫЕ ПРОЕКТЫ"],
    meta: "КАТАЛОГ, ПОИСК И АРХИВНЫЕ МАТЕРИАЛЫ / 00:12",
    videoPath: "/assets/reels/garage-archives.mp4",
    posterPath: "/assets/reel-posters/garage-archives.jpg",
    chapterPaths: [
      "/assets/reel-chapters/garage-archives-01.mp4",
      "/assets/reel-chapters/garage-archives-02.mp4",
    ],
    width: 900,
    height: 600,
    duration: { min: 11.5, max: 12.1 },
  }],
  ["garage-webzine", {
    mapId: "garage-webzine",
    artifactId: "garage-webzine",
    index: "06 / 17",
    titleFragments: ["НЕЧЕЛОВЕЧЕСКИЕ ЖИВОТНЫЕ", "ТЕХНИКА"],
    meta: "ГЛАВНАЯ, ТЕКСТ И ТЁМНАЯ ТЕМА / 00:12",
    videoPath: "/assets/reels/garage-webzine.mp4",
    posterPath: "/assets/reel-posters/garage-webzine.jpg",
    chapterPaths: [
      "/assets/reel-chapters/garage-webzine-01.mp4",
      "/assets/reel-chapters/garage-webzine-02.mp4",
    ],
    width: 900,
    height: 600,
    duration: { min: 12.1, max: 12.7 },
  }],
  ["garage-institutions", {
    mapId: "garage-institutions",
    artifactId: "garage-institutions",
    index: "07 / 17",
    titleFragments: ["ПОМОЩЬ КУЛЬТУРНЫМ ИНСТИТУЦИЯМ"],
    meta: "СОБЫТИЯ, НАПРАВЛЕНИЯ И ПОСЕЩЕНИЕ / 00:12",
    videoPath: "/assets/reels/garage-institutions.mp4",
    posterPath: "/assets/reel-posters/garage-institutions.jpg",
    chapterPaths: [
      "/assets/reel-chapters/garage-institutions-01.mp4",
      "/assets/reel-chapters/garage-institutions-02.mp4",
    ],
    width: 900,
    height: 600,
    duration: { min: 11.3, max: 11.9 },
  }],
  ["garage-endowment", {
    mapId: "garage-endowment",
    artifactId: "garage-endowment",
    index: "08 / 17",
    titleFragments: ["ЭНДАУМЕНТ-ФОНД МУЗЕЯ"],
    meta: "МИССИЯ, ЦЕЛЕВЫЕ КАПИТАЛЫ И ПОЖЕРТВОВАНИЕ / 00:11",
    videoPath: "/assets/reels/garage-endowment.mp4",
    posterPath: "/assets/reel-posters/garage-endowment.jpg",
    chapterPaths: [
      "/assets/reel-chapters/garage-endowment-01.mp4",
      "/assets/reel-chapters/garage-endowment-02.mp4",
    ],
    width: 900,
    height: 600,
    duration: { min: 10.5, max: 11.1 },
  }],
  ["shirokostup", {
    mapId: "shirokostup",
    artifactId: "shirokostup",
    index: "09 / 17",
    titleFragments: ["Сайт независимого куратора", "Ольги Широкоступ"],
    meta: "ГЛАВНАЯ, МЕНЮ И ТЁМНАЯ ТЕМА / 00:13",
    videoPath: "/assets/reels/shirokostup.mp4",
    posterPath: "/assets/reel-posters/shirokostup.jpg",
    chapterPaths: [
      "/assets/reel-chapters/shirokostup-01.mp4",
      "/assets/reel-chapters/shirokostup-02.mp4",
    ],
    width: 900,
    height: 600,
    duration: { min: 12.5, max: 13.1 },
  }],
  ["herman", {
    mapId: "herman",
    artifactId: "herman",
    index: "11 / 17",
    titleFragments: ["Сайт стилиста", "Германа Винокурова"],
    meta: "ПРОФИЛЬ, МЕДИА И ПЛЕЙЛИСТЫ / 00:15",
    videoPath: "/assets/reels/herman.mp4",
    posterPath: "/assets/reel-posters/herman.jpg",
    chapterPaths: [
      "/assets/reel-chapters/herman-01.mp4",
      "/assets/reel-chapters/herman-02.mp4",
    ],
    width: 900,
    height: 600,
    duration: { min: 14.5, max: 15.1 },
  }],
  ["hotline-camp", {
    mapId: "hotline-camp",
    artifactId: "hotline-camp",
    index: "12 / 17",
    titleFragments: ["Сайт предстартового кэмпа", "Hotline Camp"],
    meta: "СОЧИНСКАЯ ПАЛИТРА, МЕНЮ И ТРЕНЕРЫ / 00:14",
    videoPath: "/assets/reels/hotline-camp.mp4",
    posterPath: "/assets/reel-posters/hotline-camp.jpg",
    chapterPaths: [
      "/assets/reel-chapters/hotline-camp-01.mp4",
      "/assets/reel-chapters/hotline-camp-02.mp4",
    ],
    width: 900,
    height: 600,
    duration: { min: 13.7, max: 14.1 },
  }],
]);
const expected = expectedById.get(reelId);

if (!expected) {
  throw new Error(
    `Unknown reel preview contract "${reelId}". `
      + `Expected one of: ${[...expectedById.keys()].join(", ")}.`,
  );
}

const artifactDirectory = resolve(
  process.env.PORTFOLIO_REEL_QA_ARTIFACT_DIR
    || join(os.tmpdir(), `portfolio-reel-preview-${expected.artifactId}`),
);
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { startStaticServer } = require("./browser-contracts.cjs");

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

  await page.goto(`${origin}/?reel=mosaic&preview=${expected.mapId}`, {
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
  await page.waitForFunction(() => (
    document.querySelector(".map-hover-preview")
      ?.classList.contains("is-mosaic-ready")
  ), null, { timeout: 15000 });
  await page.waitForTimeout(350);

  report = await page.evaluate(() => {
    const preview = document.querySelector(".map-hover-preview");
    const media = preview?.querySelector(".map-hover-preview__media");
    const video = media?.querySelector("video");
    const bounds = media?.getBoundingClientRect();
    const videoStyle = video ? getComputedStyle(video) : null;
    const chapterVideos = [...preview.querySelectorAll(
      ".map-hover-preview__mosaic-video",
    )];

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
      mosaicActive: preview?.classList.contains("has-reel-mosaic") || false,
      mosaicReady: preview?.classList.contains("is-mosaic-ready") || false,
      chapters: chapterVideos.map((chapterVideo) => {
        const style = getComputedStyle(chapterVideo);

        return {
          currentSrc: chapterVideo.currentSrc || "",
          videoWidth: chapterVideo.videoWidth || 0,
          videoHeight: chapterVideo.videoHeight || 0,
          objectFit: style.objectFit,
          objectPosition: style.objectPosition,
        };
      }),
    };
  });

  const videoUrl = new URL(report.currentSrc);
  const posterUrl = new URL(report.poster);
  const durationFits = report.duration >= expected.duration.min
    && report.duration <= expected.duration.max;

  if (!report.visible || !report.videoReady || report.ariaHidden !== "true") {
    failures.push("the decorative hover receiver is not visibly video-ready");
  }
  if (
    report.index !== expected.index
    || !expected.titleFragments.every((fragment) => report.title.includes(fragment))
    || normalizeText(report.meta) !== expected.meta
  ) {
    failures.push(`the ${expected.artifactId} readout identity changed`);
  }
  if (
    videoUrl.pathname !== expected.videoPath
    || posterUrl.pathname !== expected.posterPath
  ) {
    failures.push(
      `the ${expected.artifactId} receiver points to the wrong video or poster`,
    );
  }
  if (
    report.videoWidth !== expected.width
    || report.videoHeight !== expected.height
    || Math.abs(report.mediaRatio - 1.5) > 0.02
    || report.objectFit !== "contain"
    || report.objectPosition !== "50% 0%"
    || !durationFits
  ) {
    failures.push(
      `the ${expected.artifactId} receiver lost its native 3:2 reel geometry`,
    );
  }

  const chapterPaths = report.chapters.map(({ currentSrc }) => (
    new URL(currentSrc).pathname
  ));
  const chapterGeometryFits = report.chapters.every((chapter) => (
    chapter.videoWidth === 450
    && chapter.videoHeight === 300
    && chapter.objectFit === "contain"
    && chapter.objectPosition === "50% 0%"
  ));

  if (
    !report.mosaicActive
    || !report.mosaicReady
    || chapterPaths.join("|") !== expected.chapterPaths.join("|")
    || !chapterGeometryFits
  ) {
    failures.push(
      `the ${expected.artifactId} mosaic lost its two native 3:2 chapters`,
    );
  }
  failures.push(...runtimeErrors);

  await page.screenshot({
    path: join(artifactDirectory, `${expected.artifactId}-hover-full.png`),
    fullPage: false,
  });
  await page.locator(".map-hover-preview").screenshot({
    path: join(artifactDirectory, `${expected.artifactId}-hover-preview.png`),
  });
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

writeFileSync(
  join(artifactDirectory, `${expected.artifactId}-hover-report.json`),
  `${JSON.stringify({ failures, report }, null, 2)}\n`,
);

if (failures.length > 0) {
  console.error(`${expected.artifactId} reel preview contract failed:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `${expected.artifactId} reel preview passed: ${report.videoWidth}×${report.videoHeight}, `
    + `${report.duration.toFixed(2)}s, ${expected.index}; `
    + `artifacts ${artifactDirectory}`,
);
