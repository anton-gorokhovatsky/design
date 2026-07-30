#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);
const {
  chromiumScenarioCatalog,
  dispatchMobileSearchKeyExpression,
  mobileMetricViewport,
  mobileSearchViewport,
  openMobileSearchExpression,
  readMobileContactResumeExpression,
  readMobileMetricGroupsExpression,
  readMobileSearchArrowExpression,
  readMobileSearchFocusedExpression,
  readMobileSearchRestoredExpression,
  startStaticServer,
  validateMobileContactResume,
  validateMobileMetricGroups,
  validateMobileSearchContract,
} = require("./browser-contracts.cjs");
const artifactDirectory = process.env.PORTFOLIO_UI_ARTIFACT_DIR
  ? resolve(process.env.PORTFOLIO_UI_ARTIFACT_DIR)
  : "";
const focusedScenarioLabel = process.env.PORTFOLIO_UI_SCENARIO?.trim() || "";
const failures = [];
const browserErrors = [];
const serverErrors = [];
const observedNetworkRequests = [];

const fail = (message, details = undefined) => {
  failures.push(details === undefined ? message : `${message}: ${JSON.stringify(details)}`);
};
const delay = (milliseconds) => new Promise((resolveDelay) => {
  setTimeout(resolveDelay, milliseconds);
});

class CdpClient {
  constructor(session) {
    this.session = session;
  }

  send(method, params = {}) {
    return this.session.send(method, params);
  }

  on(method, listener) {
    this.session.on(method, listener);
    return () => this.session.off(method, listener);
  }

  waitFor(method, timeout = 10000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const cleanup = this.on(method, (params) => {
        clearTimeout(timer);
        cleanup();
        resolveEvent(params);
      });
      const timer = setTimeout(() => {
        cleanup();
        rejectEvent(new Error(`Timed out waiting for ${method}.`));
      }, timeout);
    });
  }

  async close() {
    await this.session.detach();
  }
}

const launchChrome = async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--force-color-profile=srgb",
      "--mute-audio",
      "--no-sandbox",
      "--no-default-browser-check",
      "--no-first-run",
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  return {
    browser,
    context,
    client: new CdpClient(session),
  };
};

const decodeRgbaPng = (path) => {
  const file = readFileSync(path);
  const signature = "89504e470d0a1a0a";
  if (file.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`${path} is not a PNG.`);
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let offset = 8;
  const imageData = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.subarray(offset + 4, offset + 8).toString("ascii");
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      imageData.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`${path} must stay an 8-bit, non-interlaced RGBA PNG.`);
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  const paeth = (left, up, upperLeft) => {
    const estimate = left + up - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
    return upDistance <= upperLeftDistance ? up : upperLeft;
  };

  for (let y = 0; y < height; y += 1) {
    const inputStart = y * (stride + 1);
    const filter = inflated[inputStart];
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputStart + 1 + x];
      const outputIndex = y * stride + x;
      const left = x >= bytesPerPixel ? pixels[outputIndex - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[outputIndex - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[outputIndex - stride - bytesPerPixel]
        : 0;
      if (filter === 0) pixels[outputIndex] = raw;
      else if (filter === 1) pixels[outputIndex] = raw + left;
      else if (filter === 2) pixels[outputIndex] = raw + up;
      else if (filter === 3) pixels[outputIndex] = raw + Math.floor((left + up) / 2);
      else if (filter === 4) pixels[outputIndex] = raw + paeth(left, up, upperLeft);
      else throw new Error(`Unsupported PNG filter ${filter}.`);
    }
  }

  return { width, height, pixels };
};

const auditFavicon = () => {
  const faviconPngPath = join(projectRoot, "assets/favicon.png");
  const faviconSvgPath = join(projectRoot, "assets/favicon.svg");
  const pngHash = createHash("sha256").update(readFileSync(faviconPngPath)).digest("hex");
  const svgHash = createHash("sha256").update(readFileSync(faviconSvgPath)).digest("hex");
  const { width, height, pixels } = decodeRgbaPng(faviconPngPath);
  let minimumX = width;
  let minimumY = height;
  let maximumX = -1;
  let maximumY = -1;
  let visiblePixels = 0;
  let bluePixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] <= 20) continue;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
      visiblePixels += 1;
      if (pixels[offset + 2] > pixels[offset] && pixels[offset + 2] > pixels[offset + 1]) {
        bluePixels += 1;
      }
    }
  }

  const bounds = {
    width: maximumX - minimumX + 1,
    height: maximumY - minimumY + 1,
  };
  const corners = [
    3,
    (width - 1) * 4 + 3,
    ((height - 1) * width) * 4 + 3,
    (width * height - 1) * 4 + 3,
  ].map((offset) => pixels[offset]);

  if (pngHash !== "c5029e4b5b9b950895d5b095d974b6c9f14229c07907cf68cacc0346c2be07fa") {
    fail("Favicon PNG must remain the accepted historical variant 01.", { pngHash });
  }
  if (svgHash !== "b41af5e5240cf0f83945cbfb87a7be0237fe07e20abb4218a3eea895bc6ab6c3") {
    fail("Favicon SVG must remain the accepted historical variant 01.", { svgHash });
  }
  if (width !== 64 || height !== 64) fail("Favicon fallback must remain 64×64.", { width, height });
  if (bounds.width < 58 || bounds.height < 38) {
    fail("Favicon arc no longer fills the tab slot.", bounds);
  }
  if (visiblePixels < 260 || visiblePixels > 1100) {
    fail("Favicon visual weight left its accepted range.", { visiblePixels });
  }
  if (bluePixels / visiblePixels < 0.95) fail("Favicon is no longer a predominantly blue signal.");
  if (corners.some((alpha) => alpha > 0)) fail("Favicon background/corners must remain transparent.", corners);
};

