const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const localMemory = new Map();
const sessionMemory = new Map();
const context = {
  window: {},
  localStorage: { getItem: (key) => localMemory.get(key) || null, setItem: (key, value) => localMemory.set(key, value) },
  sessionStorage: { getItem: (key) => sessionMemory.get(key) || null, setItem: (key, value) => sessionMemory.set(key, value) },
  document: { getElementById: () => null },
  crypto: { randomUUID: () => "manual-v2" },
  console,
  Date,
  Set,
  Map,
};
vm.createContext(context);
const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
vm.runInContext(source, context);
const board = context.window.BANQUET_ERP_OPERATION_BOARD;

const targetDate = "2026-09-29";
const otherDate = "2026-09-30";
const events = [{
  id: "event-0929",
  eventName: "9월 29일 행사",
  calendarDates: [targetDate],
  venue: "페스타",
  venueSpaceIds: ["space-f"],
  schedule: [{ date: targetDate, time: "15:00", content: "커피브레이크", venue: "페스타" }],
}];

// A. 행사와 수동 작업이 없는 날짜는 운영 항목이 없다.
board._setStateForTest({ completions: {}, plans: {}, manual: [], checklist: [] });
assert.strictEqual(board.allBlocks(otherDate, events).length, 0);

// B. 선택 날짜와 일치하는 이벤트오더 일정만 생성한다.
const targetBlocks = board.allBlocks(targetDate, events);
assert(targetBlocks.some((item) => item.type === "coffee" && item.time === "15:00"));
assert(!board.allBlocks(otherDate, events).some((item) => item.type === "coffee"));

// C. 수동 작업은 저장된 board date에서만 보인다.
board._setStateForTest({
  completions: {},
  plans: {},
  checklist: [],
  manual: [{ key: "manual:v2", id: "manual:v2", kind: "manual", type: "manual", date: targetDate, time: "14:30", venue: "페스타", title: "커피 준비", completed: false }],
});
assert(board.allBlocks(targetDate, []).some((item) => item.key === "manual:v2"));
assert(!board.allBlocks(otherDate, []).some((item) => item.key === "manual:v2"));

// D. 오늘 동작은 현재 로컬 날짜로 돌아가며, UI 버튼도 같은 경로를 사용한다.
board.setSelectedDate(targetDate);
const now = new Date();
const offset = now.getTimezoneOffset() * 60000;
const today = new Date(now.getTime() - offset).toISOString().slice(0, 10);
board.setSelectedDate(today);
assert.strictEqual(board.getSelectedDate(), today);
assert(source.includes('root.querySelector("[data-board-today]").onclick = () => { selectDate(dateKey()); render(); };'));
assert.strictEqual(sessionMemory.get("banquet-erp-operation-board-selected-date-v2"), today);

// 공간 그룹은 기존 physicalSpaceKeys 결과를 사용하고 지정 우선순위로 정렬한다.
const grouped = board.groupBlocksBySpace([
  { key: "capri", venue: "카프리2", time: "13:00" },
  { key: "burano-late", venue: "부라노1", time: "16:00" },
  { key: "convention", venue: "컨벤션센터 A", time: "09:00" },
  { key: "burano-early", venue: "부라노1", time: "10:00" },
]);
assert.strictEqual(grouped.map((group) => group.name).join(","), "컨벤션,부라노,카프리");
assert.strictEqual(grouped.find((group) => group.name === "부라노").venues[0].blocks.map((block) => block.time).join(","), "10:00,16:00");

// 다음 세팅은 종료 행사의 physical space를 이어받아 같은 공간 그룹에 남는다.
const groupedNext = board.groupBlocksBySpace(board.buildAutoBlocks([
  { id: "convention-today", eventName: "컨벤션 행사", calendarDates: [targetDate], venue: "컨벤션 A", schedule: [{ date: targetDate, time: "18:00", content: "행사 종료", venue: "컨벤션 A" }] },
  { id: "convention-next", eventName: "다음 컨벤션 행사", calendarDates: [otherDate], venue: "컨벤션 A", schedule: [{ date: otherDate, time: "09:00", content: "행사 시작", venue: "컨벤션 A" }] },
], targetDate));
assert(groupedNext.find((group) => group.name === "컨벤션").blocks.some((block) => block.type === "next_setup"));

