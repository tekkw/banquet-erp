const assert = require("assert");
const fs = require("fs");

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

console.log("shared-floorplan-editor tests passed");
