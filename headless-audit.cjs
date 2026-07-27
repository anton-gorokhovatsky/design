const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.PORTFOLIO_AUDIT_URL
  || "http://127.0.0.1:4188/?qa=full-a11y-final";
const artifactDir = path.resolve(
  __dirname,
  "../.portfolio-audit-artifacts/content-system-fix/console-system",
);

const pause = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const collectRuntimeErrors = (page) => {
  const errors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    errors.push(`requestfailed: ${request.url()} — ${failure?.errorText || "unknown"}`);
  });

  return errors;
};

const visibleOverflowAudit = async (page) => page.evaluate(() => {
  const viewportWidth = document.documentElement.clientWidth;
  const candidates = Array.from(document.querySelectorAll("body *")).filter((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) > 0
      && rect.width > 0
      && rect.height > 0
      && rect.bottom > 0
      && rect.top < innerHeight;
  });

  const horizontal = candidates.flatMap((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.left >= -0.5 && rect.right <= viewportWidth + 0.5) {
      return [];
    }
    if (
      element.closest(".map-node")
      || element.closest(".signal-constellation")
      || element.matches(".map-axis, .map-links, .map-specks")
    ) {
      return [];
    }
    return [{
      selector: element.id
        ? `#${element.id}`
        : `${element.tagName.toLowerCase()}.${String(element.className).trim().split(/\s+/).join(".")}`,
      left: rect.left,
      right: rect.right,
    }];
  });

  const clippedText = candidates.flatMap((element) => {
    if (!element.textContent.trim() || element.children.length > 0) {
      return [];
    }
    const style = getComputedStyle(element);
    const clips = ["hidden", "clip"].includes(style.overflow)
      || ["hidden", "clip"].includes(style.overflowX)
      || ["hidden", "clip"].includes(style.overflowY);
    if (!clips) {
      return [];
    }
    if (
      element.scrollWidth <= element.clientWidth + 1
      && element.scrollHeight <= element.clientHeight + 1
    ) {
      return [];
    }
    return [{
      selector: element.id
        ? `#${element.id}`
        : `${element.tagName.toLowerCase()}.${String(element.className).trim().split(/\s+/).join(".")}`,
      text: element.textContent.trim().slice(0, 100),
      client: [element.clientWidth, element.clientHeight],
      scroll: [element.scrollWidth, element.scrollHeight],
    }];
  });

  return {
    viewportWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    horizontal,
    clippedText,
  };
});

const contrastAudit = async (page) => page.evaluate(() => {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });

  const rgba = (cssColor) => {
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = "rgba(0, 0, 0, 0)";
    colorContext.fillRect(0, 0, 1, 1);
    colorContext.fillStyle = cssColor;
    colorContext.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
    return { red, green, blue, alpha: alpha / 255 };
  };
  const composite = (foreground, background) => {
    const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
    if (!alpha) {
      return { red: 0, green: 0, blue: 0, alpha: 0 };
    }
    return {
      red: (
        foreground.red * foreground.alpha
        + background.red * background.alpha * (1 - foreground.alpha)
      ) / alpha,
      green: (
        foreground.green * foreground.alpha
        + background.green * background.alpha * (1 - foreground.alpha)
      ) / alpha,
      blue: (
        foreground.blue * foreground.alpha
        + background.blue * background.alpha * (1 - foreground.alpha)
      ) / alpha,
      alpha,
    };
  };
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color) => (
    channel(color.red) * 0.2126
    + channel(color.green) * 0.7152
    + channel(color.blue) * 0.0722
  );
  const ratio = (first, second) => {
    const bright = Math.max(luminance(first), luminance(second));
    const dark = Math.min(luminance(first), luminance(second));
    return (bright + 0.05) / (dark + 0.05);
  };
  const baseProbe = document.createElement("span");
  baseProbe.style.background = "var(--bg)";
  document.body.append(baseProbe);
  const base = rgba(getComputedStyle(baseProbe).backgroundColor);
  baseProbe.remove();
  const surfaceBackground = (surface) => composite(
    rgba(getComputedStyle(surface).backgroundColor),
    base,
  );
  const textRatio = (element, background, pseudo = null) => {
    const foreground = rgba(getComputedStyle(element, pseudo).color);
    return ratio(composite(foreground, background), background);
  };

  const navigation = document.querySelector(".constellation-nav");
  const search = document.querySelector(".command-dock");
  const dock = document.querySelector(".system-dock");
  const brand = document.querySelector(".brand");
  const navLabel = document.querySelector(".constellation-nav__label");
  const input = document.querySelector(".command-dock input");
  const focusTarget = document.querySelector('[data-map-filter="practice"]');
  focusTarget.focus();
  const focusSymbol = focusTarget.querySelector(".map-control__symbol");

  return {
    brand: textRatio(brand, base),
    navigationLabel: textRatio(navLabel, surfaceBackground(navigation)),
    searchPlaceholder: textRatio(input, surfaceBackground(search), "::placeholder"),
    focusIndicator: ratio(
      rgba(getComputedStyle(focusSymbol).outlineColor),
      surfaceBackground(dock),
    ),
  };
});

