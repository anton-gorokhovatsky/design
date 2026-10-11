const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdir, rename, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { reelSpecs, reelFrame, reelSourceViewport } = require("./reel-specs.mjs");

const spec = reelSpecs.find(item => item.itemId === "ks-fish");
const park = page => page.mouse.move(-30, -30);
const wait = (page, ms) => page.waitForTimeout(ms);
const scroll = (page, selector, duration, offset = 64) => page.evaluate(async ({ selector, duration, offset }) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing KS Fish capture target: ${selector}`);
  const from = scrollY;
  const to = Math.min(document.documentElement.scrollHeight - innerHeight,
    Math.max(0, from + element.getBoundingClientRect().top - offset));
  const started = performance.now();
  await new Promise(resolve => {
    const frame = now => {
      const p = Math.min(1, (now - started) / duration);
      window.scrollTo(0, from + (to - from) * (1 - Math.cos(Math.PI * p)) / 2);
      if (p < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}, { selector, duration, offset });

async function prepare(page, id) {
  // Recording mechanics only: preserve the public site's layout and imagery.
  await page.addStyleTag({ content: "html { scroll-behavior: auto !important; } * { caret-color: transparent !important; } ::-webkit-scrollbar { width: 0; height: 0; }" });
  await page.evaluate(async () => {
    const images = [...document.images];
    images.forEach(image => { image.loading = "eager"; });
    await Promise.all(images.map(image => image.decode().catch(() => {})));
  });
  if (id === "journal") await scroll(page, "#journal-title", 1, 88);
  if (id === "recipe-stories") await scroll(page, ".recipe-editorial-story", 1, 52);
  if (id === "catalog") {
    await page.locator('button[data-category="seafood"]').click();
    await scroll(page, "#category-seafood", 1, 112);
  }
  await park(page);
  await wait(page, 500);
  await page.waitForFunction(() => [...document.images].filter(image => {
    const r = image.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && r.top < innerHeight && r.bottom > 0;
  }).every(image => image.complete && image.naturalWidth > 0));
}

async function perform(page, id, snapshot) {
  if (id === "sea") {
    await wait(page, 1600);
    await page.locator('[data-hero-journal-next]').click();
    await park(page);
  } else if (id === "journal") {
    await wait(page, 1400);
    await scroll(page, ".atlas-record--1", 1900, 40);
    await snapshot("journal-caviar");
    await wait(page, 2200);
    await scroll(page, ".atlas-record--3", 1800, 40);
    await snapshot("journal-fish");
  } else if (id === "recipe-cod") {
    await wait(page, 1600);
    await scroll(page, ".recipe-editorial-lead", 1500, 56);
    await snapshot("recipe-cod");
    await wait(page, 3000);
    await scroll(page, ".recipe-editorial-lead", 1100, -96);
  } else if (id === "recipe-stories") {
    await snapshot("recipe-photos");
    await wait(page, 2100);
    await scroll(page, "#recipe-editorial-377", 1800, 296);
    await snapshot("recipe-stories");
  } else if (id === "catalog") {
    await wait(page, 1000);
    await scroll(page, "#category-seafood", 1800, -72);
  }
}

async function captureKsFishTour({ rawDirectory, finalDirectory }) {
  const project = process.env.PORTFOLIO_KS_REUSE
    ? path.resolve(process.env.PORTFOLIO_KS_REUSE)
    : path.join(rawDirectory, `ks-fish-tour-${Date.now()}`);
  const assets = path.join(project, "assets");
  await mkdir(assets, { recursive: true });
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--force-color-profile=srgb"],
  });
  const context = await browser.newContext({
    viewport: reelSourceViewport, colorScheme: "light",
    recordVideo: { dir: project, size: reelSourceViewport },
  });
  const timeline = [];
  try {
    for (const scene of spec.capture.scenes) {
      const clip = path.join(assets, `${scene.id}.mp4`);
      const start = Number(timeline.reduce((sum, item) => sum + item.duration, 0).toFixed(1));
      if (process.env.PORTFOLIO_KS_REUSE && existsSync(clip)) {
        timeline.push({ ...scene, start });
        console.log(`KS Fish: reused ${scene.id}`);
        continue;
      }
      const page = await context.newPage();
      const recordingStarted = Date.now();
      const video = page.video();
      await page.goto(new URL(scene.url, spec.capture.url).href, { waitUntil: "networkidle", timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      await prepare(page, scene.id);
      await page.screenshot({ path: path.join(project, `${scene.id}-start.png`) });
      const usefulStart = (Date.now() - recordingStarted) / 1000;
      const takeStart = Date.now();
      await perform(page, scene.id, name => page.screenshot({ path: path.join(project, `${name}.png`) }));
      const remaining = scene.duration * 1000 - (Date.now() - takeStart);
      if (remaining < -300) throw new Error(`${scene.id}: actions exceed duration by ${-remaining} ms`);
      await wait(page, Math.max(0, remaining) + 350);
      await page.close();
      const source = path.join(project, `${scene.id}.webm`);
      await rename(await video.path(), source);
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(usefulStart), "-i", source,
        "-t", String(scene.duration), "-vf", `fps=30,scale=${reelFrame.width}:${reelFrame.height}:flags=lanczos,setsar=1`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-g", "30", "-keyint_min", "30", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", clip]);
      timeline.push({ ...scene, start, usefulStart });
      console.log(`KS Fish: captured ${scene.id} (${scene.duration}s)`);
    }
  } finally { await context.close(); await browser.close(); }

  await writeFile(path.join(project, "timeline.json"), JSON.stringify(timeline, null, 2));
  await writeFile(path.join(project, "hyperframes.json"), JSON.stringify({ paths: { assets: "assets" } }, null, 2));
  const gsapPath = path.join(assets, "gsap.min.js");
  if (!existsSync(gsapPath)) {
    const response = await fetch("https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js");
    if (!response.ok) throw new Error(`GSAP capture dependency: HTTP ${response.status}`);
    await writeFile(gsapPath, await response.text());
  }
  await writeFile(path.join(project, "index.html"), `<!doctype html>
<html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>
html,body{margin:0;width:900px;height:600px;overflow:hidden;background:#fff}
#root{width:100%;height:100%}.clip{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
</style></head><body><div id="root" data-composition-id="ks-fish" data-duration="${spec.duration.target}" data-width="900" data-height="600">
${timeline.map(scene => `<video id="${scene.id}" class="clip" src="assets/${scene.id}.mp4" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="0" muted playsinline></video>`).join("\n")}
</div><script>window.__timelines["ks-fish"] = gsap.timeline({ paused: true });</script></body></html>`);
  console.log(`KS Fish: composition ${project}`);
  if (process.env.PORTFOLIO_KS_CAPTURE_ONLY) return;
  execFileSync("npx", ["--yes", "hyperframes@0.8.139", "check"], { cwd: project, stdio: "inherit" });
  execFileSync("npx", ["--yes", "hyperframes@0.8.139", "render", "--quality", "delivery", "--fps", "30", "--crf", "22", "--output", "render.mp4"], { cwd: project, stdio: "inherit" });
  const output = path.join(finalDirectory, spec.master);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(project, "render.mp4"), "-c", "copy", "-an", "-movflags", "+faststart", "-metadata",
    "comment=source-fit=native-capture;source-viewport=1200x800;source-dar=3:2", output]);
  console.log(`KS Fish: ${output}`);
}

module.exports = { captureKsFishTour };
