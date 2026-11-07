const assert = require("assert");
const fs = require("fs");
const path = require("path");

global.window = {};
require(path.join(__dirname, "../outputs/src/floorplanEditor.js"));
const api = global.window.BANQUET_ERP_FLOORPLAN_EDITOR;
const source = fs.readFileSync(path.join(__dirname, "../outputs/src/floorplanEditor.js"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "../outputs/index.html"), "utf8");
const preview = fs.readFileSync(path.join(__dirname, "../outputs/event-order-preview.html"), "utf8");

assert.strictEqual(api.normalizeObjectColor("#d9dee6"), "#D9DEE6");
assert.strictEqual(api.normalizeObjectColor("red"), "", "색상 contract는 안전한 6자리 hex만 허용한다");

const storedMemo = api.writeMasterMemo("운영 메모", "#93c5fd");
assert.strictEqual(storedMemo, "운영 메모\n[defaultColor:#93C5FD]");
assert.strictEqual(api.readMasterDefaultColor({ memo: storedMemo }), "#93C5FD", "마스터 기본색 reload");
assert.strictEqual(api.readMasterMemo({ memo: storedMemo }), "운영 메모", "사용자 memo는 보존한다");
assert.strictEqual(api.readMasterDefaultColor({ memo: "기존 메모" }), "", "기존 무색 마스터 backward compatibility");

const master = { memo: storedMemo };
assert.strictEqual(api.resolveObjectFillColor({ metadata: {} }, master, "rgba(1,2,3,.2)"), "#93C5FD", "마스터 기본색 적용");
assert.strictEqual(api.resolveObjectFillColor({ metadata: { colorOverride: "#F97316" } }, master, "#000000"), "#F97316", "개별 override 우선");
assert.strictEqual(api.resolveObjectFillColor({ metadata: {} }, {}, "rgba(1,2,3,.2)"), "rgba(1,2,3,.2)", "색상 없는 기존 객체 스타일 유지");

assert.deepStrictEqual(Object.keys(api.OBJECT_COLOR_PRESETS), ["cold", "hot", "dessert"]);
assert(source.includes("applyWorkspaceSelectionColor") && source.includes("workspaceSelectedIds"), "다중 선택 색상 변경 경로");
assert(source.includes("delete object.metadata.colorOverride"), "기본색 복원 경로");
assert(source.includes("...storageMetadata") && source.includes("dbObjectToWorkspaceObject") && source.includes("colorOverride"), "layout metadata 저장/reload contract");
assert(source.includes("duplicateFloorplanObjects(selected") && source.includes("metadata: { ...(object.metadata || {}) }"), "복제는 metadata를 유지한다");
assert(source.includes("resolveObjectFillColor(object, master") && source.includes("dataset.objectFillColor"), "SVG editor/preview 공용 fill resolver");
assert(source.includes("node.dataset.objectFillColor || style.fill"), "PNG/PDF export에서 지정 fill 유지");
assert(source.includes("targetCtx.fillStyle = resolveObjectFillColor"), "legacy canvas preview fill resolver");
assert(source.includes("renderObjectPreviewSvg") && source.includes("defaultColor: readMasterDefaultColor(item)"), "library thumbnail 기본색");
assert(source.includes('let editingObjectTypeId = ""') && source.includes('let objectColorInputSource = ""'), "master form persistence state는 명시적으로 초기화한다");
assert(source.includes("layout_object_types color verify") && source.includes("MASTER_COLOR_PERSISTENCE_MISMATCH"), "Supabase 저장 후 실제 row 색상을 재검증한다");
assert(source.includes('code: error?.code') && source.includes('details: error?.details') && source.includes('hint: error?.hint'), "Supabase error diagnostics를 보존한다");

for (const html of [index, preview]) {
  for (const id of ["layoutObjectColorInput", "layoutObjectColorTextInput", "layoutWorkspaceColorInput", "layoutWorkspaceRoleInput", "layoutWorkspaceColorResetButton"]) {
    assert(html.includes(`id="${id}"`), `${id} UI wiring`);
  }
  assert(html.includes('data-object-color-preset="cold"') && html.includes('data-object-color-preset="hot"') && html.includes('data-object-color-preset="dessert"'));
}

console.log("floorplan object colors V1 tests passed");
