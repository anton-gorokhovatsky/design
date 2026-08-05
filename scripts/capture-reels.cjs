const { execFileSync } = require("node:child_process");
const { mkdir, rename } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const chromePath = process.env.PORTFOLIO_CAPTURE_BROWSER
  || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const captureRoot = path.resolve(
  process.env.PORTFOLIO_REEL_OUTPUT
    || path.join(__dirname, "..", ".reel-capture"),
);
const rawDirectory = path.join(captureRoot, "raw");
const finalDirectory = path.join(captureRoot, "final");

const desktopViewport = { width: 1200, height: 800 };
const desktopVideo = { width: 900, height: 600 };

const projects = {
  "garage-site": {
    url: "https://garagemca.org/",
    dismissSelectors: ['button[aria-label="Закрыть"]'],
  },
  "garage-collection": {
    url: "https://garagemca.org/collection/catalogue",
    dismissSelectors: ['button[aria-label="Закрыть"]'],
  },
  "garage-courses": {
    url: "https://garagemca.org/learn/online-courses",
    dismissSelectors: ['button[aria-label="Закрыть"]'],
  },
  "garage-webzine": {
    url: "https://non-human-animals.garage.digital/index.html",
  },
  narkomfin: {
    url: "https://narkomfin.ru/",
    dismissSelectors: ['button[aria-label="Закрыть виджет"]'],
    outputDuration: 13.2,
    finalHold: 1200,
  },
  shirokostup: {
    url: "https://shirokostup.site/",
  },
  tarski: {
    url: "https://tarski.ru/",
    outputDuration: 12.4,
    finalHold: 2200,
  },
  herman: {
    url: "https://barberherman.ru/",
  },
  "dusty-merch": {
    url: "https://merch.dustydumbbells.com/",
    dismissSelectors: [".t-popup__close"],
  },
  "dusty-camp": {
    url: "https://camp.dustydumbbells.com/",
  },
  "11111": {
    url: "https://11111.life/",
    sourceViewport: { width: 1350, height: 900 },
    outputDuration: 11.8,
    finalHold: 2400,
  },
  "ks-fish": {
    url: "https://ks.fish/",
    dismissSelectors: [".t-popup__close"],
  },
  doronin: {
    url: "https://doronin.store/",
  },
};

const projectId = process.argv[2];
const project = projects[projectId];

if (!project) {
  console.error(
    `Unknown project: ${projectId || "(missing)"}. `
    + `Expected one of: ${Object.keys(projects).join(", ")}`,
  );
  process.exit(1);
}

const sourceViewport = project.sourceViewport || desktopViewport;

const smoothScroll = async (page, duration = 6500) => {
  await page.evaluate(async (scrollDuration) => {
    const scrollRoot = document.scrollingElement || document.documentElement;
    const start = scrollRoot.scrollTop;
    const maximum = Math.max(0, scrollRoot.scrollHeight - innerHeight);
    const target = Math.min(maximum, Math.max(innerHeight * 1.4, maximum * 0.82));
    const startedAt = Date.now();

    await new Promise((resolve) => {
      const frame = () => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(1, elapsed / scrollDuration);
        const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
        scrollRoot.scrollTop = start + (target - start) * eased;

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });
  }, duration);
};

const slowScrollThroughPartners = async (page, duration = 5200) => {
  await page.evaluate(async (scrollDuration) => {
    const partners = document.querySelector("#partners");

    if (!partners) {
      throw new Error("The 11 111 partner chapter is missing");
    }

    const scrollRoot = document.scrollingElement || document.documentElement;
    const start = scrollRoot.scrollTop;
    const maximum = Math.max(0, scrollRoot.scrollHeight - innerHeight);
    const sectionEnd = partners.offsetTop + partners.offsetHeight;
    const target = Math.min(
      maximum,
      Math.max(start, sectionEnd - innerHeight * 0.85),
    );
    const startedAt = Date.now();

    await new Promise((resolve) => {
      const frame = () => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(1, elapsed / scrollDuration);
        const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
        scrollRoot.scrollTop = start + (target - start) * eased;

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });
  }, duration);
};

