const assert = require("assert");
const fs = require("fs");

const production = fs.readFileSync("outputs/index.html", "utf8");
const preview = fs.readFileSync("outputs/event-order-preview.html", "utf8");
const editor = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const styles = fs.readFileSync("outputs/src/styles/assets.css", "utf8");

for (const html of [production, preview]) {
  assert(html.includes('id="layoutWorkspaceImportBaseButton"'), "production과 preview toolbar에 불러오기 버튼이 있어야 한다");
  assert(html.includes('id="layoutWorkspaceImportBaseModal"'), "기본도면 picker modal이 로드되어야 한다");
  assert(html.includes('workspaceImportBaseButton: document.getElementById("layoutWorkspaceImportBaseButton")'), "FloorplanEditor 초기화에 버튼이 전달되어야 한다");
  assert(html.includes("floorplanEditor.js?v="), "production이 갱신된 editor bundle을 요청해야 한다");
}

assert(editor.includes('workspaceImportBaseButton?.addEventListener("click", openCompositeBasePlanModal)'), "버튼 클릭이 picker에 연결되어야 한다");
assert(!editor.includes('workspaceEditMode !== "base"'), "새 레이아웃(layout mode)에서도 picker가 열려야 한다");
assert(editor.includes('venue_floorplans?select=*&is_active=eq.true&order=floorplan_name.asc'), "picker는 활성 기본도면 library를 조회해야 한다");
assert(editor.includes('const isBaseReference = workspaceEditMode === "base"'), "layout과 base 저장 경로를 구분해야 한다");
assert(editor.includes("await hydrateCompositeGroups(workspaceObjects.filter((object) => !isWorkspaceBaseObject(object)))"), "저장된 layout composite 참조를 재로드해야 한다");
assert(editor.includes("if (isCompositeGroup(object) && !isWorkspaceBaseObject(object)) return true"), "layout에 삽입한 그룹은 이동할 수 있어야 한다");
assert(styles.includes(".layout-editor-workbench.library-mode .layout-editor-toolbar .tool-row") && styles.includes("display: none"), "관리 목록에서는 tool row를 숨기는 기존 규칙을 유지한다");
assert(editor.includes('function showLayoutEditor(preserveViewport = false) { floorplanV2EventPanel?.classList.remove("library-mode")'), "새 레이아웃 진입 시 toolbar가 표시되어야 한다");

console.log("Floorplan Composite Base Plan production UI wiring tests passed");
