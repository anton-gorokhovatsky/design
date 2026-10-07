const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdir, rename, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { reelSpecs, reelFrame, reelSourceViewport } = require("./reel-specs.mjs");

const spec = reelSpecs.find(item => item.itemId === "eleven");
const park = page => page.mouse.move(-30, -30);
const wait = (page, ms) => page.waitForTimeout(ms);
const scroll = (page, selector, duration, offset = 96) => page.evaluate(async ({ selector, duration, offset }) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing capture target: ${selector}`);
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

const scrubLight = (page, from, to, duration) => page.locator("#dubai-time").evaluate(async (input, range) => {
  if (input.disabled) throw new Error("The public start-day control is disabled");
  const started = performance.now();
  await new Promise(resolve => {
    const frame = now => {
      const p = Math.min(1, (now - started) / range.duration);
      input.value = String(Math.round(range.from + (range.to - range.from) * p));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (p < 1) requestAnimationFrame(frame);
      else { input.dispatchEvent(new Event("change", { bubbles: true })); resolve(); }
    };
    requestAnimationFrame(frame);
  });
}, { from, to, duration });

async function prepare(page, id) {
  // These affect recording mechanics only, never the source site's layout.
  await page.addStyleTag({ content: "html { scroll-behavior: auto !important; } * { caret-color: transparent !important; } ::-webkit-scrollbar { width: 0; height: 0; }" });
  await park(page);
  if (id === "ride-2024") {
    await scroll(page, "#ride-2024", 1);
    // Warm up the actual player through its controls before starting the take.
    await page.locator("[data-film-play]").click();
    await page.waitForFunction(() => document.querySelector("[data-film-video]").readyState >= 3);
    await page.locator("[data-film-chapter='0']").click();
    await park(page);
  } else if (id === "daylight") {
    await scroll(page, "#dubai-light", 1);
    await page.locator('[data-dubai-mode="preview"]').click();
    await scrubLight(page, 720, 720, 1);
    await park(page);
  }
  await wait(page, 800);
  await page.waitForFunction(() => [...document.images].filter(image => {
    const r = image.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && r.top < innerHeight && r.bottom > 0;
  }).every(image => image.complete && image.naturalWidth > 0));
}

async function perform(page, id) {
  if (id === "overview") {
    await wait(page, 2600);
    await page.locator("details.nav-shell > summary").click();
    await park(page);
    await wait(page, 2400);
    await page.locator('details.nav-shell a[href="#distance"]').click();
    await park(page);
    await wait(page, 2200);
    await scroll(page, "#ride-2024", 1600);
  } else if (id === "ride-2024") {
    await wait(page, 1100);
    await page.locator("[data-film-play]").click();
    await park(page);
    await wait(page, 4500);
    for (const chapter of [1, 2, 3]) {
      await page.locator(`[data-film-chapter='${chapter}']`).click();
      // Selecting a chapter intentionally pauses the public player.
      // Wait for its seek to finish: clicking during loading cancels the seek.
      await page.waitForFunction(() => !document.querySelector("[data-film-video]").seeking
        && document.querySelector("[data-film-play-label]").textContent === "Смотреть заезд");
      await page.locator("[data-film-play]").click();
      await park(page);
      const before = await page.locator("[data-film-video]").evaluate(video => video.currentTime);
      await wait(page, 4000);
      const after = await page.locator("[data-film-video]").evaluate(video => video.currentTime);
      if (after - before < 2) throw new Error(`Ride chapter ${chapter} did not play`);
    }
  } else if (id === "daylight") {
    await wait(page, 1200);
    await scroll(page, ".site-footer__wordmark", 1200, 112);
    await scrubLight(page, 720, 1035, 3300);
    await wait(page, 900);
    await scrubLight(page, 1035, 1260, 2300);
  }
}

async function captureElevenTour({ rawDirectory, finalDirectory }) {
  const project = process.env.PORTFOLIO_ELEVEN_REUSE
    ? path.resolve(process.env.PORTFOLIO_ELEVEN_REUSE)
    : path.join(rawDirectory, `eleven-tour-${Date.now()}`);
  const assets = path.join(project, "assets");
  await mkdir(assets, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PORTFOLIO_CAPTURE_BROWSER || chromium.executablePath(),
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
      if (process.env.PORTFOLIO_ELEVEN_REUSE && existsSync(clip)) {
        timeline.push({ id: scene.id, start: timeline.reduce((sum, item) => sum + item.duration, 0), duration: scene.duration });
        console.log(`11 111: reused ${scene.id}`);
        continue;
      }
      const page = await context.newPage();
      page.on("crash", () => console.error(`11 111: ${scene.id} renderer crashed`));
      const recordingStarted = Date.now();
      const video = page.video();
      await page.goto(spec.capture.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await prepare(page, scene.id);
      const usefulStart = (Date.now() - recordingStarted) / 1000;
      const takeStart = Date.now();
      await perform(page, scene.id);
      const remaining = scene.duration * 1000 - (Date.now() - takeStart);
      if (remaining < -300) throw new Error(`${scene.id}: actions exceed the authored duration by ${-remaining} ms`);
      await wait(page, Math.max(0, remaining) + 300);
      await page.screenshot({ path: path.join(project, `${scene.id}.png`) });
      await page.close();
      const source = path.join(project, `${scene.id}.webm`);
      await rename(await video.path(), source);
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(usefulStart), "-i", source,
        "-t", String(scene.duration), "-vf", `fps=30,scale=${reelFrame.width}:${reelFrame.height}:flags=lanczos,setsar=1`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-g", "30", "-keyint_min", "30", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", clip]);
      timeline.push({ id: scene.id, start: timeline.reduce((sum, item) => sum + item.duration, 0), duration: scene.duration, source, usefulStart });
      console.log(`11 111: captured ${scene.id} (${scene.duration}s)`);
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
html,body{margin:0;width:900px;height:600px;overflow:hidden;background:#09221b}
#root{width:100%;height:100%}.clip{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
</style></head><body><div id="root" data-composition-id="eleven" data-duration="${spec.duration.target}" data-width="900" data-height="600">
${timeline.map(scene => `<video id="${scene.id}" class="clip" src="assets/${scene.id}.mp4" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="0" muted playsinline></video>`).join("\n")}
</div><script>window.__timelines["eleven"] = gsap.timeline({ paused: true });</script></body></html>`);
  console.log(`11 111: composition ${project}`);
  // Native screen captures already contain the motion; HyperFrames owns only
  // cuts and playback. No fabricated overlays, zooms, fades or source retiming.
  execFileSync("npx", ["--yes", "hyperframes@0.8.139", "check"], { cwd: project, stdio: "inherit" });
  execFileSync("npx", ["--yes", "hyperframes@0.8.139", "render", "--quality", "delivery", "--fps", "30", "--crf", "22", "--output", "render.mp4"], { cwd: project, stdio: "inherit" });
  const output = path.join(finalDirectory, spec.master);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(project, "render.mp4"), "-c", "copy", "-an", "-movflags", "+faststart", "-metadata",
    "comment=source-fit=native-capture;source-viewport=1200x800;source-dar=3:2", output]);
  console.log(JSON.stringify({ id: "11111", final: output, project, duration: spec.duration.target }));
}

module.exports = { captureElevenTour };
