const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/eventStructuredData.js", "utf8"), context);
const api = context.BANQUET_ERP_EVENT_STRUCTURED_DATA;

assert.deepEqual({ ...api.normalizeTimeRange("09:00~") }, { rawTime: "09:00~", startTime: "09:00", endTime: null, timeOpenEnded: true, timeEndOnly: false });
assert.deepEqual({ ...api.normalizeTimeRange("~11:00") }, { rawTime: "~11:00", startTime: null, endTime: "11:00", timeOpenEnded: false, timeEndOnly: true });
assert.equal(api.normalizeTimeRange("18:30~21:00").endTime, "21:00");

const event = {
  id: "event-a-l", eventName: "복합 행사", companyName: "주최사", venue: "컨벤션A / 부라노 I+II+III", guestCount: 50,
  calendarDates: ["2026-11-05", "2026-11-06"], layoutText: "6T 9줄 · 포디움", othersText: "정면 현수막 · 카메라",
  schedule: [
    { id: "s1", date: "2026-11-05", time: "09:00~", content: "세미나", venue: "컨벤션A", people: 50 },
    { id: "s2", date: "", time: "10:00~10:30", content: "COFFEE BREAK", venue: "", people: 50 },
    { id: "s3", date: "", time: "14:00~14:30", content: "커피브레이크", venue: "부라노 I+II+III", people: 50 },
    { id: "s4", date: "2026-11-06", time: "~11:00", content: "CHECK IN", venue: "컨벤션A" },
    { id: "s5", date: "", time: "12:00~13:00", content: "중식", venue: "피렌체", people: 40 },
    { id: "s6", date: "", time: "18:00~", content: "CHECK OUT", venue: "부라노1" },
  ],
  items: [{ item_name: "커피브레이크", quantity: 50 }], notes: [{ note_type: "layout_eqp", content: "스쿨식" }], attachments: [{ id: "f1" }],
};
const result = api.buildEventStructuredData(event);
assert.equal(result.schedules[1].date, "2026-11-05");
assert.equal(result.schedules[4].date, "2026-11-06");
assert.equal(result.schedules[3].activityType, "CHECK_IN");
assert.equal(result.schedules[5].activityType, "CHECK_OUT");
assert.equal(result.schedules[0].timeOpenEnded, true);
assert.equal(result.schedules[3].timeEndOnly, true);
assert.deepEqual([...api.physicalVenueCodes("부라노 I+II+III")], ["BURANO_1", "BURANO_2", "BURANO_3"]);
assert(result.venueUsages.some((row) => row.canonicalVenue === "CONVENTION_A"));
assert.equal(result.foodBeverage.occurrenceCount, 3);
assert.equal(result.foodBeverage.servings, 140);
assert.equal(result.setupSources.layout.includes("6T 9줄"), true);
assert.equal(result.setupSources.others.includes("현수막"), true);
assert.equal(result.attachments.length, 1);
assert.equal(result.schedules.find((row) => row.sourceScheduleId === "s5").sourceVenueText, "피렌체");
assert.equal(result.unknownMessage, "이벤오더에 해당 수량이 기재되어 있지 않습니다.");

const noDate = api.inheritScheduleDates([{ time: "09:00", content: "세미나" }])[0];
assert.equal(noDate.date, "");
assert.equal(noDate.needsReview, true);
const registrySource = fs.readFileSync("outputs/src/erpActionRegistry.js", "utf8");
const boardPageSource = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
assert(registrySource.includes('"get_event_structured_data", "event", "query"'));
assert(registrySource.includes("get_event_structured_data: \"선택 행사의"));
assert(boardPageSource.includes("get_event_structured_data: plannerEventStructuredData"));
console.log("event structured data v1 tests passed");
