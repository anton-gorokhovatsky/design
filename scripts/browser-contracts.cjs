"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const staticAssetMimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

const startStaticServer = async ({
  projectRoot,
  onNotFound = () => {},
} = {}) => {
  if (!projectRoot) {
    throw new Error("startStaticServer requires projectRoot.");
  }

  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url || "/", "http://127.0.0.1").pathname,
    );
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const absolutePath = path.resolve(projectRoot, path.normalize(relativePath));
    const isInsideRoot = absolutePath === projectRoot
      || absolutePath.startsWith(`${projectRoot}${path.sep}`);

    if (
      !isInsideRoot
      || !fs.existsSync(absolutePath)
      || !fs.statSync(absolutePath).isFile()
    ) {
      onNotFound(pathname);
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": staticAssetMimeTypes[path.extname(absolutePath)]
        || "application/octet-stream",
    });
    fs.createReadStream(absolutePath).pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
  };
};

const mobileSearchViewport = {
  width: 390,
  height: 430,
  screenWidth: 390,
  screenHeight: 844,
};

const mobileMetricViewport = {
  width: 390,
  height: 844,
};

const readCompactAuthorshipExpression = `(() => {
  const rect = (element) => {
    const bounds = element?.getBoundingClientRect();
    return bounds ? {
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
    } : null;
  };
  const brand = document.querySelector(".brand");
  const role = document.querySelector(".brand__role");
  const garage = document.querySelector(
    '[data-map-id="garage"] .map-node__glyph',
  );
  const brandBounds = rect(brand);
  const garageBounds = rect(garage);
  const range = role ? document.createRange() : null;
  range?.selectNodeContents(role);
  const roleLines = range
    ? new Set(
      Array.from(range.getClientRects()).map((bounds) => Math.round(bounds.top)),
    ).size
    : 0;
  const sharesHorizontalSpace = Boolean(
    brandBounds
    && garageBounds
    && brandBounds.right > garageBounds.left
    && brandBounds.left < garageBounds.right
  );
  const clearance = brandBounds && garageBounds
    ? garageBounds.top - brandBounds.bottom
    : null;
  return {
    brand: brandBounds,
    garage: garageBounds,
    roleLines,
    sharesHorizontalSpace,
    clearance,
    overflowX: document.documentElement.scrollWidth
      - document.documentElement.clientWidth,
  };
})()`;

const compactAcceptanceScenarios = [
  { label: "mobile-390-light", width: 390, height: 844, mobile: true, theme: "light" },
  { label: "mobile-390-dark", width: 390, height: 844, mobile: true, theme: "dark" },
  { label: "mobile-320-light", width: 320, height: 568, mobile: true, theme: "light" },
  { label: "mobile-320-dark", width: 320, height: 568, mobile: true, theme: "dark" },
];

const chromiumScenarioCatalog = [
  { label: "desktop-light", width: 1440, height: 900, mobile: false, theme: "light" },
  { label: "desktop-dark", width: 1440, height: 900, mobile: false, theme: "dark" },
  { label: "tablet-light", width: 1024, height: 768, mobile: false, theme: "light" },
  { label: "tablet-dark", width: 1024, height: 768, mobile: false, theme: "dark" },
  ...compactAcceptanceScenarios.slice(0, 2),
  {
    label: "mobile-393-safari-light",
    width: 393,
    height: 700,
    screenWidth: 393,
    screenHeight: 852,
    mobile: true,
    theme: "light",
  },
  {
    label: "mobile-390-safari-compact-light",
    width: 390,
    height: 664,
    screenWidth: 390,
    screenHeight: 844,
    mobile: true,
    theme: "light",
  },
  ...compactAcceptanceScenarios.slice(2),
  {
    label: "zoom-200-light",
    width: 720,
    height: 450,
    screenWidth: 1440,
    screenHeight: 900,
    deviceScaleFactor: 2,
    mobile: false,
    theme: "light",
  },
  {
    label: "desktop-reduced-motion",
    width: 1440,
    height: 900,
    mobile: false,
    theme: "dark",
    reducedMotion: "reduce",
  },
  {
    label: "desktop-high-contrast",
    width: 1440,
    height: 900,
    mobile: false,
    theme: "dark",
    contrast: "more",
  },
];

