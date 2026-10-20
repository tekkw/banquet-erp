const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("outputs/src/storage.js", "utf8");
const requests = [];
const window = {};
const fetch = async (url, options) => {
  requests.push({ url, options });
  return { ok: true, text: async () => "" };
};
vm.runInNewContext(source, { window, console, fetch, URL, Date });
const storage = window.BANQUET_ERP_STORAGE.createStorageService({ supabaseConfig: { url: "https://example.supabase.co", anonKey: "test-key", bucket: "event-orders" } });

assert.equal(storage.resolveSpreadsheetContentType({ name: "inventory.xlsx", type: "text/plain" }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
assert.equal(storage.resolveSpreadsheetContentType({ name: "inventory.xlsx", type: "" }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
assert.equal(storage.resolveSpreadsheetContentType({ name: "inventory.XLSX", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
assert.equal(storage.resolveSpreadsheetContentType({ name: "legacy.xls", type: "text/plain" }), "application/vnd.ms-excel");

(async () => {
  const inventory = { name: "inventory.xlsx", type: "text/plain" };
  const inventoryResult = await storage.uploadOriginalFile(inventory, { pathPrefix: "beverage_inventory" });
  assert.equal(requests[0].options.headers["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.match(inventoryResult.storagePath, /^beverage_inventory_\d+\.xlsx$/);

  const eventOrder = { name: "event-order.xlsx", type: "text/plain" };
  const eventResult = await storage.uploadOriginalFile(eventOrder);
  assert.equal(requests[1].options.headers["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.match(eventResult.storagePath, /^event_\d+\.xlsx$/);

  await storage.supabaseRequest("operation_board_items", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ metadata: { snapshot: { beer: 254, soju: 223, cola: 203, cider: 179 } } }) });
  assert.equal(requests[2].options.headers["Content-Type"], "application/json", "snapshot JSON body must not fall back to text/plain");
  console.log("storage XLSX MIME tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
