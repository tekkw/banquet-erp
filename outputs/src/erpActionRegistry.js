(function (global) {
  "use strict";

  const definitions = [
    ["search_events", "event", "query"], ["query_events", "event", "query"], ["get_event_detail", "event", "query"], ["get_event_guest_count", "event", "query"], ["get_event_schedule", "event", "query"], ["get_event_items", "event", "query"], ["get_event_notes", "event", "query"], ["get_event_layout", "event", "query"], ["get_event_document_section", "event", "query"], ["get_event_requests", "event", "query"], ["get_event_attachments", "event", "query"], ["resolve_next_event", "event", "query"], ["open_event_original", "event", "query"], ["event.query", "eventAnalytics", "query"], ["event.items.query", "eventAnalytics", "query"], ["event.items.aggregate", "eventAnalytics", "query"],
    ["create_event", "event", "mutation", "not_implemented"], ["update_event", "event", "mutation", "not_implemented"],
    ["add_schedule", "schedule", "mutation"], ["update_schedule_time", "schedule", "mutation"], ["update_schedule_content", "schedule", "mutation", "not_implemented"], ["delete_schedule", "schedule", "mutation", "not_implemented"],
    ["search_assets", "asset", "query"], ["get_asset_quantity", "asset", "query"], ["get_asset_location", "asset", "query"], ["get_asset_movement", "asset", "query"], ["create_asset", "asset", "mutation"], ["increase_asset_quantity", "asset", "mutation"], ["decrease_asset_quantity", "asset", "mutation"], ["update_asset_location", "asset", "mutation"],
    ["get_beverage_inventory_status", "inventory", "query"], ["get_beverage_inventory", "inventory", "query"], ["get_asset_status", "asset", "query"],
    ["get_current_setup", "hallState", "query"], ["get_current_setup_state", "hallState", "query"], ["get_next_setup_tasks", "hallState", "query"], ["confirm_current_setup", "hallState", "mutation"], ["record_field_setup", "hallState", "mutation"],
    ["search_layouts", "layout", "query"], ["get_layout_info", "layout", "query"], ["recommend_layouts", "layout", "query"], ["open_layout_preview", "layout", "query", "read_only"], ["link_layout_to_current_state", "layout", "mutation", "read_only"], ["save_layout_draft", "layout", "mutation", "read_only"],
    ["add_manual_task", "board", "mutation"], ["update_manual_task", "board", "mutation", "read_only"], ["complete_manual_task", "board", "mutation", "read_only"], ["delete_manual_task", "board", "mutation", "read_only"],
    ["search_knowledge", "knowledge", "query"], ["propose_add_knowledge", "knowledge", "mutation"], ["propose_update_knowledge", "knowledge", "mutation"], ["propose_disable_knowledge", "knowledge", "mutation"],
    ["get_widget_settings", "dashboard", "query", "read_only"], ["update_widget_visibility", "dashboard", "mutation", "read_only"], ["update_widget_size", "dashboard", "mutation", "read_only"], ["reset_widget_layout", "dashboard", "mutation", "read_only"],
  ];
  const catalog = Object.freeze(Object.fromEntries(definitions.map(([id, domain, type, status = "active"]) => [id, Object.freeze({ id, domain, type, requiresApproval: type === "mutation", status })])));
  const plannerDescriptions = Object.freeze({ query_events: "날짜/기간/행사장으로 행사 목록 조회", get_event_detail: "선택된 행사의 기본 상세", get_event_schedule: "행사 일정과 식사/커피브레이크 조회", get_event_items: "행사 품목과 명시 수량 조회", get_event_notes: "OTHERS, LAY&OUT, event_notes 조회", get_event_attachments: "행사 첨부 목록 조회", get_next_setup_tasks: "persistent 다음 세팅 작업 조회", get_current_setup_state: "현재 홀 세팅 상태 조회", resolve_next_event: "같은 공간의 다음 행사 조회", get_beverage_inventory: "음주류 재고 조회", get_asset_status: "자산 상태 조회", get_layout_info: "행사/저장 레이아웃 정보 조회" });
  function failure(actionId, errorCode, message) { return { ok: false, actionId, errorCode, message }; }
  function normalizeResult(action, value, args) {
    if (value?.ok === false) return { actionId: action.id, ...value };
    if (action.requiresApproval) return { ok: true, actionId: action.id, requiresApproval: true, proposal: value?.proposal ?? value ?? null, uiActions: value?.uiActions || [{ type: "show_proposal", actionId: action.id }] };
    const defaultUiActions = action.id === "open_event_original" ? [{ type: "open_event_original", eventOrderId: args.event?.id || args.eventOrderId || "", storagePath: args.event?.storagePath || args.storagePath || "" }] : action.id === "open_layout_preview" ? [{ type: "open_layout_preview", layoutId: args.layoutId || "" }] : [];
    return { ok: true, actionId: action.id, data: value?.data ?? value ?? null, replyHint: value?.replyHint || "", uiActions: value?.uiActions || defaultUiActions };
  }
  function create(adapters = {}) {
    function getAction(id) { return catalog[id] || null; }
    function listActions() { return Object.values(catalog); }
    function listPlannerActions() { return Object.keys(plannerDescriptions).map((id) => ({ id, description: plannerDescriptions[id], domain: catalog[id].domain })); }
    function getCapabilities() { return listActions().reduce((result, action) => { (result[action.domain] ||= []).push({ id: action.id, type: action.type, requiresApproval: action.requiresApproval, status: action.status }); return result; }, {}); }
    async function executeAction(id, args = {}) {
      const action = getAction(id); if (!action) return failure(id, "unsupported_action", "지원하지 않는 ERP 작업입니다.");
      if (action.status !== "active") return failure(id, action.status, action.status === "read_only" ? "현재는 조회 또는 화면 이동만 지원합니다." : "아직 안전하게 연결되지 않은 작업입니다.");
      const execute = adapters[id]; if (typeof execute !== "function") return failure(id, "not_implemented", "이 화면에는 해당 ERP 작업이 연결되지 않았습니다.");
      try { return normalizeResult(action, await execute(args), args); } catch (error) { return failure(id, "execution_failed", error instanceof Error ? error.message : "ERP 작업 실행에 실패했습니다."); }
    }
    return Object.freeze({ getAction, listActions, listPlannerActions, getCapabilities, executeAction });
  }
  global.ERP_ACTION_REGISTRY = catalog;
  global.erpActionRegistry = Object.freeze({ create, getAction: (id) => catalog[id] || null, listActions: () => Object.values(catalog), listPlannerActions: () => Object.keys(plannerDescriptions).map((id) => ({ id, description: plannerDescriptions[id], domain: catalog[id].domain })) });
})(window);
