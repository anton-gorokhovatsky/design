const { webkit } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");

const baseUrl = process.env.PORTFOLIO_AUDIT_URL
  || "http://127.0.0.1:4198/?qa=webkit-regression";
const artifactDir = process.env.PORTFOLIO_AUDIT_DIR
  || path.resolve(
    __dirname,
    "../../.portfolio-audit-artifacts/content-system-fix/webkit",
  );

const waitForLayout = async (page, milliseconds = 220) => {
  await page.waitForTimeout(milliseconds);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
};

const runtimeErrors = [];
const attachRuntimeLog = (page, label) => {
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(`${label}: console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(`${label}: pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const isIntentionalMediaCancellation = request.resourceType() === "media"
      && /aborted|cancelled/i.test(failure?.errorText || "");
    if (isIntentionalMediaCancellation) {
      return;
    }
    runtimeErrors.push(
      `${label}: requestfailed: ${request.url()} — ${failure?.errorText || "unknown"}`,
    );
  });
};

const materialAudit = async (page) => page.evaluate(() => {
  const expected = getComputedStyle(document.documentElement)
    .getPropertyValue("--material-01")
    .trim();
  const probe = document.createElement("i");
  probe.style.background = expected;
  document.body.append(probe);
  const expectedBackground = getComputedStyle(probe).backgroundColor;
  probe.remove();

  const active = Array.from(document.querySelectorAll("[data-material-surface]"))
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0
        && !element.classList.contains("is-content-stack-behind")
        && !element.classList.contains("is-content-stack-hidden");
    })
    .map((element) => {
      const style = getComputedStyle(element);
      return {
        surface: element.dataset.materialSurface,
        background: style.backgroundColor,
        backdrop: style.webkitBackdropFilter || style.backdropFilter,
        border: style.border,
        shadow: style.boxShadow,
      };
    });

  return {
    expectedBackground,
    active,
    failures: active.filter((surface) => (
      surface.background !== expectedBackground
      || !surface.backdrop.includes("blur(24px)")
      || surface.shadow !== "none"
      || !surface.border.startsWith("0px")
    )),
  };
});