// 다일 행사 병합 셀의 빈 날짜는 직전 유효 날짜를 상속하고 일반 일정도 버리지 않는다.
const multiDayEvents = [{
  id: "burano-multi",
  eventName: "부라노 다일 행사",
  calendarDates: ["2026-09-29", "2026-09-30", "2026-10-01"],
  venue: "부라노1",
  schedule: [
    { date: "09.29", time: "15:00", content: "CHECK IN", venue: "부라노1" },
    { date: "", time: "13:00~18:00", content: "세미나", venue: "부라노1" },
    { date: "09.30", time: "07:00~09:30", content: "조식/뷔페", venue: "부라노1" },
    { date: "", time: "~11:00", content: "CHECK OUT", venue: "부라노1" },
    { date: "10.01", time: "09:00", content: "교육", venue: "부라노1" },
    { date: "", time: "14:00~16:00", content: "회의", venue: "부라노1" },
  ],
}];
const inheritedRows = board.normalizedScheduleRows(multiDayEvents[0]);
assert.strictEqual(inheritedRows.map((item) => item.day).join(","), "2026-09-29,2026-09-29,2026-09-30,2026-09-30,2026-10-01,2026-10-01");
assert.strictEqual(board.normalizedScheduleRows({ ...multiDayEvents[0], schedule: [{ date: "2026.09.30", time: "09:00", content: "교육" }] })[0].day, "2026-09-30");
assert.strictEqual(board.normalizedScheduleRows({ ...multiDayEvents[0], schedule: [{ date: "10월 1일", time: "09:00", content: "교육" }] })[0].day, "2026-10-01");
for (const value of ["09.30", "9. 30", "09.30 (수)", "9. 30 (수)", "2026.09.30", "2026년 09월 30일"]) {
  assert.strictEqual(board.normalizedScheduleRows({ ...multiDayEvents[0], schedule: [{ date: value, time: "09:00", content: "교육" }] })[0].day, "2026-09-30", value);
}
assert.strictEqual(board.normalizedScheduleRows({ calendarDates: ["2026-09-30"], schedule: [{ date: "10. 01 (목)", time: "09:00", content: "교육" }] })[0].day, "2026-10-01");
assert(board.buildAutoBlocks(multiDayEvents, "2026-09-29").some((item) => item.type === "schedule" && item.title === "세미나"));
assert(!board.buildAutoBlocks(multiDayEvents, "2026-09-30").some((item) => item.type === "checkout"));
assert(board.buildAutoBlocks(multiDayEvents, "2026-10-01").some((item) => item.type === "schedule" && item.title === "회의"));

// 실데이터 증상과 같은 행사 수로 각 날짜에 모든 행사가 최소 한 블록을 만든다.
const datedEvent = (id, date, venue, content, time = "09:00") => ({
  id, eventName: id, calendarDates: [date], venue,
  schedule: [{ date, time, content, venue }],
});
const regressionEvents = [
  datedEvent("0929-festa", "2026-09-29", "페스타", "예식"),
  datedEvent("0929-burano", "2026-09-29", "부라노1", "세미나"),
  datedEvent("0930-convention", "2026-09-30", "컨벤션A", "교육"),
  datedEvent("0930-capri", "2026-09-30", "카프리1", "회의"),
  ...[1, 2, 3, 4].map((number) => datedEvent(`1001-${number}`, "2026-10-01", `부라노${number}`, "강연")),
];
for (const [date, expected] of [["2026-09-29", 2], ["2026-09-30", 2], ["2026-10-01", 4]]) {
  const eventIds = new Set(board.buildAutoBlocks(regressionEvents, date).filter((item) => item.type === "schedule").map((item) => item.eventOrderId));
  assert.strictEqual(eventIds.size, expected, `${date}의 선택 행사마다 일반 운영 일정이 생성되어야 한다`);
}

// 선택 날짜의 일정 날짜를 특정할 수 없거나 유효 일정이 없어도 행사를 숨기지 않는다.
const fallbackEvents = [{
  id: "ambiguous-multi", eventName: "날짜 확인 행사", calendarDates: [targetDate, otherDate],
  startDate: targetDate, endDate: otherDate, eventDateTime: `${targetDate} 14:30`, venue: "부라노1", guestCount: 31,
  schedule: [{ date: "", time: "13:00", content: "세미나", venue: "부라노1" }],
}, {
  id: "empty-schedule", eventName: "일정 없는 행사", calendarDates: [targetDate], venue: "카프리1", guestCount: 20, schedule: [],
}];
const fallbackBlocks = board.buildAutoBlocks(fallbackEvents, targetDate).filter((item) => item.needsScheduleReview);
assert.strictEqual(fallbackBlocks.length, 2);
assert.strictEqual(fallbackBlocks.find((item) => item.eventOrderId === "ambiguous-multi").time, "14:30");
assert.strictEqual(fallbackBlocks.find((item) => item.eventOrderId === "empty-schedule").time, "시간 미정");
assert.strictEqual(board.groupBlocksBySpace(fallbackBlocks).map((group) => group.name).join(","), "부라노,카프리");
assert(source.includes("세부 일정 확인 필요"));

