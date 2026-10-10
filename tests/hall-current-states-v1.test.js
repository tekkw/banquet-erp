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

const widget = fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8");
assert(widget.includes("data-hall-unchanged"));
assert(widget.includes("source_event_order_id: sourceEventId"));
assert(widget.includes("다음 행사 전 세팅 변경이 필요합니다."));

console.log("hall-current-states-v1 tests passed");
