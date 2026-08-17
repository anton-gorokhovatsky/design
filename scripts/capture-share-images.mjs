#!/usr/bin/env node

import { mkdirSync } from "node:fs";
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
  }

  await context.close();
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
