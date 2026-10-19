import assert from "node:assert/strict";

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
}
