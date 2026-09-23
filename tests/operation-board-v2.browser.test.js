const assert = require("assert");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 375, height: 800 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.route("https://operation-board.test/**", (route) => route.fulfill({ body: "<html><body></body></html>", contentType: "text/html" }));
    await page.goto("https://operation-board.test/");
    await page.setContent('<main><section id="todayOperationBoard"></section><section id="weeklySetupWidget"></section></main>');
    await page.addStyleTag({ path: "outputs/src/styles/dashboard.css" });
    await page.addStyleTag({ path: "outputs/src/styles/dashboardWidgets.css" });
    await page.addScriptTag({ path: "outputs/src/operationBoard.js" });

    await page.evaluate(() => window.BANQUET_ERP_OPERATION_BOARD.render({ events: [{
      id: "event-0929",
      eventName: "9월 29일 행사",
      calendarDates: ["2026-09-29"],
      venue: "페스타",
      venueSpaceIds: ["space-f"],
      schedule: [{ date: "2026-09-29", time: "15:00", content: "커피브레이크", venue: "페스타" }],
    }] }));

    await page.locator("[data-board-date]").fill("2026-09-29");
    await page.locator("[data-board-date]").dispatchEvent("change");
    assert.strictEqual(await page.locator(".operation-block h4").filter({ hasText: "커피브레이크" }).count(), 1);

    await page.locator("[data-board-add]").click();
    await page.locator('[name="time"]').fill("14:30");
    await page.locator('[name="venue"]').fill("페스타");
    await page.locator('[name="title"]').fill("커피 준비");
    await page.locator("[data-board-form]").evaluate((form) => form.requestSubmit());
    assert.strictEqual(await page.locator(".operation-block h4").filter({ hasText: "커피 준비" }).count(), 1);
    const manualBlock = page.locator('.operation-block:has([data-edit])');
    await manualBlock.locator("[data-edit]").click();
    await page.locator('[name="time"]').fill("14:15");
    await page.locator('[name="title"]').fill("커피 준비 시작");
    await page.locator("[data-board-form]").evaluate((form) => form.requestSubmit());
    assert.strictEqual(await page.locator(".operation-block h4").filter({ hasText: "커피 준비 시작" }).count(), 1);
    await page.locator('.operation-block:has([data-edit]) [data-complete]').check();

    await page.locator('[data-board-date-step="1"]').click();
    assert.strictEqual(await page.locator(".operation-block h4").filter({ hasText: "커피 준비 시작" }).count(), 0);
    assert.strictEqual(await page.locator(".operation-board-empty").count(), 1);
    await page.locator('[data-board-date-step="-1"]').click();
    assert.strictEqual(await page.locator(".operation-block h4").filter({ hasText: "커피 준비 시작" }).count(), 1);
    assert(await page.locator('.operation-block:has([data-edit]) [data-complete]').isChecked());

    await page.locator("[data-board-today]").click();
    const expectedToday = await page.evaluate(() => {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    });
    assert.strictEqual(await page.locator("[data-board-date]").inputValue(), expectedToday);
    if (mobile) {
      const width = await page.locator(".operation-date-controls").evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
      assert(width.scroll <= width.client, `mobile date controls overflow: ${JSON.stringify(width)}`);
    }
    await context.close();
  }
  await browser.close();
  console.log("operation-board-v2 browser tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
