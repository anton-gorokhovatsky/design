const { webkit } = require("playwright");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  clickMobileSearchDismissExpression,
  exposeMobileSearchDismissFallbackExpression,
  mobileMetricViewport,
  mobileSearchViewport,
  openMobileSearchExpression,
  readAnnotationHierarchyExpression,
  readCompactAuthorshipExpression,
  readMaterialAuditExpression,
  readMobileContactResumeExpression,
  readMobileMetricGroupsExpression,
  readMobileSearchArrowExpression,
  readMobileSearchDismissFallbackExpression,
  readMobileSearchFocusedExpression,
  readMobileSearchRestoredExpression,
  startStaticServer,
  validateAnnotationHierarchy,
  validateCompactAuthorship,
  validateMobileContactResume,
  validateMobileMetricGroups,
  validateMobileSearchContract,
  webkitCompactScenarios,
} = require("./browser-contracts.cjs");

let baseUrl = process.env.PORTFOLIO_AUDIT_URL || "";
const artifactDir = process.env.PORTFOLIO_AUDIT_DIR
  || path.join(os.tmpdir(), "portfolio-webkit-contracts");
const projectRoot = path.resolve(__dirname, "..");
const waitForLayout = async (page, milliseconds = 220) => {
  await page.waitForTimeout(milliseconds);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
};

const telemetryRequests = [];
const isolateThirdPartyTelemetry = async (page) => {
  await page.route("https://mc.yandex.ru/**", (route) => {
    telemetryRequests.push(route.request().url());
    return route.abort();
  });
};

const annotationHierarchyAudit = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  const page = await context.newPage();
  await isolateThirdPartyTelemetry(page);
  attachRuntimeLog(page, "1440x900-light-annotation-hierarchy");
  await page.goto(`${baseUrl}-annotation-hierarchy`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts?.ready);
  await waitForLayout(page, 500);
  const state = await page.evaluate(readAnnotationHierarchyExpression);
  await page.screenshot({
    path: path.join(artifactDir, "1440x900-light-annotation-hierarchy.png"),
    fullPage: false,
  });
  await context.close();

  return {
    failures: validateAnnotationHierarchy(state),
    state,
  };
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

const materialAudit = async (page) => page.evaluate(readMaterialAuditExpression);

const readStackState = (page, panelName, expectedScroll, inputMode) => {
  const selector = panelName === "work"
    ? ".work-intro, .work-list .work-row"
    : ".approach-intro, .approach-grid li";

  return page.evaluate(({
    surfaceSelector,
    expectedScrollTop,
    mode,
  }) => {
    const body = document.querySelector(".content-panel__body");
    const bodyRect = body.getBoundingClientRect();
    const bodyStyle = getComputedStyle(body);
    const surfaces = Array.from(document.querySelectorAll(surfaceSelector));
    const geometry = surfaces.map((surface, index) => {
      const rect = surface.getBoundingClientRect();
      const style = getComputedStyle(surface);
      const childOpacities = Array.from(surface.children)
        .filter((child) => getComputedStyle(child).display !== "none")
        .map((child) => Number(getComputedStyle(child).opacity));
      return {
        index,
        active: surface.classList.contains("is-content-stack-active"),
        behind: surface.classList.contains("is-content-stack-behind"),
        hidden: surface.classList.contains("is-content-stack-hidden"),
        position: style.position,
        zIndex: Number(style.zIndex) || 0,
        childOpacities,
        stackTop: Number.parseFloat(
          style.getPropertyValue("--content-stack-top"),
        ) || 0,
        inlineStackTop: surface.style.getPropertyValue("--content-stack-top"),
        clipPath: style.clipPath,
        top: rect.top,
        topOffset: rect.top - bodyRect.top,
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
    const overlap = active && next
      ? Math.max(0, active.bottom - next.top)
      : 0;
    const centerX = Math.round((bodyRect.left + bodyRect.right) / 2);
    const centerY = Math.round((bodyRect.top + bodyRect.bottom) / 2);
    const hit = document.elementFromPoint(centerX, centerY);
    const hitInsideBody = Boolean(hit && body.contains(hit));

    return {
      inputMode: mode,
      expectedScroll: expectedScrollTop,
      actualScroll: body.scrollTop,
      interaction: {
        pointerEvents: bodyStyle.pointerEvents,
        touchAction: bodyStyle.touchAction,
        hitInsideBody,
      },
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
      geometry,
      active,
      next,
      activeText,
      overlap,
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
          active.topOffset < active.stackTop - 2
          || active.left < bodyRect.left - 1
          || active.right > bodyRect.right + 1
        )
          ? ["active surface is clipped outside the scroll viewport"]
          : []),
        ...(overlap > 0 && next.zIndex <= active.zIndex
          ? ["incoming surface is layered below the active surface"]
          : []),
        ...(active && active.childOpacities.some((opacity) => opacity < 0.99)
          ? ["active surface copy is faded or unreadable"]
          : []),
        ...(geometry.some((item) => item.clipPath !== "none")
          ? ["stack surfaces must remain complete shapes without clipping"]
          : []),
        ...(geometry.some((item) => item.inlineStackTop)
          ? ["runtime rewrites a stack surface plane"]
          : []),
        ...(overlap > 0
          && next.childOpacities.some((opacity) => opacity < 0.99)
          ? ["incoming surface copy is faded or unreadable"]
          : []),
        ...(geometry
          .filter((item) => item.behind || item.hidden)
          .some((item) => item.childOpacities.some((opacity) => opacity > 0.01))
          ? ["quiet or hidden stack layers expose competing copy"]
          : []),
        ...(bodyStyle.pointerEvents === "none"
          ? ["scroll viewport rejects pointer input"]
          : []),
        ...(!bodyStyle.touchAction.includes("pan-y")
          ? ["scroll viewport does not expose native pan-y"]
          : []),
        ...(!hitInsideBody
          ? ["scroll viewport loses the center hit test"]
          : []),
      ],
    };
  }, {
    surfaceSelector: selector,
    expectedScrollTop: expectedScroll,
    mode: inputMode,
  });
};

