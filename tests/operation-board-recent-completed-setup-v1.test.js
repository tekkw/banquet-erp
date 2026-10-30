const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const context = {
  window: { matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null },
  crypto: { randomUUID: () => "test-id" },
  console, Date, Intl, Set, Map,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/eventDisplayUtils.js", "utf8"), context);
vm.runInContext(source, context);
const board = context.window.BANQUET_ERP_OPERATION_BOARD;

assert.deepStrictEqual({ ...board.completedSetupWeekRange("2026-10-29") }, { start: "2026-10-26", end: "2026-11-01" });

board._setEventsForTest([
  { id: "event-current", venue: "컨벤션AB", companyName: "대한전기학회", calendarDates: ["2026-10-28"] },
  { id: "event-fallback", venue: "부라노1", companyName: "행사일 기준 주최", calendarDates: ["2026-10-30"] },
]);
board._setStateForTest({ completions: {} });

const tasks = [
  { key: "current", completed: true, scheduledDate: "2026-10-27", eventOrderId: "event-current", venue: "컨벤션AB" },
  { key: "previous", completed: true, scheduledDate: "2026-10-25", eventOrderId: "event-current", venue: "컨벤션AB" },
  { key: "event-fallback", completed: true, eventOrderId: "event-fallback", venue: "부라노1" },
  { key: "completed-at", completed: true, venue: "페스타", metadata: { completedAt: "2026-10-28T16:30:00.000Z" } },
  { key: "scheduled-priority", completed: true, scheduledDate: "2026-10-24", eventOrderId: "event-fallback", venue: "부라노1" },
  { key: "incomplete", completed: false, scheduledDate: "2026-10-28", venue: "카프리1" },
];
const visible = Array.from(board.getRecentCompletedSetupTasks(tasks, "2026-10-29"), (item) => item.key);
assert.deepStrictEqual(visible, ["current", "event-fallback", "completed-at"], "이번 주에 속한 완료 task만 표시해야 한다");
assert.strictEqual(board.completedSetupReferenceDate(tasks[4]), "2026-10-24", "scheduledDate가 eventDate보다 우선해야 한다");
assert.strictEqual(board.completedSetupReferenceDate(tasks[3]), "2026-10-29", "completedAt은 서울 날짜로 마지막 fallback되어야 한다");

const differentDates = board.completedSetupDisplayInfo(tasks[0]);
assert.strictEqual(differentDates.venue, "컨AB");
assert.strictEqual(differentDates.organizer, "대한전기학회");
assert.strictEqual(differentDates.summary, "세팅 10/27 · 행사 10/28 · 대한전기학회");

const sameDate = board.completedSetupDisplayInfo({ key: "same", completed: true, scheduledDate: "2026-10-28", eventOrderId: "event-current", venue: "컨벤션AB" });
assert.strictEqual(sameDate.summary, "행사 10/28 · 대한전기학회");
assert.strictEqual((sameDate.summary.match(/10\/28/g) || []).length, 1, "세팅일과 행사일이 같으면 날짜를 중복 표시하지 않아야 한다");

assert(source.includes('getRecentCompletedSetupTasks(state.manual.filter((item) => item.type === "next_setup"), seoulDateKey())'));
assert(source.includes("getRecentCompletedSetupTasks(tasks, seoulDateKey())"), "PC/모바일 및 주간 UI가 같은 완료 필터를 사용해야 한다");
assert(source.includes("completed.map(renderCompletedSetupRow)"), "표시 count와 렌더 목록이 같은 filtered collection을 사용해야 한다");
assert(source.includes('data-restore-complete>복원'), "기존 복원 기능을 유지해야 한다");

console.log("operation board recent completed setup v1 tests passed");
