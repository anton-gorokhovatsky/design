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
      // Capture the same Atlas composition used by the live route, without video.
      await page.evaluate(async () => {
        document.documentElement.dataset.theme = "light";
        const card = document.querySelector("[data-observation-title-card]");
        card.dataset.scene = "intro";
        card.hidden = false;
        const poster = card.querySelector("[data-atlas-poster]");
        poster.src = poster.dataset.src;
        await poster.decode();
        const domain = document.createElement("span");
        domain.className = "observation-share-domain";
        domain.textContent = "gorokhovatsky.tech";
        card.querySelector("figcaption").append(domain);
      });
      await page.addStyleTag({ content: `
        html[data-capture="og"] .share-heading,
        html[data-capture="og"] .share-domain { visibility: hidden; }
        html[data-capture="og"] .observation-title-card {
          display: block; position: fixed; inset: 0; z-index: 30;
          width: 1200px; height: 630px; transform: none; border-radius: 0;
        }
        html[data-capture="og"] .observation-title-card__caption {
          max-width: 430px; font-size: 1.5rem;
        }
        .observation-share-domain { font-size: 1.125rem; }
      ` });
    }
    await page.locator(
      capture.id === "site" ? ".observation-title-card" : ".map-inspector.is-open",
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
      const alt = "Антон Гороховатский. Придумываю, разрабатываю и веду веб-проекты. Работы и интересы: имя на фоне рельефа из точек и крестов.";
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
