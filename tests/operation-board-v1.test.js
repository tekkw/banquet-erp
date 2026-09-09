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

const searchWindowFixture = [
  nextFixture[0],
  { ...nextFixture[1], id: "outside-window", eventName: "31일 뒤 행사", calendarDates: ["2026-10-09"], schedule: [{ date: "2026-10-09", time: "09:00", content: "행사 시작", venue: "페스타" }] },
  { ...nextFixture[1], id: "other-space", eventName: "다른 공간 행사", calendarDates: ["2026-09-09"], venueSpaceIds: ["space-other"], schedule: [{ date: "2026-09-09", time: "09:00", content: "행사 시작", venue: "다른 공간", spaceId: "space-other" }] },
];
const noNextIn30Days = board.buildAutoBlocks(searchWindowFixture, today).find((item) => item.type === "next_setup");
assert(noNextIn30Days, "행사 종료 공간에는 다음 세팅 블록이 유지되어야 한다");
assert.strictEqual(noNextIn30Days.next, null, "30일 밖 행사와 다른 공간 행사는 다음 행사로 선택하면 안 된다");
assert(fs.readFileSync("outputs/src/operationBoard.js", "utf8").includes("30일 이내 예정된 다음 행사가 없습니다."));

board._setStateForTest({ completions: {}, plans: {}, manual: [], checklist: [] });
const weeklyEvents = [
  { id: "previous", eventName: "앞 행사", calendarDates: ["2026-09-08"], venue: "페스타", venueSpaceIds: ["space-f"], venueSpaces: [{ id: "space-f", spaceName: "페스타" }] },
  { id: "setup-target", eventName: "주간 행사", calendarDates: ["2026-09-10"], venue: "페스타", venueSpaceIds: ["space-f"], venueSpaces: [{ id: "space-f", spaceName: "페스타" }], guestCount: 100, internalMemo: "스쿨식", venueLayouts: layouts.map((layout) => ({ ...layout, space_id: "space-f" })) },
];
const weekly = board.buildWeeklySetupTasks(weeklyEvents, today);
const targetTasks = weekly.filter((item) => item.eventOrderId === "setup-target" && item.spaceId === "space-f");
assert.strictEqual(targetTasks.length, 1, "같은 행사와 공간은 하나의 세팅 할 일만 생성해야 한다");
assert.strictEqual(targetTasks[0].plannedDate, today, "앞 행사 종료일을 세팅 예정일로 우선 추천해야 한다");
assert.strictEqual(targetTasks[0].recommendation, "스쿨 120", "같은 공간의 레이아웃을 추천해야 한다");
console.log("operation-board-v1 tests passed");
