const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const html = fs.readFileSync('outputs/index.html', 'utf8');
const viewer = html.slice(html.indexOf('    async function openStoredExcel('), html.search(/    (?:async )?function downloadStoredExcel\(/));
const css = (file) => fs.readFileSync(file, 'utf8').replace(/@import "([^"?]+)(?:\?[^"]*)?";/g, (_, child) => css(path.resolve(path.dirname(file), child)));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const mobile of [true, false]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 393, height: 800 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.route('https://test.local/**', route => route.fulfill({ body: '<html><head></head><body></body></html>', contentType: 'text/html' }));
    await page.goto('https://test.local/');
    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css('outputs/src/styles/app.css')} body{min-height:3000px}</style><div id="todayOperationBoard"></div><div id="weeklySetupWidget"></div>${html.slice(html.indexOf('    <div id="excelViewerModal"'), html.indexOf('    <div id="mobileDateSheet"'))}`);
    await page.evaluate((source) => {
      window.fetchStoredFile = async storagePath => { window.openedPath = storagePath; return new ArrayBuffer(0); };
      window.escapeHtml = value => String(value);
      window.XLSX = { read: () => ({ SheetNames: ['Original'], Sheets: { Original: { '!ref': 'A1:AD100' } } }), utils: { decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 99, c: 29 } }), encode_cell: ({ r, c }) => `${r}:${c}` } };
      (0, eval)(source);
      document.getElementById('closeExcelViewerModal').onclick = window.closeExcelViewerModal;
    }, viewer);
    await page.addScriptTag({ path: 'outputs/src/operationBoard.js' });
    await page.evaluate(() => {
      const today = new Date(); const day = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const future = new Date(today); future.setDate(future.getDate()+2); const nextDay = `${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`;
      window.BANQUET_ERP_OPERATION_BOARD.render({ events: [
        { id: 'ended', eventName: 'Ended', calendarDates: [day], venue: 'Hall', venueSpaceIds: ['hall'], storagePath: 'old.xlsx', schedule: [{ date: day, time: '18:00', content: '행사 종료', venue: 'Hall' }] },
        { id: 'next', eventName: 'Future', calendarDates: [nextDay], venue: 'Hall', venueSpaceIds: ['hall'], storagePath: 'future.xlsx', schedule: [{ date: nextDay, time: '09:00', content: '행사 시작', venue: 'Hall' }] },
        { id: 'missing', eventName: 'Missing', calendarDates: [nextDay], venue: 'Other' }
      ] });
    });
    assert.equal(await page.locator('[data-setup-original="missing"]').count(), 0);
    await page.locator('#weeklySetupWidget [data-setup-original="next"]').click();
    assert.equal(await page.evaluate(() => window.openedPath), 'future.xlsx');
    const wrap = page.locator('.excel-sheet-table-wrap');
    const size = await wrap.evaluate(el => ({ w: el.clientWidth, sw: el.scrollWidth, h: el.clientHeight, sh: el.scrollHeight }));
    assert(size.sw > size.w && size.sh > size.h, JSON.stringify(size));
    if (mobile) {
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
      const backgroundScroll = await page.evaluate(() => scrollY);
      const cdp = await context.newCDPSession(page);
      const box = await wrap.boundingBox();
      const x = box.x + box.width * .8, y = box.y + box.height * .8;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i=1;i<=8;i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x:x-i*22, y:y-i*28 }] }); await page.waitForTimeout(25); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const scroll = await wrap.evaluate(el => ({ x:el.scrollLeft, y:el.scrollTop }));
      assert(scroll.x > 0 && scroll.y > 0, JSON.stringify(scroll));
      await page.waitForTimeout(500);
      const beforeReverse = await wrap.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 50, y: box.y + 100 }] });
      for (let i=1;i<=6;i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x+50+i*20, y: box.y+100+i*25 }] }); await page.waitForTimeout(25); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const reversed = await wrap.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
      assert(reversed.x < beforeReverse.x && reversed.y < beforeReverse.y);
      assert.equal(await page.evaluate(() => scrollY), backgroundScroll);
    } else {
      await wrap.hover(); await page.mouse.wheel(200, 300); await page.waitForTimeout(150);
      assert((await wrap.evaluate(el => el.scrollTop)) > 0);
    }
    await page.locator('#closeExcelViewerModal').click();
    assert.equal(await page.locator('.excel-viewer-backdrop.visible').count(), 0);
    if (mobile) assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'auto');
    await page.evaluate(() => window.scrollTo(0, 200)); assert((await page.evaluate(() => scrollY)) > 0);
    await page.locator('#todayOperationBoard [data-setup-original="next"]').click();
    assert.equal(await page.evaluate(() => window.openedPath), 'future.xlsx');
    console.log(`${mobile ? 'Mobile touch' : 'Desktop'}: scroll, close, future file, missing file passed`);
    await context.close();
  }
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
