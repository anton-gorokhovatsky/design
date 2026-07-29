#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const source = await readFile(join(projectRoot, "assets/favicon.svg"), "utf8");
const auditPath = process.env.PORTFOLIO_FAVICON_AUDIT
  ? resolve(process.env.PORTFOLIO_FAVICON_AUDIT)
  : "";
const browser = await chromium.launch({ headless: true });

try {
  for (const [size, filename] of [
    [64, "favicon.png"],
    [180, "apple-touch-icon.png"],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });

    await page.setContent(`
      <style>
        html, body {
          width: ${size}px;
          height: ${size}px;
          margin: 0;
          overflow: hidden;
          background: transparent;
        }
        svg {
          display: block;
          width: ${size}px;
          height: ${size}px;
        }
      </style>
      ${source}
    `);
    await page.screenshot({
      path: join(projectRoot, `assets/${filename}`),
      animations: "disabled",
      omitBackground: true,
    });
    await page.close();
  }

  if (auditPath) {
    const page = await browser.newPage({
      viewport: { width: 1120, height: 420 },
      deviceScaleFactor: 1,
    });
    const samples = [16, 32, 64, 104]
      .map((size) => `
        <figure>
          <span style="width:${size}px;height:${size}px">${source}</span>
          <figcaption>${size}px</figcaption>
        </figure>
      `)
      .join("");

    await page.setContent(`
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #d7d8d5; }
        body {
          display: grid;
          min-height: 420px;
          grid-template-columns: 1fr 1fr;
          padding: 28px;
          font: 16px Arial, sans-serif;
          color: #70726c;
        }
        section {
          display: flex;
          align-items: center;
          justify-content: space-evenly;
          border-radius: 34px 0 0 34px;
          background: #eeede7;
        }
        section + section {
          border-radius: 0 34px 34px 0;
          background: #11120f;
        }
        figure {
          display: grid;
          min-width: 92px;
          justify-items: center;
          gap: 16px;
          margin: 0;
        }
        figure > span, svg {
          display: block;
        }
        svg { width: 100%; height: 100%; }
      </style>
      <section>${samples}</section>
      <section>${samples}</section>
    `);
    await page.screenshot({
      path: auditPath,
      animations: "disabled",
      omitBackground: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
