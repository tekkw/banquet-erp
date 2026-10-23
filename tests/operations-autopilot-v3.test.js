const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {}, Intl, Date, Set, Map, JSON };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
context.window.BANQUET_ERP_OPERATION_BOARD = { getActualTodaySeoul: () => "2026-10-22" };
vm.runInContext(fs.readFileSync("outputs/src/operationsAutopilot.js", "utf8"), context);
const autopilot = context.window.BANQUET_ERP_OPERATIONS_AUTOPILOT;

const task = (key, date, time, venue, extra = {}) => ({ key, id: key, recordId: `row-${key}`, type: "next_setup", eventOrderId: key, venue, scheduledDate: date, scheduledTime: time, completed: false, metadataSource: "autopilot", metadata: { source: "autopilot", priority: "normal", readiness: "needs_action", ...extra } });
const events = [
  { id: "today", companyName: "대한전기학회", venue: "부라노1", startDate: "2026-10-22", eventDateTime: "2026-10-22T10:00:00+09:00" },
  { id: "tomorrow", companyName: "내일행사", venue: "카프리1", startDate: "2026-10-23" },
  { id: "overdue", companyName: "지연행사", venue: "페스타", startDate: "2026-10-21" },
];
const tasks = [task("today", "2026-10-22", "09:00", "부라노1"), task("tomorrow", "2026-10-23", "08:00", "카프리1"), task("overdue", "2026-10-21", "18:00", "페스타")];
const checklist = [
  { id: "c1", parentKey: "today", name: "스쿨", quantity: 60, unit: "석", completed: true },
  { id: "c2", parentKey: "today", name: "등록테이블", quantity: 2, unit: "T", completed: false },
  { id: "c3", parentKey: "today", name: "무선마이크", quantity: 2, unit: "EA", completed: false },
];

let board = autopilot.buildTodayBoard({ tasks, checklist, events, actualToday: "2026-10-22" });
assert.deepStrictEqual(Array.from(board.tasks, (item) => item.key), ["overdue", "today"], "어제 미완료가 최상단이고 내일 작업은 제외한다");
assert.strictEqual(board.tasks[1].progressLabel, "1/3");
assert.strictEqual(board.tasks[1].canComplete, false);
assert.strictEqual(board.tasks[0].overdueDays, 1);

const completedChecklist = checklist.map((item) => ({ ...item, completed: true }));
board = autopilot.buildTodayBoard({ tasks, checklist: completedChecklist, events, actualToday: "2026-10-22" });
assert.strictEqual(board.tasks.find((item) => item.key === "today").progressLabel, "완료");
assert.strictEqual(board.tasks.find((item) => item.key === "today").canComplete, true);

const blocked = task("blocked", "2026-10-22", "07:00", "컨벤션A", { priority: "high", readiness: "blocked" });
board = autopilot.buildTodayBoard({ tasks: [...tasks, blocked], checklist, events, actualToday: "2026-10-22" });
assert(!board.tasks.some((item) => item.key === "blocked"), "BLOCKED는 일반 실행 작업과 섞지 않는다");
assert(board.exceptions.some((item) => item.key === "blocked"));

assert(autopilot.matchesTodayQuestion("오늘 뭐부터 하면 돼?"));
assert(autopilot.matchesTodayQuestion("지금 다음 작업 뭐야?"));
assert(autopilot.todayBoardAnswer(board).includes("지연행사"), "AI 답변은 Today Board 최상위 작업을 사용한다");

const afterComplete = autopilot.buildTodayBoard({ tasks: tasks.map((item) => item.key === "overdue" ? { ...item, completed: true } : item), checklist, events, actualToday: "2026-10-22" });
assert.strictEqual(afterComplete.nextTask.key, "today", "완료 후 다음 작업이 최상위로 이동한다");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
const mobileHtml = fs.readFileSync("outputs/board/index.html", "utf8");
assert(source.includes("renderTodayExecutionBoard"));
assert(source.includes("syncChecklist(item)"), "PC/mobile checklist는 기존 persistent 저장 경로를 사용한다");
assert(source.includes("completeBoardItem"), "최종 완료는 기존 task 완료 경로를 사용한다");
assert(source.includes('persistent.metadata?.readiness === "blocked"'), "BLOCKED persistent task 완료를 차단한다");
assert(source.includes("data-today-alert-ack"));
assert(/operationsAutopilot\.js\?v=operations-autopilot-v[34]/.test(html));
assert(/operationBoard\.js\?v=operations-autopilot-v[34]/.test(mobileHtml));
console.log("operations autopilot V3 tests passed");