const stackAudit = async (
  page,
  panelName,
  captureLabel,
  { nativeWheel = true } = {},
) => {
  await page.evaluate((name) => {
    document.querySelector(`[data-open-panel="${name}"]`)?.click();
  }, panelName);
  await waitForLayout(page, 400);

  const maxScroll = await page.locator(".content-panel__body").evaluate(
    (element) => Math.max(0, element.scrollHeight - element.clientHeight),
  );
  const surfaceSelector = panelName === "work"
    ? ".work-intro, .work-list .work-row"
    : ".approach-intro, .approach-grid li";
  const overlapStops = await page.evaluate(({ selector, maximum }) => {
    const body = document.querySelector(".content-panel__body");
    const bodyRect = body.getBoundingClientRect();
    const scrollTop = body.scrollTop;
    const overlapInset = Math.max(
      72,
      Math.min(112, Math.round(body.clientHeight * 0.14)),
    );
    return Array.from(document.querySelectorAll(selector))
      .slice(1)
      .map((surface) => (
        surface.getBoundingClientRect().top
        - bodyRect.top
        + scrollTop
        - overlapInset
      ))
      .map((stop) => Math.max(0, Math.min(maximum, Math.round(stop))));
  }, { selector: surfaceSelector, maximum: maxScroll });
  const stops = Array.from(new Set([
    0,
    Math.round(maxScroll * 0.25),
    Math.round(maxScroll * 0.5),
    Math.round(maxScroll * 0.75),
    maxScroll,
    ...overlapStops,
  ])).sort((a, b) => a - b);
  const scrollSequence = [
    ...stops,
    ...stops.slice(0, -1).reverse(),
  ];
  const states = [];
  let capturedMidOverlap = false;

  for (const scrollTop of scrollSequence) {
    await page.locator(".content-panel__body").evaluate((element, top) => {
      element.scrollTop = top;
      element.dispatchEvent(new Event("scroll"));
    }, scrollTop);
    await waitForLayout(page);
    const state = await readStackState(
      page,
      panelName,
      scrollTop,
      "programmatic",
    );
    states.push(state);
    if (!capturedMidOverlap && state.overlap > 0) {
      capturedMidOverlap = true;
      await page.screenshot({
        path: path.join(
          artifactDir,
          `${captureLabel}-${panelName}-mid-overlap.png`,
        ),
        fullPage: false,
      });
    }
  }

  const finalProgrammaticState = states.at(-1);
  if (!capturedMidOverlap && finalProgrammaticState) {
    finalProgrammaticState.failures.push(
      "stack sequence never captured a real incoming-card overlap",
    );
  }
  if (
    finalProgrammaticState
    && (
      finalProgrammaticState.actualScroll > 1
      || finalProgrammaticState.activeIndex !== 0
    )
  ) {
    finalProgrammaticState.failures.push(
      "reverse stack sequence did not fully restore the initial state",
    );
  }

  const physicalInvariantFailures = [];
  const forwardStates = states.slice(0, stops.length);
  const reverseStates = states.slice(stops.length);
  const surfaceCount = forwardStates[0]?.geometry.length || 0;

  for (let surfaceIndex = 0; surfaceIndex < surfaceCount; surfaceIndex += 1) {
    const samples = states.map((state) => state.geometry[surfaceIndex]);
    const heightSpread = Math.max(...samples.map((item) => item.height))
      - Math.min(...samples.map((item) => item.height));
    const planeSpread = Math.max(...samples.map((item) => item.stackTop))
      - Math.min(...samples.map((item) => item.stackTop));

    if (heightSpread > 1) {
      physicalInvariantFailures.push(
        `surface ${surfaceIndex} changes height while other cards arrive`,
      );
    }
    if (planeSpread > 0.1) {
      physicalInvariantFailures.push(
        `surface ${surfaceIndex} changes its fixed stack plane`,
      );
    }

    for (let index = 1; index < forwardStates.length; index += 1) {
      const previous = forwardStates[index - 1].geometry[surfaceIndex];
      const current = forwardStates[index].geometry[surfaceIndex];
      if (current.topOffset > previous.topOffset + 1) {
        physicalInvariantFailures.push(
          `surface ${surfaceIndex} rises again during forward travel`,
        );
        break;
      }
      if (current.topOffset < current.stackTop - 2) {
        physicalInvariantFailures.push(
          `surface ${surfaceIndex} crosses above its fixed stack plane`,
        );
        break;
      }
    }

    for (const reverseState of reverseStates) {
      const matchingForward = forwardStates.find(
        (state) => state.expectedScroll === reverseState.expectedScroll,
      );
      if (!matchingForward) {
        continue;
      }
      const forward = matchingForward.geometry[surfaceIndex];
      const reverse = reverseState.geometry[surfaceIndex];
      if (
        Math.abs(forward.topOffset - reverse.topOffset) > 1
        || Math.abs(forward.height - reverse.height) > 1
      ) {
        physicalInvariantFailures.push(
          `surface ${surfaceIndex} does not return to the same geometry`,
        );
        break;
      }
    }
  }

  await page.locator(".content-panel__body").evaluate((element) => {
    element.scrollTop = 0;
  });
  await waitForLayout(page, 320);
  const bodyBox = await page.locator(".content-panel__body").boundingBox();
  const nativeStates = [];

  if (nativeWheel && bodyBox) {
    nativeStates.push(
      await readStackState(page, panelName, 0, "native-wheel"),
    );
    await page.mouse.move(
      bodyBox.x + bodyBox.width / 2,
      bodyBox.y + Math.min(bodyBox.height - 24, bodyBox.height * 0.62),
    );
    for (let index = 0; index < 3; index += 1) {
      await page.mouse.wheel(0, Math.max(180, Math.round(bodyBox.height * 0.42)));
      await waitForLayout(page, 300);
      nativeStates.push(await readStackState(
        page,
        panelName,
        null,
        "native-wheel",
      ));
    }
    for (let index = 0; index < 2; index += 1) {
      await page.mouse.wheel(
        0,
        -Math.max(180, Math.round(bodyBox.height * 0.42)),
      );
      await waitForLayout(page, 300);
      nativeStates.push(await readStackState(
        page,
        panelName,
        null,
        "native-wheel-reverse",
      ));
    }
  }

  const maximumNativeScroll = nativeStates.length
    ? Math.max(...nativeStates.map((state) => state.actualScroll))
    : 0;
  const nativeMoved = !nativeWheel
    || maximumNativeScroll > 0;
  if (nativeWheel && !nativeMoved && nativeStates.length) {
    nativeStates.at(-1).failures.push(
      "native WebKit wheel input did not move the scroll viewport",
    );
  }
  const nativeReturned = !nativeWheel
    || (
      nativeStates.length > 1
      && nativeStates.at(-1).actualScroll < maximumNativeScroll
    );
  if (nativeWheel && !nativeReturned && nativeStates.length) {
    nativeStates.at(-1).failures.push(
      "reverse WebKit wheel input did not move the scroll viewport upward",
    );
  }

  await page.screenshot({
    path: path.join(artifactDir, `${captureLabel}-${panelName}-stack.png`),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await waitForLayout(page, 420);
  return {
    panelName,
    maxScroll,
    states,
    nativeStates,
    physicalInvariantFailures,
    failures: [
      ...physicalInvariantFailures.map(
        (failure) => `${panelName}/physical-invariant: ${failure}`,
      ),
      ...[...states, ...nativeStates].flatMap((state) => (
        state.failures.map(
          (failure) => `${panelName}/${state.inputMode}@${state.actualScroll}: ${failure}`,
        )
      )),
    ],
  };
};

const routeAudit = async (page, mapId, expectedCount) => {
  await page.evaluate(() => {
    document.querySelector(".content-panel.is-open [data-close-panel]")?.click();
    document.querySelector(".map-inspector.is-open [data-close-inspector]")?.click();
    document.querySelector(
      "[data-constellation-nav].is-open [data-constellation-nav-toggle]",
    )?.click();
  });
  await page.mouse.move(1, 1);
  await waitForLayout(page, 420);

  const baselinePaths = await page.evaluate(() => (
    Array.from(document.querySelectorAll("[data-map-links] path"))
      .map((path) => path.getAttribute("d"))
  ));

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

  const readRouteState = (mode) => page.evaluate(({
    id,
    count,
    phase,
    baseline,
  }) => {
    const field = document.querySelector("[data-signal-field]");
    const paths = Array.from(document.querySelectorAll("[data-map-links] path"));
    const active = paths
      .filter((path) => path.classList.contains("is-active-relation"))
      .filter((path) => Number(getComputedStyle(path).opacity) > 0);
    const changed = paths.filter((path, index) => (
      path.getAttribute("d") !== baseline[index]
    ));
    const badPaths = active.filter((path) => {
      const data = path.getAttribute("d") || "";
      return !data || /NaN|undefined|Infinity/.test(data);
    });
    const stateId = phase === "hover"
      ? field?.dataset.focusId || ""
      : field?.dataset.selectedId || "";
    const getMaximumCurveDeflection = (path) => {
      const numbers = (path.getAttribute("d") || "")
        .match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
      if (numbers.length !== 8) return 0;
      const [startX, startY, control1X, control1Y, control2X, control2Y, endX, endY]
        = numbers;
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const length = Math.hypot(deltaX, deltaY) || 1;
      const distanceFromChord = (x, y) => Math.abs(
        deltaY * x - deltaX * y + endX * startY - endY * startX
      ) / length;
      return Math.max(
        distanceFromChord(control1X, control1Y),
        distanceFromChord(control2X, control2Y),
      );
    };
    const minimumActiveDeflection = active.length
      ? Math.min(...active.map(getMaximumCurveDeflection))
      : 0;
    const changedActiveCount = active.filter((path) => changed.includes(path)).length;
    const changedInactiveCount = changed.filter((path) => (
      !path.classList.contains("is-active-relation")
    )).length;
    const requiresExactRelationshipFamily = phase === "hover";

    return {
      phase,
      stateId,
      activeCount: active.length,
      changedCount: changed.length,
      changedActiveCount,
      changedInactiveCount,
      minimumActiveDeflection,
      pendingAnimations: paths.reduce((total, path) => (
        total
        + path.querySelectorAll("animate").length
        + Number(path.dataset.relationMorphing === "true")
      ), 0),
      badPaths: badPaths.length,
      failure: active.length !== count
        || changedActiveCount !== count
        || (requiresExactRelationshipFamily && changed.length !== count)
        || (requiresExactRelationshipFamily && changedInactiveCount !== 0)
        || minimumActiveDeflection < 0.8
        || paths.some((path) => (
          path.querySelector("animate") || path.dataset.relationMorphing === "true"
        ))
        || badPaths.length > 0,
    };
  }, {
    id: mapId,
    count: expectedCount,
    phase: mode,
    baseline: baselinePaths,
  });

  await page.locator(`[data-map-id="${mapId}"]`).hover({ force: true });
  await waitForLayout(page, 620);
  const hover = await readRouteState("hover");

  await page.mouse.move(1, 1);
  await waitForLayout(page, 620);
  await page.evaluate((id) => {
    document.querySelector(`[data-map-id="${id}"]`)?.click();
  }, mapId);
  await waitForLayout(page, 620);
  const click = await readRouteState("click");
  click.failure = click.failure || click.stateId !== mapId;

  return {
    mapId,
    hitTest,
    hover,
    click,
    failure: !hitTest.hitInsideNode || hover.failure || click.failure,
  };
};

const reducedMotionRelationsAudit = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await isolateThirdPartyTelemetry(page);
  attachRuntimeLog(page, "reduced-motion-relations");
  await page.goto(`${baseUrl}-reduced-motion-relations`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts?.ready);
  await waitForLayout(page, 500);

  const state = await page.evaluate(() => new Promise((resolve) => {
    const paths = Array.from(document.querySelectorAll("[data-map-links] path"));
    const baseline = paths.map((path) => path.getAttribute("d"));
    document.querySelector('[data-map-id="garage"]')?.click();
    window.setTimeout(() => {
      const active = paths.filter((path) => path.classList.contains("is-active-relation"));
      const changed = paths.filter((path, index) => (
        path.getAttribute("d") !== baseline[index]
      ));
      resolve({
        selectedId: document.querySelector("[data-signal-field]")?.dataset.selectedId || "",
        activeCount: active.length,
        changedCount: changed.length,
        pendingAnimations: paths.reduce((total, path) => (
          total
          + path.querySelectorAll("animate").length
          + Number(path.dataset.relationMorphing === "true")
        ), 0),
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
    }, 620);
  }));
  await context.close();

  return {
    ...state,
    failure: state.selectedId !== "garage"
      || state.activeCount !== 9
      || state.changedCount !== 0
      || state.pendingAnimations !== 0
      || !state.reducedMotion,
  };
};

const childRelationsAudit = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  const page = await context.newPage();
  await isolateThirdPartyTelemetry(page);
  attachRuntimeLog(page, "child-relations");
  await page.goto(`${baseUrl}-child-relations`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts?.ready);
  await waitForLayout(page, 500);

  const state = await page.evaluate(() => new Promise((resolve) => {
    const paths = Array.from(document.querySelectorAll("[data-map-links] path"));
    const baseline = paths.map((path) => path.getAttribute("d"));
    const getMaximumCurveDeflection = (path) => {
      const numbers = (path.getAttribute("d") || "")
        .match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
      if (numbers.length !== 8) return 0;
      const [startX, startY, control1X, control1Y, control2X, control2Y, endX, endY]
        = numbers;
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const length = Math.hypot(deltaX, deltaY) || 1;
      const distanceFromChord = (x, y) => Math.abs(
        deltaY * x - deltaX * y + endX * startY - endY * startX
      ) / length;
      return Math.max(
        distanceFromChord(control1X, control1Y),
        distanceFromChord(control2X, control2Y),
      );
    };
    document.querySelector('[data-map-id="narkomfin"]')?.click();
    const readState = () => {
      const active = paths.filter((path) => path.classList.contains("is-active-relation"));
      const changed = paths.filter((path, index) => (
        path.getAttribute("d") !== baseline[index]
      ));
      return {
        selectedId: document.querySelector("[data-signal-field]")?.dataset.selectedId || "",
        activeCount: active.length,
        changedCount: changed.length,
        changedActiveCount: active.filter((path) => changed.includes(path)).length,
        changedInactiveCount: changed.filter((path) => (
          !path.classList.contains("is-active-relation")
        )).length,
        minimumActiveDeflection: active.length
          ? Math.min(...active.map(getMaximumCurveDeflection))
          : 0,
        pendingAnimations: paths.reduce((total, path) => (
          total
          + path.querySelectorAll("animate").length
          + Number(path.dataset.relationMorphing === "true")
        ), 0),
      };
    };
    const startedAt = performance.now();
    const settle = () => {
      const nextState = readState();
      const ready = nextState.selectedId === "narkomfin"
        && nextState.activeCount === 1
        && nextState.changedCount === 1
        && nextState.changedActiveCount === 1
        && nextState.changedInactiveCount === 0
        && nextState.minimumActiveDeflection >= 0.8
        && nextState.pendingAnimations === 0;
      if (ready || performance.now() - startedAt >= 5000) {
        resolve(nextState);
        return;
      }
      requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  }));
  await context.close();

  return {
    ...state,
    failure: state.selectedId !== "narkomfin"
      || state.activeCount !== 1
      || state.changedCount !== 1
      || state.changedActiveCount !== 1
      || state.changedInactiveCount !== 0
      || state.minimumActiveDeflection < 0.8
      || state.pendingAnimations !== 0,
  };
};

const relationshipCascadeAudit = async (page) => {
  await page.evaluate(() => {
    document.querySelector(".content-panel.is-open [data-close-panel]")?.click();
    document.querySelector(".map-inspector.is-open [data-close-inspector]")?.click();
    document.querySelector(
      "[data-constellation-nav].is-open [data-constellation-nav-toggle]",
    )?.click();
    document.querySelector('[data-map-filter="all"]')?.click();
    document.querySelector('[data-map-filter="project"]')?.click();
    document.querySelector('[data-map-id="private-practice"]')?.click();
  });
  await waitForLayout(page, 420);

  const filtered = await page.evaluate(() => {
    const root = document.querySelector("[data-map-links]");
    const active = Array.from(
      root?.querySelectorAll("path.is-private-practice-link.is-active-relation") || [],
    );
    const hidden = Array.from(root?.querySelectorAll("path.is-filter-hidden") || []);
    const rootOpacity = Number(getComputedStyle(root).opacity);
    const minimumActiveOpacity = active.length
      ? Math.min(...active.map((path) => Number(getComputedStyle(path).opacity)))
      : 0;
    const maximumActiveOpacity = active.length
      ? Math.max(...active.map((path) => Number(getComputedStyle(path).opacity)))
      : 0;
    const maximumHiddenOpacity = hidden.length
      ? Math.max(...hidden.map((path) => Number(getComputedStyle(path).opacity)))
      : 0;
    const filter = new URL(location.href).searchParams.get("filter");
    const activeKinds = document.querySelector("[data-practice-map]")
      ?.dataset.activeKinds;

    return {
      filter,
      activeKinds,
      rootOpacity,
      activeCount: active.length,
      hiddenCount: hidden.length,
      minimumActiveOpacity,
      maximumActiveOpacity,
      maximumHiddenOpacity,
      failure: filter !== "project"
        || activeKinds !== "project"
        || rootOpacity < 0.99
        || active.length !== 9
        || minimumActiveOpacity < 0.15
        || maximumActiveOpacity > 0.17
        || maximumHiddenOpacity > 0.01,
    };
  });

  await page.evaluate(() => {
    document.querySelector(".map-inspector.is-open [data-close-inspector]")?.click();
    document.querySelector('[data-map-filter="all"]')?.click();
  });
  const input = page.locator("[data-command-input]");
  await input.fill("Сайт музея");
  await waitForLayout(page, 420);

  const search = await page.evaluate(() => {
    const root = document.querySelector("[data-map-links]");
    const active = Array.from(root?.querySelectorAll("path.is-active-relation") || []);
    const rootOpacity = Number(getComputedStyle(root).opacity);
    const minimumActiveOpacity = active.length
      ? Math.min(...active.map((path) => Number(getComputedStyle(path).opacity)))
      : 0;

    return {
      rootOpacity,
      relationshipId: root?.dataset.relationshipId || "",
      activeCount: active.length,
      minimumActiveOpacity,
      failure: rootOpacity < 0.99
        || root?.dataset.relationshipId !== "garage-site"
        || active.length !== 1
        || minimumActiveOpacity < 0.7,
    };
  });

  await input.fill("");
  await input.press("Escape");
  await waitForLayout(page, 220);

  return {
    filtered,
    search,
    failure: filtered.failure || search.failure,
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
  const resume = await page.evaluate(readMobileContactResumeExpression);
  const resumeFailures = validateMobileContactResume(resume);
  state.resume = resume;
  state.resumeFailures = resumeFailures;
  state.failure = state.failure || resumeFailures.length > 0;
  await page.keyboard.press("Escape");
  await waitForLayout(page, 420);
  return state;
};

const firstPaintAudit = async (browser, viewport, colorScheme) => {
  const context = await browser.newContext({ viewport, colorScheme });
  const page = await context.newPage();
  await isolateThirdPartyTelemetry(page);
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
          themeColor: document.querySelector('meta[name="theme-color"]')?.content || "",
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
      themeColors: [...new Set(samples.map(({ themeColor }) => themeColor))],
      themeAtEnd: document.documentElement.dataset.theme,
    };
  });
  const expectedThemeColor = colorScheme === "dark" ? "#11120f" : "#eeede7";
  if (
    result.themeColors.length !== 1
    || result.themeColors[0] !== expectedThemeColor
  ) {
    result.failures.push({
      surface: "theme-color",
      background: result.themeColors.join(",") || "missing",
      backdrop: `expected ${expectedThemeColor}`,
    });
  }
  result.expectedThemeColor = expectedThemeColor;
  await context.close();
  return result;
};

const commandDockAxisAudit = async (page) => page.evaluate(() => {
  const centerY = (selector) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect ? rect.top + rect.height / 2 : null;
  };
  const centers = {
    dock: centerY(".control-console .command-dock"),
    mark: centerY(".control-console .command-dock__mark"),
    input: centerY(".control-console .command-dock input"),
    submit: centerY(".control-console .command-dock__submit"),
    submitMark: centerY(".command-dock__submit-mark"),
  };
  const missing = Object.entries(centers)
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  const deltas = Object.fromEntries(
    Object.entries(centers)
      .filter(([name, value]) => name !== "dock" && value !== null)
      .map(([name, value]) => [name, value - centers.dock]),
  );
  const maxDelta = Math.max(
    0,
    ...Object.values(deltas).map((value) => Math.abs(value)),
  );
  return {
    centers,
    deltas,
    maxDelta,
    missing,
    failure: missing.length > 0 || maxDelta > 0.5,
  };
});

