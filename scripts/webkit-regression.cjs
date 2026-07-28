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
  await waitForLayout(page, 420);

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
    failure: !hitTest.hitInsideNode || hover.failure || click.failure,
  };
};

const relationshipCascadeAudit = async (page) => {
  await page.evaluate(() => {
    document.querySelector(".content-panel.is-open [data-close-panel]")?.click();
    document.querySelector(".map-inspector.is-open [data-close-inspector]")?.click();
    document.querySelector(
      "[data-constellation-nav].is-open [data-constellation-nav-toggle]",
    )?.click();
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

    return {
      rootOpacity,
      activeCount: active.length,
      hiddenCount: hidden.length,
      minimumActiveOpacity,
      maximumActiveOpacity,
      maximumHiddenOpacity,
      failure: rootOpacity < 0.99
        || active.length !== 8
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
  await input.press("ArrowDown");
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
        || minimumActiveOpacity < 0.99,
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

        const context = await browser.newContext({
          viewport,
          colorScheme,
          hasTouch: true,
          isMobile: true,
        });
        const page = await context.newPage();
        const label = `${viewport.width}x${viewport.height}-${colorScheme}`;
        attachRuntimeLog(page, label);
        await page.goto(`${baseUrl}-${label}`, { waitUntil: "networkidle" });
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
        const privatePractice = await routeAudit(page, "private-practice", 8);
        const relationshipCascade = await relationshipCascadeAudit(page);
        const material = await materialAudit(page);

        await page.screenshot({
          path: path.join(artifactDir, `${label}-final.png`),
          fullPage: false,
        });
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
        });
        await context.close();

        const nativeContext = await browser.newContext({
          viewport,
          colorScheme,
        });
        const nativePage = await nativeContext.newPage();
        const nativeLabel = `${label}-native-scroll`;
        attachRuntimeLog(nativePage, nativeLabel);
        await nativePage.goto(`${baseUrl}-${nativeLabel}`, {
          waitUntil: "networkidle",
        });
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
      ...state.nativeScroll.workStack.failures,
      ...state.nativeScroll.approachStack.failures,
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
