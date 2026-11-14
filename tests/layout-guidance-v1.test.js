const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const window = {};
vm.runInNewContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), { window, console });
vm.runInNewContext(fs.readFileSync("outputs/src/layoutGuidance.js", "utf8"), { window, console });
const api = window.BANQUET_ERP_LAYOUT_GUIDANCE;
const data = {
  spaces: [{ id: "festa", space_name: "페스타", space_code: "FESTA" }],
  files: [{ id: "school-image", public_url: "https://example.com/festa-school.png" }],
  images: [{ id: "school", space_id: "festa", file_id: "school-image", layout_type: "school", is_active: true, is_verified: true, column_count: 5, row_count: 7, extra_table_count: 2, table_count: 37, seats_per_table: 3, setup_capacity: 111 }],
  layouts: [{ id: "round", space_id: "festa", layout_type: "round", is_active: true, table_count: 13, seats_per_table: 10, setup_capacity: 130 }],
};

assert.equal(api.matches("페스타 스쿨식 130석이면 어떻게 세팅해야해?"), true);
assert.equal(api.matches("예전에 페스타 130명 했던 행사 보여줘"), false);
let result = api.answer("페스타 스쿨식 어떻게 세팅해?", data);
assert.equal(result.intent, "LAYOUT_GUIDANCE");
assert.match(result.text, /5열 × 7줄 \+ 전면 2T.*37T.*111석/);
assert.equal(result.manual.imageUrl, "https://example.com/festa-school.png");
result = api.answer("페스타 라운드식 어떻게 세팅해?", data);
assert.match(result.text, /13T.*130석/);
result = api.answer("페스타 스쿨식 130석이면 어떻게 세팅해야해?", data);
assert.equal(result.intent, "LAYOUT_CAPACITY");
assert.match(result.text, /최대 111석.*130석 배치는 확정된 기준이 없습니다/);
assert(!result.text.includes("행사"));
result = api.answer("페스타 배치도 보여줘", data, { venue: "FESTA", layoutType: "CLASSROOM" });
assert.equal(result.intent, "LAYOUT_IMAGE");
assert.equal(result.manual.imageUrl, "https://example.com/festa-school.png");
assert.equal(api.answer("카프리2 U자 어떻게 세팅해?", data).text, "등록된 확정 세팅 기준이 없습니다.");
result = api.answer("페스타 130석은 5열 8줄로 해", data, { venue: "FESTA", layoutType: "CLASSROOM" });
assert.equal(result.intent, "LAYOUT_TEACH");
assert.deepEqual({ people: result.parsed.people, columns: result.parsed.columns, rows: result.parsed.rows }, { people: 130, columns: 5, rows: 8 });

const assistant = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
const submitFlow = assistant.slice(assistant.indexOf("async function handleAiPageChatSubmit"));
assert(submitFlow.indexOf("await answerLayoutGuidance(question)") < submitFlow.indexOf("answerEventOrderAnalytics(question)"));
assert(assistant.includes('source: "AI_CHAT_MANUAL"'));
assert(assistant.includes('type: "layout_manual"'));
assert(fs.readFileSync("outputs/index.html", "utf8").includes("세팅 매뉴얼과 레이아웃 이미지 관리"));

console.log("layout guidance V1 tests passed");
