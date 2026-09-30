const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const editor = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const styles = fs.readFileSync("outputs/src/styles/assets.css", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(editor, context);

const api = context.window.BANQUET_ERP_FLOORPLAN_EDITOR;
assert.strictEqual(api.layoutLibraryGroupName("부라노1", "호텔"), "부라노");
assert.strictEqual(api.layoutLibraryGroupName("컨벤션 AB", "호텔"), "컨벤션");
assert.strictEqual(api.layoutLibraryGroupName("연회장", "별관"), "기타");

const normalized = api.layoutLibraryObjectGeometry({ x: 0.1, y: 0.2, width: 0.2, height: 0.1 }, 10000, 8000);
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalized)), { x: 2000, y: 2000, width: 2000, height: 800 });
const view = api.layoutLibraryViewBox(10000, 8000, [], [{ metadata: { xMm: 11000, yMm: 4000, widthMm: 1000, heightMm: 1000 } }]);
assert(view.x < 0 && view.y < 0, "자동 fit은 도면 여백을 포함해야 한다");
assert(view.x + view.width > 11500, "자동 fit은 도면 밖 객체도 잘리지 않게 포함해야 한다");

assert(editor.includes('preserveAspectRatio="xMidYMid meet"'), "썸네일은 비율을 유지한 contain 렌더링이어야 한다");
assert(editor.includes('data-library-group='), "공간 그룹 선택 단계가 필요하다");
assert(editor.includes('data-library-space='), "하위 공간 선택 단계가 필요하다");
assert(editor.includes('data-layout-filter='), "레이아웃 유형 선택 단계가 필요하다");
assert(editor.includes('data-action="preview"') && editor.includes('data-action="edit"') && editor.includes('data-action="delete"'), "카드는 미리보기/편집/삭제를 제공해야 한다");
assert(editor.includes('venue_floorplan_objects?select=*'), "중요 구조물 라벨은 기존 기본 도면 객체를 재사용해야 한다");
assert(editor.includes('const label = isFixed ?'), "테이블과 의자의 미세 라벨은 썸네일에서 숨겨야 한다");
assert(styles.includes('.layout-library-important-label'), "썸네일 전용 읽기 쉬운 라벨 스타일이 필요하다");
assert(styles.includes('overflow-x: auto'), "모바일 선택 탭은 가로 스크롤을 지원해야 한다");

console.log("layout-library-v3 tests passed");
