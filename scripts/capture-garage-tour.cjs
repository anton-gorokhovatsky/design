const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdir, readFile, rename, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

// Whole browser viewports, in the author's requested order. Page loads and
// image warm-up are trimmed out; the source site's layout is never rewritten.
const scenes = [
  { id: "home-hero", url: "/", carouselAt: 1000, duration: 4.2 },
  { id: "museum-menu", url: "/", menu: true, duration: 4.6 },
  { id: "home-stream", url: "/", startHeading: "Поток", offset: 80,
    scrollBy: 600, hold: 900, scroll: 2600, duration: 4.4 },
  { id: "tours", url: "/visit/tours", scrollStart: 0,
    endHeading: "Открытое хранение", offset: 70,
    hold: 1200, scroll: 2600, duration: 4.8 },
  { id: "collection", url: "/collection",
    endHeading: "Каталог коллекции", offset: 90,
    carouselAt: 1200, hold: 3400, scroll: 2600, duration: 6.8 },
  { id: "calendar", url: "/calendar", scrollBy: 600,
    hold: 900, scroll: 2600, duration: 4.4 },
  { id: "library", url: "/programs/library/catalogue", scrollBy: 550,
    hold: 900, scroll: 2600, duration: 4.4 },
  { id: "exhibitions", url: "/exhibitions", scrollBy: 650,
    hold: 900, scroll: 2600, duration: 4.4 },
  { id: "courses", url: "/learn/online-courses", scrollStart: 0,
    endHeading: "Описание", offset: -200,
    hold: 1200, scroll: 2800, duration: 5 },
  { id: "studios-cover", url: "/programs/garage_studios", scrollStart: 0, duration: 2.2 },
  { id: "studios-gallery", url: "/programs/garage_studios",
    startHeading: "Галерея", offset: 80, carouselAt: 1000, duration: 3.6 },
];

const headingPosition = (page, text, offset) => page.evaluate(({ text, offset }) => {
  const heading = [...document.querySelectorAll("h1,h2,h3")].find((node) => (
    node.innerText.trim().toLocaleLowerCase("ru") === text.toLocaleLowerCase("ru")
  ));
  if (!heading) throw new Error(`Missing Garage section: ${text}`);
  return Math.max(0, heading.getBoundingClientRect().top + scrollY - offset);
}, { text, offset });

const waitForVisibleImages = (page) => page.waitForFunction(() => (
  [...document.images].filter((image) => {
    const rect = image.getBoundingClientRect();
    return rect.width > 40 && rect.height > 40 && rect.top < innerHeight && rect.bottom > 0
      && rect.left < innerWidth && rect.right > 0;
  }).every((image) => image.complete && image.naturalWidth > 0)
), null, { timeout: 15000 });

const scrollTo = (page, top) => page.evaluate((y) => window.scrollTo(0, y), top);

// Parking inside the viewport expands the collection image on hover.
const parkPointer = (page) => page.mouse.move(-30, -30);

async function nextSlide(page) {
  const controls = page.getByRole("button", {
    name: "Переключить на следующий слайд", exact: true,
  });
  const viewport = page.viewportSize();
  for (const control of await controls.all()) {
    const rect = await control.boundingBox();
    if (!rect || rect.x < 0 || rect.y < 0
      || rect.x + rect.width > viewport.width || rect.y + rect.height > viewport.height) continue;
    await control.click();
    await parkPointer(page);
    return;
  }
  throw new Error("Missing visible Garage carousel control");
}

const recordScroll = (page, top, duration) => page.evaluate(async ({ top, duration }) => {
  const from = scrollY;
  await new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = (1 - Math.cos(Math.PI * progress)) / 2;
      window.scrollTo(0, from + (top - from) * eased);
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}, { top, duration });

