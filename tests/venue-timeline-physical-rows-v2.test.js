const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { console, localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {} }, document: { body: { classList: { contains: () => false } }, addEventListener() {}, visibilityState: "visible" }, addEventListener() {}, dispatchEvent() {}, CustomEvent: function () {}, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const file of ["venueUtils.js", "operationBoard.js"]) vm.runInContext(fs.readFileSync(`outputs/src/${file}`, "utf8"), context);

const venue = context.BANQUET_ERP_VENUE_UTILS;
const board = context.BANQUET_ERP_OPERATION_BOARD;
assert.deepEqual(Array.from(venue.expandVenueDisplayCodes("컨벤션AB")), ["CONVENTION_A", "CONVENTION_B"]);
assert.deepEqual(Array.from(venue.expandVenueDisplayCodes("부라노전체")), ["BURANO_1", "BURANO_2", "BURANO_3"]);
assert.deepEqual(Array.from(venue.expandVenueDisplayCodes("카프리전체")), ["CAPRI_1", "CAPRI_2", "CAPRI_3"]);
assert.deepEqual(Array.from(venue.expandVenueDisplayCodes("부라노1+2")), ["BURANO_1", "BURANO_2"]);
assert.equal(board.timelineVenueRows().length, 10);
assert(!board.timelineVenueRows().some((code) => ["CONVENTION_AB", "BURANO_ALL", "CAPRI_ALL"].includes(code)));

const usage = { eventOrderId: "event-1", canonicalVenue: "BURANO_ALL", date: "2026-11-30", usageSegmentId: "default", startTime: "09:00", endTime: "12:00", activities: [] };
const expanded = board.expandTimelineUsages([usage, { ...usage, canonicalVenue: "BURANO_1", startTime: "10:00" }]);
assert.deepEqual(Array.from(expanded.map((row) => row.timelineVenue)), ["BURANO_1", "BURANO_2", "BURANO_3"], "combined and child usage must not duplicate the same event/date/physical venue");
assert(expanded.every((row) => row.eventOrderId === "event-1"));

console.log("venue timeline physical rows V2 tests passed");
