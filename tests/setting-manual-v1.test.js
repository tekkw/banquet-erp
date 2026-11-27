const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(file, "utf8");
const migration = read("supabase/migrations/20261127100000_add_setting_manual_system.sql");
const manager = read("outputs/src/settingManualManager.js");
const assistant = read("outputs/src/aiAssistant.js");
const registry = read("outputs/src/erpActionRegistry.js");
const edge = read("supabase/functions/event-order-ai-chat/index.ts");

for (const table of ["setting_manual_categories", "setting_manuals"]) assert(migration.includes(`public.${table}`), `${table} migration missing`);
assert(migration.includes("'setting-manuals'"), "setting-manuals Storage bucket missing");
assert(migration.includes("file_links") && migration.includes("setting_manual"), "files/file_links reuse contract missing");
assert(migration.includes("status in ('DRAFT','PUBLISHED','INACTIVE')"), "manual status constraint missing");
assert(migration.includes("prototype setting manuals write"), "local-login prototype policy must be explicit");

for (const page of ["outputs/index.html", "outputs/event-order-preview.html"]) {
  const html = read(page);
  assert(html.includes('data-dashboard-target="manuals"'), `${page}: sidebar manual menu missing`);
  assert(html.includes('data-erp-page="manuals"'), `${page}: manual page missing`);
  assert(html.includes("settingManualManager.js?v=setting-manual-v1"), `${page}: manager script missing`);
  assert(html.includes('"manuals", "ai"'), `${page}: manual route missing`);
}

assert(manager.includes("crypto.randomUUID()"), "safe UUID Storage object key required");
assert(manager.includes("설명 또는 첨부자료 중 하나 이상"), "text or attachment validation required");
assert(manager.includes("banquet:setting-manuals-updated"), "save invalidation event required");
assert(manager.includes("저장 후 재조회 검증에 실패"), "post-save verification required");
assert(manager.includes("data-category-manage") && manager.includes("newName"), "dynamic category management missing");
assert(manager.includes("data-file-up") && manager.includes("data-file-down") && manager.includes("primaryExisting"), "file ordering/primary controls missing");
assert.match(manager, /async function load\(\)[\s\S]*?renderShell\(\)/, "login hydration must rebuild admin controls");

assert(registry.includes('"search_setting_manuals"') && registry.includes('"get_setting_manual_detail"'), "manual actions missing from registry");
assert(edge.includes("answerSettingManualQuestion") && edge.includes("status=eq.PUBLISHED"), "published manual search missing");
assert(edge.includes("isSettingManualIntent") && edge.includes("몇명") && edge.includes("스쿨식"), "event/layout intent guard missing");
assert(edge.indexOf("answerSettingManualQuestion(cleanQuestion") < edge.indexOf("answerEventDocumentQuestion(cleanQuestion"), "manual routing must precede event search");
assert(edge.includes('type: "setting_manual_card"'), "manual rich result missing");
assert(assistant.includes("createSettingManualCard") && assistant.includes("lastSettingManualContext"), "PC/mobile rich card or follow-up context missing");

const context = { window: {} }; vm.createContext(context); vm.runInContext(manager, context);
assert.equal(context.window.BANQUET_ERP_SETTING_MANUALS.normalizeSearch("Coffee Break"), "coffeebreak");
assert.equal(context.window.BANQUET_ERP_SETTING_MANUALS.normalizeSearch("커피 브레이크"), "커피브레이크");

console.log("setting manual V1 tests passed");