const stackAudit = async (page, panelName) => {
  await page.evaluate((name) => {
    document.querySelector(`[data-open-panel="${name}"]`)?.click();
  }, panelName);
  await waitForLayout(page, 400);

  const selector = panelName === "work"
    ? ".work-intro, .work-list .work-row"
    : ".approach-intro, .approach-grid li";
  const maxScroll = await page.locator(".content-panel__body").evaluate(
    (element) => Math.max(0, element.scrollHeight - element.clientHeight),
  );
  const stops = Array.from(new Set([
    0,
    Math.round(maxScroll * 0.25),
    Math.round(maxScroll * 0.5),
    Math.round(maxScroll * 0.75),
    maxScroll,
  ]));
  const states = [];

  for (const scrollTop of stops) {
    await page.locator(".content-panel__body").evaluate((element, top) => {
      element.scrollTop = top;
      element.dispatchEvent(new Event("scroll"));
    }, scrollTop);
    await waitForLayout(page);
    states.push(await page.evaluate(({ surfaceSelector, expectedScroll }) => {
      const body = document.querySelector(".content-panel__body");
      const bodyRect = body.getBoundingClientRect();
      const surfaces = Array.from(document.querySelectorAll(surfaceSelector));
      const geometry = surfaces.map((surface, index) => {
        const rect = surface.getBoundingClientRect();
        return {
          index,
          active: surface.classList.contains("is-content-stack-active"),
          behind: surface.classList.contains("is-content-stack-behind"),
          hidden: surface.classList.contains("is-content-stack-hidden"),
          after: surface.classList.contains("is-content-stack-after"),
          position: getComputedStyle(surface).position,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      });
      const activeIndex = geometry.findIndex((item) => item.active);
      const active = geometry[activeIndex] || null;
      const next = geometry[activeIndex + 1] || null;
      const activeText = active
        ? surfaces[activeIndex].innerText.trim()
        : "";

      return {
        expectedScroll,
        actualScroll: body.scrollTop,
        body: {
          top: bodyRect.top,
          right: bodyRect.right,
          bottom: bodyRect.bottom,
          left: bodyRect.left,
        },
        activeIndex,
        activeCount: geometry.filter((item) => item.active).length,
        behindCount: geometry.filter((item) => item.behind).length,
        hiddenCount: geometry.filter((item) => item.hidden).length,
        active,
        next,
        activeText,
        failures: [
          ...(geometry.filter((item) => item.active).length !== 1
            ? ["stack must have exactly one active surface"]
            : []),
          ...(geometry.filter((item) => item.behind).length > 2
            ? ["stack exposes more than two quiet shoulders"]
            : []),
          ...(!active || !activeText
            ? ["active surface is missing or unreadable"]
            : []),
          ...(active && (
            active.top < bodyRect.top + 10
            || active.left < bodyRect.left - 1
            || active.right > bodyRect.right + 1
          )
            ? ["active surface is clipped outside the scroll viewport"]
            : []),
          ...(next && next.top < active.bottom + 7
            ? ["next surface collides with the active surface"]
            : []),
        ],
      };
    }, { surfaceSelector: selector, expectedScroll: scrollTop }));
  }

  await page.keyboard.press("Escape");
  await waitForLayout(page, 420);
  return {
    panelName,
    maxScroll,
    states,
    failures: states.flatMap((state) => state.failures.map(
      (failure) => `${panelName}@${state.actualScroll}: ${failure}`,
    )),
  };
};

const routeAudit = async (page, mapId, expectedCount) => {
  const hitTest = await page.evaluate((id) => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const node = document.querySelector(`[data-map-id="${id}"]`);
    const rect = node.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    return {
      nodeRect: {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
      point: { x, y },
      hit: hit
        ? `${hit.tagName.toLowerCase()}.${String(hit.className).trim().split(/\s+/).join(".")}`
        : "",
      hitInsideNode: Boolean(hit?.closest(`[data-map-id="${id}"]`)),
    };
  }, mapId);

  const readRouteState = (mode) => page.evaluate(({ id, count, phase }) => {
    const field = document.querySelector("[data-signal-field]");
    const routeSelector = id === "garage"
      ? ".map-links path.is-garage-link"
      : ".map-links path.is-private-practice-link";
    const active = Array.from(document.querySelectorAll(routeSelector))
      .filter((path) => Number(getComputedStyle(path).opacity) > 0);
    const badPaths = active.filter((path) => {
      const data = path.getAttribute("d") || "";
      return !data || /NaN|undefined|Infinity/.test(data);
    });
    const stateId = phase === "hover"
      ? field?.dataset.focusId || ""
      : field?.dataset.selectedId || "";

    return {
      phase,
      stateId,
      activeCount: active.length,
      badPaths: badPaths.length,
      failure: active.length !== count
        || badPaths.length > 0,
    };
  }, { id: mapId, count: expectedCount, phase: mode });

  await page.locator(`[data-map-id="${mapId}"]`).hover({ force: true });
  await waitForLayout(page, 340);
  const hover = await readRouteState("hover");

  await page.mouse.move(1, 1);
  await waitForLayout(page, 180);
  await page.evaluate((id) => {
    document.querySelector(`[data-map-id="${id}"]`)?.click();
  }, mapId);
  await waitForLayout(page, 340);
  const click = await readRouteState("click");
  click.failure = click.failure || click.stateId !== mapId;

  return {
    mapId,
    hitTest,
    hover,
    click,
    failure: hover.failure || click.failure,
  };
};

const contactAudit = async (page, width) => {
  await page.evaluate(() => {
    document.querySelector('[data-open-panel="contact"]')?.click();
  });
  await waitForLayout(page, 420);
  const state = await page.evaluate((viewportWidth) => {
    const card = document.querySelector(".contact-copy");
    const intro = document.querySelector(".contact-intro");
    const links = document.querySelector(".contact-links");
    const actions = Array.from(document.querySelectorAll(".contact-links a"));
    const cardRect = card.getBoundingClientRect();
    const introRect = intro.getBoundingClientRect();
    const linksRect = links.getBoundingClientRect();
    const actionRects = actions.map((action) => {
      const rect = action.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    });
    const linksStyle = getComputedStyle(links);
    const twoColumns = viewportWidth > 360;
    const horizontallyCentered = Math.abs(
      (cardRect.left + cardRect.right) / 2 - innerWidth / 2,
    ) <= 1;
    const dividerAligned = twoColumns
      ? Math.abs(actionRects[0].top - actionRects[1].top) <= 1
      : actionRects[1].top >= actionRects[0].bottom;

    return {
      card: {
        top: cardRect.top,
        right: cardRect.right,
        bottom: cardRect.bottom,
        left: cardRect.left,
      },
      intro: {
        top: introRect.top,
        right: introRect.right,
        bottom: introRect.bottom,
        left: introRect.left,
      },
      links: {
        top: linksRect.top,
        right: linksRect.right,
        bottom: linksRect.bottom,
        left: linksRect.left,
        borderTop: linksStyle.borderTopWidth,
        borderLeft: linksStyle.borderLeftWidth,
      },
      actions: actionRects,
      horizontallyCentered,
      dividerAligned,
      horizontalOverflow: Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
      ) > document.documentElement.clientWidth + 1,
      failure: !horizontallyCentered
        || !dividerAligned
        || linksStyle.borderLeftWidth !== "0px"
        || Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth,
        ) > document.documentElement.clientWidth + 1,
    };
  }, width);
  await page.keyboard.press("Escape");
  await waitForLayout(page, 420);
  return state;
};

