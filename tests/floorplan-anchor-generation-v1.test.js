const assert = require("node:assert/strict");
const fs = require("node:fs");

global.window = {};
require("../outputs/src/floorplanEditor.js");
const api = window.BANQUET_ERP_FLOORPLAN_EDITOR;

const anchors = [
  { id: "24", capacity: 24, columns: 3, rows: 4, seatsPerTable: 2, verified: true },
  { id: "36", capacity: 36, columns: 3, rows: 6, seatsPerTable: 2, verified: false },
  { id: "63", capacity: 63, columns: 3, rows: 7, seatsPerTable: 3, verified: false },
  { id: "81", capacity: 81, columns: 3, rows: 9, seatsPerTable: 3, verified: true },
];

const exactRequest = api.parseLayoutAiCommand("부라노1 스쿨식 52석 만들어줘").plan;
const exact = api.resolveSchoolTargetPlan(exactRequest, anchors);
assert.equal(exact.totalSeats, 52, "52석은 정확한 좌석수를 우선한다");
assert.equal(exact.columns, 3, "anchor의 3열 관례를 유지한다");
assert.equal(exact.tableCount, 26);
assert.deepEqual(exact.anchorPair, { lowerId: "24", upperId: "81" }, "verified anchor를 우선해 lower/upper를 고른다");
const room = { widthMm: 20000, heightMm: 20000, paddingMm: 800, frontDirection: "top", baseZIndex: 0 };
const masters = { table: { id: "seminar-1800", widthMm: 1800, heightMm: 450, displayShape: "rect" }, chair: { id: "chair", widthMm: 450, heightMm: 450, displayShape: "rect" } };
const generated = api.generateSchoolLayout(exact, room, masters, "anchor-52");
assert.equal(generated.filter((row) => row.objectType === "seminar_table").length, 26);
assert.equal(generated.filter((row) => row.objectType === "chair").length, 52);
assert.equal(api.validateGeneratedLayout(generated, room, [], exact).valid, true);

const atLeastRequest = api.parseLayoutAiCommand("52명 들어가게 만들어줘").plan;
const atLeast = api.resolveSchoolTargetPlan(atLeastRequest, anchors);
assert(atLeast.totalSeats >= 52);
assert.equal(atLeast.totalSeats, 52, "최소 초과 후보를 선택한다");
assert.equal(api.resolveSchoolTargetPlan(atLeastRequest, []).columns, 3, "anchor가 없어도 system 기본 3열로 생성한다");

const unverifiedPair = api.selectSchoolAnchorPair(anchors.map((row) => ({ ...row, verified: false })), 52);
assert.deepEqual([unverifiedPair.lower.id, unverifiedPair.upper.id], ["36", "63"], "확인 표시가 같으면 가장 가까운 lower/upper를 쓴다");

const profiled = api.applySchoolSpacingProfile(exact, { horizontalGapMm: 450, verticalGapMm: 900, frontOffsetMm: 1200, leftMarginMm: 800, rightMarginMm: 800, seatsPerTable: 3 });
assert.equal(profiled.horizontalGapMm, 450);
assert.equal(profiled.verticalGapMm, 900);
assert.equal(profiled.seatsPerTable, 2, "target 계산 좌석수는 anchor profile이 덮어쓰지 않는다");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
assert(source.includes('source: "system-default"'), "same-space/family anchor가 없으면 system default로 fallback한다");
assert(source.includes('layout_notes: `[status:generated]'));
assert(source.includes("[status:verified]"));
assert(source.includes('openLayoutInfoModal("save", true)'), "generated draft도 기존 저장 flow를 사용한다");

console.log("floorplan anchor generation V1 tests passed");
