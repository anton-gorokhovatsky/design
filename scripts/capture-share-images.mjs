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
    deviceScaleFactor: selectedCaptures.some(capture => capture.id === "site") ? 2 : 1,
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
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      await page.addStyleTag({ content: `
        html[data-capture="og"] .share-heading,
        html[data-capture="og"] .share-domain,
        html[data-capture="og"] .whoop-field { visibility: hidden; }
        html[data-capture="og"] .map-grid { opacity: .5; }
        html[data-capture="og"] .map-links path.is-garage-link { opacity: .6; }
        html[data-capture="og"] .map-links path { stroke-width: 1.2px; }
      ` });
      await page.waitForFunction(() => !document.querySelector('[data-map-links][data-layout-pending]'));
      const mapImage = 'data:image/png;base64,' + (await page.screenshot({ animations: 'disabled' })).toString('base64');
      // A build-only cover: it adds no title card, styles or video to the live route.
      await page.evaluate(async mapImage => {
        const card = document.createElement("figure");
        card.className = "share-cover";
        card.innerHTML = `<img alt="">
          <figcaption>
            <strong><span>Антон</span><span class="share-cover__surname">Гороховатский</span></strong>
            <span class="share-cover__caption">Придумываю, разрабатываю<br>и&nbsp;веду веб-проекты.</span>
          </figcaption>`;
        document.body.append(card);
        card.querySelector("img").src = mapImage;
        await card.querySelector("img").decode();
      }, mapImage);
      await page.addStyleTag({ content: `
        html[data-capture="og"] .share-heading,
        html[data-capture="og"] .share-domain { visibility: hidden; }
        .share-cover {
          position: fixed; inset: 0; z-index: 30; width: 1200px; height: 630px;
          margin: 0; overflow: hidden; background: #0b0f12; color: #eeeee6;
        }
        .share-cover img {
          position: absolute; left: -88px; top: -97px;
          width: 1500px; height: 787.5px; max-width: none; opacity: .72;
        }
        .share-cover figcaption {
          position: relative; height: 100%;
        }
        .share-cover strong {
          position: absolute; inset: 153px 57px auto; text-align: left;
          font-family: var(--font-author); font-size: 125px; font-weight: 400;
          line-height: .96; letter-spacing: -.055em;
        }
        .share-cover strong span { display: block; width: max-content; white-space: nowrap; }
        .share-cover strong .share-cover__surname { font-size: 140px; margin-top: 24px; }
        .share-cover__caption {
          position: absolute; left: 62px; bottom: 48px; font-family: var(--font-sans);
          font-size: 32px; line-height: 1.3; letter-spacing: -.015em;
        }
      ` });
      await page.evaluate(async () => {
        await document.fonts.load('125px Rene');
        await document.fonts.ready;
        const surname = document.querySelector('.share-cover__surname');
        const width = surname.getBoundingClientRect().width;
        if (width > 1080) surname.style.fontSize = `${140 * 1080 / width}px`;
      });
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
      quality: capture.id === "site" ? 94 : 90,
      scale: "css",
      animations: "disabled",
    });
    console.log(
      `Captured ${relative(projectRoot, capture.outputPath).replaceAll("\\", "/")}`,
    );
    if (capture.id === "site") {
      const version = createHash("sha256").update(readFileSync(capture.outputPath)).digest("hex").slice(0, 12);
      const indexPath = join(projectRoot, "index.html");
      const alt = "Антон Гороховатский. Придумываю, разрабатываю и веду веб-проекты. Крупное имя авторским шрифтом на фоне ночной карты со сферами, орбитами и связями между проектами.";
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
