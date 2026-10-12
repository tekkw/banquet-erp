const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const window = {}; vm.runInNewContext(fs.readFileSync("outputs/src/erpActionRegistry.js", "utf8"), { window });
const proposals = { intent: "test" }; const events = [{ id: "event-1" }];
const registry = window.erpActionRegistry.create({
  search_events: () => events,
  open_event_original: () => null,
  decrease_asset_quantity: () => proposals,
  confirm_current_setup: () => proposals,
  record_field_setup: () => proposals,
  recommend_layouts: () => [{ id: "layout-1" }],
  add_manual_task: () => proposals,
});
(async () => {
  assert.deepEqual(JSON.parse(JSON.stringify((await registry.executeAction("search_events")).data)), events);
  const original = await registry.executeAction("open_event_original", { event: { id: "event-1", storagePath: "orders/a.xlsx" } });
  assert.deepEqual(JSON.parse(JSON.stringify(original.uiActions)), [{ type: "open_event_original", eventOrderId: "event-1", storagePath: "orders/a.xlsx" }]);
  for (const id of ["decrease_asset_quantity", "confirm_current_setup", "record_field_setup", "add_manual_task"]) { const result = await registry.executeAction(id); assert.equal(result.requiresApproval, true); assert.deepEqual(JSON.parse(JSON.stringify(result.proposal)), proposals); }
  assert.equal((await registry.executeAction("recommend_layouts")).requiresApproval, undefined);
  assert.equal((await registry.executeAction("missing_action")).errorCode, "unsupported_action");
  assert.equal((await registry.executeAction("create_event")).errorCode, "not_implemented");
  assert.equal((await registry.executeAction("save_layout_draft")).errorCode, "read_only");
  const capabilities = registry.getCapabilities(); for (const domain of ["event", "schedule", "asset", "hallState", "layout", "board", "knowledge", "dashboard"]) assert(Array.isArray(capabilities[domain]));
  const board = fs.readFileSync("outputs/board/index.html", "utf8"); const pc = fs.readFileSync("outputs/index.html", "utf8");
  assert(board.includes("erpActionRegistry.js?v=1") && pc.includes("erpActionRegistry.js?v=1"));
  console.log("ERP action registry V1 tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
