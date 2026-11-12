import assert from "node:assert/strict";
import { waitForCaseLayout } from "./browser-contracts.cjs";

// A history entry survives a document reload before its shared payload arrives.
export async function checkDeferredCaseReturn(browser, origin) {
  const errors = [];
  for (const action of ["restore", "read", "close", "switch"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: "reduce" });
    page.on("pageerror", error => errors.push(error.message));
    let release;
    try {
      await page.goto(origin + "/?point=dd-camp");
      const sourceLink = page.locator('[data-map-related] a[href="?point=hotline-camp"]');
      await sourceLink.waitFor({ state: "visible" });
      await waitForCaseLayout(page);
      await sourceLink.scrollIntoViewIfNeeded();
      await sourceLink.focus();
      const sourceTop = await page.locator(".case-scroll").evaluate(element => element.scrollTop);
      assert.ok(sourceTop > 20, "The saved source link needs a real reading position");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector("[data-map-inspector]").dataset.selectedMapId === "hotline-camp");
      await waitForCaseLayout(page);
      assert.equal(await page.locator(".case-scroll").evaluate(element => element.scrollTop), 0,
        "A newly opened related case starts at its heading");
      await page.goBack();
      await page.waitForFunction(top => Math.abs(document.querySelector(".case-scroll").scrollTop - top) < 2
        && document.activeElement?.matches('[data-map-related] a[href="?point=hotline-camp"]'), sourceTop);
      const sourceUrl = page.url();
      const held = new Promise(resolve => { release = resolve; });
      await page.route("**/case-content.json*", async route => { await held; await route.continue(); });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("[data-case-load-state]").waitFor({ state: "visible" });
      await waitForCaseLayout(page);
      if (action === "close") {
        await page.locator("[data-close-inspector]").click();
        await page.waitForFunction(() => !document.body.hasAttribute("data-case-open"));
      } else if (action === "switch") {
        await page.locator('[data-map-related] a[href="?point=private-practice"]').click();
        await page.waitForFunction(() => document.querySelector("[data-map-inspector]").dataset.selectedMapId === "private-practice");
        await waitForCaseLayout(page);
        await page.locator(".case-scroll").focus();
      } else if (action === "read") {
        await page.locator(".case-scroll").focus();
        await page.keyboard.press("Home");
        await page.waitForFunction(() => document.querySelector(".case-scroll").scrollTop === 0
          && document.activeElement?.matches(".case-scroll"));
      }
      const focused = await page.evaluateHandle(() => document.activeElement);
      const response = page.waitForResponse(response => response.url().includes("case-content.json"));
      release();
      const received = await response;
      if (action !== "close") {
        await page.waitForFunction(() => document.querySelector("[data-case-load-state]").hidden);
        await waitForCaseLayout(page);
      } else {
        await received.finished();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      if (action === "restore") {
        assert.equal(page.url(), sourceUrl, "Reload preserves the saved case address");
        assert.ok(Math.abs(await page.locator(".case-scroll").evaluate(element => element.scrollTop) - sourceTop) < 2,
          "The complete payload restores the saved scroll range");
        assert.equal(await sourceLink.evaluate(element => element === document.activeElement), true,
          "The restored case focuses its source related link after that row arrives");
      } else {
        assert.equal(await focused.evaluate(element => element === document.activeElement), true,
          "A completed old restoration cannot steal focus after " + action);
        if (action === "close") {
          assert.equal(await page.locator("[data-map-inspector]").evaluate(element => element.classList.contains("is-open")), false,
            "A completed old restoration cannot reopen the dismissed case");
        } else if (action === "switch") {
          assert.equal(new URL(page.url()).searchParams.get("point"), "private-practice");
          assert.equal(await page.locator(".case-scroll").evaluate(element => element.scrollTop), 0,
            "A different case cannot inherit the earlier saved scroll position");
        } else {
          assert.equal(page.url(), sourceUrl, "Reading continues in the same case");
          assert.equal(await page.locator(".case-scroll").evaluate(element => element.scrollTop), 0,
            "A reader's Home command supersedes deferred history restoration");
        }
      }
      await focused.dispose();
    } finally { release?.(); await page.close(); }
  }
  assert.deepEqual(errors, [], "Deferred history restoration has no uncaught browser errors");
}

