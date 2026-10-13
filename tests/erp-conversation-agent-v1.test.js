const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const html = fs.readFileSync("outputs/board/index.html", "utf8");

assert(page.includes('conversationContextKey = "banquetBoard.conversationContext.v1"'));
assert(page.includes('event: null, setting: null, asset: null, venue: null, lastDomain: ""'));
assert(page.includes("const row = named || currentSettingAdvisorRow()"), "explicit venue must override prior setting context");
assert(page.includes('intent: "confirm_current_setup"'));
assert(page.includes('source_event_order_id: proposal.sourceEventOrderId || null'));
assert(page.includes('source_layout_id: proposal.sourceLayoutId || null'));
assert(page.includes('source: "manual_confirmed"'));
assert(page.includes('showMessage("어느 행사장 세팅을 완료하셨나요?")'));
assert(page.includes('conversationContext.lastDomain === "asset"'), "asset follow-up must use only asset context");
assert(html.includes("erpConversationAgent.js?v=1-recent-context"));
assert(html.includes("operationBoardPage.js?v=28-action-registry-recent-context"));

console.log("ERP conversation agent V1 tests passed");
