const assert = require("node:assert/strict");
const fs = require("node:fs");

global.window = {};
require("../outputs/src/venueUtils.js");
require("../outputs/src/floorplanEditor.js");
const api = window.BANQUET_ERP_FLOORPLAN_EDITOR;
const tableSpecs = [{ widthMm: 1800, depthMm: 450 }, { widthMm: 1600, depthMm: 450 }];
const defaults = { tableWidthMm: 1800, tableDepthMm: 450, columns: 3, rows: 7, horizontalGapMm: 900, verticalGapMm: 1300, frontDirection: "north", origin: { xMm: 1500, yMm: 1000 } };

const a = api.parseAutoGridLayoutIntent("부라노1 1800 세미나 3열 7줄 좌우 90cm 앞뒤 130cm", defaults, { tableSpecs });
assert.deepEqual({ venue: a.venue, width: a.tableWidthMm, depth: a.tableDepthMm, columns: a.columns, rows: a.rows, hgap: a.horizontalGapMm, vgap: a.verticalGapMm }, { venue: "BURANO_1", width: 1800, depth: 450, columns: 3, rows: 7, hgap: 900, vgap: 1300 });
assert.equal(a.needsConfirmation, false);

const b = api.parseAutoGridLayoutIntent("부1 1800 3x7 간격 0.9m 1.3m", defaults, { tableSpecs });
assert.equal(b.venue, "BURANO_1");
assert.equal(b.horizontalGapMm, 900);
assert.equal(b.verticalGapMm, 1300);

const c = api.parseAutoGridLayoutIntent("카프리1 1800 테이블 3열 4줄", defaults, { tableSpecs });
assert.equal(c.venue, "CAPRI_1");
assert.equal(c.columns, 3);
assert.equal(c.rows, 4);
assert.equal(c.horizontalGapMm, 900, "생략된 간격은 현재 Auto Grid 값을 유지한다");

const d = api.parseAutoGridLayoutIntent("좌우 간격 70으로 줄여줘", a, { tableSpecs });
assert.equal(d.horizontalGapMm, 700, "gap 문맥의 단위 없는 70은 70cm로 해석한다");
assert.equal(d.verticalGapMm, 1300);
const e = api.parseAutoGridLayoutIntent("4열로 바꿔", d, { tableSpecs });
assert.equal(e.columns, 4);
assert.equal(e.rows, 7);
const f = api.parseAutoGridLayoutIntent("앞뒤 120", e, { tableSpecs });
assert.equal(f.verticalGapMm, 1200);
const reduced = api.parseAutoGridLayoutIntent("한 줄 줄여줘", f, { tableSpecs });
assert.equal(reduced.rows, 6);

assert.equal(api.resolveLayoutVenueCode("컨A 1800 세미나"), "CONVENTION_A");
assert.equal(api.resolveLayoutVenueCode("페스타 3열 4줄"), "FESTA");
assert.equal(api.resolveLayoutVenueCode("올리비아 3 X 4"), "OLIVIA");
const explicitSpec = api.parseAutoGridLayoutIntent("컨벤션A 1800x450 6*15 좌우 900mm 앞뒤 1.3m", defaults, { tableSpecs });
assert.equal(explicitSpec.tableDepthMm, 450);
assert.equal(explicitSpec.columns, 6);
assert.equal(explicitSpec.rows, 15);

assert.equal(api.parseAutoGridGapMm(90, "cm"), 900);
assert.equal(api.parseAutoGridGapMm(.9, "m"), 900);
assert.equal(api.parseAutoGridGapMm(900, "mm"), 900);
assert.equal(api.parseAutoGridGapMm(90), 900);

const constraints = api.deriveLayoutConstraints({ widthMm: 8600, heightMm: 15000 });
const tooWide = api.generateSeminarGrid({ tableSpec: { widthMm: a.tableWidthMm, depthMm: a.tableDepthMm }, columns: 4, rows: 7, horizontalGapMm: a.horizontalGapMm, verticalGapMm: a.verticalGapMm, origin: a.origin, constraints });
assert.equal(tooWide.valid, false);
assert.equal(tooWide.reason, "insufficient_width");
assert.match(api.formatAutoGridFailureMessage(tooWide), /필요 폭 .*사용 가능 폭 .*열 수를 줄이거나 좌우 간격/);
const blocked = api.deriveLayoutConstraints({ widthMm: 12000, heightMm: 15000, objects: [{ objectType: "blocked_area", label: "사용불가", x: 1500, y: 1000, widthM: 2, heightM: 2 }] });
assert.equal(api.generateSeminarGrid({ tableSpec: { widthMm: 1800, depthMm: 450 }, columns: 3, rows: 7, horizontalGapMm: 900, verticalGapMm: 1300, origin: a.origin, constraints: blocked }).reason, "blocked_area_collision");
assert.match(api.formatAutoGridFailureMessage({ reason: "blocked_area_collision", obstacle: { label: "사용불가" } }), /사용불가.*겹쳐/);

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const css = fs.readFileSync("outputs/src/styles/assets.css", "utf8");
assert(source.includes("parseAutoGridLayoutIntent") && source.includes("previewAutoGridLayout()"), "자연어 결과는 기존 Auto Grid preview 경로를 호출한다");
assert(source.includes("generateSeminarGrid({") && source.includes("autoGridUi.width.value"), "좌표는 기존 deterministic generator가 생성한다");
assert(source.includes("data-auto-grid-apply disabled"), "preview 적용 전 저장하지 않는다");
assert(css.includes(".layout-auto-grid-fields label") && css.includes("#26384a") && css.includes(".layout-auto-grid-helper"), "Auto Grid panel 텍스트 contrast를 명시한다");

console.log("floorplan Auto Grid layout intent V1 tests passed");