const geometryExpression = String.raw`(() => {
  const viewport = { width: innerWidth, height: innerHeight };
  const rect = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      selector,
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      width: bounds.width,
      height: bounds.height,
      centerX: bounds.left + bounds.width / 2,
      centerY: bounds.top + bounds.height / 2,
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      fontSize: Number.parseFloat(style.fontSize),
    };
  };
  const visible = (item) => item
    && item.display !== "none"
    && item.visibility !== "hidden"
    && item.opacity > 0
    && item.width > 0
    && item.height > 0;
  const probe = document.createElement("i");
  probe.style.background = getComputedStyle(document.documentElement)
    .getPropertyValue("--material-01");
  document.body.append(probe);
  const expectedBackground = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const mobile = matchMedia("(max-width: 680px)").matches;
  const materials = Array.from(document.querySelectorAll("[data-material-surface]"))
    .filter((element) => {
      const mode = element.dataset.materialActive;
      const modeActive = mode === "always"
        || (mode === "mobile" && mobile)
        || (mode === "desktop" && !mobile);
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return modeActive
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && bounds.width > 0
        && bounds.height > 0
        && !element.classList.contains("is-content-stack-hidden");
    })
    .map((element) => {
      const style = getComputedStyle(element);
      return {
        surface: element.dataset.materialSurface,
        background: style.backgroundColor,
        backdrop: style.backdropFilter || style.webkitBackdropFilter,
        border: style.border,
        shadow: style.boxShadow,
      };
    });
  const selectors = {
    view: ".map-controls",
    display: ".display-control",
    navigation: ".control-console",
    brand: ".brand",
    search: ".command-dock",
    searchMark: ".command-dock__mark",
    searchInput: ".command-dock input",
    searchSubmit: ".command-dock__submit",
    systemDock: ".system-dock",
    mobileMenu: ".constellation-nav__toggle",
    mobileNavigation: ".constellation-nav__orbit",
    mapCamera: ".map-camera",
    horizon: ".orbital-horizon",
    garageNode: '[data-map-id="garage"] .map-node__glyph',
    inspector: ".map-inspector",
    reel: ".map-hover-preview",
    reelMedia: ".map-hover-preview__media",
    reelReadout: ".map-hover-preview__readout",
    searchResults: ".command-results",
    contentPanel: ".content-panel",
    contentBody: ".content-panel__body",
    panelClose: "[data-close-panel]",
  };
  const geometry = Object.fromEntries(
    Object.entries(selectors).map(([name, selector]) => [name, rect(selector)]),
  );
  return {
    viewport,
    mobile,
    geometry,
    visible: Object.fromEntries(
      Object.entries(geometry).map(([name, item]) => [name, visible(item)]),
    ),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    materials,
    materialFailures: materials.filter((surface) => (
      surface.background !== expectedBackground
      || !surface.backdrop.includes("blur(24px)")
      || surface.shadow !== "none"
      || !surface.border.startsWith("0px")
    )),
  };
})()`;

const evaluate = async (client, expression, awaitPromise = false) => {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || "Runtime evaluation failed.",
    );
  }
  return result.result.value;
};

const setViewport = async (client, {
  width,
  height,
  mobile,
  theme = "light",
  deviceScaleFactor = 1,
  screenWidth = width,
  screenHeight = height,
  reducedMotion = "no-preference",
  contrast = "no-preference",
  forcedColors = "none",
}) => {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile,
    screenWidth,
    screenHeight,
  });
  await client.send("Emulation.setTouchEmulationEnabled", {
    enabled: mobile,
    maxTouchPoints: mobile ? 5 : 1,
  });
  await client.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: reducedMotion },
      { name: "prefers-contrast", value: contrast },
      { name: "forced-colors", value: forcedColors },
    ],
  });
};

const navigate = async (client, url) => {
  const loaded = client.waitFor("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
  await evaluate(client, "document.fonts.ready.then(() => true)", true);
  await delay(360);
};

const pressTab = async (client, { shift = false } = {}) => {
  const modifiers = shift ? 8 : 0;
  await client.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
    modifiers,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
    modifiers,
  });
  await delay(40);
};

const withinViewport = (item, viewport, tolerance = 1) => (
  item
  && item.left >= -tolerance
  && item.top >= -tolerance
  && item.right <= viewport.width + tolerance
  && item.bottom <= viewport.height + tolerance
);
const overlaps = (left, right, tolerance = 0) => (
  left && right
  && left.left < right.right - tolerance
  && left.right > right.left + tolerance
  && left.top < right.bottom - tolerance
  && left.bottom > right.top + tolerance
);