const firstPaintAudit = async (browser, viewport, colorScheme) => {
  const context = await browser.newContext({ viewport, colorScheme });
  const page = await context.newPage();
  attachRuntimeLog(page, `first-paint-${viewport.width}-${colorScheme}`);
  await page.addInitScript(() => {
    window.__materialPaintSamples = [];
    const started = performance.now();
    const sample = () => {
      const surface = Array.from(document.querySelectorAll("[data-material-surface]"))
        .find((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0
            && rect.height > 0
            && style.display !== "none"
            && style.visibility !== "hidden";
        });
      if (surface) {
        const style = getComputedStyle(surface);
        window.__materialPaintSamples.push({
          time: performance.now(),
          surface: surface.dataset.materialSurface,
          background: style.backgroundColor,
          backdrop: style.webkitBackdropFilter || style.backdropFilter,
        });
      }
      if (performance.now() - started < 1500) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  await page.goto(`${baseUrl}-first-paint-${viewport.width}-${colorScheme}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1600);
  const result = await page.evaluate(() => {
    const samples = window.__materialPaintSamples || [];
    const first = samples[0] || null;
    const last = samples.at(-1) || null;
    const failures = samples.filter((sample) => (
      sample.background === "rgba(0, 0, 0, 0)"
      || !sample.backdrop.includes("blur(24px)")
    ));
    return {
      sampleCount: samples.length,
      first,
      last,
      failures,
      themeAtEnd: document.documentElement.dataset.theme,
    };
  });
  await context.close();
  return result;
};

(async () => {
  await fs.mkdir(artifactDir, { recursive: true });
  const browser = await webkit.launch({ headless: true });
  const report = {
    schemaVersion: 1,
    firstPaint: [],
    viewports: [],
    runtimeErrors,
  };

  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      for (const colorScheme of ["light", "dark"]) {
        report.firstPaint.push({
          viewport,
          colorScheme,
          ...await firstPaintAudit(browser, viewport, colorScheme),
        });

        const context = await browser.newContext({ viewport, colorScheme });
        const page = await context.newPage();
        const label = `${viewport.width}x${viewport.height}-${colorScheme}`;
        attachRuntimeLog(page, label);
        await page.goto(`${baseUrl}-${label}`, { waitUntil: "networkidle" });
        await waitForLayout(page, 500);

        const initialSelectedId = await page.locator("[data-signal-field]")
          .getAttribute("data-selected-id");
        const workStack = await stackAudit(page, "work");
        const approachStack = await stackAudit(page, "approach");
        const contact = await contactAudit(page, viewport.width);
        const garage = await routeAudit(page, "garage", 9);
        await page.keyboard.press("Escape");
        await waitForLayout(page, 300);
        const privatePractice = await routeAudit(page, "private-practice", 8);
        const material = await materialAudit(page);

        await page.screenshot({
          path: path.join(artifactDir, `${label}-final.png`),
          fullPage: false,
        });
        report.viewports.push({
          viewport,
          colorScheme,
          initialSelectedId: initialSelectedId || "",
          workStack,
          approachStack,
          contact,
          garage,
          privatePractice,
          material,
        });
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const failures = [
    ...report.runtimeErrors,
    ...report.firstPaint.flatMap((state) => state.failures.map(
      (failure) => `first-paint ${state.viewport.width}/${state.colorScheme}: `
        + `${failure.surface} ${failure.background} ${failure.backdrop}`,
    )),
    ...report.viewports.flatMap((state) => [
      ...(state.initialSelectedId
        ? [`${state.viewport.width}/${state.colorScheme}: initial map selection is not empty`]
        : []),
      ...state.workStack.failures,
      ...state.approachStack.failures,
      ...(state.contact.failure
        ? [`${state.viewport.width}/${state.colorScheme}: contact geometry failed`]
        : []),
      ...(state.garage.failure
        ? [`${state.viewport.width}/${state.colorScheme}: Garage routes failed`]
        : []),
      ...(state.privatePractice.failure
        ? [`${state.viewport.width}/${state.colorScheme}: private-practice routes failed`]
        : []),
      ...state.material.failures.map(
        (failure) => `${state.viewport.width}/${state.colorScheme}: material ${failure.surface}`,
      ),
    ]),
  ];
  report.failures = failures;

  await fs.writeFile(
    path.join(artifactDir, "webkit-regression.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(
    `WebKit regression: ${report.viewports.length} viewport/theme states; `
      + `${failures.length} failures.\n`,
  );
  if (failures.length) {
    process.stdout.write(`${failures.join("\n")}\n`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
