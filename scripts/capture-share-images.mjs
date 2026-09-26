#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputDirectory = join(projectRoot, "assets", "share");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { startStaticServer } = require("./browser-contracts.cjs");

const siteShare = {
  id: "site",
  outputPath: join(projectRoot, "assets", "og-signal.jpg"),
};
const sharePoints = [
  "garage",
  "narkomfin",
  "tarski",
  "doronin",
  "eleven",
  "shirokostup",
].map((id) => ({
  id,
  outputPath: join(outputDirectory, `${id}.jpg`),
}));
const shareCaptures = [siteShare, ...sharePoints];
const requestedIds = process.argv.slice(2);
const selectedCaptures = requestedIds.length === 0
  ? sharePoints
  : requestedIds.map((id) => {
    const capture = shareCaptures.find((candidate) => candidate.id === id);
    if (!capture) {
      throw new Error(
        `Unknown share capture "${id}". Expected one of: `
          + shareCaptures.map(({ id: availableId }) => availableId).join(", "),
      );
    }
    return capture;
  });

const { origin, server } = await startStaticServer({ projectRoot });
mkdirSync(outputDirectory, { recursive: true });

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

try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    colorScheme: "dark",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  for (const capture of selectedCaptures) {
    const pointQuery = capture.id === "site" ? "" : `&point=${capture.id}`;
    await page.goto(`${origin}/?og=1${pointQuery}`, {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts?.ready);
    if (capture.id === "site") {
      // The social cover has its own editorial scale; no website UI is changed.
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "light";
        document.querySelector(".share-heading__eyebrow").textContent = "Работы и интересы";
        document.querySelector(".share-heading strong").textContent = "Антон\nГороховатский";
        document.querySelector(".share-heading__role").textContent = "Придумываю, разрабатываю и\u00a0веду веб-проекты.";
        document.querySelector(".share-domain").textContent = "gorokhovatsky.tech";
      });
      await page.addStyleTag({ content: `
        html[data-capture="og"] { --bg: #eeede7; }
        html[data-capture="og"] .practice-map::after {
          content: ""; position: absolute; inset: 0; z-index: 18;
          background: linear-gradient(90deg, #eeede7 0%, #eeede7 37%, rgba(238,237,231,.96) 45%, rgba(238,237,231,.3) 62%, transparent 77%);
          pointer-events: none;
        }
        html[data-capture="og"] .map-camera { transform: translateX(220px) scale(1.04); }
        html[data-capture="og"] .share-heading {
          top: 61px; left: 64px; width: 630px; max-width: none; gap: 0;
          color: #222521;
        }
        html[data-capture="og"] .share-heading__eyebrow {
          display: block; margin-bottom: 46px; font-size: 1.125rem;
          font-weight: 400; letter-spacing: .05em; text-transform: uppercase; color: #63665f;
        }
        html[data-capture="og"] .share-heading__eyebrow::before { display: none; }
        html[data-capture="og"] .share-heading strong {
          white-space: pre-line; font-size: 4.5rem; line-height: 1.04;
          letter-spacing: -.045em; font-weight: 600;
        }
        html[data-capture="og"] .share-heading__role {
          max-width: 470px; margin-top: 29px; font-size: 1.875rem;
          line-height: 1.3; letter-spacing: -.02em; font-weight: 400; color: #53564f;
        }
        html[data-capture="og"] .share-domain {
          top: auto; right: auto; left: 64px; bottom: 49px;
          font-size: 1.25rem; font-weight: 400; letter-spacing: 0; color: #304cff;
        }
      ` });
    }
    await page.locator(
      capture.id === "site" ? ".share-heading" : ".map-inspector.is-open",
    ).waitFor({
      state: "visible",
      timeout: 10000,
    });
    await page.locator(".map-node").first().waitFor({
      state: "visible",
      timeout: 10000,
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: capture.outputPath,
      type: "jpeg",
      quality: 90,
      animations: "disabled",
    });
    console.log(
      `Captured ${relative(projectRoot, capture.outputPath).replaceAll("\\", "/")}`,
    );
    if (capture.id === "site") {
      const version = createHash("sha256").update(readFileSync(capture.outputPath)).digest("hex").slice(0, 12);
      const indexPath = join(projectRoot, "index.html");
      const alt = "Антон Гороховатский. Придумываю, разрабатываю и веду веб-проекты. Светлая карта работ и интересов с проектными узлами и созвездием.";
      const html = readFileSync(indexPath, "utf8")
        .replaceAll(/og-signal\.jpg\?v=[a-f0-9]{12}/g, `og-signal.jpg?v=${version}`)
        .replace(/(<meta\s+(?:property="og:image:alt"|name="twitter:image:alt")\s+content=")[^"]*(")/g, `$1${alt}$2`)
        .replace(/("caption":\s*")[^"]*(")/, `$1${alt}$2`);
      writeFileSync(indexPath, html);
    }
  }

  await context.close();
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
