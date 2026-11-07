const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/dashboardMemos.js", "utf8");
const css = fs.readFileSync("outputs/src/styles/dashboardMemos.css", "utf8");
const index = fs.readFileSync("outputs/index.html", "utf8");
const context = { window: {}, document: { readyState: "loading", addEventListener() {} }, console, setTimeout, clearTimeout };
context.window.window = context.window;
vm.createContext(context); vm.runInContext(source, context);
const api = context.window.BANQUET_ERP_DASHBOARD_MEMOS;

const normalized = api.normalizeMemoMetadata({ keep: "value", text: "확인", xRatio: 2, yRatio: -1, width: 40, height: 20, color: "bad", zIndex: 0 });
assert.strictEqual(normalized.keep, "value", "기존 metadata를 보존한다");
assert.deepStrictEqual(JSON.parse(JSON.stringify({ x: normalized.xRatio, y: normalized.yRatio, width: normalized.width, height: normalized.height, color: normalized.color })), { x: 1, y: 0, width: 180, height: 100, color: "yellow" });

const position = api.memoPosition({ xRatio: .5, yRatio: .5, width: 240, height: 150 }, { width: 1000, height: 600 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(position)), { width: 240, height: 150, left: 380, top: 225 });
const ratios = api.memoRatios(position.left, position.top, position.width, position.height, { width: 1000, height: 600 });
assert.strictEqual(ratios.xRatio, .5); assert.strictEqual(ratios.yRatio, .5);
const clamped = api.memoPosition({ xRatio: 1, yRatio: 1, width: 1200, height: 900 }, { width: 800, height: 500 });
assert.strictEqual(clamped.left, 0); assert.strictEqual(clamped.top, 0); assert.strictEqual(clamped.width, 800); assert.strictEqual(clamped.height, 500);

assert.deepStrictEqual(Object.keys(api.COLORS), ["yellow", "blue", "mint", "pink", "gray"]);
assert(source.includes('item_kind: "manual"') && source.includes('recordType: RECORD_TYPE') && source.includes('source: SOURCE'), "operation_board_items metadata contract");
assert(source.includes("SAVE_DELAY_MS = 500") && source.includes("scheduleSave(row)"), "500ms debounce autosave");
assert(source.includes("data-memo-collapse") && source.includes("metadata.collapsed = true"), "X는 삭제가 아니라 숨김");
assert(source.includes('method: "DELETE"') && source.includes("window.confirm"), "명시적 목록 삭제만 DB row 제거");
assert(source.includes("pointermove") && source.includes('mode === "move"') && source.includes("MIN_WIDTH") && source.includes("MIN_HEIGHT"), "자유 drag/resize와 최소 크기");
assert(source.includes("zIndex") && source.includes("bringFront"), "클릭한 메모 z-order 승격");
assert(css.includes("z-index: 18") && css.includes("pointer-events: none") && css.includes("pointer-events: auto"), "별도 overlay layer이며 modal보다 낮다");
assert(css.includes("max-width: 768px") && css.includes("display: none !important"), "모바일 V1 제외");
assert(index.includes('dashboardMemos.js?v=dashboard-postit-v1'), "PC ERP entrypoint wiring");
assert(index.includes('dashboardWidgets.js?v=dashboard-calendar-bars-v4'), "기존 dashboard widget module 유지");

console.log("dashboard memos V1 tests passed");