// User journeys for the shared on-demand payload, including failures and races.
export async function checkDeferredCaseContent(browser, origin) {
  const errors = [];
  const open = async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    page.on("pageerror", error => errors.push(error.message));
    return page;
  };
  let page = await open();
  try {
    let requests = 0;
    await page.route("**/case-content.json*", async route => {
      requests++;
      if (requests === 1) await route.fulfill({ status: 503, body: "Unavailable" });
      else await route.continue();
    });
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector("[data-map-id='private-practice']"));
    assert.equal(requests, 0, "The first map needs no case payload");
    await page.goto(origin + "/?point=ks-fish");
    await page.locator("[data-case-retry]").waitFor({ state: "visible" });
    assert.match(await page.locator("[data-map-description]").innerText(), /первый.*давний/s);
    await page.locator("[data-case-retry]").click();
    await page.waitForFunction(() => document.querySelector("[data-case-load-state]").hidden
      && document.querySelector("[data-map-evidence-result]").textContent.trim());
    assert.equal(requests, 2, "Retry makes a fresh request");
    assert.ok(await page.locator(".case-figure img").count(), "Figures arrive with complete details");
  } finally { await page.close(); }

  // A stalled response must release the shared request, not keep every reader waiting.
  for (const entry of ["card", "search"]) {
    page = await open();
    let heldRoute, attempts = 0;
    try {
      await page.clock.install();
      await page.route("**/case-content.json*", route => {
        if (++attempts === 1) { heldRoute = route; return; }
        return route.continue();
      });
      await page.goto(origin + (entry === "card" ? "/?point=ks-fish" : "/"));
      if (entry === "search") {
        await page.locator("[data-spatial-search]").click();
        await page.locator("[data-command-input]").fill("51 420");
        await page.locator("[data-command-status]").filter({ hasText: "Загружается поиск" }).waitFor();
      } else {
        await page.locator("[data-case-load-state]").waitFor({ state: "visible" });
      }
      await page.clock.fastForward(10_001);
      assert.equal(attempts, 1, "Readers share one pending request");
      if (entry === "card") {
        await page.locator("[data-case-retry]").waitFor({ state: "visible" });
        assert.match(await page.locator("[data-map-description]").innerText(), /первый.*давний/s);
        await page.locator("[data-case-retry]").click();
        await page.waitForFunction(() => document.querySelector("[data-case-load-state]").hidden
          && document.querySelector("[data-map-evidence-result]").textContent.trim());
      } else {
        await page.locator("[data-command-status]").filter({ hasText: "Не удалось загрузить" }).waitFor();
        assert.equal(await page.locator("[data-command-input]").inputValue(), "51 420");
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector("[data-map-inspector]").dataset.selectedMapId === "narkomfin");
      }
      assert.equal(attempts, 2, "Timeout permits a fresh, successful request");
    } finally {
      await heldRoute?.abort().catch(() => {});
      await page.close();
    }
  }

  page = await open();
  let release;
  try {
    const held = new Promise(resolve => { release = resolve; });
    await page.route("**/case-content.json*", async route => { await held; await route.continue(); });
    await page.goto(origin);
    await page.locator("[data-spatial-search]").click();
    await page.locator("[data-command-input]").fill("51 420");
    await page.keyboard.press("Enter");
    release();
    await page.waitForFunction(() => document.querySelector("[data-map-inspector]").dataset.selectedMapId === "narkomfin"
      && document.querySelector("[data-map-inspector]").classList.contains("is-open"));
    assert.match(await page.locator("[data-map-evidence-result]").innerText(), /51\s420/);
  } finally { release?.(); await page.close(); }

  page = await open();
  try {
    const held = new Promise(resolve => { release = resolve; });
    const response = page.waitForResponse(response => response.url().includes("case-content.json"));
    await page.route("**/case-content.json*", async route => { await held; await route.continue(); });
    await page.goto(origin + "/?point=ks-fish");
    await page.locator("[data-close-inspector]").click();
    release();
    await response;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator("[data-map-inspector]").evaluate(element => element.classList.contains("is-open")), false,
      "A response cannot reopen a dismissed card");
  } finally { release?.(); await page.close(); }
  assert.deepEqual(errors, [], "Deferred content has no uncaught browser errors");
  await checkDeferredCaseReturn(browser, origin);
}
