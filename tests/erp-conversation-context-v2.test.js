const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const agentSource = fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8");
const pageSource = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const storage = new Map();
const sessionStorage = { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
const agentContext = { window: {}, sessionStorage };
vm.runInNewContext(agentSource, agentContext);

const agent = agentContext.window.erpConversationAgent.create({ storage: sessionStorage, storageKey: "test-context" });
agent.save({ event: { eventOrderId: "event-1", eventName: "컨벤션 행사", venue: "컨벤션A" }, setting: { space: "컨벤션A" }, asset: null, venue: null, lastDomain: "event", lastResults: [] });

const assetPlan = agent.plan("멀티탭 어디 있어?", "asset_query");
assert.equal(assetPlan.route, "asset_query");
assert.equal(assetPlan.usesContext, false);

const capriPlan = agent.plan("이번주 카프리는?", "event_query");
assert.equal(capriPlan.route, "event_query");
assert.equal(capriPlan.text, "이번주 카프리는?");
assert.equal(capriPlan.usesContext, false);

const followupPlan = agent.plan("그 행사 몇 명?", "event_query");
assert.equal(followupPlan.route, "event_query");
assert.equal(followupPlan.selectedResultId, "event-1");
assert.equal(followupPlan.usesContext, true);

const settingPlan = agent.plan("오늘 뭐 세팅해야 돼?", "setting_advisor");
assert.equal(settingPlan.route, "setting_advisor");
assert.equal(settingPlan.usesContext, false);

function functionSource(name) {
  const start = pageSource.indexOf(`  function ${name}`);
  assert(start >= 0, `${name} must exist`);
  let depth = 0; let opened = false;
  for (let index = pageSource.indexOf("{", start); index < pageSource.length; index += 1) {
    if (pageSource[index] === "{") { depth += 1; opened = true; }
    if (pageSource[index] === "}") depth -= 1;
    if (opened && depth === 0) return pageSource.slice(start, index + 1);
  }
  throw new Error(`${name} source is incomplete`);
}

const removed = [];
const clearContext = {
  activeEventContexts: [{ eventOrderId: "event-1" }], settingAdvisorContext: { nextEventOrderId: "event-1" }, settingAdvisorRows: [{}], pendingEventQuery: {},
  activeEventContextKey: "active", settingAdvisorContextKey: "setting", conversationContext: { event: { eventOrderId: "event-1" }, setting: { space: "컨벤션A" }, asset: { assetId: "asset-1" }, venue: { name: "컨벤션A" }, lastDomain: "event", lastResults: [{ id: "event-1", domain: "event" }, { id: "asset-1", domain: "asset" }] },
  sessionStorage: { removeItem: (key) => removed.push(key) }, rendered: 0,
};
vm.createContext(clearContext);
vm.runInContext(`${functionSource("clearRecentEventSettingContext")} function saveConversationContext(next) { conversationContext = next; } function renderAiContext() { rendered += 1; } clearRecentEventSettingContext();`, clearContext);
assert.equal(clearContext.activeEventContexts.length, 0);
assert.equal(clearContext.settingAdvisorContext, null);
assert.equal(clearContext.conversationContext.event, null);
assert.equal(clearContext.conversationContext.setting, null);
assert.equal(clearContext.conversationContext.asset.assetId, "asset-1");
assert.equal(clearContext.conversationContext.lastDomain, "");
assert.deepEqual(removed, ["active", "setting"]);
assert.equal(clearContext.rendered, 1);

console.log("ERP conversation recent context V2 tests passed");
