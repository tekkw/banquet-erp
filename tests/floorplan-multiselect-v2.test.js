const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const editor = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const assets = fs.readFileSync("outputs/src/styles/assets.css", "utf8");
const dark = fs.readFileSync("outputs/src/styles/darkTheme.css", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(editor, context);
const api = context.window.BANQUET_ERP_FLOORPLAN_EDITOR;

const tables = Array.from({ length: 6 }, (_, index) => ({
  instanceId: `table-${index}`,
  objectType: "seminar_table",
  x: 1000 + index * 500,
  y: 2000,
  widthM: 1.8,
  heightM: 0.45,
  zIndex: index + 1,
  metadata: {},
}));

// A/B. 그룹 복제는 전체 개수와 상대 간격을 유지한다.
const copies = api.duplicateFloorplanObjects(tables, 200, (_, index) => `copy-${index}`);
assert.strictEqual(copies.length, 6);
assert.strictEqual(copies.map((item) => item.x - copies[0].x).join(","), tables.map((item) => item.x - tables[0].x).join(","));
assert(copies.every((item, index) => item.x - tables[index].x === 200 && item.y - tables[index].y === 200));
assert(editor.includes("selectedStarts: selectedObjects.map"), "그룹 드래그는 선택 객체의 시작 좌표를 함께 보존해야 한다");

// C. marquee와 겹치는 객체만 선택 가능하다.
const marquee = { x: 800, y: 1700, width: 1400, height: 700 };
assert.strictEqual(tables.filter((item) => api.floorplanObjectIntersectsBox(item, marquee)).length, 5);
assert(editor.includes('workspaceDragState.mode === "marquee"'));

// D/E. base 객체는 label을 강제 표시하고 layout 모드 편집 대상에서 제외한다.
assert(editor.includes("isWorkspaceBaseObject(object) || (options.showNames ?? workspaceShowNames)"));
assert(editor.includes('return !object.locked && !isWorkspaceBaseObject(object);'));
assert(assets.includes(".layout-workspace-base-label"));

// F. 다크 패널의 제목/본문/보조/입력/placeholder 색을 명시한다.
["#F4F7FA", "#C9D5DE", "#96A9BA", "#70879A"].forEach((color) => assert(dark.includes(color), `${color} dark editor color missing`));
assert(dark.includes(".layout-editor-properties"));
assert(dark.includes("::placeholder"));

console.log("floorplan multiselect v2 tests passed");
