const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { console }; context.globalThis = context; vm.createContext(context);
for (const file of ["venueUtils.js", "eventStructuredData.js", "venueTimeline.js"]) vm.runInContext(fs.readFileSync(`outputs/src/${file}`, "utf8"), context);
const api = context.BANQUET_ERP_VENUE_TIMELINE;
const schedule = (date, time, endTime, venue, content = "세미나", id = `${date}-${time}-${venue}`) => ({ id, date, time: endTime ? `${time}~${endTime}` : time, content, venue, people: 50 });
const events = [
  { id: "day-long", venue: "컨벤션A", schedule: [schedule("2026-11-08", "09:00", null, "컨벤션A", "세미나", "a1"), schedule("2026-11-08", "10:30", null, "컨벤션A", "COFFEE BREAK", "a2"), schedule("2026-11-08", "13:00", "18:00", "컨벤션A", "세미나", "a3")] },
  { id: "next-a", venue: "컨벤션A", schedule: [schedule("2026-11-09", "09:00", "12:00", "컨벤션A")] },
  { id: "two-day", venue: "부라노2", schedule: [schedule("2026-11-08", "09:00", "17:00", "부라노2"), schedule("2026-11-09", "09:00", "17:00", "부라노2")] },
  { id: "open", venue: "카프리1", schedule: [{ id: "open-1", date: "2026-11-08", time: "09:00~", content: "세미나", venue: "카프리1" }] },
  { id: "all", venue: "부라노 I+II+III", schedule: [schedule("2026-11-08", "09:00", "12:00", "부라노 I+II+III")] },
  { id: "child", venue: "부라노1", schedule: [schedule("2026-11-08", "10:00", "11:00", "부라노1")] },
  { id: "conv-all", venue: "컨벤션AB", schedule: [schedule("2026-11-10", "09:00", "12:00", "컨벤션AB")] },
  { id: "conv-child", venue: "컨벤션A", schedule: [schedule("2026-11-10", "10:00", "11:00", "컨벤션A")] },
  { id: "excluded", venue: "피렌체", schedule: [schedule("2026-11-08", "12:00", "13:00", "피렌체", "중식"), schedule("2026-11-08", "14:00", "15:00", "프론트", "CHECK IN"), schedule("2026-11-08", "16:00", "17:00", "컨벤션A", "CHECK OUT")] },
  { id: "parent-early", venue: "부라노 I+II+III", schedule: [schedule("2026-11-11", "08:00", "09:00", "부라노 I+II+III")] },
  { id: "parent-tie", venue: "부라노 I+II+III", schedule: [schedule("2026-11-11", "10:00", "11:00", "부라노 I+II+III")] },
  { id: "exact-tie", venue: "부라노1", schedule: [schedule("2026-11-11", "10:00", "11:00", "부라노1")] },
];
const built = api.buildVenueTimeline(events);
const allDay = built.timeline.CONVENTION_A.find((row) => row.eventOrderId === "day-long");
assert.equal(allDay.occupancyStart, "2026-11-08T09:00:00+09:00");
assert.equal(allDay.occupancyEnd, "2026-11-08T18:00:00+09:00");
assert.equal(allDay.activities.length, 3);
assert.equal(allDay.activities[0].endInferenceSource, "next_schedule_boundary");
assert.equal(built.timeline.BURANO_2.filter((row) => row.eventOrderId === "two-day").length, 2);
assert.equal(built.timeline.CAPRI_1[0].occupancyEnd, null);
assert.equal(built.timeline.CAPRI_1[0].needsReview, true);
assert.equal(built.rawVenueUsages.find((row) => row.eventOrderId === "open").timeOpenEnded, true);
assert.equal(built.timeline.BURANO_1.find((row) => row.eventOrderId === "all").overlap, true);
assert.equal(built.timeline.CONVENTION_A.find((row) => row.eventOrderId === "conv-all").overlap, true);
assert(built.rawVenueUsages.some((row) => /피렌체/.test(row.sourceVenueText) && !row.isOperationalOccupancy));
assert(built.rawVenueUsages.some((row) => row.activityType === "CHECK_IN" && !row.isOperationalOccupancy));
assert(built.rawVenueUsages.some((row) => row.activityType === "CHECK_OUT" && !row.isOperationalOccupancy));
assert.equal(api.getCurrentVenueEvent({ timeline: built, venue: "컨벤션A", atDateTime: "2026-11-08T14:00:00+09:00" }).eventOrderId, "day-long");
assert.equal(api.getCurrentVenueEvent({ timeline: built, venue: "카프리1", atDateTime: "2026-11-08T10:00:00+09:00" }), null);
assert.equal(api.getPreviousVenueEvent({ timeline: built, venue: "컨벤션A", beforeDateTime: "2026-11-09T08:00:00+09:00" }).eventOrderId, "day-long");
assert.equal(api.getNextVenueEvent({ timeline: built, venue: "컨벤션A", afterDateTime: "2026-11-08T18:00:00+09:00" }).eventOrderId, "next-a");
assert.equal(api.getNextVenueEvent({ timeline: built, venue: "부라노1", afterDateTime: "2026-11-11T09:30:00+09:00" }).eventOrderId, "exact-tie");
assert.equal(api.getNextVenueEvent({ timeline: built, venue: "부라노1", afterDateTime: "2026-11-11T07:00:00+09:00" }).eventOrderId, "parent-early");
assert.equal(built.timeline.CONVENTION_A.find((row) => row.eventOrderId === "next-a").gapMinutes, 900);
for (const action of ["get_venue_timeline", "get_previous_venue_event", "get_current_venue_event", "get_next_venue_event"]) assert(fs.readFileSync("outputs/src/erpActionRegistry.js", "utf8").includes(action));
console.log("venue timeline V1 tests passed");