const auditGeometry = (label, state) => {
  const { geometry, viewport, visible } = state;
  if (state.overflowX !== 0) fail(`${label}: horizontal overflow.`, state.overflowX);
  if (state.materialFailures.length > 0) {
    fail(`${label}: MATERIAL / 01 mismatch.`, state.materialFailures);
  }

  if (!state.mobile) {
    for (const name of ["view", "display", "navigation", "brand", "search"]) {
      if (!visible[name]) fail(`${label}: ${name} is not visible.`);
      else if (!withinViewport(geometry[name], viewport)) {
        fail(`${label}: ${name} leaves the viewport.`, geometry[name]);
      }
    }
    if (overlaps(geometry.view, geometry.display, 4)) {
      fail(`${label}: view and display consoles overlap.`);
    }
    if (overlaps(geometry.navigation, geometry.brand, 4)) {
      fail(`${label}: navigation and authorship overlap.`);
    }
  } else {
    for (const name of ["mobileMenu", "search", "systemDock"]) {
      if (!visible[name]) fail(`${label}: ${name} is not visible.`);
      else if (!withinViewport(geometry[name], viewport, 2)) {
        fail(`${label}: ${name} leaves the viewport.`, geometry[name]);
      }
    }
    if (!visible.mapCamera) {
      fail(`${label}: mapCamera is not visible.`);
    } else if (
      geometry.mapCamera.left < -2
      || geometry.mapCamera.right > viewport.width + 2
      || geometry.mapCamera.top < -64
      || geometry.mapCamera.top > 2
      || geometry.mapCamera.bottom > viewport.height
      || geometry.mapCamera.height < viewport.height * 0.72
    ) {
      fail(`${label}: mapCamera does not fill the useful mobile stage.`, geometry.mapCamera);
    }
    if (!visible.horizon) {
      fail(`${label}: orbital horizon is not visible.`);
    } else if (geometry.search) {
      const horizonToControls = geometry.search.top - geometry.horizon.top;
      const maximumHorizonGap = Math.max(72, viewport.height * 0.085);

      if (horizonToControls < 18 || horizonToControls > maximumHorizonGap) {
        fail(`${label}: lower map stage leaves an empty band above the controls.`, {
          horizonToControls,
          maximumHorizonGap,
        });
      }
    }
    if (!visible.garageNode) {
      fail(`${label}: primary company sphere is not visible.`);
    } else if (geometry.garageNode.top < 6) {
      fail(`${label}: primary company sphere is clipped at the top edge.`, {
        top: geometry.garageNode.top,
      });
    }
    if (overlaps(geometry.search, geometry.systemDock, 1)) {
      fail(`${label}: mobile search and system dock overlap.`);
    }
    if (
      geometry.search
      && geometry.systemDock
      && geometry.search.bottom > geometry.systemDock.top - 6
    ) {
      fail(`${label}: mobile bottom controls have no breathing room.`);
    }
    if (geometry.searchInput?.fontSize < 16) {
      fail(`${label}: search input can trigger Safari auto-zoom.`, geometry.searchInput.fontSize);
    }
    const searchCenters = [
      geometry.searchMark?.centerY,
      geometry.searchInput?.centerY,
      geometry.searchSubmit?.centerY,
    ].filter(Number.isFinite);
    if (
      searchCenters.length !== 3
      || Math.max(...searchCenters) - Math.min(...searchCenters) > 1.5
    ) {
      fail(`${label}: search-row elements are not on one optical axis.`, searchCenters);
    }
    if (geometry.mobileMenu && (geometry.mobileMenu.width < 40 || geometry.mobileMenu.height < 40)) {
      fail(`${label}: mobile navigation hit area is too small.`, geometry.mobileMenu);
    }
  }
};

const saveScreenshot = async (client, name) => {
  if (!artifactDirectory) return;
  mkdirSync(artifactDirectory, { recursive: true });
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  writeFileSync(join(artifactDirectory, `${name}.png`), Buffer.from(screenshot.data, "base64"));
};

