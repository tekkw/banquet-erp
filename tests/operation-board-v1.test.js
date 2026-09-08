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
console.log("operation-board-v1 tests passed");