const mobileSearchViewportAudit = async (browser) => {
  const context = await browser.newContext({
    viewport: {
      width: mobileSearchViewport.width,
      height: mobileSearchViewport.height,
    },
    colorScheme: "dark",
    hasTouch: true,
    isMobile: true,
    screen: {
      width: mobileSearchViewport.screenWidth,
      height: mobileSearchViewport.screenHeight,
    },
  });
  const page = await context.newPage();
  await isolateThirdPartyTelemetry(page);
  attachRuntimeLog(page, "390x430-dark-mobile-search");
  await page.goto(`${baseUrl}-mobile-search#map`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts?.ready);
  const authorship = await page.evaluate(readCompactAuthorshipExpression);
  await page.screenshot({
    path: path.join(artifactDir, "390x430-dark-mobile-authorship.png"),
    fullPage: false,
  });
  await page.evaluate(openMobileSearchExpression);
  await waitForLayout(page, 160);

  const focused = await page.evaluate(readMobileSearchFocusedExpression);

  await page.screenshot({
    path: path.join(artifactDir, "390x430-dark-mobile-search.png"),
    fullPage: false,
  });

  await page.evaluate(exposeMobileSearchDismissFallbackExpression);
  await waitForLayout(page, 40);
  const fallback = await page.evaluate(
    readMobileSearchDismissFallbackExpression,
  );
  await page.screenshot({
    path: path.join(artifactDir, "390x430-dark-mobile-search-dismiss.png"),
    fullPage: false,
  });
  await page.evaluate(clickMobileSearchDismissExpression);
  await waitForLayout(page, 160);
  const dismissed = await page.evaluate(readMobileSearchRestoredExpression);

  await page.evaluate(openMobileSearchExpression);
  await waitForLayout(page, 140);
  await page.keyboard.press("ArrowUp");
  const arrow = await page.evaluate(readMobileSearchArrowExpression);

  await page.keyboard.press("Escape");
  await waitForLayout(page, 140);
  const restored = await page.evaluate(readMobileSearchRestoredExpression);

  await page.setViewportSize(mobileMetricViewport);
  await page.goto(
    `${baseUrl}-narkomfin-number&point=narkomfin#map`,
    { waitUntil: "networkidle" },
  );
  await page.evaluate(() => document.fonts?.ready);
  await waitForLayout(page, 180);
  const metricGroups = await page.evaluate(readMobileMetricGroupsExpression);
  const failures = [
    ...validateCompactAuthorship(authorship),
    ...validateMobileSearchContract({
      arrow,
      dismissed,
      fallback,
      focused,
      restored,
    }),
    ...validateMobileMetricGroups(metricGroups),
  ].map((failure) => failure.message);
  await page.screenshot({
    path: path.join(artifactDir, "390x844-dark-narkomfin-number.png"),
    fullPage: false,
  });
  await context.close();

  return {
    arrow,
    authorship,
    dismissed,
    failure: failures.length > 0,
    failures,
    fallback,
    focused,
    metricGroups,
    restored,
  };
};

