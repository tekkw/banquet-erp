const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const window = {};
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), { window, Intl, Date });
vm.runInNewContext(fs.readFileSync("outputs/src/erpActionRegistry.js", "utf8"), { window });

const calls = [];
const registry = window.erpActionRegistry.create({
  query_events: (args) => { calls.push(["query_events", args]); return { events: [{ id: "e1", venue: "컨벤션A" }] }; },
  get_event_schedule: (args) => { calls.push(["get_event_schedule", args]); assert.equal(args.lastResult.events[0].id, "e1"); return { schedules: [{ content: "커피브레이크", people: 100 }] }; },
  get_event_items: (args) => { calls.push(["get_event_items", args]); assert.equal(args.previousResults[0].events[0].id, "e1"); return { items: [] }; },
  get_event_notes: (args) => { calls.push(["get_event_notes", args]); return { notes: [] }; },
  get_next_setup_tasks: (args) => { calls.push(["get_next_setup_tasks", args]); return { tasks: [] }; },
  resolve_next_event: (args) => { calls.push(["resolve_next_event", args]); return { pairs: [] }; },
  get_layout_info: (args) => { calls.push(["get_layout_info", args]); return { pairs: args.lastResult.pairs }; },
});

const plans = {
  coffee: { goal: "오늘 컨벤션 커피 준비량", responseMode: "aggregate", steps: [{ action: "query_events", arguments: { date: "today", venue: "컨벤션" }, reason: "대상 행사" }, { action: "get_event_schedule", arguments: { filter: "coffee_break" }, reason: "커피 일정" }, { action: "get_event_items", arguments: { filter: "coffee_break" }, reason: "명시 수량" }] },
  setup: { goal: "남은 세팅", responseMode: "list", steps: [{ action: "get_next_setup_tasks", arguments: { scheduledOnOrBeforeToday: true, incompleteOnly: true }, reason: "persistent task" }] },
  notes: { goal: "부라노 특이사항", responseMode: "list", steps: [{ action: "query_events", arguments: { date: "today", venue: "부라노" }, reason: "대상 행사" }, { action: "get_event_notes", arguments: {}, reason: "특이사항" }] },
  turnover: { goal: "행사 후 전환", responseMode: "list", steps: [{ action: "query_events", arguments: { date: "today" }, reason: "오늘 행사" }, { action: "resolve_next_event", arguments: {}, reason: "다음 행사" }, { action: "get_layout_info", arguments: { compareWithNext: true }, reason: "세팅 비교" }] },
  meal: { goal: "내일 카프리 식사 인원", responseMode: "aggregate", steps: [{ action: "query_events", arguments: { date: "tomorrow", venue: "카프리" }, reason: "대상 행사" }, { action: "get_event_schedule", arguments: { filter: "meal" }, reason: "식사 일정 인원" }] },
};
const variants = [
  ["오늘 컨벤션 커피 몇 개야?", "coffee"], ["커피브레이크 얼마나 준비해?", "coffee"],
  ["오늘 해야 할 세팅 뭐 남았어?", "setup"], ["다음 행사 준비할 거 뭐야?", "setup"], ["오늘 가장 먼저 해야 할 일 뭐야?", "setup"],
  ["부라노 특이사항 있어?", "notes"], ["이번주 재인폼 뭐 있어?", "notes"],
  ["끝나고 뒤집는 홀 있어?", "turnover"], ["다음 행사랑 세팅 다른 데?", "turnover"],
  ["내일 카프리 식사 몇 명이야?", "meal"],
];

(async () => {
  for (const [question, key] of variants) {
    const plan = await window.erpConversationAgent.requestPlanner({ question, registry, request: async () => ({ plan: plans[key] }) });
    assert.deepEqual(Array.from(plan.steps, (step) => step.action), plans[key].steps.map((step) => step.action), `${question}: 동일 의미 action plan`);
  }
  const execution = await window.erpConversationAgent.executePlannerPlan(plans.coffee, registry, { question: variants[0][0] });
  assert.equal(execution.ok, true); assert.equal(execution.results.length, 3); assert.equal(execution.failures.length, 0);
  assert.equal(calls[1][1].lastResult.events[0].id, "e1", "step 결과를 다음 input/context로 전달");
  const partialRegistry = window.erpActionRegistry.create({ query_events: () => ({ events: [{ id: "e1" }] }) });
  const partial = await window.erpConversationAgent.executePlannerPlan(plans.coffee, partialRegistry, { question: variants[0][0] });
  assert.equal(partial.ok, true); assert.equal(partial.partial, true); assert.equal(partial.results.length, 1); assert.equal(partial.failures.length, 2, "실패 단계 이후에도 확보한 context를 유지");
  assert.throws(() => window.erpConversationAgent.validatePlannerPlan({ goal: "unsafe", steps: [{ action: "delete_event", arguments: {} }] }, registry), /등록되지 않은|안전하게/);
  assert.equal(window.erpConversationAgent.validatePlannerPlan({ goal: "limit", steps: Array.from({ length: 6 }, () => ({ action: "query_events" })) }, registry).steps.length, 4);
  assert.equal(window.erpConversationAgent.shouldUsePlanner("오늘 컨벤션 행사 알려줘", "event_query", {}), true);
  assert.equal(window.erpConversationAgent.shouldUsePlanner("그 행사 인원은?", "event_query", { event: { eventOrderId: "e1" } }), false, "명확한 context fast path 유지");
  assert.equal(window.erpConversationAgent.shouldUsePlanner("그 행사가 아니라 오늘 부라노 특이사항은?", "event_query", { event: { eventOrderId: "e1" } }), true, "현재 발화의 명시 venue/date가 prior context보다 우선");
  assert.equal(window.erpConversationAgent.shouldUsePlanner("카프리 일정 추가해", "conversation_agent", {}), false, "mutation은 read planner로 보내지 않음");
  const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");
  assert(edge.includes('mode === "erp_action_plan"'));
  assert(edge.includes("Never produce SQL") && edge.includes("ERP_PLANNER_ACTIONS"), "LLM은 whitelist read action만 계획");
  const board = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
  assert(board.includes("await tryRunReadPlanner(text, fastRoute)"));
  assert(board.includes("showMessage(formatted.answer, true, formatted.ttsText)"), "UI answer와 짧은 ttsText 분리");
  console.log("ERP conversation multi-step planner V1 tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
