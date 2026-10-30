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
const actualToday = "2026-10-30";
const base = { kind: "manual", type: "next_setup", persistent: true, venue: "부라노1", completed: false };
const tasks = [
  { ...base, key: "today-late", scheduledDate: actualToday, scheduledTime: "18:00" },
  { ...base, key: "today-early", scheduledDate: actualToday, scheduledTime: "08:00" },
  { ...base, key: "tomorrow", scheduledDate: "2026-10-31", scheduledTime: "07:00" },
  { ...base, key: "later", scheduledDate: "2026-11-02", scheduledTime: "09:00" },
  { ...base, key: "overdue", scheduledDate: "2026-10-29", scheduledTime: "10:00" },
  { ...base, key: "undated", eventDate: actualToday },
  { ...base, key: "done", scheduledDate: actualToday, completed: true },
];
board._setStateForTest({ pins: Object.fromEntries(tasks.map((task) => [task.key, true])), completions: {} });

assert.equal(board.getSetupTaskTimingBucket(tasks[0], actualToday), "today");
assert.equal(board.getSetupTaskTimingBucket(tasks[2], actualToday), "upcoming");
assert.equal(board.getSetupTaskTimingBucket(tasks[3], actualToday), "upcoming");
assert.equal(board.getSetupTaskTimingBucket(tasks[4], actualToday), "overdue");
assert.equal(board.getSetupTaskTimingBucket(tasks[5], actualToday), "undated", "eventDate를 scheduledDate로 추정하면 안 된다");
assert.equal(board.getSetupTaskTimingBucket(tasks[6], actualToday), "completed");

const groups = board.groupPinnedSetupTasks(tasks, "2026-11-02", actualToday);
assert.deepStrictEqual(Array.from(groups.today, (task) => task.key), ["today-early", "today-late"], "오늘 task는 시간순이어야 한다");
assert.deepStrictEqual(Array.from(groups.overdue, (task) => task.key), ["overdue"]);
assert.deepStrictEqual(Array.from(groups.upcoming, (task) => task.key), ["tomorrow", "later"]);
assert.deepStrictEqual(Array.from(groups.undated, (task) => task.key), ["undated"]);
assert(!groups.today.some((task) => task.key === "done") && !groups.overdue.some((task) => task.key === "done") && !groups.upcoming.some((task) => task.key === "done"));
assert.equal(board.getSetupTaskTimingBucket(tasks[0], actualToday), "today", "selectedDate가 미래여도 actualToday 기준 bucket은 바뀌지 않는다");

const undatedBlocked = { ...tasks[5], metadata: { readiness: "blocked" } };
board._setStateForTest({ pins: { undated: true }, completions: {} });
const undatedSummary = board.pinnedSetupSummary([undatedBlocked], "2026-11-02", actualToday);
assert.equal(undatedSummary.undated.length, 1);
assert.equal(undatedSummary.attention.length, 1, "날짜 없는 blocked task는 날짜 bucket이 아니라 확인 필요에만 남긴다");

const persistent = { ...base, key: "persistent", id: "persistent", eventOrderId: "event-1", scheduledDate: actualToday };
const automatic = { ...persistent, key: "automatic", id: undefined, kind: "next_setup", persistent: false };
board._setStateForTest({ pins: { persistent: true, automatic: true }, completions: {} });
const deduped = board.groupPinnedSetupTasks([automatic, persistent], "2026-11-02", actualToday);
assert.deepStrictEqual(Array.from(deduped.today, (task) => task.key), ["persistent"], "persistent/auto 중복은 한 bucket에 한 번만 표시해야 한다");

board._setStateForTest({ pins: { persistent: true }, completions: { persistent: true } });
assert.equal(board.groupPinnedSetupTasks([persistent], "2026-11-02", actualToday).today.length, 0, "완료 직후 active bucket에서 제거해야 한다");

board._setStateForTest({ pins: Object.fromEntries(tasks.map((task) => [task.key, true])), completions: {} });
board._setPinnedSetupUiForTest();
const summary = board.renderSetupTaskBoard(tasks, actualToday);
assert(summary.includes("오늘 세팅 <strong>2</strong>") && summary.includes("지연 <strong>1</strong>") && summary.includes("세팅 예정 <strong>2</strong>"));
board._setPinnedSetupUiForTest("today");
const todayPanel = board.renderSetupTaskBoard(tasks, actualToday);
assert(todayPanel.includes('data-setup-panel="today"') && !todayPanel.includes('data-setup-panel="upcoming"'));
assert(todayPanel.includes('class="setup-today-badge">오늘 세팅'));
board._setPinnedSetupUiForTest("overdue");
assert(board.renderSetupTaskBoard(tasks, actualToday).includes("지연 1일"), "기존 지연 N일 badge를 유지해야 한다");

context.window.matchMedia = () => ({ matches: true });
const mobile = board.getSetupTaskTimingBucket(tasks[0], actualToday);
context.window.matchMedia = () => ({ matches: false });
const pc = board.getSetupTaskTimingBucket(tasks[0], actualToday);
assert.equal(pc, mobile, "PC/mobile은 같은 bucket helper를 사용해야 한다");

assert(source.indexOf('panel("today", "오늘 세팅"') < source.indexOf('panel("overdue", "지연된 세팅"'));
assert(source.indexOf('panel("overdue", "지연된 세팅"') < source.indexOf('panel("upcoming", "세팅 예정"'));
assert(source.includes('class="setup-today-badge">오늘 세팅'));
assert(source.includes("actualToday}T12:00:00+09:00"), "지연 N일은 actualToday 기준을 유지해야 한다");

console.log("operation board setup timing buckets V1 tests passed");