const webkitCompactScenarios = compactAcceptanceScenarios.map((scenario) => ({
  label: `${scenario.width}x${scenario.height}-${scenario.theme}`,
  viewport: {
    width: scenario.width,
    height: scenario.height,
  },
  colorScheme: scenario.theme,
}));

const openMobileSearchExpression = `(() => {
  const input = document.querySelector("[data-command-input]");
  input?.focus({ preventScroll: true });
  if (input) {
    input.value = "";
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward",
    }));
  }
  return true;
})()`;

const readMobileSearchFocusedExpression = `(() => {
  const rect = (selector) => {
    const bounds = document.querySelector(selector)?.getBoundingClientRect();
    return bounds ? {
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
    } : null;
  };
  const withinViewport = (bounds) => (
    bounds
    && bounds.top >= -1
    && bounds.left >= -1
    && bounds.right <= innerWidth + 1
    && bounds.bottom <= innerHeight + 1
  );
  const input = document.querySelector("[data-command-input]");
  const results = document.querySelector("[data-command-results]");
  const dockBounds = rect("[data-command-form]");
  const resultsBounds = rect("[data-command-results]");
  return {
    focused: document.activeElement === input,
    bodyHasFocus: document.body.classList.contains("has-command-focus"),
    expanded: input?.getAttribute("aria-expanded"),
    count: results?.children.length || 0,
    dock: dockBounds,
    results: resultsBounds,
    geometryFits: withinViewport(dockBounds)
      && withinViewport(resultsBounds)
      && resultsBounds.bottom <= dockBounds.top - 6,
    resultsClientHeight: results?.clientHeight || 0,
    resultsScrollHeight: results?.scrollHeight || 0,
    pageScrollY: window.scrollY,
    overflowX: document.documentElement.scrollWidth
      - document.documentElement.clientWidth,
    systemDockVisibility: getComputedStyle(
      document.querySelector(".system-dock"),
    ).visibility,
    navigationVisibility: getComputedStyle(
      document.querySelector("[data-constellation-nav]"),
    ).visibility,
  };
})()`;

const dispatchMobileSearchKeyExpression = (key) => `(() => {
  const input = document.querySelector("[data-command-input]");
  input?.dispatchEvent(new KeyboardEvent("keydown", {
    bubbles: true,
    key: ${JSON.stringify(key)},
  }));
  return true;
})()`;

const readMobileSearchArrowExpression = `(() => ({
  activeId: document.querySelector("[data-command-input]")
    ?.getAttribute("aria-activedescendant"),
  pageScrollY: window.scrollY,
  resultsScrollTop: document.querySelector("[data-command-results]")
    ?.scrollTop || 0,
}))()`;

const readMobileSearchRestoredExpression = `(() => ({
  focused: document.activeElement?.matches?.("[data-command-input]") || false,
  bodyHasFocus: document.body.classList.contains("has-command-focus"),
  expanded: document.querySelector("[data-command-input]")
    ?.getAttribute("aria-expanded"),
  pageScrollY: window.scrollY,
  systemDockVisibility: getComputedStyle(
    document.querySelector(".system-dock"),
  ).visibility,
  navigationVisibility: getComputedStyle(
    document.querySelector("[data-constellation-nav]"),
  ).visibility,
}))()`;

const readMobileMetricGroupsExpression = `(() => {
  const element = document.querySelector("[data-map-evidence-result]");
  const value = element?.textContent || "";
  const measure = (fragment) => {
    const node = element?.firstChild;
    const start = value.indexOf(fragment);
    if (!node || start < 0) {
      return null;
    }
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + fragment.length);
    const rects = Array.from(range.getClientRects());
    return {
      rectCount: rects.length,
      lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
    };
  };
  return {
    has51: value.includes("51\\u00a0420"),
    has67: value.includes("67\\u00a0893"),
    group51: measure("51\\u00a0420"),
    group67: measure("67\\u00a0893"),
  };
})()`;

