const assert = require("assert");
const fs = require("fs");
const path = require("path");

global.window = {};
require("../outputs/src/floorplanEditor.js");
const api = window.BANQUET_ERP_FLOORPLAN_EDITOR;
const masters = { table: { id: "seminar", widthMm: 1800, heightMm: 450, displayShape: "rect" }, chair: { id: "chair", widthMm: 450, heightMm: 450, displayShape: "rect" } };
const room = { widthMm: 16000, heightMm: 18000, paddingMm: 800, frontClearanceMm: 1200, baseZIndex: 3 };

const initial = api.parseLayoutAiCommand("부라노1 스쿨식 3x7 2석씩 만들어줘").plan;
assert.deepStrictEqual({ columns: initial.columns, rows: initial.rows, tables: initial.tableCount, seats: initial.totalSeats }, { columns: 3, rows: 7, tables: 21, seats: 42 });
const generated = api.generateSchoolLayout(initial, room, masters, "test");
assert.strictEqual(generated.filter((row) => row.objectType === "seminar_table").length, 21, "A: 21 tables");
assert.strictEqual(generated.filter((row) => row.objectType === "chair").length, 42, "A: 42 chairs");
assert(generated.every((row) => row.metadata.generatedBy === "layout_ai"));

const bottomScreen = { objectType: "screen", x: 8000, y: 17700 };
assert.strictEqual(api.frontDirection(room, [bottomScreen]), "bottom", "screen이 아래쪽이면 bottom을 front로 판단한다");
const bottomGenerated = api.generateSchoolLayout(initial, { ...room, frontDirection: api.frontDirection(room, [bottomScreen]) }, masters, "bottom");
const bottomTables = bottomGenerated.filter((row) => row.objectType === "seminar_table"); const bottomChairs = bottomGenerated.filter((row) => row.objectType === "chair");
assert(bottomChairs.every((chair) => chair.rotation === 180), "screen bottom: 의자가 아래쪽을 바라본다");
assert(bottomChairs.every((chair) => chair.y < bottomTables.find((table) => table.metadata.row === chair.metadata.row && table.metadata.column === chair.metadata.column).y), "screen bottom: 의자가 테이블 뒤에서 screen을 바라본다");
assert(bottomTables.find((table) => table.metadata.row === 1).y > bottomTables.find((table) => table.metadata.row === 2).y, "screen bottom: 첫 줄이 screen에 가장 가깝다");

const topScreen = { objectType: "screen", x: 8000, y: 100 };
const topGenerated = api.generateSchoolLayout(initial, { ...room, frontDirection: api.frontDirection(room, [topScreen]) }, masters, "top");
const topTables = topGenerated.filter((row) => row.objectType === "seminar_table"); const topChairs = topGenerated.filter((row) => row.objectType === "chair");
assert(topChairs.every((chair) => chair.rotation === 0), "screen top: 의자가 위쪽을 바라본다");
assert(topChairs.every((chair) => chair.y > topTables.find((table) => table.metadata.row === chair.metadata.row && table.metadata.column === chair.metadata.column).y), "screen top: 의자가 테이블 뒤에서 screen을 바라본다");
assert(topTables.find((table) => table.metadata.row === 1).y < topTables.find((table) => table.metadata.row === 2).y, "screen top: 첫 줄이 screen에 가장 가깝다");

assert.strictEqual(bottomTables.length, 21, "부라노3 3x7 2석: 21 tables");
assert.strictEqual(bottomChairs.length, 42, "부라노3 3x7 2석: 42 chairs");
assert(bottomChairs.every((chair) => chair.metadata.frontDirection === "bottom" && chair.rotation === api.chairFacingDirection("bottom")), "부라노3 3x7 2석: 모든 의자 방향이 screen 기준이다");

const resized = api.parseLayoutAiCommand("4x6으로 바꿔", initial).plan;
assert.strictEqual(resized.tableCount, 24, "B: 4x6은 24 tables");
assert.strictEqual(resized.totalSeats, 48, "B: 기존 2석씩을 유지한다");
assert.strictEqual(api.parseLayoutAiCommand("앞줄 하나 빼", resized).plan.rows, 5, "C: 앞줄 제거");
const oneSeat = api.parseLayoutAiCommand("1석씩으로 바꿔", resized).plan;
assert.strictEqual(oneSeat.tableCount, 24); assert.strictEqual(oneSeat.totalSeats, 24, "D: 테이블은 유지하고 의자만 1개씩");

const shifted = api.parseLayoutAiCommand("전체를 뒤로 300mm 옮겨", initial).plan;
const moved = api.generateSchoolLayout(shifted, room, masters, "moved");
assert.strictEqual(moved[0].y - generated[0].y, 300, "E: 생성 객체만 300mm 이동");
const fixed = { objectType: "pillar", label: "기둥", x: generated[0].x, y: generated[0].y, widthM: .8, heightM: .8, metadata: { baseFloorplanObject: true } };
const invalid = api.validateGeneratedLayout(generated, room, [fixed], initial);
assert.strictEqual(invalid.valid, false, "F: 기둥 충돌은 저장 불가 오류");
assert(invalid.errors.some((message) => message.includes("기둥 충돌")));
assert.strictEqual(api.parseLayoutAiCommand("라운드 7테이블 만들어줘").understood, false, "라운드는 열×행 없이 추측 생성하지 않는다");
const exactTables = api.parseLayoutAiCommand("스쿨식 테이블 20개 2석씩").plan;
assert.strictEqual(api.generateSchoolLayout(exactTables, room, masters, "twenty").filter((row) => row.objectType === "seminar_table").length, 20);

const source = fs.readFileSync(path.join(__dirname, "../outputs/src/floorplanEditor.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../outputs/index.html"), "utf8");
assert(source.includes('generatedBy: "layout_ai"'));
assert(source.includes("pushWorkspaceHistory(); layoutAiPreviousPlan"), "AI 적용 직전 undo snapshot");
assert(source.includes('openLayoutInfoModal("save", true)'), "G/H: AI 저장은 기존 저장 모달을 새 레이아웃 모드로 연다");
assert(source.includes("workspaceActiveLayout || pendingLayoutInfo"), "AI draft의 유형/이름을 기존 저장 모달에 전달한다");
assert(source.includes("layoutAiPlan && !layoutAiValidation?.valid"), "치명적 검증 오류는 기존 저장 버튼에서도 차단한다");
assert(source.includes("workspaceActiveLayout = null"), "I: 기존 레이아웃 AI 수정은 새 draft로 분리한다");
assert(!source.includes('mode: "layout_ai"'), "명확한 V1 명령은 Edge/LLM 호출 없이 처리한다");
assert(/floorplanEditor\.js\?v=layout-ai-v\d+/.test(html));

console.log("floorplan layout AI V1 tests passed");