async function captureGarageTour({ rawDirectory, finalDirectory }) {
  const viewport = { width: 1200, height: 800 };
  const clipsDirectory = process.env.PORTFOLIO_GARAGE_REUSE
    ? path.resolve(process.env.PORTFOLIO_GARAGE_REUSE)
    : path.join(rawDirectory, `garage-tour-${Date.now()}`);
  await mkdir(clipsDirectory, { recursive: true });
  const previousTimeline = process.env.PORTFOLIO_GARAGE_REUSE
    ? JSON.parse(await readFile(path.join(clipsDirectory, "timeline.json"), "utf8"))
    : [];
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--force-color-profile=srgb"],
  });
  const context = await browser.newContext({
    viewport, colorScheme: "light", recordVideo: { dir: clipsDirectory, size: viewport },
  });
  const timeline = [];
  let start = 0;
  try {
    for (const scene of scenes) {
      const previous = previousTimeline.find((entry) => entry.id === scene.id);
      if (previous && existsSync(previous.clip)
        && Object.entries(scene).every(([key, value]) => previous[key] === value)) {
        timeline.push({ ...previous, start: Number(start.toFixed(1)) });
        start += scene.duration;
        console.log(`Garage: ${scene.id} — existing capture reused`);
        continue;
      }
      const page = await context.newPage();
      const recordingStartedAt = Date.now();
      const video = page.video();
      await page.goto(`https://garagemca.org${scene.url}`, {
        waitUntil: "domcontentloaded", timeout: 60000,
      });
      await page.waitForLoadState("networkidle", { timeout: 6500 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      for (const button of await page.locator('button[aria-label="Закрыть"]').all()) {
        if (await button.isVisible()) await button.click();
      }
      await page.addStyleTag({ content: [
        "html { scroll-behavior: auto !important; }",
        "* { caret-color: transparent !important; }",
        "::-webkit-scrollbar { width: 0 !important; height: 0 !important; }",
      ].join("\n") });

      const from = scene.startHeading
        ? await headingPosition(page, scene.startHeading, scene.offset)
        : scene.scrollStart || 0;
      const to = scene.endHeading
        ? await headingPosition(page, scene.endHeading, scene.offset)
        : from + (scene.scrollBy || 0);
      // Load lazy images along the future scroll before the useful recording.
      for (let y = from; y <= to + 500; y += 500) {
        await scrollTo(page, Math.min(y, to));
        await page.waitForTimeout(400);
        await waitForVisibleImages(page);
      }
      await scrollTo(page, from);
      await parkPointer(page);
      await page.waitForTimeout(700);
      await waitForVisibleImages(page);
      await page.screenshot({ path: path.join(clipsDirectory, `${scene.id}-start.png`) });
      const usefulStart = (Date.now() - recordingStartedAt) / 1000;

      if (scene.menu) {
        await page.waitForTimeout(400);
        await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
        await parkPointer(page);
        await page.waitForTimeout(scene.duration * 1000 - 400);
      } else {
        const openingHold = scene.scroll ? scene.hold : scene.duration * 1000;
        if (scene.carouselAt != null) {
          await page.waitForTimeout(scene.carouselAt);
          await nextSlide(page);
          await page.waitForTimeout(openingHold - scene.carouselAt);
        } else {
          await page.waitForTimeout(openingHold);
        }
        if (scene.scroll) {
          await recordScroll(page, to, scene.scroll);
          await page.waitForTimeout(scene.duration * 1000 - scene.hold - scene.scroll);
        }
      }
      await page.screenshot({ path: path.join(clipsDirectory, `${scene.id}-end.png`) });
      await page.waitForTimeout(600);
      const rawPath = await video.path();
      await page.close();
      const raw = path.join(clipsDirectory, `${scene.id}.webm`);
      const clip = path.join(clipsDirectory, `${scene.id}.mp4`);
      await rename(rawPath, raw);
      execFileSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-ss", usefulStart.toFixed(3),
        "-i", raw, "-t", String(scene.duration),
        "-vf", "setpts=PTS-STARTPTS,fps=30,scale=900:600:flags=lanczos,setsar=1",
        "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
        "-an", "-movflags", "+faststart", clip,
      ], { stdio: "inherit" });
      timeline.push({ ...scene, start: Number(start.toFixed(1)), usefulStart, raw, clip });
      start += scene.duration;
      console.log(`Garage: ${scene.id} — ${scene.duration}s captured`);
    }
  } finally {
    await context.close();
    await browser.close();
  }
  const list = path.join(clipsDirectory, "concat.txt");
  await writeFile(list, timeline.map(({ id }) => `file '${id}.mp4'`).join("\n"));
  const destination = path.join(finalDirectory, "garage-site.mp4");
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
    "-i", list, "-c", "copy", "-an", "-movflags", "+faststart",
    "-metadata", "comment=source-fit=native-capture;source-viewport=1200x800;source-dar=3:2",
    destination,
  ], { stdio: "inherit" });
  await writeFile(path.join(clipsDirectory, "timeline.json"), JSON.stringify(timeline, null, 2));
  console.log(JSON.stringify({ final: destination, duration: Number(start.toFixed(1)), timeline: clipsDirectory }));
}

module.exports = { captureGarageTour };