const smoothScrollTo = async (
  page,
  selector,
  duration,
  viewportOffset = 0.12,
) => {
  await page.evaluate(async ({ targetSelector, scrollDuration, targetOffset }) => {
    const targetElement = document.querySelector(targetSelector);

    if (!targetElement) {
      throw new Error(`Capture target is missing: ${targetSelector}`);
    }

    const scrollRoot = document.scrollingElement || document.documentElement;
    const start = scrollRoot.scrollTop;
    const maximum = Math.max(0, scrollRoot.scrollHeight - innerHeight);
    const targetRect = targetElement.getBoundingClientRect();
    const target = Math.min(
      maximum,
      Math.max(0, start + targetRect.top - innerHeight * targetOffset),
    );
    const startedAt = Date.now();

    await new Promise((resolve) => {
      const frame = () => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(1, elapsed / scrollDuration);
        const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
        scrollRoot.scrollTop = start + (target - start) * eased;

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });
  }, {
    targetSelector: selector,
    scrollDuration: duration,
    targetOffset: viewportOffset,
  });
};

const runTarskiCaptureMotion = async (page) => {
  await page.waitForTimeout(1400);
  await smoothScrollTo(
    page,
    '[data-i18n-block="focus"]',
    2600,
    0.14,
  );
  await page.waitForTimeout(700);

  const themeToggle = page.locator('.main-nav [data-theme-toggle]').first();

  if (await themeToggle.count() !== 1) {
    throw new Error("The Tarski desktop theme toggle must be unique");
  }

  await themeToggle.press("Enter");
  await page.waitForTimeout(900);
  await smoothScrollTo(page, "#artists", 2300, 0.06);
  await page.waitForTimeout(700);

  const artistLink = page.locator(
    '#artists-cloud [data-artist-key="anastasia"]',
  );

  if (await artistLink.count() !== 1) {
    throw new Error("The Tarski artist link must be unique");
  }

  await artistLink.press("Enter");
  await page.waitForTimeout(1800);
};

const prepareNarkomfinCapture = async (page) => {
  const modelCanvas = page.locator('[class*="Model_container"] canvas').first();
  await modelCanvas.waitFor({ state: "visible", timeout: 20000 });

  const switchToLight = page.getByRole("button", {
    name: "Сменить тему на светлую",
    exact: true,
  });

  if (await switchToLight.count() === 1) {
    await switchToLight.click();
    await page.waitForTimeout(1300);
  }
};

const clickNarkomfinRoute = async (page, name, hold) => {
  const route = page.getByRole("link", { name, exact: true });

  if (await route.count() !== 1) {
    throw new Error(`The Narkomfin route must be unique: ${name}`);
  }

  await route.click();
  await page.waitForTimeout(hold);
};

const runNarkomfinCaptureMotion = async (page) => {
  await page.waitForTimeout(550);
  await page.mouse.move(930, 210);
  await page.mouse.move(680, 540, { steps: 36 });
  await page.waitForTimeout(750);

  await clickNarkomfinRoute(page, "О проекте", 2400);
  await clickNarkomfinRoute(page, "Кафе", 2400);
  await clickNarkomfinRoute(page, "Книжный", 2400);

  const themeToggle = page.locator(
    'footer button[aria-label^="Сменить тему"]',
  );

  if (await themeToggle.count() !== 1) {
    throw new Error("The Narkomfin theme toggle must be unique");
  }

  const themeAction = await themeToggle.getAttribute("aria-label");

  if (!themeAction?.includes("темную")) {
    throw new Error(`Expected the Narkomfin dark-theme action; found ${themeAction}`);
  }

  await themeToggle.click();
  await page.waitForTimeout(1500);
  await clickNarkomfinRoute(page, "О проекте", 2000);
};

const dismissVisibleOverlays = async (page, selectors = []) => {
  for (const selector of selectors) {
    const controls = page.locator(selector);
    const count = await controls.count();

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      if (await control.isVisible().catch(() => false)) {
        await control.click({ timeout: 1200 }).catch(() => {});
      }
    }
  }
};

