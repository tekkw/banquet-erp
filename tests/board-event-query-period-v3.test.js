const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const html = fs.readFileSync("outputs/board/index.html", "utf8");
const start = page.indexOf("  function seoulTodayKey()");
const end = page.indexOf("  function isAssetAnalyticsRequest", start);
const context = { Intl, Date, console, activeEventContexts: [], board: { getSelectedDate: () => "2026-10-12" } };
vm.createContext(context);
vm.runInContext(`${page.slice(start, end)}\nthis.api = { queryPeriod, normalizedVenue, venueTerm, eventVenueMatches, eventDateKeys, eventInPeriod, displayEventDate };`, context);
const api = context.api;
const anchor = "2026-10-12";

assert.deepEqual(JSON.parse(JSON.stringify(api.queryPeriod("이번주", anchor))), { start: "2026-10-12", end: "2026-10-18", label: "이번 주" });
assert.deepEqual(JSON.parse(JSON.stringify(api.queryPeriod("다음 주", anchor))), { start: "2026-10-19", end: "2026-10-25", label: "다음 주" });
assert.deepEqual(JSON.parse(JSON.stringify(api.queryPeriod("지난주", anchor))), { start: "2026-10-05", end: "2026-10-11", label: "지난 주" });

const event = (date, venue = "부라노1") => ({ eventName: date, venue, calendarDates: [date], startDate: date, endDate: date, eventDateTime: "", schedule: [] });
const burano = [event("2026-10-06"), event("2026-10-13"), event("2026-10-15"), event("2026-10-20")];
const filter = (label, venue = "부라노") => { const period = api.queryPeriod(label, anchor); return burano.filter((item) => api.eventInPeriod(item, period) && api.eventVenueMatches(item, venue)).map((item) => item.startDate); };
assert.deepEqual(filter("이번주"), ["2026-10-13", "2026-10-15"]);
assert.deepEqual(filter("다음주"), ["2026-10-20"]);
assert.deepEqual(filter("지난주"), ["2026-10-06"]);

const capriRows = [event("2026-10-13", "카프리 I"), event("2026-10-14", "카프리 III"), event("2026-10-15", "카프리 I+II")];
assert.equal(capriRows.filter((item) => api.eventVenueMatches(item, "카프리")).length, 3);
assert.equal(api.normalizedVenue("카프리 I+II+III"), "카프리1+2+3");
assert.equal(api.venueTerm("카프리 II 행사"), "카프리2");

const mixedSources = { venue: "카프리1", calendarDates: ["2026-10-01"], startDate: "2026-10-13", endDate: "2026-10-15", eventDateTime: "", schedule: [] };
assert.equal(api.eventInPeriod(mixedSources, api.queryPeriod("이번주", anchor)), true, "valid fallback dates must not be hidden by an out-of-period calendar row");
assert.equal(api.displayEventDate({ ...mixedSources, calendarDates: ["2026-10-13", "2026-10-20"] }, api.queryPeriod("이번주", anchor)), "10/13");

assert(page.includes('let period = queryPeriod(text, anchorDate)'));
assert(page.includes('if (!period && venue && !allowAll) period = queryPeriod("이번 주", anchorDate)'));
assert(page.includes("hasRelativePeriod && !period"));
assert(page.includes('console.debug("event query debug"'));
assert(page.includes("matches.sort"));
assert(html.includes("operationBoardPage.js?v=27-field-setup-observation"));

console.log("board event query period V3 tests passed");
