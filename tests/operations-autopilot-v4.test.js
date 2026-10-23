const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {}, Intl, Date, Set, Map, JSON };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
context.window.BANQUET_ERP_OPERATION_BOARD = { getActualTodaySeoul: () => "2026-10-23" };
vm.runInContext(fs.readFileSync("outputs/src/operationsAutopilot.js", "utf8"), context);
const autopilot = context.window.BANQUET_ERP_OPERATIONS_AUTOPILOT;

const cases = [
  ["스쿨 60석", "setup"], ["등록테이블 2T", "setup"], ["무선 마이크 2EA", "av"],
  ["아이시스 300ml", "beverage"], ["커피브레이크 준비", "service"], ["최종 검수", "check"], ["명찰 준비", "general"],
];
cases.forEach(([name, role]) => assert.strictEqual(autopilot.classifyChecklistRole({ name }), role, `${name} 역할 분류`));
assert.strictEqual(autopilot.classifyChecklistRole({ id: "manual", name: "무선 마이크" }, { manual: "service" }), "service", "수동 역할이 자동 분류보다 우선한다");

const task = { key: "setup-1", id: "setup-1", type: "next_setup", eventOrderId: "event-1", venue: "부라노1", scheduledDate: "2026-10-23", scheduledTime: "09:00", completed: false, metadata: { source: "autopilot", priority: "normal", readiness: "needs_action", checklistRoles: { c3: "service" } } };
const checklist = [
  { id: "c1", parentKey: "setup-1", name: "스쿨 60석", completed: false },
  { id: "c2", parentKey: "setup-1", name: "무선 마이크 2EA", completed: true },
  { id: "c3", parentKey: "setup-1", name: "아이시스 300ml", completed: false },
];
const events = [{ id: "event-1", companyName: "대한전기학회", startDate: "2026-10-24", eventDateTime: "2026-10-24T10:00:00+09:00" }];
let board = autopilot.buildTodayBoard({ tasks: [task], checklist, events, actualToday: "2026-10-23", priorityItems: [{ id: "bev", sourceKey: "bev", itemKind: "alert", type: "beverage_shortage", priority: "high", readiness: "blocked", summary: "아이시스 부족" }] });
assert.deepStrictEqual(Array.from(board.tasks[0].checklist, (item) => item.role), ["setup", "av", "service"], "수동 override를 포함해 항목별 역할을 유지한다");
assert.strictEqual(board.tasks[0].progressLabel, "1/3");
assert.strictEqual(board.tasks[0].canComplete, false, "역할 일부가 끝나도 전체 task 완료는 불가하다");
assert.strictEqual(board.exceptions[0].role, "beverage", "음료 부족 예외는 음주류 담당이다");

const assetBoard = autopilot.buildTodayBoard({ tasks: [], checklist: [], events: [], actualToday: "2026-10-23", priorityItems: [
  { id: "asset-av", sourceKey: "asset-av", itemKind: "alert", type: "asset_shortage", priority: "high", summary: "무선 마이크 부족" },
  { id: "asset-setup", sourceKey: "asset-setup", itemKind: "alert", type: "asset_shortage", priority: "high", summary: "테이블 부족" },
  { id: "asset-other", sourceKey: "asset-other", itemKind: "alert", type: "asset_shortage", priority: "high", summary: "린넨 부족" },
] });
assert.deepStrictEqual(Array.from(assetBoard.exceptions, (item) => item.role).sort(), ["av", "general", "setup"], "자산 부족은 동일 classifier로 AV/setup/general에 연결한다");

const avBoard = autopilot.filterTodayBoardByRole(board, "av");
assert.strictEqual(avBoard.tasks.length, 1);
assert.deepStrictEqual(Array.from(avBoard.tasks[0].visibleChecklist, (item) => item.id), ["c2"], "필터는 항목을 복제하지 않고 해당 역할만 노출한다");
assert.strictEqual(autopilot.filterTodayBoardByRole(board, "beverage").exceptions.length, 1);
assert(autopilot.matchesRoleQuestion("AV 할 일 보여줘"));
assert.strictEqual(autopilot.roleFromQuestion("음주류 뭐 남았어?"), "beverage");
assert(autopilot.roleBoardAnswer(board, "setup").includes("스쿨 60석"), "역할별 다음 작업은 Today Board 결과를 사용한다");

const blockedTask = { ...task, key: "blocked", id: "blocked", metadata: { ...task.metadata, readiness: "blocked", priority: "high" } };
board = autopilot.buildTodayBoard({ tasks: [blockedTask], checklist: [], events, actualToday: "2026-10-23" });
assert.strictEqual(board.tasks.length, 0);
assert.strictEqual(board.exceptions.length, 1, "BLOCKED는 일반 역할 작업으로 전환하지 않는다");

const boardSource = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const aiSource = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
const mobileHtml = fs.readFileSync("outputs/board/index.html", "utf8");
assert(boardSource.includes("metadata.checklistRoles"), "승인 시 역할을 기존 task metadata에 저장한다");
assert(boardSource.includes("setChecklistRole") && boardSource.includes("syncItem(item)"), "수동 역할 변경도 persistent task 저장 경로를 쓴다");
assert(boardSource.includes("data-today-role") && boardSource.includes("groupChecklistByRole"));
assert(aiSource.includes("matchesRoleQuestion") && aiSource.includes("roleBoardAnswer"));
assert(/operationsAutopilot\.js\?v=operations-autopilot-v[45]/.test(html));
assert(/operationsAutopilot\.js\?v=operations-autopilot-v[45]/.test(mobileHtml) && /operationBoard\.js\?v=operations-autopilot-v[45]/.test(mobileHtml), "PC/mobile이 같은 역할/Today Board 모듈을 사용한다");
console.log("operations autopilot V4 tests passed");