const readMobileContactResumeExpression = `(() => {
  const container = document.querySelector(".contact-resume");
  const links = Array.from(container?.querySelectorAll("a") || []);
  const bounds = container?.getBoundingClientRect();
  const textLines = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 1 && rect.height > 1);
    return new Set(rects.map((rect) => Math.round(rect.top))).size;
  };
  return {
    visible: Boolean(
      container
      && getComputedStyle(container).visibility !== "hidden"
      && bounds?.width
      && bounds?.height
    ),
    containerWidth: bounds?.width || 0,
    horizontalOverflow: container
      ? container.scrollWidth - container.clientWidth
      : 0,
    links: links.map((link) => {
      const rect = link.getBoundingClientRect();
      return {
        href: link.href,
        text: link.textContent.replace(/\\s+/g, " ").trim(),
        lines: textLines(link),
        width: rect.width,
      };
    }),
  };
})()`;

const validateMobileSearchContract = ({
  arrow,
  focused,
  restored,
}) => {
  const failures = [];

  if (
    !focused.focused
    || !focused.bodyHasFocus
    || focused.expanded !== "true"
    || focused.count !== 7
    || !focused.geometryFits
    || focused.pageScrollY !== 0
    || focused.overflowX !== 0
    || focused.systemDockVisibility !== "hidden"
    || focused.navigationVisibility !== "hidden"
  ) {
    failures.push({
      id: "focused-state",
      message: "focused search does not fit the keyboard-sized viewport",
      details: focused,
    });
  }

  if (
    arrow.activeId !== "command-result-panel-contact"
    || arrow.pageScrollY !== 0
    || arrow.resultsScrollTop <= 0
  ) {
    failures.push({
      id: "option-scroll",
      message: "option navigation pans the page instead of the result list",
      details: arrow,
    });
  }

  if (
    restored.focused
    || restored.bodyHasFocus
    || restored.expanded !== "false"
    || restored.pageScrollY !== 0
    || restored.systemDockVisibility !== "visible"
    || restored.navigationVisibility !== "visible"
  ) {
    failures.push({
      id: "escape-restore",
      message: "Escape does not restore the map controls",
      details: restored,
    });
  }

  return failures;
};

const validateCompactAuthorship = (authorship) => {
  if (
    authorship.brand
    && authorship.garage
    && authorship.roleLines === 1
    && authorship.overflowX === 0
    && (
      !authorship.sharesHorizontalSpace
      || authorship.clearance >= 8
    )
  ) {
    return [];
  }

  return [{
    id: "compact-authorship-clearance",
    message: "compact authorship overlaps the Garage node or wraps its role",
    details: authorship,
  }];
};

const validateMobileContactResume = (resume) => {
  if (
    resume.visible
    && resume.horizontalOverflow <= 1
    && resume.links.length === 1
    && resume.links[0].href.startsWith("https://gorokhovatsky.notion.site/")
    && resume.links.every((link) => (
      link.lines === 1
      && link.width <= resume.containerWidth + 1
    ))
  ) {
    return [];
  }

  return [{
    id: "contact-resume-wrap",
    message: "mobile Notion resume route is missing or wraps incorrectly",
    details: resume,
  }];
};

const validateMobileMetricGroups = (metricGroups) => {
  if (
    metricGroups.has51
    && metricGroups.has67
    && metricGroups.group51?.lines === 1
    && metricGroups.group67?.lines === 1
  ) {
    return [];
  }

  return [{
    id: "metric-wrap",
    message: "Narkomfin metrics split inside thousands-separated numbers",
    details: metricGroups,
  }];
};

module.exports = {
  chromiumScenarioCatalog,
  dispatchMobileSearchKeyExpression,
  mobileMetricViewport,
  mobileSearchViewport,
  openMobileSearchExpression,
  readCompactAuthorshipExpression,
  readMobileContactResumeExpression,
  readMobileMetricGroupsExpression,
  readMobileSearchArrowExpression,
  readMobileSearchFocusedExpression,
  readMobileSearchRestoredExpression,
  startStaticServer,
  staticAssetMimeTypes,
  validateCompactAuthorship,
  validateMobileContactResume,
  validateMobileMetricGroups,
  validateMobileSearchContract,
  webkitCompactScenarios,
};
