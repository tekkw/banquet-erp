const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

let handler;
const context = { console, Response, Deno: { env: { get: () => "test-only" }, serve: (callback) => { handler = callback; } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/aiKnowledgeRules.js", "utf8"), context);
const rules = context.BANQUET_ERP_AI_KNOWLEDGE_RULES;
const server = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");
vm.runInContext(stripTypeScriptTypes(server.replace(/^import .*;\r?\n/, "")).replace(/^export /gm, ""), context);
const content = "피렌체 식사 일정은 연회팀 준비 대상이 아니다";
const executionRule = rules.buildExecutionRuleCandidate(content);
assert(executionRule);
assert.equal(rules.buildExecutionRuleCandidate("피렌체 식사를 연회 계산에서 제외하지 않는다"), null);
const knowledge = [{ id: "approved-rule", status: "approved", natural_language: content, metadata: { executionRule } }];
const seminar = { date: "09.30", time: "13:00~17:00", content: "세미나", venue: "부라노1", people: 55 };
const dinner = { date: "09.30", time: "18:00", content: "디너뷔페 맥주", venue: "1F 피렌체", people: 55 };
const event = { guestCount: 55, venue: "부라노1", schedule: [seminar, dinner],
  beveragesText: "피렌체 맥주 55명", layoutEqpText: "부라노1 Class Type\n피렌체 Round Type", mealTypes: ["디너뷔페"],
  items: [{ itemName: "디너뷔페", quantity: 55 }, { itemName: "프로젝터", quantity: 1 }] };
const master = [{ name: "세미나 기물", keywords: ["세미나"], trigger_section: ["schedule"], recommended_items: ["의자"], calc_type: "per_person" }];
const original = JSON.stringify(event);
const calculate = (data, rows = knowledge) => context.calculateKnowledgeAwareAnalysis(data, master, rows);
const result = calculate(event);
assert.equal(result.operationalAnalysis.representativePeople, 55);
assert.equal(result.calculatedStaff.operation, 2);
assert.equal(result.calculatedStaff.basis.length, 1);
assert.match(result.calculatedStaff.basis[0], /세미나/);
assert.equal(result.calculatedStaff.setup, 1);
assert.equal(result.operationalAnalysis.needsFlip, false);
assert.equal(result.operationalAnalysis.beverages.beerBoxes, 0);
assert.equal(result.recommendedItems.length, 1);
assert.equal(result.recommendedItems[0].name, "의자");
assert.match(JSON.stringify(result.recommendedItems[0]), /55/);
assert(result.operationalAnalysis.warnings.some((line) => line.includes("피렌체 일정 1건")));
assert.equal(JSON.stringify(event), original, "C: 화면과 저장에 쓰는 schedule 원본 유지");
assert.equal(event.schedule.length, 2);

const onlyDinner = { ...event, venue: "피렌체", schedule: [dinner], layoutEqpText: "Round Type", fnbText: "양식 88000 *55G", beveragesText: "맥주" };
const only = calculate(onlyDinner);
assert.equal(only.operationalAnalysis.representativePeople, 0);
assert.equal(only.calculatedStaff.operation, 0);
assert.equal(only.calculatedStaff.setup, 0);
assert.equal(only.recommendedItems.length, 0);
assert.equal(only.operationalAnalysis.beverages.beerBoxes, 0);
assert.equal(rules.calculationView(onlyDinner, "layout", knowledge).schedule.length, 0);

assert.equal(calculate({ ...event, guestCount: 550, schedule: [seminar, { ...dinner, people: 550 }] }).operationalAnalysis.representativePeople, 55);
for (const status of ["draft", "pending", "rejected"]) {
  assert.equal(rules.calculationView(event, "equipment", [{ ...knowledge[0], status }]).schedule.length, 2);
}
assert.equal(rules.calculationView(event, "equipment", [{ ...knowledge[0], metadata: { executionRule: { ...executionRule, approved: false } } }]).schedule.length, 2);
const beverageOnly = [{ ...knowledge[0], metadata: { executionRule: { ...executionRule, categories: ["beverage"] } } }];
assert.equal(rules.calculationView(event, "staffing", beverageOnly).schedule.length, 2);
assert.equal(rules.calculationView(event, "beverage", beverageOnly).schedule.length, 1);
assert.equal(rules.calculationView(event, "equipment", [{ status: "approved", original_answer: JSON.stringify({ executionRule }) }]).schedule.length, 1);
assert.equal(rules.calculationView(event, "equipment", [{ status: "approved", natural_language: content }]).schedule.length, 1, "이미 승인된 자연어 지식도 API 없이 인식");
assert.equal(rules.partitionSchedule({ venue: "피렌체", schedule: [{ content: "식사" }] }, "staffing", knowledge).excluded.length, 1);
assert.equal(rules.matchesVenue("1F Firenze", "피렌체"), true);

context.window = { BANQUET_ERP_AI_KNOWLEDGE_RULES: rules, addEventListener() {} };
context.localStorage = { getItem: () => null };
let assistantSource = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
assistantSource = assistantSource.replace("      handleChatSubmit,", "      buildKnowledgeInsertRow, rankLayoutRecommendations, buildAiAnalysisPayload, handleChatSubmit,");
vm.runInContext(assistantSource, context);
const assistant = context.window.BANQUET_ERP_AI_ASSISTANT.createAiAssistant({ elements: {}, deps: {
  cleanValue: (value) => String(value ?? "").trim(), normalizeMealTypes: (value) => value || [],
}, state: { getAssets: () => [] } });
rules._setRulesForTest(knowledge);
const saved = assistant.buildKnowledgeInsertRow({ subject: "피렌체", natural_language: content }, { originalAnswer: content });
assert.equal(saved.natural_language, content, "D: AI 비서의 자연어 지식 보존");
assert.equal(JSON.parse(saved.original_answer).originalAnswer, content);
assert.equal(JSON.parse(saved.original_answer).executionRule.ruleType, executionRule.ruleType);
assert.equal(assistant.buildAiAnalysisPayload(event).schedule.length, 2);
assert.equal(assistant.rankLayoutRecommendations([{ is_verified: true, layout_type: "round" }], onlyDinner).length, 0);
const layouts = assistant.rankLayoutRecommendations([
  { layout_type: "뷔페", venues: { venue_name: "피렌체" } },
  { layout_type: "세미나", venues: { venue_name: "부라노1" } },
], event);
assert.equal(layouts[0].layout_type, "세미나");
assert.equal(layouts.length, 1, "피렌체 레이아웃 후보도 제외");
const seminarDrinks = calculate({ ...event, beveragesText: "부라노1 맥주\n피렌체 맥주" });
assert.equal(seminarDrinks.operationalAnalysis.beverages.beerBoxes, 2, "명시된 연회장 주류는 유지");

(async () => {
  let knowledgeRequested = false;
  context.fetch = async (url, options) => {
    if (url.includes("/ai_knowledge?")) {
      assert(url.includes("status=eq.approved"));
      knowledgeRequested = true;
      return new Response(JSON.stringify(knowledge));
    }
    if (url.includes("api.openai.com")) {
      assert(knowledgeRequested, "계산 전에 승인 규칙 조회 완료");
      const input = JSON.parse(JSON.parse(options.body).input[1].content);
      assert.equal(input.extractedEventOrder.schedule.length, 1);
      assert.equal(input.extractedEventOrder.schedule[0].venue, "부라노1");
      assert.equal(input.calculatedStaffPolicy.operation, 2);
      return new Response(JSON.stringify({ output_text: JSON.stringify({ staff: { recommended: 99 }, items: [{ name: "잘못된 기물" }], beverages: { beerBoxes: 99 }, warnings: [] }) }));
    }
    return new Response(JSON.stringify(url.includes("recommend_items") ? master : []));
  };
  const response = await handler({ method: "POST", json: async () => ({ mode: "event_order_analysis", analysisData: event }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.analysis.staff.operation, 2);
  assert.equal(body.analysis.beverages.beerBoxes, 0);
  assert(!body.analysis.items.some((item) => item.name === "잘못된 기물"));
  assert(body.analysis.warnings.some((line) => line.includes("피렌체 일정 1건")));
  console.log("ai-knowledge-analysis tests passed (A–D, approval, category scope, zero fallback, layout, source preservation, request integration)");
})().catch((error) => { console.error(error); process.exitCode = 1; });