const saveElementScreenshot = async (client, name, selector, padding = 12) => {
  if (!artifactDirectory) return;
  const clip = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    const inset = ${padding};
    const x = Math.max(0, bounds.left - inset);
    const y = Math.max(0, bounds.top - inset);
    return {
      x,
      y,
      width: Math.min(innerWidth - x, bounds.width + inset * 2),
      height: Math.min(innerHeight - y, bounds.height + inset * 2),
      scale: 1,
    };
  })()`);
  if (!clip || clip.width <= 0 || clip.height <= 0) return;
  mkdirSync(artifactDirectory, { recursive: true });
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    clip,
  });
  writeFileSync(join(artifactDirectory, `${name}.png`), Buffer.from(screenshot.data, "base64"));
};

const auditBrowser = async (client, origin) => {
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Network.enable"),
  ]);
  await client.send("Network.setBlockedURLs", {
    urls: ["https://mc.yandex.ru/*", "https://mc.yandex.ru/**"],
  });
  client.on("Runtime.exceptionThrown", (params) => {
    browserErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text);
  });
  client.on("Runtime.consoleAPICalled", (params) => {
    if (params.type !== "error") return;
    browserErrors.push(
      params.args?.map((argument) => argument.value ?? argument.description).join(" "),
    );
  });
  client.on("Network.requestWillBeSent", ({ request }) => {
    observedNetworkRequests.push(request.url);
  });

  const scenarios = focusedScenarioLabel
    ? chromiumScenarioCatalog.filter((scenario) => scenario.label === focusedScenarioLabel)
    : chromiumScenarioCatalog;

  if (focusedScenarioLabel && scenarios.length === 0) {
    fail(`Unknown focused UI scenario: ${focusedScenarioLabel}`);
    return;
  }

  for (const scenario of scenarios) {
    await setViewport(client, scenario);
    await navigate(client, `${origin}/?qa=ui-contracts-${scenario.label}`);
    const state = await evaluate(client, geometryExpression);
    auditGeometry(scenario.label, state);
    await saveScreenshot(client, scenario.label);
    if (scenario.label === "desktop-dark") {
      await saveElementScreenshot(client, "crop-desktop-view-dark", ".map-controls");
      await saveElementScreenshot(client, "crop-desktop-display-dark", ".display-control");
      await saveElementScreenshot(client, "crop-desktop-search-dark", ".control-console");
    }
    if (scenario.label === "mobile-390-dark") {
      await saveElementScreenshot(client, "crop-mobile-search-dark", ".command-dock");
      await saveElementScreenshot(client, "crop-mobile-dock-dark", ".system-dock");
    }
  }

  if (focusedScenarioLabel) {
    await navigate(client, `${origin}/?qa=ui-contracts-favicon-motion`);
    const faviconMotion = await evaluate(client, `(() => new Promise((resolve) => {
      const link = document.querySelector("#site-favicon");
      const firstHref = link?.href || "";
      const image = new Image();

      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, 64, 64);
        const pixels = context.getImageData(0, 0, 64, 64).data;
        let visiblePixels = 0;
        for (let offset = 3; offset < pixels.length; offset += 4) {
          if (pixels[offset] > 32) visiblePixels += 1;
        }

        window.setTimeout(() => {
          const secondHref = link?.href || "";
          resolve({
            animatedFrame: firstHref.startsWith("data:image/png"),
            changed: firstHref !== secondHref,
            visiblePixels,
            mode: document.documentElement.dataset.faviconMotion,
          });
        }, 320);
      };
      image.src = firstHref;
    }))()`, true);

    if (
      !faviconMotion.animatedFrame
      || !faviconMotion.changed
      || faviconMotion.visiblePixels < 80
      || faviconMotion.mode !== "animated"
    ) {
      fail("Historical favicon 01 is not visibly animated.", faviconMotion);
    }
    return;
  }

  await setViewport(client, {
    width: 1440,
    height: 900,
    mobile: false,
    theme: "light",
  });
  await navigate(client, `${origin}/?qa=ui-contracts-selected&point=garage`);
  const selectedState = await evaluate(client, geometryExpression);
  const selectedContract = await evaluate(client, `(() => {
    const node = document.querySelector('[data-map-id="garage"]');
    return {
      pressed: node?.getAttribute("aria-pressed"),
      expanded: node?.getAttribute("aria-expanded"),
      inspectorHidden: document.querySelector(".map-inspector")?.getAttribute("aria-hidden"),
    };
  })()`);
  if (
    !selectedState.visible.inspector
    || selectedContract.pressed !== "true"
    || selectedContract.expanded !== "true"
    || selectedContract.inspectorHidden !== "false"
  ) {
    fail("selected-point: Garage and its inspector do not expose one selected state.", selectedContract);
  }
  if (!withinViewport(selectedState.geometry.inspector, selectedState.viewport, 2)) {
    fail("selected-point: inspector leaves the viewport.", selectedState.geometry.inspector);
  }
  if (selectedState.materialFailures.length > 0) {
    fail("selected-point: MATERIAL / 01 mismatch.", selectedState.materialFailures);
  }
  await saveScreenshot(client, "desktop-selected-garage");
  await saveElementScreenshot(client, "crop-desktop-inspector", ".map-inspector");

  for (const pointId of ["private-practice", "running"]) {
    await navigate(
      client,
      `${origin}/?qa=ui-contracts-floating-safe-area&point=${pointId}`,
    );
    const floatingSafeArea = await evaluate(client, `(() => {
      const display = document.querySelector(".display-control")?.getBoundingClientRect();
      const inspector = document.querySelector(".map-inspector")?.getBoundingClientRect();
      const intersectionArea = (first, second) => (
        Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
        * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top))
      );
      const nodeCollisions = [...document.querySelectorAll(".map-node")]
        .map((node) => ({
          id: node.dataset.mapId,
          area: display
            ? intersectionArea(node.getBoundingClientRect(), display)
            : 0,
        }))
        .filter(({ area }) => area > 0.5);

      return {
        selected: document.querySelector(".map-inspector")?.dataset.selectedMapId,
        inspectorDisplayOverlap:
          display && inspector ? intersectionArea(inspector, display) : null,
        inspectorDisplayGap:
          display && inspector ? display.left - inspector.right : null,
        descriptionScroll: (() => {
          const description = document.querySelector(
            ".map-readout__description",
          );
          return description
            ? {
                overflowY: getComputedStyle(description).overflowY,
                scrollHeight: description.scrollHeight,
                clientHeight: description.clientHeight,
              }
            : null;
        })(),
        nodeCollisions,
      };
    })()`);

    if (
      floatingSafeArea.selected !== pointId
      || floatingSafeArea.inspectorDisplayOverlap !== 0
      || floatingSafeArea.inspectorDisplayGap < 12
      || floatingSafeArea.nodeCollisions.length > 0
      || (
        pointId === "private-practice"
        && (
          floatingSafeArea.descriptionScroll?.overflowY !== "visible"
          || floatingSafeArea.descriptionScroll.scrollHeight
            > floatingSafeArea.descriptionScroll.clientHeight + 1
        )
      )
    ) {
      fail(
        `floating-safe-area: ${pointId} collides with the display console.`,
        floatingSafeArea,
      );
    }

    if (pointId === "running") {
      await saveScreenshot(client, "desktop-selected-running-safe-area");
    }
  }

  await navigate(client, `${origin}/?qa=ui-contracts-search`);
  await evaluate(client, `(() => {
    const input = document.querySelector("[data-command-input]");
    input.value = "tarski";
    input.focus();
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    return true;
  })()`);
  await delay(220);
  const searchState = await evaluate(client, geometryExpression);
  const searchContract = await evaluate(client, `(() => ({
    expanded: document.querySelector("[data-command-input]")?.getAttribute("aria-expanded"),
    count: document.querySelectorAll(".command-result").length,
    active: document.querySelector("[data-command-input]")?.getAttribute("aria-activedescendant"),
  }))()`);
  if (
    !searchState.visible.searchResults
    || searchContract.expanded !== "true"
    || searchContract.count < 1
    || !searchContract.active
  ) {
    fail("search: visible results and active option are not synchronized.", searchContract);
  }
  if (!withinViewport(searchState.geometry.searchResults, searchState.viewport, 2)) {
    fail("search: results leave the viewport.", searchState.geometry.searchResults);
  }
  if (searchState.materialFailures.length > 0) {
    fail("search: MATERIAL / 01 mismatch.", searchState.materialFailures);
  }
  await saveScreenshot(client, "desktop-search-results");
  await saveElementScreenshot(client, "crop-desktop-search-results", ".command-results");

  await navigate(client, `${origin}/?qa=ui-contracts-reel`);
  await evaluate(client, `(() => {
    const node = document.querySelector('[data-map-id="tarski"]');
    node.dispatchEvent(new PointerEvent("pointerenter"));
    return true;
  })()`);
  await delay(240);
  const reelState = await evaluate(client, geometryExpression);
  const reelContract = await evaluate(client, `(() => {
    const preview = document.querySelector(".map-hover-preview");
    const media = document.querySelector(".map-hover-preview__media");
    const video = media?.querySelector("video");
    const bounds = media?.getBoundingClientRect();
    const style = video ? getComputedStyle(video) : null;
    return {
      visible: preview?.classList.contains("is-visible"),
      hidden: preview?.getAttribute("aria-hidden"),
      ratio: bounds?.width && bounds?.height ? bounds.width / bounds.height : 0,
      objectFit: style?.objectFit,
      objectPosition: style?.objectPosition,
      poster: video?.getAttribute("poster"),
    };
  })()`);
  if (
    !reelState.visible.reel
    || !reelState.visible.reelMedia
    || !reelState.visible.reelReadout
    || !reelContract.visible
    || reelContract.hidden !== "true"
    || Math.abs(reelContract.ratio - 1.5) > 0.02
    || reelContract.objectFit !== "contain"
    || reelContract.objectPosition !== "50% 0%"
    || !reelContract.poster?.endsWith("assets/reel-posters/tarski.jpg")
  ) {
    fail("reel: Tarski receiver lost its native 3:2 content geometry.", reelContract);
  }
  if (reelState.materialFailures.length > 0) {
    fail("reel: MATERIAL / 01 readout mismatch.", reelState.materialFailures);
  }
  await saveScreenshot(client, "desktop-reel-tarski");
  await saveElementScreenshot(client, "crop-desktop-reel-tarski", ".map-hover-preview");

  await navigate(client, `${origin}/?qa=ui-contracts-focus`);
  await pressTab(client);
  const focusContract = await evaluate(client, `(() => {
    const target = document.activeElement;
    const bounds = target?.getBoundingClientRect();
    const style = getComputedStyle(target);
    return {
      className: target?.className,
      visible: target.matches(":focus-visible"),
      bounds: bounds ? {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
      } : null,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    };
  })()`);
  if (
    !String(focusContract.className).includes("skip-link")
    || !focusContract.visible
    || !withinViewport(focusContract.bounds, { width: 1440, height: 900 }, 2)
  ) {
    fail("focus: keyboard focus is not visibly represented.", focusContract);
  }
  await saveElementScreenshot(client, "crop-desktop-keyboard-focus", ".skip-link:focus");

  await setViewport(client, {
    width: 1440,
    height: 900,
    mobile: false,
    theme: "dark",
    contrast: "more",
    forcedColors: "active",
  });
  await navigate(client, `${origin}/?qa=ui-contracts-forced-colors`);
  await pressTab(client);
  const forcedColorsContract = await evaluate(client, `(() => {
    const target = document.activeElement;
    const bounds = target?.getBoundingClientRect();
    const style = getComputedStyle(target);
    return {
      active: matchMedia("(forced-colors: active)").matches,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      focused: target?.matches(":focus-visible"),
      className: target?.className,
      bounds: bounds ? {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
      } : null,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      color: style.color,
      background: style.backgroundColor,
    };
  })()`);
  if (
    !forcedColorsContract.active
    || forcedColorsContract.overflowX !== 0
    || !forcedColorsContract.focused
    || !String(forcedColorsContract.className).includes("skip-link")
    || !withinViewport(forcedColorsContract.bounds, { width: 1440, height: 900 }, 2)
    || forcedColorsContract.color === forcedColorsContract.background
  ) {
    fail("forced-colors: reflow or keyboard focus contract failed.", forcedColorsContract);
  }
  await saveScreenshot(client, "desktop-forced-colors");
  await saveElementScreenshot(client, "crop-desktop-forced-colors-focus", ".skip-link:focus");

  await setViewport(client, {
    width: 390,
    height: 844,
    mobile: true,
    theme: "dark",
  });
  await navigate(client, `${origin}/?qa=ui-contracts-mobile-navigation`);
  await evaluate(client, "document.querySelector('[data-constellation-nav-toggle]')?.click()");
  await delay(120);
  const mobileNavigationState = await evaluate(client, geometryExpression);
  const mobileNavigationContract = await evaluate(client, `(() => {
    const toggle = document.querySelector("[data-constellation-nav-toggle]");
    const items = [...document.querySelectorAll("[data-nav-view]")];
    const heights = items.map((item) => item.getBoundingClientRect().height);
    return {
      expanded: toggle?.getAttribute("aria-expanded"),
      count: items.length,
      minimumHeight: Math.min(...heights),
      maximumHeight: Math.max(...heights),
      allVisible: items.every((item) => {
        const style = getComputedStyle(item);
        const bounds = item.getBoundingClientRect();
        return style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
      }),
    };
  })()`);
  if (
    !mobileNavigationState.visible.mobileNavigation
    || mobileNavigationContract.expanded !== "true"
    || mobileNavigationContract.count !== 5
    || !mobileNavigationContract.allVisible
    || mobileNavigationContract.minimumHeight < 40
    || mobileNavigationContract.maximumHeight - mobileNavigationContract.minimumHeight > 1
  ) {
    fail("mobile-navigation: five equal touch routes are not disclosed together.", mobileNavigationContract);
  }
  if (!withinViewport(
    mobileNavigationState.geometry.mobileNavigation,
    mobileNavigationState.viewport,
    2,
  )) {
    fail(
      "mobile-navigation: disclosed routes leave the viewport.",
      mobileNavigationState.geometry.mobileNavigation,
    );
  }
  if (mobileNavigationState.materialFailures.length > 0) {
    fail("mobile-navigation: MATERIAL / 01 mismatch.", mobileNavigationState.materialFailures);
  }
  await saveScreenshot(client, "mobile-navigation-dark");
  await saveElementScreenshot(client, "crop-mobile-navigation-dark", ".constellation-nav");

  await setViewport(client, {
    width: mobileSearchViewport.width,
    height: mobileSearchViewport.height,
    mobile: true,
    theme: "dark",
    screenWidth: mobileSearchViewport.screenWidth,
    screenHeight: mobileSearchViewport.screenHeight,
  });
  await navigate(client, `${origin}/?qa=ui-contracts-mobile-search#map`);
  await evaluate(client, openMobileSearchExpression);
  await delay(140);
  const mobileSearchFocused = await evaluate(
    client,
    readMobileSearchFocusedExpression,
  );
  await saveScreenshot(client, "mobile-search-keyboard-shell");
  await saveElementScreenshot(
    client,
    "crop-mobile-search-keyboard-results",
    ".command-results",
  );

  await evaluate(client, dispatchMobileSearchKeyExpression("ArrowUp"));
  const mobileSearchArrow = await evaluate(
    client,
    readMobileSearchArrowExpression,
  );
  await evaluate(client, dispatchMobileSearchKeyExpression("Escape"));
  await delay(140);
  const mobileSearchRestored = await evaluate(
    client,
    readMobileSearchRestoredExpression,
  );
  for (const failure of validateMobileSearchContract({
    arrow: mobileSearchArrow,
    focused: mobileSearchFocused,
    restored: mobileSearchRestored,
  })) {
    fail(`mobile-search: ${failure.message}.`, failure.details);
  }

  await setViewport(client, {
    width: mobileMetricViewport.width,
    height: mobileMetricViewport.height,
    mobile: true,
    theme: "dark",
  });
  await navigate(
    client,
    `${origin}/?qa=ui-contracts-narkomfin-number&point=narkomfin#map`,
  );
  const mobileMetricGroups = await evaluate(
    client,
    readMobileMetricGroupsExpression,
  );
  for (const failure of validateMobileMetricGroups(mobileMetricGroups)) {
    fail(`mobile-narkomfin: ${failure.message}.`, failure.details);
  }
  await saveScreenshot(client, "mobile-narkomfin-number");
  await saveElementScreenshot(
    client,
    "crop-mobile-narkomfin-number",
    "[data-map-evidence-result]",
  );

  await setViewport(client, {
    width: 390,
    height: 844,
    mobile: true,
    theme: "dark",
  });
  await navigate(client, `${origin}/?qa=ui-contracts-mobile-panel#contact`);
  const mobilePanel = await evaluate(client, geometryExpression);
  if (!mobilePanel.visible.contentPanel || !mobilePanel.visible.contentBody) {
    fail("mobile-panel: content panel/body is not visible.");
  }
  if (!withinViewport(mobilePanel.geometry.panelClose, mobilePanel.viewport, 2)) {
    fail("mobile-panel: close control leaves the viewport.", mobilePanel.geometry.panelClose);
  }
  if (mobilePanel.visible.search) {
    fail("mobile-panel: search must yield its space while long-form content is open.");
  }
  if (mobilePanel.materialFailures.length > 0) {
    fail("mobile-panel: MATERIAL / 01 mismatch.", mobilePanel.materialFailures);
  }
  const mobileContactResume = await evaluate(
    client,
    readMobileContactResumeExpression,
  );
  for (const failure of validateMobileContactResume(mobileContactResume)) {
    fail(`mobile-panel: ${failure.message}.`, failure.details);
  }
  await saveScreenshot(client, "mobile-panel-contact");

  await setViewport(client, {
    width: 1440,
    height: 900,
    mobile: false,
    theme: "light",
  });
  await navigate(client, `${origin}/?qa=ui-contracts-favicon`);
  const firstFavicon = await evaluate(
    client,
    "document.querySelector('#site-favicon')?.href || ''",
  );
  await delay(320);
  const secondFavicon = await evaluate(
    client,
    "document.querySelector('#site-favicon')?.href || ''",
  );
  const faviconMode = await evaluate(
    client,
    "document.documentElement.dataset.faviconMotion || ''",
  );
  if (
    !firstFavicon.startsWith("data:image/png")
    || firstFavicon === secondFavicon
    || faviconMode !== "animated"
  ) {
    fail("Historical favicon 01 must visibly animate.", {
      firstFrame: firstFavicon.slice(0, 32),
      changed: firstFavicon !== secondFavicon,
      faviconMode,
    });
  }

  await client.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: "light" },
    ],
  });
  await navigate(client, `${origin}/?qa=ui-contracts-favicon-reduced`);
  const reducedFirst = await evaluate(
    client,
    "document.querySelector('#site-favicon')?.href || ''",
  );
  await delay(320);
  const reducedSecond = await evaluate(
    client,
    "document.querySelector('#site-favicon')?.href || ''",
  );
  const reducedMode = await evaluate(
    client,
    "document.documentElement.dataset.faviconMotion || ''",
  );
  if (
    !reducedFirst.includes("/assets/favicon.png")
    || reducedFirst !== reducedSecond
    || reducedMode !== "static"
  ) {
    fail("Reduced-motion favicon must keep the accepted static variant 01.", {
      sourceAsset: reducedFirst.includes("/assets/favicon.png"),
      stable: reducedFirst === reducedSecond,
      reducedMode,
    });
  }

  await client.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [
      { name: "prefers-reduced-motion", value: "no-preference" },
      { name: "prefers-color-scheme", value: "light" },
    ],
  });
  await evaluate(
    client,
    "localStorage.removeItem('anton-signal-analytics'); true",
  );
  await client.send("Emulation.setScriptExecutionDisabled", { value: true });
  {
    const loaded = client.waitFor("Page.loadEventFired");
    await client.send("Page.navigate", { url: `${origin}/?qa=no-script` });
    await loaded;
    await delay(120);
  }
  await client.send("Emulation.setScriptExecutionDisabled", { value: false });
  const noScriptContract = await evaluate(client, `(() => {
    const fallback = document.querySelector(".no-script-fallback");
    const fallbackStyle = fallback ? getComputedStyle(fallback) : null;
    const normalMain = Array.from(document.querySelectorAll("body > main"))
      .find((element) => !element.classList.contains("no-script-fallback"));
    return {
      visible: fallbackStyle?.display !== "none",
      linkCount: fallback?.querySelectorAll("a").length || 0,
      normalMainDisplay: normalMain ? getComputedStyle(normalMain).display : "",
      trackerPixels: document.querySelectorAll('img[src*="mc.yandex.ru"]').length,
      visibleMainCount: Array.from(document.querySelectorAll("main")).filter((element) => (
        getComputedStyle(element).display !== "none"
      )).length,
    };
  })()`);
  if (
    !noScriptContract.visible
    || noScriptContract.linkCount < 9
    || noScriptContract.normalMainDisplay !== "none"
    || noScriptContract.trackerPixels !== 0
    || noScriptContract.visibleMainCount !== 1
  ) {
    fail("no-script: selected work and contacts are not a self-contained fallback.", noScriptContract);
  }
  await saveScreenshot(client, "desktop-no-script");
  await saveElementScreenshot(client, "crop-desktop-no-script", ".no-script-fallback");

  await navigate(client, `${origin}/?qa=privacy&analytics-consent=show`);
  const analyticsRequestsBeforeChoice = observedNetworkRequests.filter((url) => (
    url.startsWith("https://mc.yandex.ru/")
  ));
  const analyticsConsentState = await evaluate(client, geometryExpression);
  const analyticsConsentContract = await evaluate(client, `(() => {
    const consent = document.querySelector("[data-analytics-consent]");
    const input = document.querySelector("[data-command-input]");
    const active = document.activeElement;
    const videos = Array.from(document.querySelectorAll("video"));
    return {
      visible: !consent?.hidden && consent?.classList.contains("is-open"),
      inert: consent?.inert,
      focusInside: Boolean(active && consent?.contains(active)),
      searchPrivate: input?.classList.contains("ym-disable-keys"),
      trackerScripts: Array.from(document.scripts).filter((script) => (
        script.src.includes("mc.yandex.ru")
      )).length,
      preference: localStorage.getItem("anton-signal-analytics"),
      videoSources: videos.filter((video) => video.getAttribute("src")).length,
      loadedVideoResources: performance.getEntriesByType("resource").filter((entry) => (
        entry.name.includes(".mp4")
      )).length,
    };
  })()`);
  if (
    !analyticsConsentContract.visible
    || analyticsConsentContract.inert
    || analyticsConsentContract.focusInside
    || !analyticsConsentContract.searchPrivate
    || analyticsConsentContract.trackerScripts !== 0
    || analyticsConsentContract.preference !== null
    || analyticsConsentContract.videoSources !== 0
    || analyticsConsentContract.loadedVideoResources !== 0
    || analyticsRequestsBeforeChoice.length !== 0
  ) {
    fail("privacy: analytics or heavy media started before an explicit choice.", {
      ...analyticsConsentContract,
      analyticsRequestsBeforeChoice,
    });
  }
  if (analyticsConsentState.materialFailures.length > 0) {
    fail("privacy: consent lost MATERIAL / 01.", analyticsConsentState.materialFailures);
  }
  await saveScreenshot(client, "desktop-analytics-consent");
  await saveElementScreenshot(client, "crop-desktop-analytics-consent", ".analytics-consent");

  await evaluate(client, "document.querySelector('[data-analytics-deny]')?.click(); true");
  const deniedContract = await evaluate(client, `(() => ({
    hidden: document.querySelector("[data-analytics-consent]")?.hidden,
    preference: localStorage.getItem("anton-signal-analytics"),
    disabled: window.disableYaCounter111107350,
    trackerScripts: Array.from(document.scripts).filter((script) => (
      script.src.includes("mc.yandex.ru")
    )).length,
  }))()`);
  if (
    !deniedContract.hidden
    || deniedContract.preference !== "denied"
    || deniedContract.disabled !== true
    || deniedContract.trackerScripts !== 0
  ) {
    fail("privacy: declining analytics does not persist a tracker-free state.", deniedContract);
  }

  await evaluate(client, "document.querySelector('[data-analytics-settings]')?.click(); true");
  await delay(40);
  const reopenedContract = await evaluate(client, `(() => ({
    visible: !document.querySelector("[data-analytics-consent]")?.hidden,
    focused: document.activeElement?.hasAttribute("data-analytics-allow"),
  }))()`);
  if (!reopenedContract.visible || !reopenedContract.focused) {
    fail("privacy: the saved choice cannot be reopened with deliberate focus.", reopenedContract);
  }
  await evaluate(client, "document.querySelector('[data-analytics-deny]')?.click(); true");
  await evaluate(
    client,
    "localStorage.removeItem('anton-signal-analytics'); true",
  );
  await navigate(client, `${origin}/?qa=privacy-allow&analytics-consent=show`);
  const analyticsRequestBaseline = observedNetworkRequests.length;
  await evaluate(client, "document.querySelector('[data-analytics-allow]')?.click(); true");
  await delay(80);
  const allowedContract = await evaluate(client, `(() => ({
    hidden: document.querySelector("[data-analytics-consent]")?.hidden,
    preference: localStorage.getItem("anton-signal-analytics"),
    disabled: window.disableYaCounter111107350,
    trackerScripts: Array.from(document.scripts).filter((script) => (
      script.src.includes("mc.yandex.ru/metrika/tag.js")
    )).length,
    queuedInit: Array.isArray(window.ym?.a) && window.ym.a.some((entry) => (
      entry?.[0] === 111107350 && entry?.[1] === "init"
    )),
  }))()`);
  const analyticsRequestsAfterAllow = observedNetworkRequests
    .slice(analyticsRequestBaseline)
    .filter((url) => url.startsWith("https://mc.yandex.ru/"));
  if (
    !allowedContract.hidden
    || allowedContract.preference !== "allowed"
    || allowedContract.disabled !== false
    || allowedContract.trackerScripts !== 1
    || !allowedContract.queuedInit
    || analyticsRequestsAfterAllow.length === 0
  ) {
    fail("privacy: explicit opt-in does not initialize the counter exactly once.", {
      ...allowedContract,
      analyticsRequestsAfterAllow,
    });
  }

  const goalContract = await evaluate(client, `(() => {
    const preventContactNavigation = (event) => {
      if (event.target.closest?.(".contact-links a")) {
        event.preventDefault();
      }
    };
    document.addEventListener("click", preventContactNavigation, true);

    document.querySelector('[data-map-filter="company"]')?.click();
    document.querySelector("[data-time-toggle]")?.click();
    document.querySelector('[data-map-id="garage"]')?.click();

    const input = document.querySelector("[data-command-input]");
    input?.focus();
    if (input) {
      input.value = "последовательное";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    document.querySelector('[data-result-id="tarski"]')?.click();

    document.querySelector("[data-start-observation]")?.click();
    const next = document.querySelector("[data-observation-next]");
    for (let index = 0; index < 8; index += 1) {
      next?.click();
    }

    document.querySelector('[data-open-panel="contact"]')?.click();
    document.querySelector('.contact-links a[href^="mailto:"]')?.click();
    document.removeEventListener("click", preventContactNavigation, true);

    const goals = (window.ym?.a || [])
      .filter((entry) => entry?.[0] === 111107350 && entry?.[1] === "reachGoal")
      .map((entry) => ({
        name: entry[2],
        parameters: entry[3] || {},
      }));
    return {
      goals,
      names: goals.map(({ name }) => name),
      parameterKeys: [...new Set(goals.flatMap(({ parameters }) => (
        Object.keys(parameters)
      )))],
      leakedValues: goals.flatMap(({ parameters }) => Object.values(parameters))
        .filter((value) => /последовательное|anton|@|gmail|telegram\\.me/i.test(String(value))),
    };
  })()`);
  const requiredGoals = [
    "point_open",
    "map_filter_change",
    "chronology_toggle",
    "observation_start",
    "observation_complete",
    "search_success",
    "panel_open",
    "contact_open",
  ];
  const missingGoals = requiredGoals.filter((goal) => (
    !goalContract.names.includes(goal)
  ));
  const unexpectedParameterKeys = goalContract.parameterKeys.filter((key) => (
    ![
      "channel",
      "filters",
      "panel_id",
      "point_id",
      "result_id",
      "result_type",
      "source",
      "state",
    ].includes(key)
  ));
  if (
    missingGoals.length > 0
    || unexpectedParameterKeys.length > 0
    || goalContract.leakedValues.length > 0
  ) {
    fail("privacy: consented navigation goals are incomplete or leak free-form data.", {
      ...goalContract,
      missingGoals,
      unexpectedParameterKeys,
    });
  }
};

let staticServer;
let chrome;

try {
  auditFavicon();
  staticServer = await startStaticServer({
    projectRoot,
    onNotFound: (pathname) => serverErrors.push(`404 ${pathname}`),
  });
  chrome = await launchChrome();
  await auditBrowser(chrome.client, staticServer.origin);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await chrome?.client.close();
  await chrome?.context.close();
  await chrome?.browser.close();
  if (staticServer?.server) {
    await new Promise((resolveClose) => staticServer.server.close(resolveClose));
  }
}

if (serverErrors.length > 0) fail("Local UI contract server returned errors.", serverErrors);
if (browserErrors.length > 0) fail("Browser runtime errors.", browserErrors);

if (failures.length > 0) {
  console.error("UI contracts failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (focusedScenarioLabel) {
  console.log(`UI contract passed: ${focusedScenarioLabel}.`);
} else {
  console.log(
    "UI contracts passed: favicon, full viewport/theme matrix, 200% reflow, "
    + "panels, search, reel, mobile navigation/content, MATERIAL / 01, focus, "
    + "contrast, forced colors, reduced motion, privacy consent, no-JS, and "
    + "deferred media.",
  );
}
