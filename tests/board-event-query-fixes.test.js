const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const main = fs.readFileSync("outputs/index.html", "utf8");
const preview = fs.readFileSync("outputs/event-order-preview.html", "utf8");

const helperStart = page.indexOf("  function seoulTodayKey()");
const helperEnd = page.indexOf("  function isAssetAnalyticsRequest", helperStart);
const context = { Intl, Date, console, activeEventContexts: [], board: { getSelectedDate: () => "2026-10-12" } };
vm.createContext(context);
vm.runInContext(`${page.slice(helperStart, helperEnd)}\nthis.api = { queryPeriod, eventInPeriod, eventVenueMatches, extractedLayoutTexts, fallbackLayoutTexts };`, context);
const api = context.api;

const period = api.queryPeriod("이번주 카프리 행사 뭐있어?");
const makeEvent = (id, date) => ({ id, venue: "카프리1", calendarDates: [date], startDate: date, endDate: date, schedule: [] });
const rows = [makeEvent("week-1", period.start), makeEvent("week-2", period.end)];
for (let index = 0; index < 3; index += 1) rows.push(makeEvent(`next-${index}`, "2026-11-15"));
for (let index = 0; index < 5; index += 1) rows.push(makeEvent(`past-${index}`, "2025-03-01"));
assert.equal(rows.filter((event) => api.eventInPeriod(event, period) && api.eventVenueMatches(event, "카프리")).length, 2);

const lastWeek = api.queryPeriod("지난 주");
assert.equal(api.eventInPeriod(makeEvent("outside", period.start), lastWeek), false);
const thisMonth = api.queryPeriod("이번 달");
assert.equal(api.eventInPeriod(makeEvent("outside-month", "2025-01-01"), thisMonth), false);
assert(page.includes("calendarDates.some"), "event_calendar_dates must participate in final date matching");
assert(page.includes("resolvedPeriod: period ? { start: period.start, end: period.end }"));
assert(page.includes("matchedCount: matches.length"));

for (const html of [main, preview]) {
  assert(html.includes("function openRequestedExcelPreview()"));
  assert(html.includes('params.get("excelPreview")'));
  assert(html.includes("openStoredExcel(storagePath)"));
}
assert(page.includes('../index.html?excelPreview=${encodeURIComponent(String(path))}'));
const boardViewer = page.slice(page.indexOf("window.openStoredExcel ="), page.indexOf("window.addEventListener", page.indexOf("window.openStoredExcel =")));
assert(!boardViewer.includes("/storage/v1/object/public/"), "board default action must not open/download the raw file URL");

assert.deepEqual(Array.from(api.extractedLayoutTexts({ layoutText: "", notes: [{ note_type: "layout_eqp", content: "Class Type 6 x 10 / 120석" }] })), ["Class Type 6 x 10 / 120석"]);
assert(page.indexOf("if (saved)") < page.indexOf("else if (extracted.length)"));
assert(page.indexOf("else if (extracted.length)") < page.indexOf("else if (fallback.length)"));
assert(page.includes('sourceBadge = "저장 레이아웃"'));
assert(page.includes('sourceBadge = "원본 이벤오더 기준"'));
assert(page.includes("등록된 이벤오더에서 레이아웃 정보를 찾지 못했습니다."));
assert(page.includes("activeEventContexts[0]"));

console.log("board event query fix tests passed");
