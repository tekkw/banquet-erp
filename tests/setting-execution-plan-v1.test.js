const assert = require("node:assert/strict");
const fs = require("node:fs");
const advisor = require("../outputs/src/settingAdvisor.js");

const increase = advisor.executionPlan({ layoutType: "school", seats: 42, tables: 21 }, { layoutType: "school", seats: 60, tables: 30 });
assert.equal(increase.tableDelta, 9);
assert.equal(increase.seatDelta, 18);
assert.deepEqual(increase.tasks.map((task) => task.title), ["세미나 테이블 9개 추가", "의자 18개 추가"]);

const decrease = advisor.executionPlan({ layoutType: "school", seats: 60, tables: 30 }, { layoutType: "school", seats: 42, tables: 21 });
assert.equal(decrease.tableDelta, -9);
assert.equal(decrease.seatDelta, -18);
assert.deepEqual(decrease.tasks.map((task) => task.title), ["세미나 테이블 9개 철수", "의자 18개 철수"]);

const changed = advisor.executionPlan({ layoutType: "round", seats: 50, tables: 5 }, { layoutType: "school", seats: 50, tables: 5 });
assert.equal(changed.layoutChanged, true);
assert.equal(changed.tasks[0].title, "레이아웃 변경: 라운드 → 스쿨식");
assert.equal(advisor.executionPlan({}, { layoutType: "school", seats: 60, tables: 30 }).currentKnown, false);

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const board = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const html = fs.readFileSync("outputs/board/index.html", "utf8");
assert(page.includes('return "setting_execution_plan"'));
assert(page.includes("먼저 준비할 행사를 선택해주세요."));
assert(page.includes("data-setting-plan-propose") && page.includes("data-setting-plan-approve"), "E: proposal precedes approval");
assert(page.includes('item.metadata?.source === "setting_execution_plan"') && page.includes("duplicates.has(task.title)"), "F: incomplete duplicate tasks are skipped");
assert(page.includes("board.addManualTasks(tasks)"));
assert(board.includes("async addManualTasks(tasks)") && board.includes('source: item.kind === "manual" ? "manual_board_task"'));
assert(page.includes('data-setting-plan-layout') && page.includes("layoutPreview="), "G: existing layout preview is reused");
assert(page.includes('data-setting-plan-original') && page.includes("window.openStoredExcel(row.nextEvent.storagePath)"), "H: existing Excel preview is reused");
assert(page.includes("plan.tableDelta") && page.includes("currentSettingAdvisorRow()"), "I: follow-up uses the selected event context");
assert(html.includes("settingAdvisor.js?v=2") && html.includes("operationBoardPage.js?v=23-setting-execution"));
assert(html.includes("operationBoard.js?v=setting-execution-v1") && html.includes("operationBoardPage.css?v=12-setting-execution"));
console.log("setting execution plan V1 tests passed");
