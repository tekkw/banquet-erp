const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
const previewHtml = fs.readFileSync("outputs/event-order-preview.html", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const api = context.window.BANQUET_ERP_FLOORPLAN_EDITOR;

for (const objectType of ["seminar_table", "round_table", "chair", "holding_table", "stage", "buffet_table"]) {
  assert.equal(api.shouldShowWorkspaceObjectLabel({ objectType }, false), false, `${objectType} label은 기본 OFF`);
  assert.equal(api.shouldShowWorkspaceObjectLabel({ objectType }, true), true, `${objectType} label은 토글 ON에서 표시`);
}
for (const objectType of ["door", "screen", "pillar", "blocked_area"]) {
  assert.equal(api.shouldShowWorkspaceObjectLabel({ objectType }, false), true, `${objectType} 구조물 label은 유지`);
}
assert.equal(api.shouldShowWorkspaceObjectLabel({ objectType: "wall", metadata: { compositeOutlineSource: true } }, true), false);

for (const markup of [html, previewHtml]) {
  assert(markup.includes('id="layoutWorkspaceViewNamesInput" type="checkbox"> 오브젝트 라벨'), "label toggle 기본값은 OFF여야 한다");
  assert(!markup.includes('id="layoutWorkspaceViewNamesInput" type="checkbox" checked'), "기존 기본 ON markup을 제거한다");
}
assert(source.includes('WORKSPACE_LABEL_PREFERENCE_KEY') && source.includes('localStorage.setItem(WORKSPACE_LABEL_PREFERENCE_KEY'), "기존 view preference 방식으로 label 선택을 보존한다");
assert(source.includes('workspaceExportRendering'), "editor/export 렌더가 같은 visibility 규칙과 별도 font scale을 사용한다");
assert(source.includes('미리보기: ${tableWidthMm}×${tableDepthMm} · ${columns}열 × ${rows}줄 · 총 ${result.objects.length}T'), "Auto Grid는 대표 요약만 제공한다");

console.log("floorplan object label visibility V1 tests passed");
