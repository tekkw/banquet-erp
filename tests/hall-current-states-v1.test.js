const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8");
const context = {
  window: { BANQUET_ERP_OPERATION_BOARD: { inferLayoutType: (event) => /스쿨/.test(event.layoutEqpText || "") ? "스쿨식" : "" } },
  document: { readyState: "loading", addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  console,
  Date,
  Map,
  Intl,
};
vm.createContext(context);
vm.runInContext(source, context);

const api = context.window.BANQUET_ERP_HALL_STATES;
assert(api, "현재 세팅 helper를 공개해야 한다");
assert.strictEqual(api.setupChangeRequired({ layout_type: "스쿨식", seats: 30 }, { layout_type: "라운드", tables: 7 }), true, "다른 레이아웃은 세팅 변경이 필요하다");
assert.strictEqual(api.setupChangeRequired({ layout_type: "라운드", tables: 7 }, { layout_type: "라운드", tables: 7 }), false, "같은 라운드 테이블 수는 변경이 필요 없다");
assert.strictEqual(api.setupChangeRequired(null, { layout_type: "라운드", tables: 7 }), null, "미확인 상태를 같다고 단정하지 않는다");

const school30 = { id: "school-30", space_id: "burano-1", layout_name: "부라노1 세미나 30석", layout_type: "school", setup_capacity: 30, table_count: 15, updated_at: "2026-10-10" };
const school40 = { id: "school-40", space_id: "burano-1", layout_name: "스쿨 40석", layout_type: "school", setup_capacity: 40, table_count: 20, updated_at: "2026-10-09" };
const round7 = { id: "round-7", space_id: "burano-1", layout_name: "라운드 7T", layout_type: "round", setup_capacity: 70, table_count: 7, updated_at: "2026-10-08" };
assert.strictEqual(api.recommendLayouts({ layout_type: "school", seats: 30, tables: 15 }, [round7, school40, school30])[0].id, "school-30", "형태, 좌석, 테이블이 모두 같은 도면을 우선 추천한다");
assert.strictEqual(api.compareLayouts(school30, { ...school30, id: "same" }), "same");
assert.strictEqual(api.compareLayouts(school30, school40), "minor_change");
assert.strictEqual(api.compareLayouts(school30, round7), "major_change");

const now = new Date("2026-10-10T12:00:00+09:00");
assert.strictEqual(api.needsHallStateConfirmation(null, null, now).needed, true, "상태가 없으면 확인이 필요하다");
assert.strictEqual(api.needsHallStateConfirmation({ source: "event_inherited" }, null, now).needed, true, "행사 승계 상태는 확인이 필요하다");
assert.strictEqual(api.needsHallStateConfirmation({ source: "ai_inferred" }, null, now).needed, true, "AI 추정 상태는 확인이 필요하다");
const confirmed = { source: "manual_confirmed", confirmed_at: "2026-10-09T12:00:00+09:00", source_event_order_id: "event-a" };
assert.strictEqual(api.needsHallStateConfirmation(confirmed, { id: "event-a", end_date: "2026-10-09" }, now).needed, false, "확정 이후 새 행사가 없으면 다시 묻지 않는다");
assert.strictEqual(api.needsHallStateConfirmation(confirmed, { id: "event-b", end_date: "2026-10-10" }, now).needed, true, "확정 이후 새 행사가 종료되면 확인이 필요하다");

const spaces = [{ id: "burano-1", space_name: "부라노1", space_code: "BURANO_1" }, { id: "capri-1", space_name: "카프리1", space_code: "CAPRI_1" }];
const orders = [{ id: "old", venue: "부라노 1", guest_count: 30, end_date: "2026-10-01" }];
const notes = [{ event_order_id: "old", note_type: "layout_eqp", content: "스쿨식 30석" }];
const suggestions = api.buildEventSuggestions(spaces, orders, notes);
assert.strictEqual(suggestions.get("burano-1").source, "event_inherited", "마지막 행사는 미확정 승계 제안이어야 한다");
assert.strictEqual(suggestions.get("burano-1").seats, 30);
assert.strictEqual(suggestions.has("capri-1"), false, "근거가 없는 공간은 미확인으로 남겨야 한다");

const conventionSpaces = [
  { id: "conv-1", space_name: "컨벤션1", space_code: "CONV_1" },
  { id: "conv-2", space_name: "컨벤션2", space_code: "CONV_2" },
  { id: "conv-3", space_name: "컨벤션3", space_code: "CONV_3" },
  { id: "festa", space_name: "페스타", space_code: "FESTA" },
];
const splitConvention = api.normalizeOperationalHallSpaces(conventionSpaces, [{ space_id: "conv-2", venue_name: "컨벤션2", updated_at: "2026-10-09" }], [{ id: "a-event", venue: "컨벤션 A", end_date: "2026-10-09" }], now);
assert.deepStrictEqual(Array.from(splitConvention.spaces.slice(0, 2), (space) => space.space_name), ["컨벤션 A", "컨벤션 B"]);
assert(!splitConvention.spaces.some((space) => /컨벤션[123]$/.test(space.space_name)), "컨벤션1/2/3을 독립 current-state 공간으로 노출하지 않는다");
assert.strictEqual(splitConvention.states[0].space_id, "conv-1", "컨벤션2 상태도 A 대표 키로 정규화한다");
const wholeConvention = api.normalizeOperationalHallSpaces(conventionSpaces, [], [{ id: "ab-event", venue: "컨벤션 AB", end_date: "2026-10-10" }], now);
assert.strictEqual(wholeConvention.spaces[0].space_name, "컨벤션 AB");
assert(!wholeConvention.spaces.some((space) => space.space_name === "컨벤션 A" || space.space_name === "컨벤션 B"), "AB 사용 시 A/B 중복 카드를 만들지 않는다");
assert.strictEqual(api.conventionUnit("컨벤션1"), "A");
assert.strictEqual(api.conventionUnit("컨벤션2"), "A");
assert.strictEqual(api.conventionUnit("컨벤션3"), "B");

const migration = fs.readFileSync("supabase/migrations/20261010120000_add_hall_current_states.sql", "utf8");
assert(migration.includes("unique (space_id)"));
assert(migration.includes("manual_confirmed"));
assert(migration.includes("event_inherited"));
assert(migration.includes("ai_inferred"));

const boardPage = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
assert(boardPage.includes("isHallStateConfirmationRequest"));
assert(boardPage.includes('source: "manual_confirmed"'));
assert(boardPage.includes("data-hall-state-approve"));
assert(boardPage.includes('layoutType === "empty"'));
assert(boardPage.includes("바꿨어"));
assert(boardPage.includes("isHallStateQueryRequest"));
assert(boardPage.includes("현재 도면 보기"));
assert(boardPage.includes("operationalHallMatches"));
assert(boardPage.includes('space_code: `CONV_${unit}`'));

const widget = fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8");
assert(widget.includes("data-hall-unchanged"));
assert(widget.includes("source_event_order_id: sourceEventId"));
assert(widget.includes("다음 행사 전 세팅 변경이 필요합니다."));
assert(widget.includes("data-hall-layout-choice"));
assert(widget.includes("현재 상태와 비슷한 저장 도면 (최대 3개)"));
assert(widget.includes("payload.source_layout_id"));
assert(widget.includes("연결된 도면을 찾을 수 없습니다."));

const floorplanEditor = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
assert(floorplanEditor.includes("openLayoutPreviewById"));
assert(floorplanEditor.includes("showLibraryPreview(layout)"));

console.log("hall-current-states-v1 tests passed");
