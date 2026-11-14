const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const window = {};
vm.runInNewContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), { window, console });
vm.runInNewContext(fs.readFileSync("outputs/src/layoutGuidance.js", "utf8"), { window, console });
const api = window.BANQUET_ERP_LAYOUT_GUIDANCE;

const parsed = api.parseQuestion("페스타 스쿨식은 5열 7줄에 앞에 2테이블 더 놓고 3명씩 앉혀");
assert.deepEqual(
  { venue: parsed.venue, layoutType: parsed.layoutType, columns: parsed.columns, rows: parsed.rows, extraTables: parsed.extraTables, tableCount: parsed.tableCount, seatsPerTable: parsed.seatsPerTable, totalSeats: parsed.totalSeats },
  { venue: "FESTA", layoutType: "CLASSROOM", columns: 5, rows: 7, extraTables: 2, tableCount: 37, seatsPerTable: 3, totalSeats: 111 }
);

const metadata = { knowledgeType: "SETUP_MANUAL", source: "AI_CHAT_MANUAL", status: "CONFIRMED", venue: "FESTA", layoutType: "CLASSROOM", peopleMin: null, peopleMax: 111, rows: 7, columns: 5, extraTables: 2, tableCount: 37, seatsPerTable: 3, totalSeats: 111 };
metadata.manualKey = api.manualKey(metadata);
const data = {
  spaces: [{ id: "festa", space_name: "페스타", space_code: "FESTA" }],
  rules: [{ id: "old-rule", space_id: "festa", layout_type: "school", is_active: true, max_people: 90, rule_note: "4열 × 7줄 · 총 30T" }],
  knowledge: [{ id: "manual", category: "layout", predicate: "confirmed_setup_manual", object: "CLASSROOM", status: "approved", natural_language: "5열 × 7줄 + 전면 2T", original_answer: JSON.stringify(metadata), updated_at: "2026-11-14T00:00:00Z" }],
};
const selected = api.getSetupManual({ venue: "FESTA", layoutType: "CLASSROOM" }, data);
assert.equal(selected.source, "AI_CHAT_MANUAL");
assert.equal(selected.manualKey, "FESTA|CLASSROOM|DEFAULT");
assert.equal(api.answer("페스타 스쿨식 어떻게 세팅해?", data).manual.id, "manual");

const legacyMetadata = { source: "AI_CHAT_MANUAL", status: "CONFIRMED", venue: "FESTA", layoutType: "CLASSROOM", columns: 6, rows: 6, totalSeats: 108 };
assert.equal(api.manualKey(legacyMetadata), "FESTA|CLASSROOM|DEFAULT");

const updated = api.answer("페스타 스쿨식 앞에 3T로 바꿔", data, { venue: "FESTA", layoutType: "CLASSROOM" });
assert.equal(updated.intent, "LAYOUT_TEACH");
assert.equal(updated.parsed.tableCount, 38);
assert.equal(updated.parsed.totalSeats, 114);

const assistant = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
assert(assistant.includes('knowledgeType: "SETUP_MANUAL"'));
assert(assistant.includes("async function verifyConfirmedSetupManual"));
assert(assistant.includes('method: existing?.id ? "PATCH" : "POST"'));
assert(assistant.includes("await persistConfirmedSetupManual"));
assert(assistant.includes("setupManualTableBody"));
assert(fs.readFileSync("outputs/index.html", "utf8").includes("AI 직접 가르치기 세팅 기준"));

console.log("setup manual teach persistence V1 tests passed");