const projectGlyphAudit = async (page) => page.evaluate(() => {
  const glyphs = [...document.querySelectorAll(
    ".map-node--project .map-node__glyph",
  )].map((glyph) => {
    const node = glyph.closest(".map-node");
    return {
      id: node?.dataset.mapId || "",
      background: getComputedStyle(glyph).backgroundColor,
    };
  });
  const opaque = glyphs.filter(
    ({ background }) => background !== "rgba(0, 0, 0, 0)",
  );
  return {
    count: glyphs.length,
    opaque,
    failure: glyphs.length === 0 || opaque.length > 0,
  };
});

const analyticsConsentAudit = async (page, viewport, label) => {
  await page.goto(
    `${baseUrl}-analytics-${label}&analytics-consent=show`,
    { waitUntil: "networkidle" },
  );
  await waitForLayout(page, 180);
  const result = await page.evaluate(() => {
    const consent = document.querySelector("[data-analytics-consent]");
    const rect = consent?.getBoundingClientRect();
    const analyticsActions = consent
      ?.querySelector(".settings-panel__analytics-actions")
      ?.getBoundingClientRect();
    const privacyDetails = consent
      ?.querySelector(".settings-panel__privacy")
      ?.getBoundingClientRect();
    const analyticsTail = consent
      ?.querySelector(".settings-panel__details")
      ?.getBoundingClientRect();
    const input = document.querySelector("[data-command-input]");
    const read = (selector) => {
      const element = document.querySelector(selector);
      const bounds = element?.getBoundingClientRect();
      const style = element ? getComputedStyle(element) : null;
      return bounds && style ? {
        width: bounds.width,
        opacity: Number(style.opacity),
        visibility: style.visibility,
      } : null;
    };
    const activeStyle = document.activeElement
      ? getComputedStyle(document.activeElement)
      : null;
    const theme = read("#settings-panel [data-theme-toggle]");
    const motion = read("#settings-panel [data-motion-toggle]");
    return {
      visible: Boolean(consent && !consent.hidden && consent.classList.contains("is-open")),
      inert: consent?.inert ?? true,
      focusInside: Boolean(consent?.contains(document.activeElement)),
      role: consent?.getAttribute("role") || "",
      modal: consent?.getAttribute("aria-modal") || "",
      closeExists: Boolean(consent?.querySelector("[data-close-settings]")),
      preferenceLabel: consent?.querySelector("[data-analytics-preference]")
        ?.innerText.trim() || "",
      stateCopy: consent?.querySelector(".settings-panel__analytics-state p")
        ?.innerText.replace(/\s+/g, " ").trim() || "",
      open: consent?.open ?? false,
      searchPrivate: input?.classList.contains("ym-disable-keys") ?? false,
      trackerScripts: Array.from(document.scripts).filter((script) => (
        script.src.includes("mc.yandex.ru")
      )).length,
      preference: localStorage.getItem("anton-signal-analytics"),
      bodyHasSettings: document.body.classList.contains("has-settings-panel"),
      command: read(".command-dock"),
      dock: read(".system-dock"),
      navigation: read("[data-constellation-nav-toggle]"),
      theme,
      motion,
      themeLabel: document.querySelector("[data-theme-panel-state]")
        ?.textContent.trim() || "",
      analyticsLauncherLabel: document.querySelector("[data-analytics-summary]")
        ?.textContent.trim() || "",
      analyticsLauncherWhiteSpace: getComputedStyle(
        document.querySelector("[data-analytics-summary]"),
      ).whiteSpace,
      privacyRows: Array.from(document.querySelectorAll(".settings-panel__privacy > div"))
        .map((row) => row.textContent.replace(/\s+/g, " ").trim()),
      detailsLabel: document.querySelector(".settings-panel__details")
        ?.textContent.trim() || "",
      detailsHref: document.querySelector(".settings-panel__details")?.href || "",
      detailsDisplay: getComputedStyle(
        document.querySelector(".settings-panel__details"),
      ).display,
      allowLabel: document.querySelector("[data-analytics-allow]")
        ?.innerText.trim() || "",
      denyLabel: document.querySelector("[data-analytics-deny]")
        ?.innerText.trim() || "",
      visibleActions: Array.from(
        document.querySelectorAll(".settings-panel__analytics-actions button"),
      ).filter((button) => button.getClientRects().length > 0)
        .map((button) => button.innerText.trim()),
      stateMarker: (() => {
        const marker = document.querySelector(".settings-panel__analytics-marker");
        const bounds = marker?.getBoundingClientRect();
        return bounds && marker ? {
          width: bounds.width,
          height: bounds.height,
          backgroundColor: getComputedStyle(marker).backgroundColor,
        } : null;
      })(),
      themeColorMatches: document.querySelector('meta[name="theme-color"]')?.content
        === (document.documentElement.dataset.theme === "dark" ? "#11120f" : "#eeede7"),
      pointerOutlineStyle: activeStyle?.outlineStyle || "",
      mapNodesOpacity: Number(getComputedStyle(document.querySelector(".map-nodes")).opacity),
      signalOpacity: Number(
        getComputedStyle(document.querySelector(".signal-constellation")).opacity,
      ),
      axisLabelOpacity: Number(
        getComputedStyle(document.querySelector(".map-axis-label")).opacity,
      ),
      rect: rect ? {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      } : null,
      trailingGap: rect && analyticsTail
        ? rect.bottom - analyticsTail.bottom
        : null,
      actionBeforePrivacy: Boolean(
        analyticsActions
        && privacyDetails
        && analyticsActions.bottom <= privacyDetails.top,
      ),
      privacyBeforeDetails: Boolean(
        privacyDetails
        && analyticsTail
        && privacyDetails.bottom <= analyticsTail.top,
      ),
    };
  });
  await page.screenshot({
    path: path.join(artifactDir, `${label}-analytics-consent.png`),
    fullPage: false,
  });
  await page.evaluate(() => {
    document.querySelector("[data-close-settings]")?.click();
    document.querySelector("[data-nav-utility][data-open-settings]")?.click();
  });
  await waitForLayout(page, 80);
  const generalSettings = await page.evaluate(() => {
    const panel = document.querySelector("[data-settings-panel]");
    const body = panel?.querySelector(".settings-panel__body");
    const tail = panel
      ?.querySelector(".settings-panel__details")
      ?.getBoundingClientRect();
    const action = panel
      ?.querySelector(".settings-panel__analytics-actions")
      ?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    const rect = panel?.getBoundingClientRect();

    return {
      mode: panel?.dataset.settingsMode || "",
      title: panel?.querySelector("[data-settings-title]")?.innerText.trim() || "",
      screenControlsVisible: Boolean(
        panel?.querySelector("[data-settings-screen-controls]")?.getClientRects().length,
      ),
      bodyScrollable: Boolean(body && body.scrollHeight > body.clientHeight + 1),
      overflowX: document.documentElement.scrollWidth
        - document.documentElement.clientWidth,
      rect: rect ? {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      } : null,
      trailingGap: rect && tail ? rect.bottom - tail.bottom : null,
      actionHeight: action?.height ?? null,
      actionVisibleHeight: action && bodyRect
        ? Math.max(
          0,
          Math.min(action.bottom, bodyRect.bottom)
            - Math.max(action.top, bodyRect.top),
        )
        : null,
    };
  });
  const material = await materialAudit(page);
  const materialFailures = material.failures.filter(({ surface }) => (
    surface === "settings-panel"
  ));
  const rect = result.rect;
  const backgroundControlsHidden = [
    result.command,
    result.dock,
    result.navigation,
  ].every((control) => (
    control
    && (control.visibility === "hidden" || control.opacity === 0)
  ));
  const withinViewport = rect
    && rect.left >= -0.5
    && rect.top >= -0.5
    && rect.right <= viewport.width + 0.5
    && rect.bottom <= viewport.height + 0.5;
  const verticallyBalanced = rect
    && Math.abs(rect.top - (viewport.height - rect.bottom)) <= 1;
  const generalRect = generalSettings.rect;
  const generalWithinViewport = generalRect
    && generalRect.left >= -0.5
    && generalRect.top >= -0.5
    && generalRect.right <= viewport.width + 0.5
    && generalRect.bottom <= viewport.height + 0.5;
  const generalVerticallyBalanced = generalRect
    && Math.abs(generalRect.top - (viewport.height - generalRect.bottom)) <= 1;

  await page.screenshot({
    path: path.join(artifactDir, `${label}-settings-panel.png`),
    fullPage: false,
  });

  return {
    ...result,
    generalSettings,
    generalWithinViewport,
    generalVerticallyBalanced,
    materialFailures,
    backgroundControlsHidden,
    withinViewport,
    verticallyBalanced,
    failure: !result.visible
      || result.inert
      || !result.focusInside
      || result.role !== "dialog"
      || result.modal !== "true"
      || !result.closeExists
      || result.preferenceLabel !== "РЕШЕНИЕ НЕ ПРИНЯТО"
      || result.stateCopy !== "До выбора Метрика не загружается."
      || !result.open
      || !result.searchPrivate
      || result.trackerScripts !== 0
      || result.preference !== null
      || !result.bodyHasSettings
      || !backgroundControlsHidden
      || !result.theme
      || !result.motion
      || Math.abs(result.theme.width - result.motion.width) > 1
      || result.themeLabel !== "СИСТЕМА"
      || result.analyticsLauncherLabel !== "АНАЛИТИКА"
      || result.analyticsLauncherWhiteSpace !== "nowrap"
      || JSON.stringify(result.privacyRows) !== JSON.stringify([
        "СТАТИСТИКА Обезличенная статистика посещений и действий на карте.",
        "ПОИСК Текст запросов в Метрику не передаётся.",
      ])
      || result.detailsLabel !== "Как Метрика использует файлы cookie"
      || result.detailsHref !== "https://yandex.ru/support/metrica/ru/general/cookie-usage"
      || result.detailsDisplay !== "inline-flex"
      || result.allowLabel !== "РАЗРЕШИТЬ"
      || result.denyLabel !== "НЕ ВКЛЮЧАТЬ"
      || JSON.stringify(result.visibleActions)
        !== JSON.stringify(["РАЗРЕШИТЬ", "НЕ ВКЛЮЧАТЬ"])
      || !result.stateMarker
      || result.stateMarker.width < 11.5
      || result.stateMarker.width > 13.5
      || Math.abs(result.stateMarker.width - result.stateMarker.height) > 0.5
      || result.stateMarker.backgroundColor !== "rgba(0, 0, 0, 0)"
      || !result.themeColorMatches
      || result.pointerOutlineStyle !== "none"
      || result.mapNodesOpacity > 0.1
      || result.signalOpacity > 0.1
      || result.axisLabelOpacity !== 0
      || result.trailingGap === null
      || result.trailingGap < 12
      || result.trailingGap > 40
      || !result.actionBeforePrivacy
      || !result.privacyBeforeDetails
      || !withinViewport
      || !verticallyBalanced
      || generalSettings.mode !== "settings"
      || generalSettings.title !== "НАСТРОЙКИ САЙТА"
      || !generalSettings.screenControlsVisible
      || generalSettings.overflowX !== 0
      || !generalWithinViewport
      || !generalVerticallyBalanced
      || (viewport.height >= 800 && (
        generalSettings.trailingGap === null
        || generalSettings.trailingGap < 12
        || generalSettings.trailingGap > 40
        || generalSettings.bodyScrollable
      ))
      || (viewport.width <= 320 && !generalSettings.bodyScrollable)
      || (viewport.width >= 390 && viewport.height >= 650 && (
        generalSettings.actionHeight === null
        || generalSettings.actionVisibleHeight === null
        || generalSettings.actionVisibleHeight
          < generalSettings.actionHeight - 1
      ))
      || materialFailures.length > 0,
  };
};

