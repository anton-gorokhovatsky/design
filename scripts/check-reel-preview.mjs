#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reelSpecs, reelFrame, reelChapterFrame, getReelChapterFileName } from "./reel-specs.mjs";
import { mapItems } from "../js/map-data.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const reelId = process.argv[2] || "eleven";
const expectedById = new Map([
  ["krainiuk", {"index":"18 / 18","titleFragments":["Сайт тренера Екатерины Крайнюк"],"meta":"ТРЕНИРОВКИ, КАРТЫ И ТЁМНАЯ ТЕМА / "}],
  ["ks-fish", {"index":"16 / 18","titleFragments":["Сайт «Рыбной лавки капитана Селёдкина»"],"meta":"ГЛАВНАЯ, ЖУРНАЛ И КАТАЛОГ / "}],
  ["eleven", {"index":"15 / 18","titleFragments":["11 111","Виктора Доронина"],"meta":"ПАЛИТРА, ПОГОДА И ВРЕМЯ / "}],
  ["narkomfin", {"index":"02 / 18","titleFragments":["Дом Наркомфина"],"meta":"МОДЕЛЬ, РАЗДЕЛЫ И ТЕМЫ / "}],
  ["garage-archives", {"index":"04 / 18","titleFragments":["Архивные проекты"],"meta":"КАТАЛОГ, ПОИСК И АРХИВНЫЕ МАТЕРИАЛЫ / "}],
  ["garage-webzine", {"index":"06 / 18","titleFragments":["Нечеловеческие животные","техника"],"meta":"ГЛАВНАЯ, ТЕКСТ И ТЁМНАЯ ТЕМА / "}],
  ["garage-institutions", {"index":"07 / 18","titleFragments":["Помощь культурным институциям"],"meta":"СОБЫТИЯ, НАПРАВЛЕНИЯ И ПОСЕЩЕНИЕ / "}],
  ["garage-endowment", {"index":"08 / 18","titleFragments":["Эндаумент-фонд Музея"],"meta":"МИССИЯ, ЦЕЛЕВЫЕ КАПИТАЛЫ И ПОЖЕРТВОВАНИЕ / "}],
  ["shirokostup", {"index":"09 / 18","titleFragments":["Сайт независимого куратора","Ольги Широкоступ"],"meta":"ГЛАВНАЯ, МЕНЮ И ТЁМНАЯ ТЕМА / "}],
  ["herman", {"index":"11 / 18","titleFragments":["Сайт стилиста","Германа Винокурова"],"meta":"ПРОФИЛЬ, МЕДИА И ПЛЕЙЛИСТЫ / "}],
  ["hotline-camp", {"index":"12 / 18","titleFragments":["Сайт предстартового кэмпа","Hotline Camp"],"meta":"СОЧИНСКАЯ ПАЛИТРА, МЕНЮ И ТРЕНЕРЫ / "}],
].map(([mapId, identity]) => {
  const spec = reelSpecs.find(item => item.itemId === mapId);
  const seconds = Math.round(mapItems.find(item => item.id === mapId).previewDuration);
  const time = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
  return [mapId, { ...identity, mapId, artifactId: spec.master.slice(0, -4),
    meta: identity.meta + time, videoPath: "/assets/reels/" + spec.master,
    posterPath: "/assets/reel-posters/" + spec.master.slice(0, -4) + ".jpg",
    chapterPaths: spec.chapters.map((_, i) => "/assets/reel-chapters/" + getReelChapterFileName(spec, i)),
    ...reelFrame, duration: spec.duration,
  }];
}));
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
    chapter.videoWidth === reelChapterFrame.width
    && chapter.videoHeight === reelChapterFrame.height
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
