const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {}, Intl, Date, Set, Map, JSON };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
context.window.BANQUET_ERP_OPERATION_BOARD = { getActualTodaySeoul: () => "2026-10-23" };
vm.runInContext(fs.readFileSync("outputs/src/operationsAutopilot.js", "utf8"), context);
const autopilot = context.window.BANQUET_ERP_OPERATIONS_AUTOPILOT;

const users = [{ id: "u1", label: "장예권" }, { id: "u2", label: "김OO" }];
const task = { key: "task-1", id: "task-1", type: "next_setup", eventOrderId: "event-1", venue: "부라노1", scheduledDate: "2026-10-23", completed: false, metadata: { source: "autopilot", readiness: "needs_action", checklistRoles: { c1: "setup", c2: "av", c3: "setup" }, checklistAssignees: { c1: { assigneeUserId: "u1", assigneeName: "장예권" } } } };
const checklist = [
  { id: "c1", parentKey: "task-1", name: "스쿨 60석", completed: true },
  { id: "c2", parentKey: "task-1", name: "무선마이크 2EA", completed: false },
  { id: "c3", parentKey: "task-1", name: "등록테이블 2T", completed: false },
];
const events = [{ id: "event-1", companyName: "대한전기학회", startDate: "2026-10-24" }];
let board = autopilot.buildTodayBoard({ tasks: [task], checklist, events, actualToday: "2026-10-23" });
assert.strictEqual(board.tasks[0].checklist[0].assigneeUserId, "u1");
assert.strictEqual(board.tasks[0].checklist[1].assigneeUserId, "", "role만 있고 assignee가 없으면 미배정이다");
assert.strictEqual(board.tasks[0].checklist[0].requiresPhoto, false, "사진 확인 연결점의 기본값은 false다");

let filtered = autopilot.filterTodayBoardByAssignee(board, "mine", "u1");
assert.deepStrictEqual(Array.from(filtered.tasks[0].visibleChecklist, (item) => item.id), ["c1"], "내 작업은 현재 사용자 id 기준이다");
filtered = autopilot.filterTodayBoardByAssignee(board, "unassigned", "u1");
assert.deepStrictEqual(Array.from(filtered.tasks[0].visibleChecklist, (item) => item.id), ["c2", "c3"], "미배정 필터는 assignee 없는 원본 item만 표시한다");

const historyTask = { ...task, key: "history", id: "history", scheduledDate: "2026-10-22", metadata: { ...task.metadata, checklistRoles: { h1: "av" }, checklistAssignees: { h1: { assigneeUserId: "u2", assigneeName: "김OO" } } } };
const suggestion = autopilot.suggestAssignee("av", { tasks: [task, historyTask], checklist: [...checklist, { id: "h1", parentKey: "history", name: "마이크", completed: true }], users, actualToday: "2026-10-23" });
assert.strictEqual(suggestion.assigneeUserId, "u2", "실제 동일 역할 배정 이력이 있을 때만 제안한다");
assert.strictEqual(autopilot.suggestAssignee("service", { tasks: [task], checklist, users, actualToday: "2026-10-23" }), null, "근거가 없으면 미지정이다");
assert.strictEqual(task.metadata.checklistAssignees.c1.assigneeUserId, "u1", "제안 계산은 수동 assignee를 덮어쓰지 않는다");

let verification = autopilot.verifyTaskCompletion(task, board.tasks[0].checklist, []);
assert.strictEqual(verification.canComplete, false);
assert.strictEqual(verification.blockedCount, 0, "checklist 미완료와 BLOCKED 상태를 구분한다");
assert(verification.blockers.some((item) => item.includes("무선마이크")), "checklist 미완료는 최종 완료를 차단한다");
const completed = board.tasks[0].checklist.map((item) => ({ ...item, completed: true }));
verification = autopilot.verifyTaskCompletion(task, completed, [{ type: "layout_reinform", eventOrderId: "event-1", readiness: "blocked", summary: "LAY & OUT RE-INFORM" }]);
assert.strictEqual(verification.canComplete, false, "RE-INFORM unresolved는 완료를 차단한다");
assert.strictEqual(verification.blockedCount, 1);
verification = autopilot.verifyTaskCompletion(task, completed, [{ type: "beverage_shortage", eventOrderId: "event-1", readiness: "blocked", summary: "아이시스 부족" }]);
assert.strictEqual(verification.canComplete, true, "beverage shortage만으로 setup task 완료를 막지 않는다");
verification = autopilot.verifyTaskCompletion(task, completed, []);
assert.strictEqual(verification.canComplete, true, "모든 자동 검증 조건 충족 시 최종 완료 가능하다");

assert.deepStrictEqual(JSON.parse(JSON.stringify(autopilot.assigneeQuestion("내 할 일 뭐야?", users, users[0]))), { type: "filter", filter: "mine", userId: "u1", label: "장예권" });
assert.strictEqual(autopilot.assigneeQuestion("미배정 작업 있어?", users, users[0]).filter, "unassigned");
assert(autopilot.assigneeBoardAnswer(board, autopilot.assigneeQuestion("장예권 할 일 뭐 남았어?", users, users[0])).includes("장예권 작업"));
assert(autopilot.assigneeBoardAnswer(board, autopilot.assigneeQuestion("세팅 담당 누가야?", users, users[0])).includes("장예권"));

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const aiSource = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
const mobileHtml = fs.readFileSync("outputs/board/index.html", "utf8");
assert(source.includes("checklistAssignees") && source.includes("setChecklistAssignee"), "담당자는 기존 task metadata 저장 경로를 사용한다");
assert(source.includes("!assignments[entry.id]"), "역할 일괄 배정은 기존 수동 배정을 덮어쓰지 않는다");
assert(source.includes("completedBy") && source.includes("completedAt") && source.includes("data-final-complete"));
assert(aiSource.includes("assigneeQuestion") && aiSource.includes("assigneeBoardAnswer"));
assert(/operationsAutopilot\.js\?v=operations-autopilot-v[56]/.test(html));
assert(/operationsAutopilot\.js\?v=operations-autopilot-v[56]/.test(mobileHtml) && mobileHtml.includes("operationBoard.js?v="), "PC/mobile은 동일 persistent assignee 결과를 사용한다");
console.log("operations autopilot V5 tests passed");
