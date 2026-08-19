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
    outputDuration: 12.4,
    finalHold: 1400,
  },
  narkomfin: {
    url: "https://narkomfin.ru/",
    dismissSelectors: ['button[aria-label="Закрыть виджет"]'],
    outputDuration: 13.2,
    finalHold: 1200,
  },
  shirokostup: {
    url: "https://shirokostup.site/",
    outputDuration: 12.8,
    finalHold: 1800,
  },
  tarski: {
    url: "https://tarski.ru/",
    outputDuration: 12.4,
    finalHold: 2200,
  },
  herman: {
    url: "https://barberherman.ru/",
    outputDuration: 14.8,
    finalHold: 1800,
  },
  "hotline-camp": {
    url: "https://anton-gorokhovatsky.github.io/hotline-camp/",
    outputDuration: 13.2,
    finalHold: 2000,
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
    outputDuration: 11.8,
    finalHold: 2800,
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

const runElevenCaptureMotion = async (page) => {
  await page.waitForTimeout(1400);

  const diaryLink = page.locator('#top a[href="#diary"]');

  if (await diaryLink.count() !== 1) {
    throw new Error("The 11 111 diary entry point must be unique");
  }

  await diaryLink.click();
  await page.waitForTimeout(2000);

  const archiveLink = page.locator('#diary a[href="#diary-archive"]');

  if (await archiveLink.count() !== 1) {
    throw new Error("The 11 111 diary archive entry point must be unique");
  }

  await archiveLink.click();
  await page.waitForTimeout(1500);

  const previousEntry = page.locator("#diary-tab-2026-05-09");

  if (await previousEntry.count() !== 1) {
    throw new Error("The 11 111 diary chapter control must be unique");
  }

  await previousEntry.click();
  await page.waitForTimeout(700);

  const menuToggle = page.locator("details.nav-shell > summary");

  if (await menuToggle.count() !== 1) {
    throw new Error("The 11 111 menu toggle must be unique");
  }

  await menuToggle.click();
  await page.waitForTimeout(700);

  const darkTheme = page.locator(
    'details.nav-shell [data-theme-option="dark"]',
  );

  if (await darkTheme.count() !== 1) {
    throw new Error("The 11 111 dark-theme control must be unique");
  }

  await darkTheme.click();
  await page.waitForTimeout(700);
  await menuToggle.click();
  await page.waitForTimeout(800);
  await smoothScrollBy(page, 360, 1400);
  await page.waitForTimeout(200);
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

const smoothScrollToLocator = async (
  locator,
  duration,
  viewportOffset = 0.12,
) => {
  await locator.evaluate(async (targetElement, { scrollDuration, targetOffset }) => {
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
    scrollDuration: duration,
    targetOffset: viewportOffset,
  });
};

const smoothScrollBy = async (page, distance, duration) => {
  await page.evaluate(async ({ scrollDistance, scrollDuration }) => {
    const scrollRoot = document.scrollingElement || document.documentElement;
    const start = scrollRoot.scrollTop;
    const maximum = Math.max(0, scrollRoot.scrollHeight - innerHeight);
    const target = Math.min(maximum, Math.max(0, start + scrollDistance));
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
    scrollDistance: distance,
    scrollDuration: duration,
  });
};

const applyCaptureStyles = async (page) => {
  await page.addStyleTag({
    content: [
      "html { scroll-behavior: auto !important; }",
      "* { caret-color: transparent !important; }",
      "::-webkit-scrollbar { width: 0 !important; height: 0 !important; }",
    ].join("\n"),
  }).catch(() => {});
};

const activateControlWithoutScrolling = async (locator, label) => {
  if (await locator.count() !== 1) {
    throw new Error(`${label} must be unique`);
  }

  await locator.evaluate((control) => control.click());
};

const prepareGarageWebzineCapture = async (page) => {
  await activateControlWithoutScrolling(
    page.locator("#light-theme"),
    "The Garage Webzine light-theme control",
  );
  await page.waitForTimeout(500);

  const theme = await page.locator("body").getAttribute("class");
  if (!theme?.includes("light-theme")) {
    throw new Error(`Expected the Garage Webzine light theme; found ${theme}`);
  }
};

const runGarageWebzineCaptureMotion = async (page) => {
  await page.waitForTimeout(1500);

  const contentsHeading = page.getByText("Оглавление", { exact: true }).first();
  if (await contentsHeading.count() !== 1) {
    throw new Error("The Garage Webzine contents heading is missing");
  }

  await smoothScrollToLocator(contentsHeading, 2400, 0.08);
  await page.waitForTimeout(800);

  const articleLink = page.getByRole("link", {
    name: "Донна Харауэй и теория собаки",
    exact: true,
  }).first();
  if (await articleLink.count() !== 1) {
    throw new Error("The Garage Webzine Donna Haraway article link is missing");
  }

  await articleLink.click();
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await applyCaptureStyles(page);
  await page.waitForTimeout(1000);

  await activateControlWithoutScrolling(
    page.locator("#dark-theme"),
    "The Garage Webzine dark-theme control",
  );
  await page.waitForTimeout(500);

  const theme = await page.locator("body").getAttribute("class");
  if (!theme?.includes("dark-theme")) {
    throw new Error(`Expected the Garage Webzine dark theme; found ${theme}`);
  }

  await page.waitForTimeout(2000);
  await smoothScrollBy(page, 480, 2000);
  await page.waitForTimeout(600);
};

const prepareShirokostupCapture = async (page) => {
  await activateControlWithoutScrolling(
    page.locator('button[title="Use light theme"]'),
    "The Shirokostup light-theme control",
  );
  await page.waitForTimeout(600);

  const theme = await page.locator("html").getAttribute("data-theme");
  if (theme !== "light") {
    throw new Error(`Expected the Shirokostup light theme; found ${theme}`);
  }
};

const runShirokostupCaptureMotion = async (page) => {
  await page.waitForTimeout(1800);

  const indexButton = page.getByRole("button", { name: "Index", exact: true });
  if (await indexButton.count() !== 1) {
    throw new Error("The Shirokostup Index button must be unique");
  }

  await indexButton.click();
  await page.waitForTimeout(2200);

  const darkTheme = page.getByRole("button", { name: "Dark", exact: true });
  if (await darkTheme.count() !== 1) {
    throw new Error("The Shirokostup dark-theme control must be unique");
  }

  await darkTheme.click();
  await page.waitForTimeout(2400);

  const selectedWork = page.getByRole("link", {
    name: "02 Selected work",
    exact: true,
  });
  if (await selectedWork.count() !== 1) {
    throw new Error("The Shirokostup Selected work link must be unique");
  }

  await selectedWork.click();
  await page.waitForTimeout(2200);
  await smoothScrollBy(page, 440, 2200);
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

const prepareHermanCapture = async (page) => {
  const currentTheme = await page.locator("html").getAttribute("data-theme");

  if (currentTheme !== "light") {
    const lightTheme = page.getByRole("button", {
      name: "Включить светлую тему",
      exact: true,
    });

    if (await lightTheme.count() !== 1) {
      throw new Error(
        `Expected the HERMAN & CO light-theme action; found ${currentTheme}`,
      );
    }

    await lightTheme.click();
    await page.waitForTimeout(600);
  }

  const preparedTheme = await page.locator("html").getAttribute("data-theme");

  if (preparedTheme !== "light") {
    throw new Error(`Expected the HERMAN & CO light theme; found ${preparedTheme}`);
  }
};

const runHermanCaptureMotion = async (page) => {
  await page.waitForTimeout(1800);

  const profile = page.getByRole("button", { name: "Профиль", exact: true });

  if (await profile.count() !== 1) {
    throw new Error("The HERMAN & CO Profile control must be unique");
  }

  await profile.click();
  await page.waitForTimeout(1800);
  await page.getByRole("button", {
    name: "Закрыть панель «Профиль»",
    exact: true,
  }).click();
  await page.waitForTimeout(250);

  const expertise = page.getByRole("button", {
    name: "Экспертиза",
    exact: true,
  });

  if (await expertise.count() !== 1) {
    throw new Error("The HERMAN & CO Expertise control must be unique");
  }

  await expertise.click();
  await page.waitForTimeout(1700);
  await page.getByRole("button", {
    name: "Закрыть панель «Экспертиза»",
    exact: true,
  }).click();
  await page.waitForTimeout(250);

  const partnerships = page.getByRole("button", {
    name: "Партнёрства",
    exact: true,
  });

  if (await partnerships.count() !== 1) {
    throw new Error("The HERMAN & CO Partnerships control must be unique");
  }

  await partnerships.click();
  await page.waitForTimeout(1700);
  await page.getByRole("button", {
    name: "Закрыть раздел «Партнёрства»",
    exact: true,
  }).click();
  await page.waitForTimeout(250);

  const darkTheme = page.getByRole("button", {
    name: "Включить тёмную тему",
    exact: true,
  });

  if (await darkTheme.count() !== 1) {
    throw new Error("The HERMAN & CO dark-theme control must be unique");
  }

  await darkTheme.click();
  await page.waitForTimeout(900);

  const media = page.getByRole("button", { name: "Медиа", exact: true });

  if (await media.count() !== 1) {
    throw new Error("The HERMAN & CO Media control must be unique");
  }

  await media.click();
  await page.waitForTimeout(800);

  const gridView = page.getByRole("button", {
    name: "Логотипы сеткой",
    exact: true,
  });

  if (await gridView.count() !== 1) {
    throw new Error("The HERMAN & CO media grid control must be unique");
  }

  await gridView.click();
  await page.waitForTimeout(1350);

  await page.getByRole("button", {
    name: "Закрыть раздел «Медиа»",
    exact: true,
  }).click();
  await page.waitForTimeout(250);

  const music = page.getByRole("button", { name: "Музыка", exact: true });

  if (await music.count() !== 1) {
    throw new Error("The HERMAN & CO Music control must be unique");
  }

  await music.click();

  const musicArchive = page.getByRole("region", {
    name: "Музыкальные подборки Германа",
    exact: true,
  });
  await musicArchive.waitFor({ state: "visible", timeout: 5000 });

  const volTwo = musicArchive.getByRole("heading", {
    name: "Vol. 2",
    exact: true,
  });

  if (await volTwo.count() !== 1) {
    throw new Error("The HERMAN & CO Vol. 2 playlist must be unique");
  }

  await page.waitForTimeout(2400);
};

const runHotlineCampCaptureMotion = async (page) => {
  await page.waitForTimeout(1600);
  await smoothScrollTo(page, "#program", 2200, 0);
  await page.waitForTimeout(900);

  const darkTheme = page.getByRole("button", {
    name: "Включить тёмную тему",
    exact: true,
  });

  if (await darkTheme.count() !== 1) {
    throw new Error("The Hotline Camp dark-theme control must be unique");
  }

  await darkTheme.click();
  await page.waitForTimeout(1000);
  await smoothScrollTo(page, "#trainers", 2200, 0);
  await page.waitForTimeout(1000);
  await smoothScrollTo(page, "#registration", 2300, 0);
  await page.waitForTimeout(500);
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
  if (id === "garage-webzine") {
    await runGarageWebzineCaptureMotion(page);
    return;
  }

  if (id === "narkomfin") {
    await runNarkomfinCaptureMotion(page);
    return;
  }

  if (id === "11111") {
    await runElevenCaptureMotion(page);
    return;
  }

  if (id === "herman") {
    await runHermanCaptureMotion(page);
    return;
  }

  if (id === "hotline-camp") {
    await runHotlineCampCaptureMotion(page);
    return;
  }

  if (id === "tarski") {
    await runTarskiCaptureMotion(page);
    return;
  }

  if (id === "shirokostup") {
    await runShirokostupCaptureMotion(page);
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

  if (projectId === "garage-webzine") {
    await prepareGarageWebzineCapture(page);
  }

  if (projectId === "shirokostup") {
    await prepareShirokostupCapture(page);
  }

  if (projectId === "herman") {
    await prepareHermanCapture(page);
  }

  await applyCaptureStyles(page);
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
