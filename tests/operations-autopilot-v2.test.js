const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {}, Intl, Date, Set, Map, JSON };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
context.window.BANQUET_ERP_OPERATION_BOARD = { getActualTodaySeoul: () => "2026-10-22", setupDocumentSummary: (event) => event.layoutText || "등록된 세팅 정보 없음" };
vm.runInContext(fs.readFileSync("outputs/src/operationsAutopilot.js", "utf8"), context);
const autopilot = context.window.BANQUET_ERP_OPERATIONS_AUTOPILOT;
const event = (id, date, venue, layoutText = "스쿨식 60석 · 등록 테이블 2T") => ({ id, startDate: date, venue, companyName: id, layoutText });

const tomorrowReinform = event("festa", "2026-10-23", "페스타", "LAY & OUT RE-INFORM");
let plan = autopilot.buildPriorityPlan({ actualToday: "2026-10-22", events: [tomorrowReinform], proactiveAlerts: [{ id: "reinform-1", type: "layout_reinform", priority: "medium", eventOrderId: "festa", venue: "페스타", summary: "LAY & OUT RE-INFORM" }] });
assert.strictEqual(plan.queue.length, 1, "동일 RE-INFORM proposal/alert는 한 카드여야 한다");
assert.strictEqual(plan.queue[0].priority, "high");
assert.strictEqual(plan.queue[0].readiness, "blocked");

const future = event("capri", "2026-10-27", "카프리1", "라운드 8T");
plan = autopilot.buildPriorityPlan({ actualToday: "2026-10-22", events: [future] });
assert.strictEqual(plan.queue[0].priority, "normal");
assert.strictEqual(plan.queue[0].readiness, "needs_action");

const assetEvent = event("asset", "2026-10-24", "부라노1", "무선 마이크 4개");
plan = autopilot.buildPriorityPlan({ actualToday: "2026-10-22", events: [assetEvent], assets: [{ asset_name: "무선 마이크", quantity: 3 }] });
assert.strictEqual(plan.queue[0].priority, "high");
assert.strictEqual(plan.queue[0].readiness, "blocked");
assert.strictEqual(autopilot.registrableProposals(plan).length, 0, "BLOCKED는 일괄 등록에서 제외한다");

const clear = event("clear", "2026-10-24", "컨벤션A");
plan = autopilot.buildPriorityPlan({ actualToday: "2026-10-22", events: [clear, tomorrowReinform], proactiveAlerts: [{ id: "bev", type: "beverage_shortage", priority: "high", summary: "아이시스 300ml 42병 부족" }, { id: "reinform-1", type: "layout_reinform", eventOrderId: "festa", venue: "페스타", summary: "LAY & OUT RE-INFORM" }] });
assert(plan.queue.some((item) => item.itemKind === "alert" && item.priority === "high"), "기존 재고 부족 alert는 HIGH로 재사용한다");
assert.strictEqual(autopilot.highestPriority(plan).priority, "high");
assert(autopilot.urgentAnswer(plan).includes("가장 먼저 확인할 것은"));
assert.strictEqual(autopilot.registrableProposals(plan).length, 1, "명확하고 BLOCKED가 아닌 작업만 일괄 등록한다");
assert(autopilot.matchesUrgentQuestion("지금 제일 급한 거 뭐야?"));
assert(autopilot.matchesUrgentQuestion("뭐부터 해야 돼?"));

const changed = event("changed", "2026-10-23", "부라노2");
plan = autopilot.buildPriorityPlan({ actualToday: "2026-10-22", events: [changed], proactiveAlerts: [{ id: "changed-1", type: "event_order_changed", priority: "medium", eventOrderId: "changed", summary: "행사 인원 변경" }] });
assert.strictEqual(plan.queue[0].priority, "high", "당일/내일 이벤트오더 변경은 HIGH다");

plan = autopilot.buildPriorityPlan({ actualToday: "2026-10-22", events: [event("later-b", "2026-10-26", "카프리2"), event("later-a", "2026-10-25", "카프리1")] });
assert.deepStrictEqual(Array.from(plan.queue, (item) => item.eventOrderId), ["later-a", "later-b"], "같은 priority는 날짜/시간/공간 순으로 정렬한다");

plan = autopilot.buildPriorityPlan({ actualToday: "2026-10-22", events: [clear], existingTasks: [{ eventOrderId: "clear", venue: "컨벤션A" }] });
assert.strictEqual(plan.eventTotal, 1);
assert.strictEqual(plan.counts.ready, 1, "persistent task가 있는 행사는 준비가능 집계한다");

const boardSource = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const aiSource = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
const htmlSource = fs.readFileSync("outputs/index.html", "utf8");
const mobileHtmlSource = fs.readFileSync("outputs/board/index.html", "utf8");
assert(boardSource.includes("setup-readiness-badge"), "PC/mobile 공용 카드에 readiness badge를 표시한다");
assert(aiSource.includes("registrableProposals"));
assert(aiSource.includes("matchesUrgentQuestion"));
assert(/operationsAutopilot\.js\?v=operations-autopilot-v[23]/.test(htmlSource));
assert(/operationBoard\.js\?v=operations-autopilot-v[23]/.test(mobileHtmlSource));
console.log("operations autopilot V2 tests passed");
