const assert = require("assert");
const fs = require("fs");

const htmlFiles = ["outputs/index.html", "outputs/event-order-preview.html"];
const css = fs.readFileSync("outputs/src/styles/assets.css", "utf8");
const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  assert(html.includes('<div class="layout-toolbar-core">'), `${file}: 핵심 toolbar가 있어야 한다`);
  assert(html.includes("<summary>보기/편집</summary>") && html.includes("<summary>도면 도구</summary>") && html.includes("<summary>저장/내보내기</summary>"), `${file}: 세 보조 그룹이 있어야 한다`);
  assert(!/<details class="layout-toolbar-menu"[^>]*\sopen(?:\s|>)/.test(html), `${file}: 보조 그룹 기본 상태는 닫힘이어야 한다`);
  [
    "layoutWorkspaceNewButton", "layoutWorkspaceImportBaseButton", "layoutWorkspaceBackLibraryButton",
    "layoutWorkspaceSaveButton", "layoutWorkspacePreviewButton", "layoutWorkspaceUndoButton", "layoutWorkspaceRedoButton",
    "layoutWorkspaceZoomInButton", "layoutWorkspaceSnapButton", "layoutWorkspaceDrawingPresetSelect",
    "layoutWorkspaceSelectToolButton", "layoutWorkspaceDimensionModeSelect", "layoutWorkspaceSaveAsButton",
    "layoutWorkspaceExportButton", "layoutWorkspaceExportPdfButton",
  ].forEach((id) => assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${file}: ${id}는 한 번만 유지되어야 한다`));
  assert(html.includes('class="layout-toolbar-icon" type="button" title="실행 취소"') && html.includes('title="다시 실행"'), `${file}: undo/redo는 compact icon과 tooltip을 유지해야 한다`);
}

assert(css.includes('.layout-auto-grid-panel .layout-auto-grid-fields input[type="number"]'), "number input에 scoped selector를 적용해야 한다");
assert(css.includes("background: #102a40 !important") && css.includes("color: #f4f7fa !important") && css.includes("-webkit-text-fill-color: #f4f7fa"), "Auto Grid 값은 dark input 위 밝은 글자로 보여야 한다");
assert(css.includes("input:disabled") && css.includes("input[readonly]") && css.includes("#96a9ba"), "disabled/readOnly/placeholder 상태를 구분해야 한다");
assert(css.includes(".layout-toolbar-menu-content { position: absolute"), "닫힌 toolbar group은 기본 toolbar 높이를 늘리지 않아야 한다");
assert(css.includes(".layout-toolbar-core") && css.includes(".layout-toolbar-menu > summary"), "핵심 toolbar와 접이식 summary 스타일이 있어야 한다");

assert(source.includes('openButton.textContent = "Auto Grid"'));
assert(source.includes('workspaceImportBaseButton.insertAdjacentElement("afterend", openButton)'), "Auto Grid는 핵심 toolbar에서 기본도면 다음에 유지되어야 한다");
assert(source.includes('class="layout-auto-grid-field-group"') && source.includes('class="layout-auto-grid-field-group direction"'), "Auto Grid 필드는 테이블/배치/간격/시작 위치/방향으로 그룹화해야 한다");
assert(source.includes("previewAutoGridLayout") && source.includes("applyAutoGridLayout") && source.includes("cancelAutoGridLayout"), "기존 preview/apply/cancel 경로를 유지해야 한다");

console.log("floorplan toolbar UI V1 tests passed");
