const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { console, Date }; context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/banquetVenueUsage.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/eventStructuredData.js", "utf8"), context);
const api = context.BANQUET_ERP_BANQUET_VENUE_USAGE;
const event = { id: "event-1", eventName: "재인폼", companyName: "한국전문대학사무국처장협의회", startDate: "2026-11-17", endDate: "2026-11-19", calendarDates: ["2026-11-17", "2026-11-18", "2026-11-19"], venue: "프론트", schedule: [
  { date: "2026-11-17", time: "15:00", venue: "프론트", content: "체크인" },
  { date: "2026-11-18", time: "09:00~17:00", venue: "페스타", content: "세미나", people: 70 },
  { date: "2026-11-19", time: "07:00", venue: "피렌체", content: "조식", people: 70 },
] };
const result = api.extractBanquetVenueUsages(event);
assert.deepEqual(Array.from(result.venueUsages, (row) => [row.date, row.canonicalVenue, row.startTime, row.endTime]), [["2026-11-18", "FESTA", "09:00", "17:00"]]);
assert.deepEqual(Array.from(result.excludedSchedules, (row) => row.reason), ["CHECK_IN_OUT", "NON_BANQUET_VENUE"]);
assert.deepEqual(Array.from(event.schedule, (row) => row.venue), ["프론트", "페스타", "피렌체"], "원본 일정은 변경하지 않는다");
const structured = context.BANQUET_ERP_EVENT_STRUCTURED_DATA.buildEventStructuredData(event);
assert.equal(structured.sourceEventPeriod.startDate, "2026-11-17");
assert.equal(structured.operationalVenueUsages.length, 1);
assert(structured.venueUsages.some((row) => /프론트/.test(row.sourceVenueText) && row.excludedFromBanquetOperations));
const multiple = api.extractBanquetVenueUsages({ id: "two", startDate: "2026-11-18", endDate: "2026-11-19", schedule: [{ date: "11/18", time: "10:00", venue: "부라노1", content: "세미나" }, { date: "11/19", time: "11:00", venue: "페스타", content: "세미나" }] });
assert.deepEqual(Array.from(multiple.venueUsages, (row) => [row.date, row.canonicalVenue]), [["2026-11-18", "BURANO_1"], ["2026-11-19", "FESTA"]]);
const mixed = api.extractBanquetVenueUsages({ id: "mixed", schedule: [{ date: "2026-11-18", venue: "프론트/페스타", content: "행사" }] });
assert.equal(mixed.venueUsages.length, 0); assert.equal(mixed.reviewItems[0].reason, "MIXED_BANQUET_AND_NON_BANQUET_VENUE");
const unknown = api.extractBanquetVenueUsages({ id: "unknown", schedule: [{ time: "10:00", venue: "미정", content: "행사" }] });
assert.equal(unknown.venueUsages.length, 0); assert(unknown.reviewItems.length > 0);
const grid = api.buildBanquetVenueCalendar([event], { dates: ["2026-11-17", "2026-11-18", "2026-11-19"] });
assert(!grid.lanes.some((lane) => /프론트|피렌체/.test(lane.venueLabel))); assert.equal(grid.lanes[0].slots["2026-11-18"].length, 1);
const firenzeOnly = api.extractBanquetVenueUsages({ id: "firenze-only", venue: "1F 피렌체", calendarDates: ["2026-11-18"] });
assert.equal(firenzeOnly.reviewItems.length, 0); assert.equal(firenzeOnly.excludedSchedules[0].reason, "NON_BANQUET_VENUE");
const outOfPeriod = { id: "old-review", venue: "미정", calendarDates: ["2025-01-01"] };
assert.equal(api.buildBanquetVenueCalendar([outOfPeriod], { dates: ["2026-11-17"] }).reviewItems.length, 0, "표시 기간 밖 검수 항목은 집계하지 않는다");
console.log("banquet venue usage V1 tests passed");
