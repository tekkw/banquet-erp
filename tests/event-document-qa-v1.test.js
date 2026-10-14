const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = { value: "", getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
const window = { sessionStorage: storage };
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), { window });
const agent = window.erpConversationAgent.create({ storage });
agent.save({ event: { eventOrderId: "event-a" } });
for (const text of ["이벤오더에 레이아웃 어떻게 해달래?", "음료 뭐 준비해?", "마이크 몇 개 준비해?"]) {
  const plan = agent.plan(text);
  assert.equal(plan.route, "event_query");
  assert.equal(plan.tool, "getEventDocumentSection");
  assert.equal(plan.selectedResultId, "event-a");
}
assert.equal(agent.plan("커피브레이크 몇 시야?").tool, "getEventSchedule");
assert.equal(agent.plan("다른 요청사항은?").tool, "getEventRequests");
assert.equal(agent.plan("레이아웃 파일 따로 있어?").tool, "getEventAttachments");

const board = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
assert(board.includes('"레이아웃은 재인폼 예정으로 기재되어 있습니다."'));
assert(board.includes('"등록된 이벤오더에서 구체적인 레이아웃 요청은 확인되지 않습니다."'));
assert(board.includes("const namedMatches = events.filter"), "explicit event name must override recent context");
assert(board.includes("file_links?select=file_id,link_type&entity_type=eq.event_order"));
assert(board.includes("data-event-attachment-path"));

const assistant = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
assert(assistant.includes("eventConversationAgent?.load()?.event || null"));
assert(assistant.includes('action.type === "open_event_original"'));

const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");
assert(edge.includes("answerEventDocumentQuestion"));
assert(edge.includes('return "attachments"'));
assert(edge.includes("event_order_id=eq.${encodeURIComponent(id)}"));
assert(!edge.includes("raw storage URL"));

console.log("Event Document Q&A V1 tests passed");
