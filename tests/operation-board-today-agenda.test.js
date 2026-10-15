const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const localMemory = new Map();
const context = {
  window: {},
  localStorage: { getItem: (key) => localMemory.get(key) || null, setItem: (key, value) => localMemory.set(key, value) },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null },
  crypto: { randomUUID: () => "test-id" },
  console, Date, Set, Map,
};
vm.createContext(context);
const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
vm.runInContext(source, context);
const board = context.window.BANQUET_ERP_OPERATION_BOARD;
const date = "2026-10-15";

board._setStateForTest({ completions: { "manual:done": true }, manual: [
  { key: "manual:coffee", kind: "manual", type: "manual", date, time: "10:30", venue: "컨벤션A", title: "커피 준비", completed: false },
  { key: "manual:done", kind: "manual", type: "manual", date, time: "08:30", venue: "카프리1", title: "완료 작업", completed: true },
] });
const events = [
  { id: "burano", eventName: "세미나", calendarDates: [date], venue: "부라노1", schedule: [{ date, time: "09:00", content: "세미나 시작", venue: "부라노1" }] },
  { id: "capri", eventName: "행사", calendarDates: [date], venue: "카프리1", schedule: [{ date, time: "09:00", content: "행사 시작", venue: "카프리1" }] },
];
const agenda = board.agendaBlocks(board.allBlocks(date, events));
assert.strictEqual(agenda.find((item) => item.key === "manual:done").completed, true);
const activeTimes = Array.from(agenda.filter((item) => !item.completed).map((item) => item.time));
assert.deepStrictEqual(activeTimes, activeTimes.slice().sort(), "여러 홀과 manual task가 시간순이어야 한다");
assert(activeTimes.filter((time) => time === "09:00").length >= 2, "같은 시간의 복수 일정이 이어져야 한다");
assert(activeTimes.indexOf("10:30") > activeTimes.lastIndexOf("09:00"));
assert(!board.agendaBlocks([{ kind: "next_setup" }]).length);
assert.strictEqual(board.isOverdue({ time: "09:00", completed: false }, date, new Date("2026-10-15T10:00:00")), true);
assert.strictEqual(board.isOverdue({ time: "09:00", completed: true }, date, new Date("2026-10-15T10:00:00")), false);
assert(source.includes("data-restore-complete"));
assert(source.includes("blocks.filter((block) => !block.completed)"));
assert(source.includes("syncItem(block); render();"));

console.log("operation-board today agenda tests passed");
