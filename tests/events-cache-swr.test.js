const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

for (const file of ["outputs/index.html", "outputs/event-order-preview.html"]) {
  const source = fs.readFileSync(file, "utf8");
  assert(source.includes('const EVENTS_CACHE_KEY = "banquet-erp-events-cache-v1";'), file);
  assert(source.includes("if (!restoreCachedEvents()) renderCalendar();"), file);
  assert(source.indexOf("if (!restoreCachedEvents()) renderCalendar();") < source.indexOf("loadEventsFromSupabase();", source.indexOf("function startAuthenticatedApp")), file);
  assert(source.includes('setEventsSyncStatus("최신 데이터 동기화 완료", "synced")'), file);
  assert(source.includes('setEventsSyncStatus("네트워크 연결 실패 · 최근 저장 데이터 표시 중", "offline")'), file);
  assert(source.includes('if (changed || !hadRenderedEvents) renderCalendar();'), file);

  const helperStart = source.indexOf("    function setEventsSyncStatus(");
  const helperEnd = source.indexOf("    async function loadEventsFromSupabase()", helperStart);
  const helpers = source.slice(helperStart, helperEnd);
  const memory = new Map();
  const status = { textContent: "", dataset: {}, hidden: true };
  const context = {
    localStorage: { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) },
    document: { querySelector: () => status },
    console,
    Date,
    savedEvents: [], eventsLoaded: false, showingEventsCache: false, renderCount: 0,
  };
  vm.createContext(context);
  vm.runInContext(`
    const EVENTS_CACHE_KEY = "banquet-erp-events-cache-v1";
    const EVENTS_CACHE_VERSION = 1;
    const EVENTS_CACHE_STALE_MS = 24 * 60 * 60 * 1000;
    function renderCalendar() { renderCount += 1; }
    ${helpers}
    this.api = { readEventsCache, writeEventsCache, restoreCachedEvents, getEvents: () => savedEvents };
  `, context);

  assert.equal(context.api.restoreCachedEvents(), false);
  context.api.writeEventsCache([{ id: "cached", schedule: [{ date: "09. 30 (수)", time: "13:00", content: "세미나" }] }]);
  assert.equal(context.api.restoreCachedEvents(), true);
  assert.equal(context.api.getEvents()[0].id, "cached");
  assert.equal(context.renderCount, 1);
  assert.equal(status.textContent, "최근 데이터 표시 중 · 최신 정보 확인 중");
}

console.log("event cache stale-while-revalidate tests passed");
