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
      // A build-only cover: it adds no title card, styles or video to the live route.
      await page.evaluate(async () => {
        document.documentElement.dataset.theme = "light";
        const card = document.createElement("figure");
        card.className = "share-cover";
        card.innerHTML = `<img src="assets/observation/atlas.svg" alt="">
          <figcaption>
            <span class="share-cover__eyebrow">Работы и интересы</span>
            <strong>Антон<br>Гороховатский</strong>
            <span class="share-cover__caption">Придумываю, разрабатываю<br>и веду веб-проекты.</span>
            <span class="share-cover__domain">gorokhovatsky.tech</span>
          </figcaption>`;
        document.body.append(card);
        await card.querySelector("img").decode();
      });
      await page.addStyleTag({ content: `
        html[data-capture="og"] .share-heading,
        html[data-capture="og"] .share-domain { visibility: hidden; }
        .share-cover {
          position: fixed; inset: 0; z-index: 30; width: 1200px; height: 630px;
          margin: 0; overflow: hidden; background: #f0f0e9; color: #292e27;
          container-type: inline-size;
        }
        .share-cover img {
          position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
          opacity: .72; mask-image: linear-gradient(90deg, transparent 30%, #000 78%);
        }
        .share-cover figcaption {
          position: relative; display: flex; flex-direction: column; align-items: flex-start;
          justify-content: space-between; gap: clamp(.75rem, 4cqi, 3rem);
          padding: 4.2% 6%; min-height: 100%; aspect-ratio: 1200 / 630;
        }
        .share-cover__eyebrow {
          display: block; font-size: clamp(.75rem, calc(.5rem + 1cqi), 1.125rem);
          letter-spacing: .04em; text-transform: uppercase;
        }
        .share-cover strong {
          font-size: clamp(1.375rem, calc(.75rem + 5.5cqi), 4.75rem);
          line-height: 1.03; letter-spacing: -.04em; font-weight: 500;
        }
        .share-cover__caption { max-width: 430px; font-size: 1.5rem; line-height: 1.35; }
        .share-cover__domain { font-size: 1.125rem; }
      ` });
    }
    await page.locator(
      capture.id === "site" ? ".share-cover" : ".map-inspector.is-open",
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
