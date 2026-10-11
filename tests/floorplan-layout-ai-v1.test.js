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
assert.strictEqual(api.parseLayoutAiCommand("라운드 7테이블 만들어줘").unsupportedType, true);
const exactTables = api.parseLayoutAiCommand("스쿨식 테이블 20개 2석씩").plan;
assert.strictEqual(api.generateSchoolLayout(exactTables, room, masters, "twenty").filter((row) => row.objectType === "seminar_table").length, 20);

const source = fs.readFileSync(path.join(__dirname, "../outputs/src/floorplanEditor.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../outputs/index.html"), "utf8");
assert(source.includes('generatedBy: "layout_ai"'));
assert(source.includes("pushWorkspaceHistory(); layoutAiPreviousPlan"), "AI 적용 직전 undo snapshot");
assert(source.includes('openLayoutInfoModal("save", !workspaceActiveLayout?.id)'), "G/H: 승인 버튼이 기존 저장 흐름만 연다");
assert(source.includes("layoutAiPlan && !layoutAiValidation?.valid"), "치명적 검증 오류는 기존 저장 버튼에서도 차단한다");
assert(source.includes("workspaceActiveLayout = null"), "I: 기존 레이아웃 AI 수정은 새 draft로 분리한다");
assert(!source.includes('mode: "layout_ai"'), "명확한 V1 명령은 Edge/LLM 호출 없이 처리한다");
assert(html.includes("floorplanEditor.js?v=layout-ai-v1"));

console.log("floorplan layout AI V1 tests passed");
