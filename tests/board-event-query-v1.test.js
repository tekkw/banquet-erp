const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const boardHtml = fs.readFileSync("outputs/board/index.html", "utf8");
const helperStart = page.indexOf("  function seoulTodayKey()");
const helperEnd = page.indexOf("  function isAssetAnalyticsRequest", helperStart);
assert(helperStart > 0 && helperEnd > helperStart, "event query helpers must remain independently testable");

const context = { Intl, console, Date, activeEventContexts: [], board: { getSelectedDate: () => "2026-10-12" } };
vm.createContext(context);
vm.runInContext(`${page.slice(helperStart, helperEnd)}\nthis.api = { queryPeriod, normalizedVenue, venueTerm, eventVenueMatches, eventDateKeys, eventInPeriod, eventQueryType, explicitLayoutTexts };`, context);
const api = context.api;

assert.equal(api.eventQueryType("이번 주 카프리 행사 레이아웃 뭐였지?"), "get_event_layout");
assert.equal(api.eventQueryType("그 행사 인원 몇 명이야?"), "get_event_guest_count");
assert.equal(api.eventQueryType("커피브레이크 몇 시였지?"), "get_event_schedule");
assert.equal(api.eventQueryType("원본 엑셀 띄워봐"), "open_event_original");
assert.equal(api.eventQueryType("이번 주 카프리 행사 뭐 있었지?"), "find_events_by_period_space");

const thisWeek = api.queryPeriod("이번 주");
assert.equal((new Date(`${thisWeek.end}T00:00:00Z`) - new Date(`${thisWeek.start}T00:00:00Z`)) / 86400000, 6, "week boundaries are deterministic Monday-Sunday");
assert.equal(api.queryPeriod("2026년 10월 14일").start, "2026-10-14");
assert.equal(api.queryPeriod("10/14").start.slice(5), "10-14");

const capri = { venue: "", startDate: "2026-10-14", calendarDates: [], schedule: [{ date: "2026-10-14", venue: "카프리3", content: "세미나" }] };
assert.equal(api.eventVenueMatches(capri, "카프리"), true, "generic Capri includes numbered spaces");
assert.equal(api.eventVenueMatches({ ...capri, schedule: [{ venue: "컨벤션 AB" }] }, "컨벤션"), true, "generic Convention includes A/B/AB");
assert.equal(api.eventVenueMatches({ ...capri, schedule: [{ venue: "부라노 전체홀" }] }, "부라노"), true, "generic Burano includes whole hall");
assert.equal(api.eventInPeriod(capri, { start: "2026-10-13", end: "2026-10-15" }), true);

const layoutTexts = api.explicitLayoutTexts({ layoutText: "", notes: [{ note_type: "layout_eqp", content: "스쿨식 40석" }], items: [], schedule: [] });
assert.deepEqual(Array.from(layoutTexts), ["스쿨식 40석"], "layout answer uses registered note text verbatim");

for (const sourceTable of ["event_orders", "event_calendar_dates", "event_schedules", "event_items", "event_notes"]) assert(page.includes(sourceTable));
assert(page.includes("sessionStorage.setItem(activeEventContextKey"));
assert(page.includes("activeEventContexts = [context, ...activeEventContexts"));
assert(page.includes("const contextFollowup = hasContext"), "layout/original follow-ups reuse the active event without repeating '그 행사'");
assert(page.includes("if (matches.length > 1)"), "multiple candidates must require selection");
assert(page.includes('data-event-query-choice="${index}"'));
assert(page.includes("window.openStoredExcel(event.storagePath)"), "original action must open the existing viewer helper");
assert(page.includes("등록된 원본 파일이 없습니다."));
assert(page.includes("등록된 이벤오더에서 조건에 맞는 행사를 찾지 못했습니다."));
assert(page.includes("등록된 이벤오더에서 레이아웃 정보를 찾지 못했습니다."));
assert(boardHtml.includes("operationBoardPage.js?v=28-action-registry"), "board cache version must be bumped");

console.log("board event query V1 tests passed");