const productionDateFormatEvent = {
  id: "production-date-format", eventName: "부라노 행사", calendarDates: ["2026-09-30"], venue: "3F 부라노 I",
  schedule: [
    { date: "09. 30 (수)", time: "15:00~", content: "CHECK IN", venue: "1F 프론트" },
    { date: "09. 30 (수)", time: "13:00~18:00", content: "세미나", venue: "3F 부라노 I" },
  ],
};
const productionFormatBlocks = board.buildAutoBlocks([productionDateFormatEvent], "2026-09-30");
assert(!productionFormatBlocks.some((item) => item.type === "checkin" || /CHECK IN|프론트/.test(`${item.title} ${item.venue}`)));
assert(productionFormatBlocks.some((item) => item.type === "schedule" && item.time === "13:00" && item.title === "세미나"));
assert(!productionFormatBlocks.some((item) => item.needsScheduleReview));

const shinanCouncilEvent = {
  id: "4c72d6f8-7358-40e4-987f-ec628d341b81", eventName: "신안군의회",
  startDate: "2026-09-29", endDate: "2026-09-29", calendarDates: ["2026-09-29"],
  venue: "3F 부라노 I", guestCount: 31,
  schedule: [
    { date: "09. 29 (화)", time: "15:00~", content: "CHECK IN", venue: "1F 프론트" },
    { date: "09. 29 (화)", time: "13:00~18:00", content: "세미나", venue: "3F 부라노 I" },
    { date: "09. 30 (수)", time: "07:00~09:30", content: "조식/뷔페", venue: "1F 피렌체", people: 31 },
    { date: "09. 30 (수)", time: "~11:00", content: "CHECK OUT", venue: "1F 프론트" },
  ],
};
const shinanBlocks = board.buildAutoBlocks([shinanCouncilEvent], "2026-09-29");
assert(shinanBlocks.some((item) => item.type === "schedule" && item.time === "13:00" && item.title === "세미나"));
assert(!shinanBlocks.some((item) => item.type === "checkin" || /CHECK IN|프론트/.test(`${item.title} ${item.venue}`)));
assert(!shinanBlocks.some((item) => item.type === "checkout" || item.needsScheduleReview));

// 호텔 일정은 일반 일정 및 fallback으로도 재생성하지 않는다.
for (const content of ["CHECK IN", "CHECK OUT", "체크인", "체크아웃"]) {
  for (const venue of ["1F 프론트", "부라노1"]) {
    const event = datedEvent("hotel-only", targetDate, venue, content);
    assert.strictEqual(board.buildAutoBlocks([event], targetDate).length, 0, `${venue} ${content}`);
  }
}
assert.strictEqual(board.buildAutoBlocks([datedEvent("front-only", targetDate, "1F 프론트", "안내")], targetDate).length, 0);

const seminar = datedEvent("seminar", targetDate, "부라노1", "세미나", "10:00~17:00");
const seminarWithHotel = {
  ...seminar,
  schedule: [
    { date: targetDate, time: "06:00", content: "CHECK IN", venue: "부라노1" },
    ...seminar.schedule,
    { date: targetDate, time: "23:00", content: "CHECK OUT", venue: "부라노1" },
  ],
};
const original = JSON.stringify(seminarWithHotel);
const seminarBlocks = board.buildAutoBlocks([seminarWithHotel], targetDate);
assert.strictEqual(seminarBlocks.filter((item) => item.type === "schedule").map((item) => item.title).join(","), "세미나");
assert.strictEqual(seminarBlocks.find((item) => item.type === "start").time, "10:00");
assert.strictEqual(seminarBlocks.find((item) => item.type === "end").time, "17:00");
assert(seminarBlocks.some((item) => item.type === "next_setup"));
assert.strictEqual(JSON.stringify(seminarWithHotel), original, "원본 일정은 변경하지 않는다");
assert.strictEqual(board.buildAutoBlocks([
  seminar, datedEvent("future-hotel", otherDate, "부라노1", "CHECK IN"),
], targetDate).find((item) => item.type === "next_setup").next, null);
const hotelDayOnly = { ...seminarWithHotel, calendarDates: [targetDate, otherDate], schedule: [
  ...seminar.schedule, { date: otherDate, time: "11:00", content: "CHECK OUT", venue: "부라노1" },
] };
assert.strictEqual(board.buildAutoBlocks([hotelDayOnly], otherDate).length, 0);
const meals = ["중식", "석식", "커피브레이크"].map((content, index) => datedEvent(`meal-${index}`, targetDate, "부라노1", content));
assert.strictEqual(board.buildAutoBlocks(meals, targetDate).map((item) => item.type).join(","), "lunch,dinner,coffee");

console.log("operation-board-v2 tests passed");
