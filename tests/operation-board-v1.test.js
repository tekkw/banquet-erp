const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const memory = new Map();
const context = {
  window: {},
  localStorage: { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) },
  document: { getElementById: () => null },
  crypto: { randomUUID: () => "test-id" },
  console,
  Date,
  Set,
  Map,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/operationBoard.js", "utf8"), context);
const board = context.window.BANQUET_ERP_OPERATION_BOARD;
board._setStateForTest({ completions: {}, manual: [], checklist: [] });

const today = "2026-09-08";
const fixture = ["컨벤션A", "부라노1", "페스타"].map((venue, index) => ({
  id: `event-${index}`,
  eventName: `행사 ${index + 1}`,
  calendarDates: [today],
  venue,
  venueSpaceIds: [`space-${index}`],
  guestCount: 100 + index,
  schedule: [{ date: today, time: "12:00", content: index ? "커피브레이크" : "중식", venue }],
}));
const blocks = board.buildAutoBlocks(fixture, today);
assert.strictEqual(blocks.filter((item) => item.time === "12:00" && ["lunch", "coffee"].includes(item.type)).length, 3, "같은 시간 세 장소를 모두 생성해야 한다");
assert.strictEqual(new Set(blocks.map((item) => item.venue)).size, 3, "장소명이 유지되어야 한다");
assert.strictEqual(board.colorForSpace("space-1"), board.colorForSpace("space-1"), "같은 space_id 색은 고정이어야 한다");
assert.strictEqual(board.classifySchedule("석식 진행"), "dinner");
assert.strictEqual(board.classifySchedule("Coffee Break"), "coffee");
assert.strictEqual(board.classifySchedule("디너/뷔페"), "dinner");

const layouts = [
  { layout_name: "스쿨 120", layout_type: "school", min_people: 80, max_people: 140, is_active: true },
  { layout_name: "라운드 100", layout_type: "round", min_people: 80, max_people: 120, is_active: true },
];
assert.strictEqual(board.recommendLayout(layouts, "school", 100), "스쿨 120", "형태와 인원 범위 일치가 우선이어야 한다");
assert.strictEqual(board.recommendLayout([], "school", 100), "추천 레이아웃 없음");

const nextFixture = [
  { id: "today", eventName: "오늘 행사", calendarDates: [today], venue: "페스타", venueSpaceIds: ["space-f"], schedule: [{ date: today, time: "18:00", content: "행사 종료", venue: "페스타" }] },
  { id: "future", eventName: "다음 행사", calendarDates: ["2026-09-10"], venue: "페스타", venueSpaceIds: ["space-f"], guestCount: 100, internalMemo: "스쿨식", venueLayouts: layouts, schedule: [{ date: "2026-09-10", time: "09:00", content: "행사 시작", venue: "페스타", people: 100 }] },
];
const next = board.buildAutoBlocks(nextFixture, today).find((item) => item.type === "next_setup");
assert(next, "종료 공간에는 다음 세팅 블록이 있어야 한다");
assert.strictEqual(next.next.name, "다음 행사");
assert.strictEqual(next.next.recommendation, "스쿨 120");

const space = (id, name) => ({ id, spaceName: name });
const buranoAll = { venue: "부라노 ALL", venueSpaceIds: ["burano-1", "burano-2", "burano-3"], venueSpaces: [space("burano-1", "부라노1"), space("burano-2", "부라노2"), space("burano-3", "부라노3")] };
const buranoBare = { venue: "부라노" };
const burano1 = { venue: "부라노1", venueSpaceIds: ["burano-1"], venueSpaces: [space("burano-1", "부라노1")] };
const burano2 = { venue: "부라노2", venueSpaceIds: ["burano-2"], venueSpaces: [space("burano-2", "부라노2")] };
assert(board.spacesOverlap(buranoAll, burano1), "부라노 ALL과 부라노1은 물리 공간이 겹쳐야 한다");
assert(board.spacesOverlap(burano1, buranoAll), "부라노1과 부라노 ALL은 양방향으로 겹쳐야 한다");
assert(!board.spacesOverlap(burano1, burano2), "부라노1과 부라노2는 겹치지 않아야 한다");
assert(board.spacesOverlap(buranoBare, buranoAll), "부라노와 부라노 ALL은 같은 전체홀로 취급해야 한다");

const overlapEvents = [
  { id: "all-today", eventName: "오늘 ALL", calendarDates: [today], ...buranoAll, schedule: [{ date: today, time: "18:00", venue: "부라노 ALL", content: "행사 종료" }] },
  { id: "all-nearest", eventName: "가장 가까운 ALL", calendarDates: ["2026-09-16"], ...buranoAll, schedule: [{ date: "2026-09-16", time: "09:00", venue: "부라노 ALL", content: "행사 시작" }] },
  { id: "one-later", eventName: "그 다음 부라노1", calendarDates: ["2026-09-17"], ...burano1, schedule: [{ date: "2026-09-17", time: "09:00", venue: "부라노1", content: "행사 시작" }] },
];
assert.strictEqual(board.buildAutoBlocks(overlapEvents, today).find((item) => item.type === "next_setup")?.next?.name, "가장 가까운 ALL", "겹치는 공간 중 가장 가까운 미래 행사를 선택해야 한다");

