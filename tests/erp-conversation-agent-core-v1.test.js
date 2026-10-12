const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const values = new Map();
const window = { sessionStorage: { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) } };
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), { window });
const agent = window.erpConversationAgent.create({ storage: window.sessionStorage });

assert.equal(agent.plan("이번주 뭐 있지?", "conversation_agent").route, "event_query");
agent.save({ event: { period: { label: "이번 주", start: "2026-10-12", end: "2026-10-18" } }, lastDomain: "event", lastResults: [{ id: "e1" }, { id: "e2" }] });
assert.match(agent.plan("카프리는?", "conversation_agent").text, /이번 주.*카프리/);
assert.equal(agent.plan("두 번째 거 몇 명?", "conversation_agent").selectedResultId, "e2");
agent.save({ event: { eventOrderId: "e2", storagePath: "orders/e2.xlsx" }, lastDomain: "event" });
const original = agent.plan("원본 보여줘", "conversation_agent");
assert.deepEqual(JSON.parse(JSON.stringify(original.actions)), [{ type: "open_event_original", eventOrderId: "e2", storagePath: "orders/e2.xlsx" }]);
agent.save({ setting: { nextEventOrderId: "e2" }, lastDomain: "setting" });
assert.equal(agent.plan("다 했어", "conversation_agent").route, "confirm_current_setup");
assert.equal(agent.plan("멀티탭 어디 있어?", "asset_query").route, "asset_query");
agent.save({ asset: { assetId: "a1", assetName: "멀티탭" }, lastDomain: "asset" });
assert.equal(agent.plan("몇 개?", "asset_query").assetId, "a1");
assert.equal(agent.plan("오늘 뭐 세팅해야 돼?", "setting_advisor").route, "setting_advisor");
assert.equal(agent.maxSteps, 4);

const registry = window.erpConversationAgent.createToolRegistry({ findEvents: (input) => input });
assert.equal(registry.has("findEvents"), true);
assert.deepEqual(registry.run("findEvents", { ok: true }), { ok: true });
console.log("ERP conversation agent core V1 tests passed");
