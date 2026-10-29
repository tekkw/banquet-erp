const assert = require("assert");
const fs = require("fs");

global.window = {};
require("../outputs/src/floorplanEditor.js");
const api = window.BANQUET_ERP_FLOORPLAN_EDITOR;

const conventionALine = { start: { x: 0, y: 0 }, end: { x: 0, y: 14000 } };
const conventionBLine = { start: { x: 0, y: 0 }, end: { x: 0, y: 14000 } };
const viewportScale = 0.041;
assert.strictEqual(api.worldMmToScreenDistance(conventionALine.end.y - conventionALine.start.y, viewportScale), api.worldMmToScreenDistance(conventionBLine.end.y - conventionBLine.start.y, viewportScale), "같은 14m는 같은 px 길이여야 한다");
const transformed = api.transformBasePlanPoint({ metadata: { offsetX: 25000, offsetY: 3000, rotation: 0, scale: 7 } }, conventionBLine.end);
assert.deepStrictEqual(transformed, { x: 25000, y: 17000 }, "source scale 값과 무관하게 translation만 적용한다");

const room = api.deriveLayoutConstraints({ widthMm: 12000, heightMm: 15000 });
const result = api.generateSeminarGrid({
  venue: "부라노1",
  tableSpec: { widthMm: 1800, depthMm: 450 },
  columns: 3,
  rows: 7,
  horizontalGapMm: 900,
  verticalGapMm: 1300,
  origin: { xMm: 1500, yMm: 1000 },
  frontDirection: "north",
  constraints: room,
});
assert.strictEqual(result.valid, true);
assert.strictEqual(result.objects.length, 21, "3x7은 21개 테이블");
assert.strictEqual(result.horizontalPitchMm, 2700, "1800 + 900 좌우 pitch");
assert.strictEqual(result.verticalPitchMm, 1750, "450 + 1300 앞뒤 pitch");
assert.strictEqual(result.objects.find((row) => row.metadata.row === 1 && row.metadata.column === 2).x - result.objects[0].x, 2700);
assert.strictEqual(result.objects.find((row) => row.metadata.row === 2 && row.metadata.column === 1).y - result.objects[0].y, 1750);
assert.deepStrictEqual(result.measurements.slice(0, 2).map((row) => row.label), ["0.9m", "1.3m"]);

const blocked = api.deriveLayoutConstraints({ widthMm: 12000, heightMm: 15000, objects: [{ objectType: "blocked_area", label: "사용불가", x: 1500, y: 1000, widthM: 2, heightM: 2 }] });
assert.strictEqual(api.generateSeminarGrid({ tableSpec: { widthMm: 1800, depthMm: 450 }, columns: 3, rows: 7, horizontalGapMm: 900, verticalGapMm: 1300, origin: { xMm: 1500, yMm: 1000 }, constraints: blocked }).reason, "blocked_area_collision", "사용불가 영역 충돌");
const pillar = api.deriveLayoutConstraints({ widthMm: 12000, heightMm: 15000, objects: [{ objectType: "pillar", label: "기둥", x: 4200, y: 1000, widthM: .8, heightM: .8 }] });
assert.strictEqual(api.generateSeminarGrid({ tableSpec: { widthMm: 1800, depthMm: 450 }, columns: 3, rows: 7, horizontalGapMm: 900, verticalGapMm: 1300, origin: { xMm: 1500, yMm: 1000 }, constraints: pillar }).reason, "pillar_collision", "기둥 충돌");
const wall = api.deriveLayoutConstraints({ widthMm: 12000, heightMm: 15000, objects: [{ objectType: "wall", label: "벽", x: 4200, y: 1000, widthM: 2, heightM: .2 }] });
assert.strictEqual(api.generateSeminarGrid({ tableSpec: { widthMm: 1800, depthMm: 450 }, columns: 3, rows: 7, horizontalGapMm: 900, verticalGapMm: 1300, origin: { xMm: 1500, yMm: 1000 }, constraints: wall }).reason, "wall_collision", "wall 충돌");
const overflow = api.generateSeminarGrid({ tableSpec: { widthMm: 1800, depthMm: 450 }, columns: 3, rows: 7, horizontalGapMm: 900, verticalGapMm: 1300, origin: { xMm: 11500, yMm: 1000 }, constraints: room });
assert.strictEqual(overflow.valid, false, "boundary overflow는 저장 불가");

const baseObjects = [{ instanceId: "pillar", objectType: "pillar" }];
const preview = api.createAutoLayoutPreview(result, baseObjects);
assert(preview.previewObjects.every((object) => object.metadata.autoLayoutPreview === true));
assert.deepStrictEqual(api.cancelAutoLayoutPreview(preview), baseObjects, "취소 시 기존 객체만 복원");
const applied = api.applyAutoLayoutPreview(preview);
assert.strictEqual(applied.length, 22);
assert(applied.slice(1).every((object) => object.metadata.autoLayoutPreview === false));
const reloaded = JSON.parse(JSON.stringify(applied));
assert.deepStrictEqual(reloaded.slice(1).map((object) => [object.metadata.xMm, object.metadata.yMm]), applied.slice(1).map((object) => [object.metadata.xMm, object.metadata.yMm]), "저장/재로드 후 mm 좌표 동일");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
assert(source.includes("scale: 1"), "composite reference scale은 1로 고정");
assert(source.includes("자동 Grid 미리보기를 적용하거나 취소한 뒤 저장해주세요."), "preview 직접 저장 차단");
assert(source.includes("layout_origin") && source.includes("front_direction"), "origin/frontDirection metadata 저장");
assert(source.includes("layout-auto-grid-measurements"), "대표 간격 치수 렌더");
assert(source.includes('id = "layoutWorkspaceAutoGridButton"'), "새 레이아웃 toolbar 자동 Grid 버튼");

console.log("Floorplan actual-mm auto grid V1 tests passed");
