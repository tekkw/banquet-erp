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

console.log("operation-board-v2 tests passed");
