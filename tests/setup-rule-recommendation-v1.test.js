const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const window = {};
vm.runInNewContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), { window, console });
vm.runInNewContext(fs.readFileSync("outputs/src/layoutGuidance.js", "utf8"), { window, console });
const api = window.BANQUET_ERP_LAYOUT_GUIDANCE;

const taught = api.parseQuestion("페스타 스쿨식은 5열이고 5줄부터 8줄까지 가능해. 기둥 앞에는 항상 3T 들어가고, 테이블당 2석이나 3석으로 써.");
assert.equal(taught.ruleTeach, true);
assert.equal(taught.venue, "FESTA");
assert.deepEqual(Array.from(taught.allowedRows), [5, 6, 7, 8]);
assert.deepEqual(Array.from(taught.allowedSeatsPerTable), [2, 3]);
assert.equal(taught.extraTables, 3);

const rule = { knowledgeType: "SETUP_RULE", source: "AI_CHAT_MANUAL", status: "CONFIRMED", canonicalVenue: "FESTA", layoutType: "CLASSROOM", columns: 5, allowedRows: [5, 6, 7, 8], extraTables: 3, allowedSeatsPerTable: [2, 3], ruleKey: "FESTA|CLASSROOM|RULE" };
const candidates = api.generateSetupCandidates(rule);
assert.equal(candidates.length, 8);
assert.deepEqual(Array.from(candidates, (item) => item.capacity), [56, 66, 76, 84, 86, 99, 114, 129]);

const data = {
  knowledge: [{ id: "rule", category: "layout", predicate: "confirmed_setup_rule", status: "approved", original_answer: JSON.stringify(rule) }],
  spaces: [{ id: "festa", space_code: "FESTA", space_name: "페스타" }],
  files: [{ id: "preview", public_url: "https://example.com/5x7.png" }],
  layouts: [{ id: "saved-5x7", space_id: "festa", layout_type: "school", is_active: true, column_count: 5, row_count: 7, extra_table_count: 3, seats_per_table: 3, setup_capacity: 114, preview_file_id: "preview" }],
};

const expectations = new Map([[66, 66], [70, 76], [80, 84], [86, 86], [92, 99], [110, 114], [125, 129]]);
for (const [people, capacity] of expectations) {
  const recommendation = api.recommendSetupForPeople({ venue: "FESTA", layoutType: "CLASSROOM", people }, data);
  assert.equal(recommendation.candidate.capacity, capacity, `${people}명 추천`);
}
const linked = api.recommendSetupForPeople({ venue: "FESTA", layoutType: "CLASSROOM", people: 110 }, data);
assert.equal(linked.candidate.imageUrl, "https://example.com/5x7.png");
assert.equal(linked.candidate.layoutId, "saved-5x7");

let answer = api.answer("페스타 92명 스쿨식 어떻게 해?", data);
assert.match(answer.text, /5열×6줄.*33T.*3석씩.*99석/);
answer = api.answer("페스타 130명 스쿨식 어떻게 해?", data);
assert.equal(answer.intent, "LAYOUT_CAPACITY");
assert.match(answer.text, /최대는 129석.*130명은 수용할 수 없습니다/);

const assistant = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
assert(assistant.includes('knowledgeType: "SETUP_RULE"'));
assert(assistant.includes("persistConfirmedSetupRule"));
assert(assistant.includes("후보 보기"));
assert(assistant.includes('predicate: "confirmed_setup_rule"'));

console.log("setup rule recommendation V1 tests passed");