const individualEvents = [
  { id: "one-today", eventName: "오늘 부라노1", calendarDates: [today], ...burano1, schedule: [{ date: today, time: "18:00", venue: "부라노1", content: "행사 종료" }] },
  { id: "two-near", eventName: "부라노2", calendarDates: ["2026-09-16"], ...burano2, schedule: [{ date: "2026-09-16", time: "09:00", venue: "부라노2", content: "행사 시작" }] },
  { id: "all-later", eventName: "부라노 ALL", calendarDates: ["2026-09-17"], ...buranoAll, schedule: [{ date: "2026-09-17", time: "09:00", venue: "부라노 ALL", content: "행사 시작" }] },
];
assert.strictEqual(board.buildAutoBlocks(individualEvents, today).find((item) => item.type === "next_setup")?.next?.name, "부라노 ALL", "개별홀은 다른 개별홀을 건너뛰고 겹치는 전체홀을 선택해야 한다");

const boundaryFixture = [{
  id: "filtered-boundary",
  eventName: "컨벤션 행사",
  calendarDates: [today],
  venue: "컨벤션",
  venueSpaceIds: ["space-convention"],
  guestCount: 120,
  schedule: [
    { date: today, time: "07:00", venue: "피렌체", content: "조식" },
    { date: today, time: "09:00~18:00", venue: "컨벤션", content: "본 행사" },
    { date: today, time: "12:00", venue: "피렌체", content: "중식" },
    { date: today, time: "13:00", venue: "컨벤션", content: "커피브레이크" },
    { date: today, time: "15:00", venue: "프론트", content: "체크인" },
  ],
}];
const filteredBlocks = board.buildAutoBlocks(boundaryFixture, today);
assert.strictEqual(filteredBlocks.filter((item) => item.type !== "next_setup").map((item) => `${item.time}:${item.type}`).join(","), "12:00:lunch,13:00:coffee,09:00:start,18:00:end");
assert(!filteredBlocks.some((item) => /프론트|조식/.test(`${item.venue} ${item.title}`)), "프론트와 피렌체 조식은 완전히 제외해야 한다");

board._setStateForTest({ completions: {}, plans: {}, manual: [], checklist: [] });
const weeklyEvents = [
  { id: "previous", eventName: "앞 행사", calendarDates: ["2026-09-08"], venue: "페스타", venueSpaceIds: ["space-f"], venueSpaces: [{ id: "space-f", spaceName: "페스타" }] },
  { id: "setup-target", eventName: "주간 행사", calendarDates: ["2026-09-10"], venue: "페스타", venueSpaceIds: ["space-f"], venueSpaces: [{ id: "space-f", spaceName: "페스타" }], guestCount: 100, internalMemo: "스쿨식", venueLayouts: layouts.map((layout) => ({ ...layout, space_id: "space-f" })) },
  { id: "next-week-1", eventName: "다음 주 행사 1", calendarDates: ["2026-09-16"], venue: "부라노", venueSpaceIds: ["space-b"], venueSpaces: [{ id: "space-b", spaceName: "부라노" }] },
  { id: "next-week-2", eventName: "다음 주 행사 2", calendarDates: ["2026-09-17"], venue: "컨벤션", venueSpaceIds: ["space-c"], venueSpaces: [{ id: "space-c", spaceName: "컨벤션" }] },
  { id: "next-month", eventName: "10월 행사", calendarDates: ["2026-10-12"], venue: "카프리", venueSpaceIds: ["space-k"], venueSpaces: [{ id: "space-k", spaceName: "카프리" }] },
];
const setupToday = "2026-09-10";
const weekly = board.buildWeeklySetupTasks(weeklyEvents, setupToday);
const targetTasks = weekly.filter((item) => item.eventOrderId === "setup-target" && item.spaceId === "space-f");
assert.strictEqual(targetTasks.length, 1, "같은 행사와 공간은 하나의 세팅 할 일만 생성해야 한다");
assert.strictEqual(targetTasks[0].plannedDate, setupToday, "앞 행사 종료일을 세팅 예정일로 우선 추천하되 과거 추천일은 오늘로 보정해야 한다");
assert.strictEqual(targetTasks[0].recommendation, "스쿨 120", "같은 공간의 레이아웃을 추천해야 한다");
assert.strictEqual(weekly.map((item) => item.eventDate).join(","), "2026-09-10,2026-09-16,2026-09-17,2026-10-12", "이번 주 이후와 다음 달의 미래 행사도 포함하고 과거 행사는 제외해야 한다");
board._setStateForTest({ completions: { "weekly-setup:next-week-1:space-b": true }, plans: { "weekly-setup:next-month:space-k": "2026-09-11" }, manual: [], checklist: [] });
const persistedWeekly = board.buildWeeklySetupTasks(weeklyEvents, setupToday);
assert.strictEqual(persistedWeekly.find((item) => item.eventOrderId === "next-week-1").completed, true, "완료 상태를 복원해야 한다");
assert.strictEqual(persistedWeekly.find((item) => item.eventOrderId === "next-month").plannedDate, "2026-09-11", "사용자가 수정한 세팅 예정일을 덮어쓰면 안 된다");
console.log("operation-board-v1 tests passed");
