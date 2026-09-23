const assert = require("assert");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 375, height: 800 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.route("https://operation-board.test/**", (route) => route.fulfill({ body: "<html><body></body></html>", contentType: "text/html" }));
    await page.goto("https://operation-board.test/");
    await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><main><section id="todayOperationBoard"></section><section id="weeklySetupWidget"></section></main>');
    await page.addStyleTag({ path: "outputs/src/styles/dashboard.css" });
    await page.addStyleTag({ path: "outputs/src/styles/dashboardWidgets.css" });
    await page.addScriptTag({ path: "outputs/src/operationBoard.js" });

    await page.evaluate(() => window.BANQUET_ERP_OPERATION_BOARD.render({ events: [
      { id: "event-0929", eventName: "9월 29일 행사", eventType: "세미나", mealTypes: ["중식"], storagePath: "event.xlsx", calendarDates: ["2026-09-29"], venue: "페스타", venueSpaceIds: ["space-f"], schedule: [{ date: "2026-09-29", time: "15:00", content: "커피브레이크", venue: "페스타" }] },
      { id: "convention-0929", eventName: "컨벤션 행사", calendarDates: ["2026-09-29"], venue: "컨벤션 A", schedule: [{ date: "2026-09-29", time: "09:00", content: "행사 시작", venue: "컨벤션 A" }, { date: "2026-09-29", time: "18:00", content: "행사 종료", venue: "컨벤션 A" }] },
      { id: "burano-0929", eventName: "부라노 행사", calendarDates: ["2026-09-29"], venue: "부라노1", schedule: [{ date: "2026-09-29", time: "10:00", content: "행사 시작", venue: "부라노1" }] },
      { id: "capri-0929", eventName: "카프리 행사", calendarDates: ["2026-09-29"], venue: "카프리2", schedule: [{ date: "2026-09-29", time: "11:00", content: "행사 시작", venue: "카프리2" }] },
      { id: "convention-next", eventName: "다음 컨벤션 행사", calendarDates: ["2026-09-30"], venue: "컨벤션 A", schedule: [{ date: "2026-09-30", time: "09:00", content: "행사 시작", venue: "컨벤션 A" }] },
    ] }));

    await page.locator("[data-board-date]").fill("2026-09-29");
    await page.locator("[data-board-date]").dispatchEvent("change");
    assert.strictEqual(await page.locator(".operation-block h4").filter({ hasText: "커피브레이크" }).count(), 1);
    assert.deepStrictEqual(await page.locator("[data-space-group-section]").evaluateAll((items) => items.map((item) => item.dataset.spaceGroupSection)), ["컨벤션", "페스타", "부라노", "카프리"]);
    assert.strictEqual(await page.locator('[data-space-group-section="컨벤션"] .operation-block').filter({ hasText: "다음 세팅" }).count(), 1);
    if (mobile) {
      assert.strictEqual(await page.locator('[data-space-group-toggle][aria-expanded="true"]').count(), 1);
      await page.locator('[data-space-group-toggle="페스타"]').click();
      assert.strictEqual(await page.locator('[data-space-group-toggle="페스타"]').getAttribute("aria-expanded"), "true");
      await page.locator('[data-space-group-section="페스타"] .operation-block').filter({ hasText: "커피브레이크" }).click();
      assert.strictEqual(await page.locator("[data-operation-detail][open]").count(), 1);
      assert(await page.locator("[data-operation-detail-content]").innerText().then((text) => text.includes("9월 29일 행사") && text.includes("원본 엑셀 보기")));
      await page.locator("[data-detail-close]").click();
    }

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