const materialAudit = async (page) => page.evaluate(() => {
  const desktop = matchMedia("(min-width: 681px)").matches;
  const registered = Array.from(document.querySelectorAll("[data-material-surface]"));
  const modeApplies = (element) => {
    const mode = element.dataset.materialActive || "always";
    return mode === "always"
      || (mode === "desktop" && desktop)
      || (mode === "mobile" && !desktop);
  };
  const effectivelyVisible = (element) => {
    if (!modeApplies(element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    for (let current = element; current && current !== document; current = current.parentElement) {
      const style = getComputedStyle(current);

      if (
        current.hidden
        || style.display === "none"
        || style.visibility === "hidden"
        || Number(style.opacity) <= 0
      ) {
        return false;
      }
    }

    return true;
  };
  const materialProbe = document.createElement("span");
  materialProbe.style.cssText = [
    "position:fixed",
    "width:1px",
    "height:1px",
    "pointer-events:none",
    "background:var(--material-01)",
  ].join(";");
  document.body.append(materialProbe);
  const expectedBackground = getComputedStyle(materialProbe).backgroundColor;
  materialProbe.remove();
  const active = registered.filter(effectivelyVisible);
  const describe = (element) => {
    const style = getComputedStyle(element);
    const filter = style.backdropFilter || style.webkitBackdropFilter;
    const borderWidths = [
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
    ];
    const ancestor = Array.from(element.parentElement?.closest("[data-material-surface]")
      ? [element.parentElement.closest("[data-material-surface]")]
      : [])
      .find(effectivelyVisible);

    return {
      surface: element.dataset.materialSurface,
      mode: element.dataset.materialActive,
      background: style.backgroundColor,
      expectedBackground,
      backdropFilter: filter,
      borderWidths,
      boxShadow: style.boxShadow,
      nestedIn: ancestor?.dataset.materialSurface || null,
      rect: {
        left: Number(element.getBoundingClientRect().left.toFixed(2)),
        top: Number(element.getBoundingClientRect().top.toFixed(2)),
        width: Number(element.getBoundingClientRect().width.toFixed(2)),
        height: Number(element.getBoundingClientRect().height.toFixed(2)),
      },
    };
  };
  const activeDetails = active.map(describe);
  const repeatedFamilyNames = new Set(["map-node-label"]);
  const duplicateNames = Array.from(new Set(
    registered
      .map((element) => element.dataset.materialSurface)
      .filter((name, index, names) => (
        names.indexOf(name) !== index && !repeatedFamilyNames.has(name)
      )),
  ));
  const mismatches = activeDetails.filter((surface) => (
    surface.background !== surface.expectedBackground
    || surface.backdropFilter !== "blur(24px)"
    || surface.borderWidths.some((width) => width !== "0px")
    || surface.boxShadow !== "none"
    || surface.nestedIn
  ));

  return {
    registeredCount: registered.length,
    registeredNames: registered.map((element) => element.dataset.materialSurface),
    activeCount: active.length,
    expectedBackground,
    duplicateNames,
    mismatches,
    active: activeDetails,
  };
});

const routeVisibilityAudit = async (page, mapId, expectedCount) => page.evaluate(
  ({ id, count }) => {
    const routeSelector = id === "garage"
      ? ".map-links path.is-garage-link"
      : ".map-links path.is-private-practice-link";
    const active = Array.from(document.querySelectorAll(routeSelector))
      .filter((path) => Number(getComputedStyle(path).opacity) > 0);
    const badPaths = active.filter((path) => {
      const data = path.getAttribute("d") || "";
      return !data || /NaN|undefined|Infinity/.test(data);
    });

    return {
      mapId: id,
      focusId: document.querySelector("[data-signal-field]")?.dataset.focusId || "",
      activeCount: active.length,
      badPaths: badPaths.length,
      failure: active.length !== count || badPaths.length > 0,
    };
  },
  { id: mapId, count: expectedCount },
);

const consoleGeometryAudit = async (page) => page.evaluate(() => {
  const mobile = matchMedia("(max-width: 680px)").matches;
  const commandDock = document.querySelector(".command-dock");
  const searchDivider = getComputedStyle(commandDock, "::before");
  const failures = [];

  if (!mobile) {
    if (searchDivider.display === "none") {
      failures.push("desktop search divider is missing");
    }

    return {
      mobile,
      searchDivider: {
        display: searchDivider.display,
        width: searchDivider.width,
      },
      controls: [],
      failures,
    };
  }

  const controls = [
    ...document.querySelectorAll(".system-dock .map-control"),
    document.querySelector(".display-control .theme-toggle"),
  ].filter(Boolean);
  const metrics = controls.map((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return {
      name: element.dataset.mapFilter || "theme",
      left: Number(rect.left.toFixed(2)),
      centerX: Number((rect.left + rect.width / 2).toFixed(2)),
      centerY: Number((rect.top + rect.height / 2).toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
      background: style.backgroundColor,
    };
  });
  const widths = metrics.map((item) => item.width);
  const heights = metrics.map((item) => item.height);
  const centers = metrics.map((item) => item.centerY);
  const horizontalSteps = metrics.slice(1).map((item, index) => (
    Number((item.centerX - metrics[index].centerX).toFixed(2))
  ));
  const transparent = new Set(["transparent", "rgba(0, 0, 0, 0)"]);
  const activeMarker = getComputedStyle(
    document.querySelector(".system-dock .map-control.is-active"),
    "::after",
  );

  if (metrics.length !== 6) {
    failures.push(`mobile system dock has ${metrics.length} controls instead of 6`);
  }
  if (Math.max(...widths) - Math.min(...widths) > 0.35) {
    failures.push("mobile system dock control widths are not equal");
  }
  if (Math.max(...heights) - Math.min(...heights) > 0.35) {
    failures.push("mobile system dock control heights are not equal");
  }
  if (Math.max(...centers) - Math.min(...centers) > 0.35) {
    failures.push("mobile system dock controls do not share one optical axis");
  }
  if (
    horizontalSteps.length
    && Math.max(...horizontalSteps) - Math.min(...horizontalSteps) > 0.35
  ) {
    failures.push("mobile system dock controls are not distributed at equal intervals");
  }
  if (metrics.some((item) => !transparent.has(item.background))) {
    failures.push("mobile system dock contains a local control background");
  }
  if (searchDivider.display !== "none") {
    failures.push("desktop search divider leaks into the mobile command dock");
  }
  if (activeMarker.display !== "none") {
    failures.push("mobile active filter uses an inconsistent underline");
  }

  const navigation = document.querySelector(".constellation-nav");
  const navigationOpen = navigation?.classList.contains("is-open") || false;
  const navigationRows = navigationOpen
    ? Array.from(navigation.querySelectorAll(".constellation-nav__item"))
    : [];
  const navigationMetrics = navigationRows.map((element) => {
    const row = element.getBoundingClientRect();
    const shape = element.querySelector(".constellation-nav__shape").getBoundingClientRect();
    const label = element.querySelector(".constellation-nav__label").getBoundingClientRect();

    return {
      row: {
        left: Number(row.left.toFixed(2)),
        top: Number(row.top.toFixed(2)),
        width: Number(row.width.toFixed(2)),
        height: Number(row.height.toFixed(2)),
      },
      shapeCenter: {
        x: Number((shape.left + shape.width / 2).toFixed(2)),
        y: Number((shape.top + shape.height / 2).toFixed(2)),
      },
      label: {
        left: Number(label.left.toFixed(2)),
        centerY: Number((label.top + label.height / 2).toFixed(2)),
      },
    };
  });

  if (navigationOpen) {
    const rowWidths = navigationMetrics.map(({ row }) => row.width);
    const rowHeights = navigationMetrics.map(({ row }) => row.height);
    const shapeX = navigationMetrics.map(({ shapeCenter }) => shapeCenter.x);
    const labelX = navigationMetrics.map(({ label }) => label.left);
    const opticalDelta = navigationMetrics.map(({ shapeCenter, label }) => (
      Math.abs(shapeCenter.y - label.centerY)
    ));

    if (navigationMetrics.length !== 5) {
      failures.push(`mobile navigation has ${navigationMetrics.length} rows instead of 5`);
    }
    if (Math.max(...rowWidths) - Math.min(...rowWidths) > 0.35) {
      failures.push("mobile navigation row widths are not equal");
    }
    if (Math.max(...rowHeights) - Math.min(...rowHeights) > 0.35) {
      failures.push("mobile navigation row heights are not equal");
    }
    if (Math.max(...shapeX) - Math.min(...shapeX) > 0.35) {
      failures.push("mobile navigation icons do not share one column");
    }
    if (Math.max(...labelX) - Math.min(...labelX) > 0.35) {
      failures.push("mobile navigation labels do not share one column");
    }
    if (Math.max(...opticalDelta) > 0.75) {
      failures.push("mobile navigation icon and label centres do not share the row axis");
    }
  }

  return {
    mobile,
    searchDivider: {
      display: searchDivider.display,
      width: searchDivider.width,
    },
    activeMarker: {
      display: activeMarker.display,
      width: activeMarker.width,
    },
    controls: metrics,
    horizontalSteps,
    navigation: {
      open: navigationOpen,
      rows: navigationMetrics,
    },
    failures,
  };
});

const principleTitleAudit = async (page) => {
  const practiceIds = await page.evaluate(() => (
    Array.from(document.querySelectorAll('[data-map-kind="practice"]'))
      .map((element) => element.dataset.mapId)
  ));
  const states = [];

  for (const id of practiceIds) {
    await page.evaluate((mapId) => {
      document.querySelector(`[data-map-id="${mapId}"]`)?.click();
    }, id);
    await page.waitForTimeout(24);
    states.push(await page.evaluate((mapId) => {
      const title = document.querySelector(".map-readout__identity h2");
      const identity = document.querySelector(".map-readout__identity");
      const titleRect = title.getBoundingClientRect();
      const identityRect = identity.getBoundingClientRect();

      return {
        id: mapId,
        title: title.textContent.trim(),
        clientWidth: title.clientWidth,
        scrollWidth: title.scrollWidth,
        titleRight: Number(titleRect.right.toFixed(2)),
        identityRight: Number(identityRect.right.toFixed(2)),
        viewportOverflow: Math.max(
          0,
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      };
    }, id));
  }

  return {
    count: states.length,
    states,
    failures: states.filter((state) => (
      state.scrollWidth > state.clientWidth + 1
      || state.titleRight > state.identityRight + 0.5
      || state.viewportOverflow > 0
    )),
  };
};

const typographyAudit = async (page, action) => page.evaluate((currentAction) => {
  const selectorsByAction = {
    search: [
      ".command-result span:first-child",
      ".command-result span:nth-child(2)",
      ".command-results__empty",
    ],
    inspector: [
      ".map-inspector .map-readout__identity h2",
      ".map-inspector .map-readout__identity p",
      ".map-inspector .map-readout__description",
    ],
    work: [
      ".work-intro h2",
      ".work-intro p",
      ".work-row__title",
    ],
    approach: [
      ".approach-intro h2",
      ".approach-intro p",
      ".approach-grid p",
    ],
    contact: [
      ".contact-copy p",
      ".contact-copy a",
    ],
  };
  const selectors = selectorsByAction[currentAction] || [];
  const shortRussianWords = new Set([
    "а", "без", "в", "во", "для", "до", "за", "и", "из", "или",
    "к", "ко", "на", "над", "не", "ни", "но", "о", "об", "от",
    "по", "под", "при", "с", "со", "у",
  ]);
  const inspected = selectors.flatMap((selector) => (
    Array.from(document.querySelectorAll(selector), (element, index) => {
      const words = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;

      while ((node = walker.nextNode())) {
        for (const match of node.data.matchAll(/[^ \t\r\n]+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rect = range.getBoundingClientRect();
          words.push({
            text: match[0],
            top: rect.top,
            left: rect.left,
          });
        }
      }

      const lines = [];

      for (const word of words.sort((first, second) => (
        Math.abs(first.top - second.top) > 2
          ? first.top - second.top
          : first.left - second.left
      ))) {
        let line = lines.find((candidate) => Math.abs(candidate.top - word.top) <= 2);

        if (!line) {
          line = { top: word.top, words: [] };
          lines.push(line);
        }

        line.words.push(word.text);
      }

      lines.sort((first, second) => first.top - second.top);
      const lastWords = lines.map((line) => line.words.at(-1) || "");
      const hanging = lastWords.filter((word) => {
        const normalized = word
          .replace(/[.,;:!?»”)]*$/u, "")
          .toLocaleLowerCase("ru");
        return shortRussianWords.has(normalized);
      });
      const lastLineWordCount = (lines.at(-1)?.words || []).reduce(
        (count, word) => count + word.split(/\u00a0+/).filter(Boolean).length,
        0,
      );
      const widow = !element.querySelector("span")
        && lines.length > 1
        && lastLineWordCount === 1;

      return {
        selector: `${selector}:nth(${index + 1})`,
        lineCount: lines.length,
        lastWords,
        hanging,
        widow,
      };
    })
  ));

  return {
    inspected,
    hanging: inspected.filter((item) => item.hanging.length),
    widows: inspected.filter((item) => item.widow),
  };
}, action);

(async () => {
  await fs.mkdir(artifactDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
  });
  const report = {
    schemaVersion: 1,
    keyboard: {},
    aria: {},
    reflow: [],
    reducedMotion: {},
    forcedColors: {},
    contrast: {},
    material: [],
    materialCoverage: {},
    routes: [],
    consoleGeometry: [],
    principles: [],
    typography: [],
    runtimeErrors: [],
  };

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
    });
    const page = await context.newPage();
    const runtimeErrors = collectRuntimeErrors(page);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    report.aria = await page.evaluate(() => {
      const mapNodes = Array.from(document.querySelectorAll("[data-map-id]"));
      const names = mapNodes.map((node) => node.getAttribute("aria-label"));
      const canvas = document.querySelector("[data-signal-constellation]");
      const inspector = document.querySelector("[data-map-inspector]");
      const panel = document.querySelector("[data-content-panel]");
      const specks = document.querySelector("[data-map-specks]");

      return {
        documentLanguage: document.documentElement.lang,
        mapNodeCount: mapNodes.length,
        uniqueMapNodeNames: new Set(names).size,
        namedMapNodes: names.every(Boolean),
        canvas: {
          role: canvas?.getAttribute("role"),
          tabIndex: canvas?.tabIndex,
          named: Boolean(canvas?.getAttribute("aria-label")),
        },
        closedInspector: {
          ariaHidden: inspector?.getAttribute("aria-hidden"),
          inert: inspector?.inert,
        },
        closedPanel: {
          ariaHidden: panel?.getAttribute("aria-hidden"),
          inert: panel?.inert,
        },
        decorativeSpecksHidden: specks?.getAttribute("aria-hidden"),
      };
    });

    const garage = page.locator('[data-map-id="garage"]');
    await garage.focus();
    const rovingBefore = await page.evaluate(() => document.activeElement?.dataset.mapId || "");
    await page.keyboard.press("ArrowRight");
    const rovingAfter = await page.evaluate(() => document.activeElement?.dataset.mapId || "");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    const inspectorOpen = await page.locator("[data-map-inspector]").evaluate((element) => ({
      open: element.classList.contains("is-open"),
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.inert,
    }));
    await page.keyboard.press("Escape");
    const inspectorReturn = await page.evaluate(() => ({
      open: document.querySelector("[data-map-inspector]")?.classList.contains("is-open"),
      focusedMapId: document.activeElement?.dataset.mapId || "",
    }));

    const navToggle = page.locator("[data-constellation-nav-toggle]");
    await navToggle.focus();
    await page.keyboard.press("Enter");
    const navOpen = await navToggle.getAttribute("aria-expanded");
    const navApproach = page.locator('[data-nav-view="approach"]');
    await navApproach.focus();
    await page.keyboard.press("Escape");
    const navReturn = await page.evaluate(() => ({
      expanded: document.querySelector("[data-constellation-nav-toggle]")?.getAttribute("aria-expanded"),
      focusedToggle: document.activeElement?.hasAttribute("data-constellation-nav-toggle"),
    }));

    await navToggle.focus();
    await page.keyboard.press("Enter");
    const navWork = page.locator('[data-nav-view="work"]');
    await navWork.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
    const panelOpen = await page.locator("[data-content-panel]").evaluate((element) => ({
      open: element.classList.contains("is-open"),
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.inert,
      focusedClose: document.activeElement?.matches("[data-close-panel]") || false,
    }));
    await page.keyboard.press("Escape");
    const panelReturn = await page.evaluate(() => ({
      open: document.querySelector("[data-content-panel]")?.classList.contains("is-open"),
      focusedView: document.activeElement?.getAttribute("data-nav-view") || "",
    }));

    await page.keyboard.press("/");
    await page.keyboard.type("бег");
    await page.waitForTimeout(120);
    const searchState = await page.evaluate(() => {
      const input = document.querySelector("[data-command-input]");
      return {
        focused: document.activeElement === input,
        expanded: input?.getAttribute("aria-expanded"),
        activeDescendant: input?.getAttribute("aria-activedescendant"),
        results: document.querySelectorAll(".command-result").length,
      };
    });
    await page.keyboard.press("Escape");

    report.keyboard = {
      rovingBefore,
      rovingAfter,
      rovingChanged: Boolean(rovingBefore && rovingAfter && rovingBefore !== rovingAfter),
      inspectorOpen,
      inspectorReturn,
      navOpen,
      navReturn,
      panelOpen,
      panelReturn,
      searchState,
    };
    report.contrast.dark = await contrastAudit(page);
    report.runtimeErrors.push(...runtimeErrors);
    await context.close();

    for (const viewport of [
      { width: 896, height: 690, label: "896x690" },
      { width: 320, height: 568, label: "320x568" },
    ]) {
      const principleContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "light",
      });
      const principlePage = await principleContext.newPage();
      const principleErrors = collectRuntimeErrors(principlePage);
      await principlePage.goto(`${baseUrl}-principles-${viewport.label}`, {
        waitUntil: "networkidle",
      });
      await principlePage.waitForTimeout(300);
      report.principles.push({
        viewport: viewport.label,
        ...await principleTitleAudit(principlePage),
      });
      report.runtimeErrors.push(...principleErrors);
      await principleContext.close();
    }

    const materialStates = [
      {
        label: "1440x900-light-idle",
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
        action: "idle",
      },
      {
        label: "1440x900-dark-idle",
        viewport: { width: 1440, height: 900 },
        colorScheme: "dark",
        action: "idle",
      },
      {
        label: "1440x900-light-garage-hover",
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
        action: "garage-hover",
      },
      {
        label: "1440x900-dark-garage-hover",
        viewport: { width: 1440, height: 900 },
        colorScheme: "dark",
        action: "garage-hover",
      },
      {
        label: "1440x900-light-private-practice-hover",
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
        action: "private-practice-hover",
      },
      {
        label: "1440x900-dark-private-practice-hover",
        viewport: { width: 1440, height: 900 },
        colorScheme: "dark",
        action: "private-practice-hover",
      },
      {
        label: "1200x630-light-search",
        viewport: { width: 1200, height: 630 },
        colorScheme: "light",
        action: "search",
      },
      {
        label: "1200x630-dark-search",
        viewport: { width: 1200, height: 630 },
        colorScheme: "dark",
        action: "search",
      },
      {
        label: "1200x760-light-inspector",
        viewport: { width: 1200, height: 760 },
        colorScheme: "light",
        action: "inspector",
      },
      {
        label: "1200x760-dark-inspector",
        viewport: { width: 1200, height: 760 },
        colorScheme: "dark",
        action: "inspector",
      },
      {
        label: "1200x760-light-reel",
        viewport: { width: 1200, height: 760 },
        colorScheme: "light",
        action: "reel",
      },
      {
        label: "1200x760-dark-reel",
        viewport: { width: 1200, height: 760 },
        colorScheme: "dark",
        action: "reel",
      },
      {
        label: "1024x768-light-work",
        viewport: { width: 1024, height: 768 },
        colorScheme: "light",
        action: "work",
      },
      {
        label: "1024x768-dark-work",
        viewport: { width: 1024, height: 768 },
        colorScheme: "dark",
        action: "work",
      },
      {
        label: "1024x768-light-approach",
        viewport: { width: 1024, height: 768 },
        colorScheme: "light",
        action: "approach",
      },
      {
        label: "1024x768-dark-approach",
        viewport: { width: 1024, height: 768 },
        colorScheme: "dark",
        action: "approach",
      },
      {
        label: "1024x768-light-contact",
        viewport: { width: 1024, height: 768 },
        colorScheme: "light",
        action: "contact",
      },
      {
        label: "1024x768-dark-contact",
        viewport: { width: 1024, height: 768 },
        colorScheme: "dark",
        action: "contact",
      },
      {
        label: "390x844-light-idle",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        action: "idle",
      },
      {
        label: "390x844-dark-idle",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        action: "idle",
      },
      {
        label: "390x844-light-garage-hover",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        action: "garage-hover",
      },
      {
        label: "390x844-dark-garage-hover",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        action: "garage-hover",
      },
      {
        label: "390x844-light-system-hover",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        action: "system-hover",
      },
      {
        label: "390x844-dark-system-hover",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        action: "system-hover",
      },
      {
        label: "390x844-light-navigation",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        action: "navigation",
      },
      {
        label: "390x844-dark-navigation",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        action: "navigation",
      },
      {
        label: "390x844-light-search",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        action: "search",
      },
      {
        label: "390x844-dark-search",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        action: "search",
      },
      {
        label: "390x844-light-inspector",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        action: "inspector",
      },
      {
        label: "390x844-dark-inspector",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        action: "inspector",
      },
      {
        label: "390x844-light-work",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        action: "work",
      },
      {
        label: "390x844-dark-work",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        action: "work",
      },
      {
        label: "390x844-light-approach",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        action: "approach",
      },
      {
        label: "390x844-dark-approach",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        action: "approach",
      },
      {
        label: "390x844-light-contact",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        action: "contact",
      },
      {
        label: "390x844-dark-contact",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        action: "contact",
      },
      {
        label: "320x568-light-navigation",
        viewport: { width: 320, height: 568 },
        colorScheme: "light",
        action: "navigation",
      },
      {
        label: "320x568-dark-search",
        viewport: { width: 320, height: 568 },
        colorScheme: "dark",
        action: "search",
      },
      {
        label: "320x568-light-work",
        viewport: { width: 320, height: 568 },
        colorScheme: "light",
        action: "work",
      },
      {
        label: "320x568-dark-contact",
        viewport: { width: 320, height: 568 },
        colorScheme: "dark",
        action: "contact",
      },
    ];

    for (const state of materialStates) {
      const materialContext = await browser.newContext({
        viewport: state.viewport,
        colorScheme: state.colorScheme,
      });
      const materialPage = await materialContext.newPage();
      const materialErrors = collectRuntimeErrors(materialPage);
      await materialPage.goto(`${baseUrl}-material-${state.label}`, { waitUntil: "networkidle" });

      if (state.action === "search") {
        await materialPage.locator("[data-command-input]").focus();
      } else if (state.action === "system-hover") {
        await materialPage.locator(".display-control .theme-toggle").hover();
      } else if (state.action === "navigation") {
        await materialPage.locator("[data-constellation-nav-toggle]").click();
      } else if (state.action === "garage-hover") {
        await materialPage.locator('[data-map-id="garage"]').hover();
      } else if (state.action === "private-practice-hover") {
        await materialPage.locator('[data-map-id="private-practice"]').hover();
      } else if (state.action === "reel") {
        await materialPage.locator('[data-map-id="garage-site"]').hover();
      } else if (state.action === "inspector") {
        await materialPage.locator('[data-map-id="garage"]').click();
      } else if (["work", "approach", "contact"].includes(state.action)) {
        await materialPage.evaluate((view) => {
          document.querySelector(`[data-open-panel="${view}"]`)?.click();
        }, state.action);
      }

      await materialPage.waitForTimeout(760);
      const stateAudit = await materialAudit(materialPage);
      const consoleGeometry = await consoleGeometryAudit(materialPage);
      const stateTypography = await typographyAudit(materialPage, state.action);
      if (state.action === "garage-hover") {
        report.routes.push({
          label: state.label,
          ...await routeVisibilityAudit(materialPage, "garage", 9),
        });
      } else if (state.action === "private-practice-hover") {
        report.routes.push({
          label: state.label,
          ...await routeVisibilityAudit(materialPage, "private-practice", 8),
        });
      }
      stateAudit.label = state.label;
      stateAudit.action = state.action;
      stateAudit.theme = state.colorScheme;
      report.material.push(stateAudit);
      report.consoleGeometry.push({
        label: state.label,
        action: state.action,
        theme: state.colorScheme,
        ...consoleGeometry,
      });
      report.typography.push({
        label: state.label,
        action: state.action,
        theme: state.colorScheme,
        ...stateTypography,
      });
      await materialPage.screenshot({
        path: path.join(artifactDir, `${state.label}-material-gate.png`),
        fullPage: false,
      });
      report.runtimeErrors.push(...materialErrors);
      await materialContext.close();
    }

    const registeredMaterialNames = report.material[0]?.registeredNames || [];
    const activeMaterialNames = new Set(
      report.material.flatMap((state) => state.active.map((surface) => surface.surface)),
    );
    const activeThemesBySurface = Object.fromEntries(registeredMaterialNames.map((name) => [
      name,
      Array.from(new Set(report.material
        .filter((state) => state.active.some((surface) => surface.surface === name))
        .map((state) => state.theme)))
        .sort(),
    ]));
    report.materialCoverage = {
      registeredCount: registeredMaterialNames.length,
      activeCount: activeMaterialNames.size,
      missing: registeredMaterialNames.filter((name) => !activeMaterialNames.has(name)),
      missingThemes: Object.entries(activeThemesBySurface)
        .filter(([, themes]) => !themes.includes("light") || !themes.includes("dark"))
        .map(([surface, themes]) => ({ surface, themes })),
      activeThemesBySurface,
    };

    for (const colorScheme of ["light", "dark"]) {
      const reflowContext = await browser.newContext({
        viewport: { width: 320, height: 720 },
        colorScheme,
      });
      const reflowPage = await reflowContext.newPage();
      const reflowErrors = collectRuntimeErrors(reflowPage);
      await reflowPage.goto(`${baseUrl}-${colorScheme}-reflow`, { waitUntil: "networkidle" });
      await reflowPage.addStyleTag({
        content: "html { font-size: 200% !important; }",
      });
      await reflowPage.waitForTimeout(150);

      for (const panelName of ["work", "approach", "contact"]) {
        await reflowPage.evaluate((name) => {
          document.querySelector(`[data-open-panel="${name}"]`)?.click();
        }, panelName);
        await reflowPage.waitForTimeout(760);
        const state = await visibleOverflowAudit(reflowPage);
        state.panel = panelName;
        state.theme = colorScheme;
        report.reflow.push(state);
        await reflowPage.screenshot({
          path: path.join(
            artifactDir,
            `320x720-${colorScheme}-${panelName}-text-zoom-200-final.png`,
          ),
          fullPage: false,
        });
        await reflowPage.keyboard.press("Escape");
        await reflowPage.waitForTimeout(520);
      }

      if (colorScheme === "light") {
        report.contrast.light = await contrastAudit(reflowPage);
        await reflowPage.screenshot({
          path: path.join(artifactDir, "320x720-light-text-zoom-200-final.png"),
          fullPage: false,
        });
      }
      report.runtimeErrors.push(...reflowErrors);
      await reflowContext.close();
    }

    const reducedContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const reducedPage = await reducedContext.newPage();
    const reducedErrors = collectRuntimeErrors(reducedPage);
    await reducedPage.goto(`${baseUrl}-reduced`, { waitUntil: "networkidle" });
    const canvas = reducedPage.locator("[data-signal-constellation]");
    const reducedBefore = await canvas.screenshot();
    await pause(700);
    const reducedAfterIdle = await canvas.screenshot();
    await canvas.focus();
    await reducedPage.keyboard.press("Shift+ArrowRight");
    await reducedPage.waitForTimeout(80);
    const reducedAfterInput = await canvas.screenshot();
    report.reducedMotion = {
      mediaMatches: await reducedPage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      stableWhenIdle: Buffer.compare(reducedBefore, reducedAfterIdle) === 0,
      respondsToKeyboard: Buffer.compare(reducedAfterIdle, reducedAfterInput) !== 0,
      videosPaused: await reducedPage.evaluate(() => (
        Array.from(document.querySelectorAll("video")).every((video) => video.paused)
      )),
    };
    await reducedPage.screenshot({
      path: path.join(artifactDir, "390x844-dark-reduced-motion-final.png"),
    });
    report.runtimeErrors.push(...reducedErrors);
    await reducedContext.close();

    const forcedContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      forcedColors: "active",
    });
    const forcedPage = await forcedContext.newPage();
    const forcedErrors = collectRuntimeErrors(forcedPage);
    await forcedPage.goto(`${baseUrl}-forced`, { waitUntil: "networkidle" });
    const running = forcedPage.locator('[data-map-id="running"]');
    await running.focus();
    report.forcedColors = await forcedPage.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("[data-map-id]"));
      const focused = document.activeElement;
      return {
        mediaMatches: matchMedia("(forced-colors: active)").matches,
        visibleMapNodes: nodes.filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
        }).length,
        focusedMapId: focused?.dataset.mapId || "",
        focusOutline: focused ? getComputedStyle(focused.querySelector(".map-node__glyph")).outline : "",
      };
    });
    await forcedPage.screenshot({
      path: path.join(artifactDir, "390x844-dark-forced-colors-final.png"),
    });
    report.runtimeErrors.push(...forcedErrors);
    await forcedContext.close();
  } finally {
    await browser.close();
  }

  report.runtimeErrors = [...new Set(report.runtimeErrors)];
  await fs.writeFile(
    path.join(artifactDir, "headless-a11y-final.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(
    `Headless audit: ${report.material.length} rendered states; `
    + `${report.materialCoverage.activeCount}/${report.materialCoverage.registeredCount} `
    + `material surfaces active; contrast ${JSON.stringify(report.contrast)}.\n`,
  );

  const materialFailures = report.material.flatMap((state) => state.mismatches);
  const duplicateMaterialNames = report.material.flatMap((state) => state.duplicateNames);
  const hangingTypography = report.typography.flatMap((state) => state.hanging);
  const widowTypography = report.typography.flatMap((state) => state.widows);
  const consoleGeometryFailures = report.consoleGeometry.flatMap((state) => state.failures);
  const principleFailures = report.principles.flatMap((state) => state.failures);
  const contrastFailures = Object.entries(report.contrast).flatMap(([theme, values]) => [
    ["brand", values.brand, 4.5],
    ["navigationLabel", values.navigationLabel, 4.5],
    ["searchPlaceholder", values.searchPlaceholder, 4.5],
    ["focusIndicator", values.focusIndicator, 3],
  ].flatMap(([name, value, threshold]) => (
    Number(value) >= threshold ? [] : [`${theme}:${name}:${value}<${threshold}`]
  )));
  const reflowFailures = report.reflow.flatMap((state) => [
    ...(state.documentScrollWidth <= state.viewportWidth + 1
      ? []
      : [`${state.panel}:${state.theme}:document-overflow`]),
    ...(state.bodyScrollWidth <= state.viewportWidth + 1
      ? []
      : [`${state.panel}:${state.theme}:body-overflow`]),
    ...state.clippedText.map((entry) => `${state.panel}:${state.theme}:${entry.selector}`),
  ]);
  const ariaFailures = [
    report.aria.documentLanguage === "ru",
    report.aria.mapNodeCount === report.aria.uniqueMapNodeNames,
    report.aria.namedMapNodes,
    report.aria.canvas.role === "img",
    report.aria.canvas.tabIndex === 0,
    report.aria.canvas.named,
    report.aria.closedInspector.ariaHidden === "true",
    report.aria.closedInspector.inert,
    report.aria.closedPanel.ariaHidden === "true",
    report.aria.closedPanel.inert,
    report.aria.decorativeSpecksHidden === "true",
  ].filter((value) => !value);
  const keyboardFailures = [
    report.keyboard.rovingChanged,
    report.keyboard.inspectorOpen.open,
    !report.keyboard.inspectorReturn.open,
    report.keyboard.navOpen === "true",
    report.keyboard.navReturn.expanded === "false",
    report.keyboard.navReturn.focusedToggle,
    report.keyboard.panelOpen.open,
    report.keyboard.panelOpen.focusedClose,
    !report.keyboard.panelReturn.open,
    report.keyboard.searchState.focused,
    report.keyboard.searchState.expanded === "true",
    report.keyboard.searchState.results > 0,
  ].filter((value) => !value);
  const reducedMotionFailures = [
    report.reducedMotion.mediaMatches,
    report.reducedMotion.stableWhenIdle,
    report.reducedMotion.respondsToKeyboard,
    report.reducedMotion.videosPaused,
  ].filter((value) => !value);
  const forcedColorsFailures = [
    report.forcedColors.mediaMatches,
    report.forcedColors.visibleMapNodes === report.aria.mapNodeCount,
    Boolean(report.forcedColors.focusedMapId),
    Boolean(report.forcedColors.focusOutline),
  ].filter((value) => !value);
  const routeFailures = report.routes.filter((state) => state.failure);

  if (
    materialFailures.length
    || duplicateMaterialNames.length
    || report.materialCoverage.missing.length
    || report.materialCoverage.missingThemes.length
    || hangingTypography.length
    || widowTypography.length
    || consoleGeometryFailures.length
    || principleFailures.length
    || contrastFailures.length
    || reflowFailures.length
    || ariaFailures.length
    || keyboardFailures.length
    || reducedMotionFailures.length
    || forcedColorsFailures.length
    || routeFailures.length
    || report.runtimeErrors.length
  ) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
