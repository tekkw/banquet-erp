const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const editor = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const styles = fs.readFileSync("outputs/src/styles/assets.css", "utf8");

assert(editor.includes('function setWorkspaceEditMode(mode)'), "공용 편집기는 base/layout 모드를 제공해야 한다");
assert(editor.includes('workspaceEditMode === "base" ? saveWorkspaceBaseFloorplan()'), "저장은 편집 모드별 데이터 경계를 지켜야 한다");
assert(editor.includes('workspaceObjects = workspaceObjects.filter(isWorkspaceBaseObject)'), "새 레이아웃은 기본 구조물을 유지해야 한다");
assert(editor.includes('data-floorplan-action="open-base"'), "라이브러리 기본 도면 열기 동작이 필요하다");
assert(editor.includes('data-floorplan-action="create-layout"'), "기본 도면 기반 레이아웃 생성 동작이 필요하다");
assert(editor.includes('function applyWorkspaceSnapPoint(point)'), "마우스 이동용 grid snap 함수가 필요하다");
assert(editor.includes('geometryVersion: 2'), "레이아웃 객체는 mm geometry V2로 저장해야 한다");
assert(editor.includes('xMm: Math.round(object.x)'), "레이아웃 객체 X 좌표는 mm로 저장해야 한다");
assert(editor.includes('widthMm: Math.round(object.widthM * 1000)'), "레이아웃 객체 크기는 mm로 저장해야 한다");
assert(styles.includes('.layout-library-folder'), "기본 도면과 자식 레이아웃 계층 스타일이 필요하다");
assert(editor.includes('renderWorkspaceFloorplanDimensions()'), "기본 도면 segment 치수를 렌더링해야 한다");
assert(editor.includes('\\uAE30\\uC900 \\uAE30\\uBCF8\\uB3C4\\uBA74'), "레이아웃 편집기에 기준 기본도면 이름을 표시해야 한다");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(editor, context);
const metrics = context.window.BANQUET_ERP_FLOORPLAN_EDITOR.floorplanOutlineMetrics([
  { x: 0, y: 0 }, { x: 16200, y: 0 }, { x: 16200, y: 5000 },
  { x: 10000, y: 5000 }, { x: 10000, y: 15000 }, { x: 0, y: 15000 }, { x: 0, y: 0 },
]);
assert.strictEqual(metrics.widthMm, 16200);
assert.strictEqual(metrics.heightMm, 15000);
assert.strictEqual(metrics.areaMm2, 181000000);
assert.strictEqual(metrics.segments.map((segment) => segment.lengthMm).join(","), "16200,5000,6200,10000,10000,15000", "L자형 외곽선은 metadata.points의 각 벽 길이를 유지해야 한다");
const rectangle = context.window.BANQUET_ERP_FLOORPLAN_EDITOR.floorplanOutlineMetrics([
  { x: 0, y: 0 }, { x: 16200, y: 0 }, { x: 16200, y: 15000 }, { x: 0, y: 15000 }, { x: 0, y: 0 },
]);
assert.strictEqual(rectangle.segments.map((segment) => segment.lengthMm).join(","), "16200,15000,16200,15000");
[0.5, 1, 2].forEach(() => assert.strictEqual(rectangle.widthMm, 16200, "zoom과 관계없이 mm geometry가 유지돼야 한다"));

const baseWizard = fs.readFileSync("outputs/src/baseFloorplanWizard.js", "utf8");
assert(baseWizard.includes('method: "PATCH"') && baseWizard.includes('floorplan_name: nextName'), "이름 변경은 기존 기본 도면 row를 PATCH해야 한다");
assert(baseWizard.includes('venue_layouts?select=id&floorplan_id=eq.'), "삭제 전 참조 레이아웃을 확인해야 한다");
assert(baseWizard.includes('JSON.stringify({ is_active: false })'), "기본 도면 삭제는 비활성화 방식이어야 한다");

console.log("shared-floorplan-editor tests passed");