const keepOverlaysDismissed = async (page, selectors = [], duration = 7600) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < duration) {
    await dismissVisibleOverlays(page, selectors);
    await page.waitForTimeout(240);
  }
};

const runCaptureMotion = async (page, id, source) => {
  if (id === "narkomfin") {
    await runNarkomfinCaptureMotion(page);
    return;
  }

  if (id === "11111") {
    const menuToggle = page.locator('details > summary[aria-label="Меню"]');

    if (await menuToggle.count() !== 1) {
      throw new Error("The 11 111 menu toggle must be unique");
    }

    await page.waitForTimeout(1200);
    await menuToggle.click();
    await page.waitForTimeout(2600);

    const partnerLink = page.getByRole("link", {
      name: "07 Партнёрам",
      exact: true,
    });

    if (await partnerLink.count() !== 1) {
      throw new Error("The 11 111 partner-menu link must be unique");
    }

    await partnerLink.click();
    await page.waitForTimeout(1000);
    await slowScrollThroughPartners(page);
    return;
  }

  if (id === "tarski") {
    await runTarskiCaptureMotion(page);
    return;
  }

  await Promise.all([
    smoothScroll(page),
    keepOverlaysDismissed(page, source.dismissSelectors),
  ]);
};

(async () => {
  await Promise.all([
    mkdir(rawDirectory, { recursive: true }),
    mkdir(finalDirectory, { recursive: true }),
  ]);

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--force-color-profile=srgb",
    ],
  });
  const context = await browser.newContext({
    viewport: sourceViewport,
    colorScheme: "light",
    recordVideo: {
      dir: rawDirectory,
      size: sourceViewport,
    },
  });

  if (projectId === "tarski") {
    await context.addInitScript(() => {
      window.localStorage.setItem("tarski-theme", "light");
    });
  }

  const page = await context.newPage();
  const recordingStartedAt = Date.now();
  const video = page.video();

  await page.goto(project.url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1000);
  await dismissVisibleOverlays(page, project.dismissSelectors);
  await page.keyboard.press("Escape").catch(() => {});

  if (projectId === "narkomfin") {
    await prepareNarkomfinCapture(page);
  }

  await page.addStyleTag({
    content: [
      "html { scroll-behavior: auto !important; }",
      "* { caret-color: transparent !important; }",
      "::-webkit-scrollbar { width: 0 !important; height: 0 !important; }",
    ].join("\n"),
  }).catch(() => {});
  await page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    root.scrollTop = 0;
  });
  await page.waitForTimeout(900);

  const usefulStart = Math.max(
    0,
    (Date.now() - recordingStartedAt) / 1000 - 0.12,
  );

  await runCaptureMotion(page, projectId, project);
  await page.waitForTimeout(project.finalHold || 1800);

  const rawPath = await video.path();
  await context.close();
  await browser.close();

  const rawDestination = path.join(
    rawDirectory,
    `${projectId}-${Date.now()}.webm`,
  );
  const finalDestination = path.join(finalDirectory, `${projectId}.mp4`);
  await rename(rawPath, rawDestination);

  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      usefulStart.toFixed(3),
      "-i",
      rawDestination,
      "-t",
      String(project.outputDuration || 7.8),
      "-vf",
      `setpts=PTS-STARTPTS,fps=30,scale=${desktopVideo.width}:${desktopVideo.height}:flags=lanczos,setsar=1`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      "-metadata",
      "comment=source-fit=native-capture;"
        + `source-viewport=${sourceViewport.width}x${sourceViewport.height};`
        + "source-dar=3:2",
      finalDestination,
    ],
    { stdio: "inherit" },
  );

  console.log(
    JSON.stringify({
      id: projectId,
      raw: rawDestination,
      final: finalDestination,
      usefulStart,
      viewport: sourceViewport,
      video: desktopVideo,
      duration: project.outputDuration || 7.8,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