const accessibilityAcceptanceAudit = async (browser) => {
  const viewport = { width: 390, height: 844 };
  const context = await browser.newContext({
    viewport,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await isolateThirdPartyTelemetry(page);
  attachRuntimeLog(page, "accessibility-acceptance");
  await page.goto(`${baseUrl}-accessibility-acceptance`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts?.ready);
  await waitForLayout(page, 420);

  const failures = [];
  const mainSnapshot = await page.locator("main").ariaSnapshot();
  const mapSnapshot = await page.locator("[data-map-nodes]").ariaSnapshot();

  if (
    !mainSnapshot.includes("Интерактивная карта опыта")
    || !mapSnapshot.includes("МУЗЕЙ")
    || !mapSnapshot.includes("Используйте стрелки")
  ) {
    failures.push("the primary map is incomplete in the WebKit accessibility tree");
  }

  await page.locator(".skip-link").first().focus();
  const skipLink = await page.evaluate(() => {
    const target = document.activeElement;
    const rect = target?.getBoundingClientRect();
    const style = target ? getComputedStyle(target) : null;
    return {
      className: target?.className || "",
      focused: Boolean(target?.matches?.(".skip-link")),
      visible: Boolean(
        style
        && style.visibility !== "hidden"
        && style.display !== "none"
        && Number.parseFloat(style.opacity) > 0
      ),
      withinViewport: Boolean(
        rect
        && rect.left >= -0.5
        && rect.top >= -0.5
        && rect.right <= innerWidth + 0.5
        && rect.bottom <= innerHeight + 0.5
      ),
    };
  });

  if (
    !skipLink.className.includes("skip-link")
    || !skipLink.focused
    || !skipLink.visible
    || !skipLink.withinViewport
  ) {
    failures.push("the primary skip link cannot be focused and revealed");
  }

  const garage = page.locator('[data-map-id="garage"]');
  await garage.focus();
  const initialMapId = await page.evaluate(() => (
    document.activeElement?.dataset?.mapId || ""
  ));
  await page.keyboard.press("ArrowRight");
  const directionalMapId = await page.evaluate(() => (
    document.activeElement?.dataset?.mapId || ""
  ));

  if (!initialMapId || !directionalMapId || initialMapId === directionalMapId) {
    failures.push("arrow navigation does not move between map points");
  }

  await page.keyboard.press("Enter");
  await waitForLayout(page, 220);
  const inspectorOpen = await page.evaluate(() => {
    const active = document.activeElement;
    const inspector = document.querySelector("[data-map-inspector]");
    return {
      activeMapId: active?.dataset?.mapId || "",
      expanded: active?.getAttribute?.("aria-expanded"),
      pressed: active?.getAttribute?.("aria-pressed"),
      hidden: inspector?.getAttribute("aria-hidden"),
      inert: Boolean(inspector?.inert),
    };
  });
  const inspectorSnapshot = await page.locator("[data-map-inspector]").ariaSnapshot();

  if (
    inspectorOpen.activeMapId !== directionalMapId
    || inspectorOpen.expanded !== "true"
    || inspectorOpen.pressed !== "true"
    || inspectorOpen.hidden !== "false"
    || inspectorOpen.inert
    || !inspectorSnapshot.includes("Закрыть карточку")
  ) {
    failures.push("Enter does not expose the selected point and its inspector");
  }

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await waitForLayout(page, 180);
  const inspectorClosed = await page.evaluate((mapId) => ({
    focusReturned: document.activeElement?.dataset?.mapId === mapId,
    hidden: document.querySelector("[data-map-inspector]")?.getAttribute("aria-hidden"),
    inert: Boolean(document.querySelector("[data-map-inspector]")?.inert),
  }), directionalMapId);

  if (
    !inspectorClosed.focusReturned
    || inspectorClosed.hidden !== "true"
    || !inspectorClosed.inert
  ) {
    failures.push("Escape does not close the inspector and return map focus");
  }

  const panelTrigger = page.locator(".skip-link--secondary");
  await panelTrigger.focus();
  await page.keyboard.press("Enter");
  await waitForLayout(page, 220);
  const dialogSnapshot = await page.locator("[data-content-panel]").ariaSnapshot();
  const panelOpen = await page.evaluate(() => {
    const panel = document.querySelector("[data-content-panel]");
    return {
      activeIsClose: document.activeElement?.matches?.("[data-close-panel]") || false,
      hidden: panel?.getAttribute("aria-hidden"),
      inert: Boolean(panel?.inert),
      role: panel?.getAttribute("role"),
    };
  });

  await page.keyboard.press("Shift+Tab");
  const trappedInside = await page.evaluate(() => (
    document.querySelector("[data-content-panel]")?.contains(document.activeElement)
  ));
  await page.keyboard.press("Escape");
  await waitForLayout(page, 180);
  const panelClosed = await page.evaluate(() => ({
    focusReturned: document.activeElement?.matches?.(".skip-link--secondary") || false,
    hidden: document.querySelector("[data-content-panel]")?.getAttribute("aria-hidden"),
    inert: Boolean(document.querySelector("[data-content-panel]")?.inert),
  }));

  if (
    panelOpen.role !== "dialog"
    || panelOpen.hidden !== "false"
    || panelOpen.inert
    || !panelOpen.activeIsClose
    || !trappedInside
    || !dialogSnapshot.includes("КЛЮЧЕВЫЕ КЕЙСЫ")
    || !panelClosed.focusReturned
    || panelClosed.hidden !== "true"
    || !panelClosed.inert
  ) {
    failures.push("the cases dialog loses its name, focus trap, or focus return");
  }

  const environment = await page.evaluate(() => ({
    horizontalOverflow:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));

  if (environment.horizontalOverflow !== 0) {
    failures.push("the 390px accessibility route creates horizontal overflow");
  }
  if (!environment.reducedMotion) {
    failures.push("WebKit does not expose the requested reduced-motion state");
  }

  await page.screenshot({
    path: path.join(artifactDir, "390x844-dark-accessibility-acceptance.png"),
    fullPage: false,
  });
  await context.close();

  return {
    dialogSnapshotPresent: dialogSnapshot.includes("КЛЮЧЕВЫЕ КЕЙСЫ"),
    environment,
    failures,
    inspectorSnapshotPresent: inspectorSnapshot.includes("Закрыть карточку"),
    mapSnapshotPresent: mapSnapshot.includes("МУЗЕЙ"),
    panelClosed,
    panelOpen,
    skipLink,
  };
};

(async () => {
  await fs.mkdir(artifactDir, { recursive: true });
  let localServer;
  let browser;

  if (!baseUrl) {
    localServer = await startStaticServer({ projectRoot });
    baseUrl = `${localServer.origin}/?qa=webkit-regression`;
  }

  browser = await webkit.launch({ headless: true });
  const report = {
    schemaVersion: 1,
    accessibility: null,
    annotationHierarchy: null,
    childRelations: null,
    firstPaint: [],
    viewports: [],
    mobileSearch: null,
    noScript: null,
    reducedMotionRelations: null,
    shortSettings: null,
    telemetryRequests,
    runtimeErrors,
  };

  try {
    for (const scenario of webkitCompactScenarios) {
      const {
        viewport,
        colorScheme,
        label,
      } = scenario;
      report.firstPaint.push({
        viewport,
        colorScheme,
        ...await firstPaintAudit(browser, viewport, colorScheme),
      });

      const context = await browser.newContext({
        viewport,
        colorScheme,
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      await isolateThirdPartyTelemetry(page);
      attachRuntimeLog(page, label);
      await page.goto(`${baseUrl}-${label}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts?.ready);
      await waitForLayout(page, 500);

      const initialSelectedId = await page.locator("[data-signal-field]")
        .getAttribute("data-selected-id");
      const commandDockAxis = await commandDockAxisAudit(page);
      const projectGlyphs = await projectGlyphAudit(page);
      const workStack = await stackAudit(page, "work", label, {
        nativeWheel: false,
      });
      const approachStack = await stackAudit(page, "approach", label, {
        nativeWheel: false,
      });
      const contact = await contactAudit(page, viewport.width);
      const garage = await routeAudit(page, "garage", 9);
      await page.keyboard.press("Escape");
      await waitForLayout(page, 300);
      await page.reload({ waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts?.ready);
      await waitForLayout(page, 500);
      const privatePractice = await routeAudit(page, "private-practice", 9);
      const relationshipCascade = await relationshipCascadeAudit(page);
      const material = await materialAudit(page);

      await page.screenshot({
        path: path.join(artifactDir, `${label}-final.png`),
        fullPage: false,
      });
      const analyticsConsent = await analyticsConsentAudit(
        page,
        viewport,
        label,
      );
      report.viewports.push({
        viewport,
        colorScheme,
        initialSelectedId: initialSelectedId || "",
        commandDockAxis,
        projectGlyphs,
        workStack,
        approachStack,
        contact,
        garage,
        privatePractice,
        relationshipCascade,
        material,
        analyticsConsent,
      });
      await context.close();

      if (colorScheme === "dark") {
        const nativeContext = await browser.newContext({
          viewport,
          colorScheme,
        });
        const nativePage = await nativeContext.newPage();
        await isolateThirdPartyTelemetry(nativePage);
        const nativeLabel = `${label}-native-scroll`;
        attachRuntimeLog(nativePage, nativeLabel);
        await nativePage.goto(`${baseUrl}-${nativeLabel}`, {
          waitUntil: "networkidle",
        });
        await nativePage.evaluate(() => document.fonts?.ready);
        await waitForLayout(nativePage, 500);
        const nativeWorkStack = await stackAudit(
          nativePage,
          "work",
          nativeLabel,
        );
        const nativeApproachStack = await stackAudit(
          nativePage,
          "approach",
          nativeLabel,
        );
        report.viewports.at(-1).nativeScroll = {
          workStack: nativeWorkStack,
          approachStack: nativeApproachStack,
        };
        await nativeContext.close();
      } else {
        report.viewports.at(-1).nativeScroll = null;
      }

      await browser.close();
      browser = await webkit.launch({ headless: true });
    }

    report.annotationHierarchy = await annotationHierarchyAudit(browser);
    report.mobileSearch = await mobileSearchViewportAudit(browser);
    report.accessibility = await accessibilityAcceptanceAudit(browser);
    report.childRelations = await childRelationsAudit(browser);
    report.reducedMotionRelations = await reducedMotionRelationsAudit(browser);

    const shortSettingsViewport = { width: 393, height: 650 };
    const shortSettingsContext = await browser.newContext({
      viewport: shortSettingsViewport,
      colorScheme: "dark",
      hasTouch: true,
      isMobile: true,
    });
    const shortSettingsPage = await shortSettingsContext.newPage();
    await isolateThirdPartyTelemetry(shortSettingsPage);
    attachRuntimeLog(shortSettingsPage, "393x650-dark-short-settings");
    report.shortSettings = await analyticsConsentAudit(
      shortSettingsPage,
      shortSettingsViewport,
      "393x650-dark-short-settings",
    );
    await shortSettingsContext.close();

    const noScriptContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      javaScriptEnabled: false,
    });
    const noScriptPage = await noScriptContext.newPage();
    await isolateThirdPartyTelemetry(noScriptPage);
    await noScriptPage.goto(`${baseUrl}-no-script`, {
      waitUntil: "networkidle",
    });
    const noScriptFallback = noScriptPage.locator(".no-script-fallback");
    const noScriptNormalMain = noScriptPage.locator("body > main:not(.no-script-fallback)");
    report.noScript = {
      visible: await noScriptFallback.isVisible(),
      linkCount: await noScriptFallback.locator("a").count(),
      normalMainVisible: await noScriptNormalMain.isVisible(),
      trackerPixels: await noScriptPage.locator('img[src*="mc.yandex.ru"]').count(),
    };
    await noScriptPage.screenshot({
      path: path.join(artifactDir, "390x844-dark-no-script.png"),
      fullPage: false,
    });
    await noScriptContext.close();
  } finally {
    await browser?.close();
    if (localServer?.server) {
      await new Promise((resolveClose) => localServer.server.close(resolveClose));
    }
  }

  const failures = [
    ...report.runtimeErrors,
    ...(report.annotationHierarchy?.failures || []).map(
      (failure) => `annotation hierarchy: ${failure.message}`,
    ),
    ...(report.accessibility?.failures || []).map(
      (failure) => `accessibility acceptance: ${failure}`,
    ),
    ...(report.mobileSearch?.failures || []).map(
      (failure) => `mobile search: ${failure}`,
    ),
    ...(report.childRelations?.failure
      ? ["child relation: Narkomfin must morph only its route to Garage"]
      : []),
    ...(report.reducedMotionRelations?.failure
      ? ["reduced motion: semantic relationship routes must remain static"]
      : []),
    ...(report.shortSettings?.failure
      ? ["393/dark: short Safari settings composition failed"]
      : []),
    ...report.firstPaint.flatMap((state) => state.failures.map(
      (failure) => `first-paint ${state.viewport.width}/${state.colorScheme}: `
        + `${failure.surface} ${failure.background} ${failure.backdrop}`,
    )),
    ...report.viewports.flatMap((state) => [
      ...(state.initialSelectedId
        ? [`${state.viewport.width}/${state.colorScheme}: initial map selection is not empty`]
        : []),
      ...(state.commandDockAxis.failure
        ? [
          `${state.viewport.width}/${state.colorScheme}: command dock axis `
            + `max delta ${state.commandDockAxis.maxDelta}`,
        ]
        : []),
      ...(state.projectGlyphs.failure
        ? [
          `${state.viewport.width}/${state.colorScheme}: idle project glyphs `
            + `opaque ${state.projectGlyphs.opaque.map(({ id }) => id).join(",")}`,
        ]
        : []),
      ...state.workStack.failures,
      ...state.approachStack.failures,
      ...(state.nativeScroll?.workStack.failures || []),
      ...(state.nativeScroll?.approachStack.failures || []),
      ...(state.contact.failure
        ? [`${state.viewport.width}/${state.colorScheme}: contact geometry failed`]
        : []),
      ...(state.garage.failure
        ? [`${state.viewport.width}/${state.colorScheme}: Garage routes failed`]
        : []),
      ...(state.privatePractice.failure
        ? [`${state.viewport.width}/${state.colorScheme}: private-practice routes failed`]
        : []),
      ...(state.relationshipCascade.failure
        ? [`${state.viewport.width}/${state.colorScheme}: relationship cascade failed`]
        : []),
      ...(state.analyticsConsent.failure
        ? [`${state.viewport.width}/${state.colorScheme}: analytics consent failed`]
        : []),
      ...state.material.failures.map(
        (failure) => `${state.viewport.width}/${state.colorScheme}: material ${failure.surface}`,
      ),
    ]),
    ...(!report.noScript?.visible
      || report.noScript?.linkCount < 9
      || report.noScript?.normalMainVisible
      || report.noScript?.trackerPixels !== 0
      ? ["390/dark: no-script fallback failed"]
      : []),
    ...(report.telemetryRequests.length > 0
      ? [`pre-consent telemetry requests: ${report.telemetryRequests.join(", ")}`]
      : []),
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
