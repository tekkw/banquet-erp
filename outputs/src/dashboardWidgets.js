(function registerDashboardWidgets() {
  const STORAGE_KEY = "banquet-erp-dashboard-layout-v1";
  const GRID_COLUMNS = 12;
  const MAX_ROW_SPAN = 12;
  const LEGACY_PRESETS = {
    small: { colSpan: 4, rowSpan: 4 },
    medium: { colSpan: 6, rowSpan: 6 },
    large: { colSpan: 12, rowSpan: 9 },
  };
  const definitions = [
    { id: "today-board", name: "운영보드", selector: "#todayOperationBoard", colSpan: 8, rowSpan: 10, minColSpan: 6, minRowSpan: 6 },
    { id: "weekly-setup", name: "다음 세팅 할 일", selector: "#weeklySetupWidget", colSpan: 4, rowSpan: 10, minColSpan: 4, minRowSpan: 5 },
    { id: "hall-current-states", name: "현재 세팅 상태", selector: "#hallCurrentStatesWidget", colSpan: 4, rowSpan: 8, minColSpan: 4, minRowSpan: 5 },
    { id: "operations-status", name: "운영 현황", selector: ".operations-status-grid", colSpan: 6, rowSpan: 5, minColSpan: 4, minRowSpan: 5 },
    { id: "mini-calendar", name: "미니 캘린더", selector: ".dashboard-month-card", colSpan: 6, rowSpan: 6, minColSpan: 4, minRowSpan: 5 },
    { id: "today-operations", name: "오늘 운영 일정", selector: ".today-operations-card", colSpan: 8, rowSpan: 5, minColSpan: 5, minRowSpan: 5 },
    { id: "quick", name: "빠른 메뉴", selector: ".dashboard-widget-grid", colSpan: 4, rowSpan: 4, minColSpan: 3, minRowSpan: 3 },
    { id: "ai-assistant", name: "AI 비서", selector: ".dashboard-ai-widget", colSpan: 4, rowSpan: 6, minColSpan: 4, minRowSpan: 5 },
  ];

  let grid;
  let editor;
  let addPanel;
  let editing = false;
  let draft;
  let beforeEdit;
  let pointerDragId = "";
  let pointerDragTargetId = "";
  let resizeState = null;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const definitionFor = (id) => definitions.find((item) => item.id === id);
  const clamp = (value, minimum, maximum, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? parsed : fallback));
  };
  const defaults = () => definitions.map((item) => ({
    id: item.id,
    visible: true,
    colSpan: item.colSpan,
    rowSpan: item.rowSpan,
  }));

  function normalize(value) {
    const input = Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string") : [];
    const byId = new Map(input.map((item) => [item.id, item]));
    const savedIds = [...new Set(input.map((item) => item.id).filter((id) => definitionFor(id)))];
    const orderedIds = [...savedIds, ...definitions.map((item) => item.id).filter((id) => !byId.has(id))];
    return orderedIds.map((id) => normalizeItem(byId.get(id), definitionFor(id)));
  }

  function normalizeItem(saved, definition) {
    const legacy = LEGACY_PRESETS[saved?.size] || {};
    return {
      id: definition.id,
      visible: saved?.visible !== false,
      colSpan: clamp(saved?.colSpan ?? legacy.colSpan, definition.minColSpan, GRID_COLUMNS, definition.colSpan),
      rowSpan: clamp(saved?.rowSpan ?? legacy.rowSpan, definition.minRowSpan, MAX_ROW_SPAN, definition.rowSpan),
    };
  }

  function load() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch {
      return defaults();
    }
  }

  function init() {
    const home = document.getElementById("homeSection");
    if (!home || home.querySelector(".dashboard-widget-layout")) return;
    decorateChrome();
    ensureQuickActions(home);
    setupDashboardAiOverlay(home);
    ensureHallCurrentStatesWidget(home);
    const header = document.createElement("header");
    header.className = "dashboard-home-header";
    header.innerHTML = `<div><span class="dashboard-today">${new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date())}</span><small>연회 운영 대시보드</small></div><div class="dashboard-edit-actions"><button class="secondary-button" type="button" data-dashboard-edit>대시보드 편집</button><button class="secondary-button" type="button" data-widget-add hidden>+ 위젯 추가</button><button class="secondary-button" type="button" data-widget-reset hidden>기본 배치로 초기화</button><button class="secondary-button" type="button" data-widget-cancel hidden>취소</button><button class="primary-button" type="button" data-widget-save hidden>저장</button></div>`;
    grid = document.createElement("div");
    grid.className = "dashboard-widget-layout";
    definitions.forEach((definition) => {
      const content = home.querySelector(definition.selector);
      if (!content) return;
      const shell = document.createElement("section");
      shell.className = "dashboard-widget-shell";
      shell.dataset.widgetId = definition.id;
      shell.innerHTML = `<div class="widget-edit-bar"><span class="widget-drag-handle" role="button" tabindex="0" aria-label="${definition.name} 이동" title="드래그하여 이동">⋮⋮</span><strong>${definition.name}</strong><div class="widget-dimension-control" aria-label="${definition.name} 가로 크기"><span data-widget-col-label>W</span><button type="button" data-widget-col-delta="-1" aria-label="가로 줄이기">−</button><button type="button" data-widget-col-delta="1" aria-label="가로 늘리기">+</button></div><div class="widget-dimension-control" aria-label="${definition.name} 세로 크기"><span data-widget-row-label>H</span><button type="button" data-widget-row-delta="-1" aria-label="세로 줄이기">−</button><button type="button" data-widget-row-delta="1" aria-label="세로 늘리기">+</button></div><button type="button" data-widget-hide>숨기기</button></div><button class="widget-resize-handle" type="button" aria-label="${definition.name} 크기 조절" title="드래그하여 크기 조절"></button>`;
      content.parentNode.insertBefore(shell, content);
      shell.append(content);
      grid.append(shell);
    });
    home.prepend(header);
    header.after(grid);
    editor = header;
    addPanel = document.createElement("div");
    addPanel.className = "widget-add-panel";
    addPanel.hidden = true;
    header.after(addPanel);
    draft = load();
    apply(draft);
    bind();
    initHallCurrentStatesWidget();
  }

  const hallState = { spaces: [], rows: [], suggestions: new Map(), dialog: null };
  const hallConfig = () => window.BANQUET_ERP_CONSTANTS?.supabaseConfig;
  const hallEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const nullableInteger = (value) => value === "" || value == null ? null : Number.parseInt(value, 10);
  const normalizeLayout = (value) => String(value || "").toLowerCase().replace(/\s+/g, "").replace(/school|스쿨형/g, "스쿨식").replace(/round|원형/g, "라운드");
  const normalizeVenue = (value) => String(value || "").toUpperCase().replace(/\s+/g, "").replace(/CONVENTION/g, "컨벤션").replace(/BURANO/g, "부라노").replace(/CAPRI/g, "카프리").replace(/FESTA/g, "페스타");

  function setupChangeRequired(current, next) {
    if (!current || !next) return null;
    const currentLayout = normalizeLayout(current.layoutType || current.layout_type);
    const nextLayout = normalizeLayout(next.layoutType || next.layout_type);
    if (!currentLayout || !nextLayout) return null;
    if (currentLayout !== nextLayout) return true;
    const currentTables = nullableInteger(current.tables ?? current.table_count);
    const nextTables = nullableInteger(next.tables ?? next.table_count);
    if (currentTables != null || nextTables != null) return currentTables == null || nextTables == null ? null : currentTables !== nextTables;
    const currentSeats = nullableInteger(current.seats ?? current.setup_capacity);
    const nextSeats = nullableInteger(next.seats ?? next.setup_capacity);
    return currentSeats == null || nextSeats == null ? null : currentSeats !== nextSeats;
  }

  async function hallRequest(path, options = {}) {
    const config = hallConfig();
    if (!config?.url || !config?.anonKey) throw new Error("Supabase 설정을 확인해주세요.");
    const response = await fetch(`${config.url}/rest/v1/${path}`, { ...options, headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const text = await response.text();
    if (!response.ok) { const error = new Error(`Supabase ${response.status}`); error.status = response.status; error.body = text; throw error; }
    return text ? JSON.parse(text) : null;
  }

  function ensureHallCurrentStatesWidget(home) {
    if (home.querySelector("#hallCurrentStatesWidget")) return;
    const section = document.createElement("section");
    section.id = "hallCurrentStatesWidget";
    section.className = "hall-current-states-widget";
    section.innerHTML = `<header><div><span class="hall-state-eyebrow">LIVE SETUP</span><h3>현재 세팅 상태</h3></div><button type="button" class="secondary-button" data-hall-refresh aria-label="현재 세팅 상태 새로고침">새로고침</button></header><p class="hall-state-help">마지막 확인 상태는 행사 종료 후에도 유지됩니다.</p><div class="hall-state-list" data-hall-state-list><p class="hall-state-loading">공간 상태를 불러오는 중…</p></div>`;
    home.append(section);
  }

  function inferredLayout(event, notes) {
    const text = `${event.venue || ""}\n${notes || ""}`;
    const board = window.BANQUET_ERP_OPERATION_BOARD;
    const layoutType = board?.inferLayoutType?.({ ...event, layoutEqpText: notes }) || ([/스쿨|school/i, /라운드|round|원형/i, /극장|theater/i, /u[- ]?shape|u자/i].map((regex, index) => regex.test(text) ? ["스쿨식", "라운드", "극장식", "U자"][index] : "").find(Boolean) || "");
    const tableMatch = text.match(/(\d+)\s*(?:T|테이블)/i);
    return { layout_type: layoutType || null, seats: Number(event.guest_count) || null, tables: tableMatch ? Number(tableMatch[1]) : null };
  }

  function buildEventSuggestions(spaces, orders, notes) {
    const noteByEvent = notes.reduce((map, row) => { if (row.note_type === "layout_eqp") map[row.event_order_id] = `${map[row.event_order_id] || ""}\n${row.content || ""}`; return map; }, {});
    const ended = orders.filter((row) => row.end_date && row.end_date < new Date().toISOString().slice(0, 10)).sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)));
    const suggestions = new Map();
    for (const space of spaces) {
      const key = normalizeVenue(space.space_name);
      const event = ended.find((row) => normalizeVenue(row.venue).includes(key));
      if (!event) continue;
      suggestions.set(space.id, { id: null, space_id: space.id, space_key: space.space_code, venue_name: space.space_name, source: "event_inherited", source_event_order_id: event.id, confidence: 0.55, confirmed_at: null, updated_at: event.end_date, ...inferredLayout(event, noteByEvent[event.id]) });
    }
    return suggestions;
  }

  function formatSetup(row) {
    if (!row) return "상태 미확인";
    const details = [row.layout_type, row.tables != null ? `${row.tables}T` : "", row.seats != null ? `${row.seats}석` : ""].filter(Boolean);
    return details.length ? details.join(" · ") : "세팅 상세 미입력";
  }

  function relativeConfirmed(row) {
    if (!row?.confirmed_at) return "";
    const days = Math.max(0, Math.floor((Date.now() - new Date(row.confirmed_at).getTime()) / 86400000));
    if (days === 0) return "오늘 확인";
    if (days < 7) return `${days}일 전 확인`;
    return `마지막 확인 ${new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(new Date(row.confirmed_at))}`;
  }

  function renderHallStates() {
    const list = document.querySelector("[data-hall-state-list]");
    if (!list) return;
    const bySpace = new Map(hallState.rows.map((row) => [row.space_id, row]));
    list.innerHTML = hallState.spaces.map((space) => {
      const saved = bySpace.get(space.id);
      const row = saved || hallState.suggestions.get(space.id) || null;
      const source = saved?.source || row?.source || "unknown";
      const label = source === "manual_confirmed" ? "확인됨" : source === "event_inherited" ? "이전 행사 기준" : source === "ai_inferred" ? "AI 추정 · 미확인" : "미확인";
      const date = source === "manual_confirmed" ? relativeConfirmed(row) : "";
      return `<button type="button" class="hall-state-row" data-hall-space-id="${space.id}"><span><strong>${hallEscape(space.space_name)}</strong><small>${hallEscape(space.floor || "")}</small></span><span class="hall-state-setup">${hallEscape(formatSetup(row))}</span><span class="hall-state-source" data-source="${source}">${label}${date ? `<small>${hallEscape(date)}</small>` : ""}</span><span class="hall-state-edit">수정</span></button>`;
    }).join("") || `<p class="hall-state-loading">등록된 연회장 공간이 없습니다.</p>`;
  }

  async function loadHallStates() {
    const list = document.querySelector("[data-hall-state-list]");
    if (list) list.innerHTML = `<p class="hall-state-loading">공간 상태를 불러오는 중…</p>`;
    try {
      const [spaces, rows, orders, notes] = await Promise.all([
        hallRequest("venue_spaces?select=id,space_name,space_code,floor&is_active=eq.true&order=space_name.asc"),
        hallRequest("hall_current_states?select=*&order=venue_name.asc"),
        hallRequest("event_orders?select=id,event_name,venue,guest_count,start_date,end_date&end_date=not.is.null&order=end_date.desc&limit=200"),
        hallRequest("event_notes?select=event_order_id,note_type,content&note_type=eq.layout_eqp&limit=1000"),
      ]);
      hallState.spaces = spaces || []; hallState.rows = rows || []; hallState.suggestions = buildEventSuggestions(hallState.spaces, orders || [], notes || []); renderHallStates();
    } catch (error) {
      console.error("hall current states load failed", { status: error.status, body: error.body, error });
      if (list) list.innerHTML = `<p class="hall-state-error">현재 세팅 상태를 불러오지 못했습니다. ${hallEscape(error.message)}</p>`;
    }
  }

  function ensureHallDialog() {
    if (hallState.dialog) return hallState.dialog;
    const dialog = document.createElement("dialog"); dialog.className = "hall-state-dialog";
    dialog.innerHTML = `<form method="dialog" data-hall-state-form><header><div><span class="hall-state-eyebrow">CURRENT SETUP</span><h3 data-hall-dialog-title>현재 세팅 수정</h3></div><button type="button" class="secondary-button" data-hall-close>닫기</button></header><input type="hidden" name="spaceId"><label>레이아웃 타입<input name="layoutType" list="hallLayoutTypes" placeholder="예: 스쿨식"></label><datalist id="hallLayoutTypes"><option value="스쿨식"><option value="라운드"><option value="극장식"><option value="U자"></datalist><div class="hall-state-form-grid"><label>좌석수<input name="seats" type="number" min="0" inputmode="numeric"></label><label>테이블수<input name="tables" type="number" min="0" inputmode="numeric"></label></div><label>장비 메모<input name="equipment" placeholder="예: 빔프로젝터, 무선마이크 2"></label><label>비고<textarea name="note" rows="3"></textarea></label><p class="hall-state-dialog-hint" data-hall-dialog-hint></p><footer><button type="button" class="secondary-button" data-hall-close>취소</button><button type="submit" class="primary-button">현재 상태 확인 저장</button></footer></form>`;
    document.body.append(dialog); hallState.dialog = dialog;
    dialog.querySelectorAll("[data-hall-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.querySelector("[data-hall-state-form]").addEventListener("submit", saveHallState);
    return dialog;
  }

  function openHallDialog(spaceId) {
    const dialog = ensureHallDialog(); const form = dialog.querySelector("form");
    const space = hallState.spaces.find((item) => item.id === spaceId); const saved = hallState.rows.find((item) => item.space_id === spaceId); const row = saved || hallState.suggestions.get(spaceId) || {};
    form.elements.spaceId.value = spaceId; form.elements.layoutType.value = row.layout_type || ""; form.elements.seats.value = row.seats ?? ""; form.elements.tables.value = row.tables ?? ""; form.elements.equipment.value = typeof row.equipment === "string" ? row.equipment : row.equipment?.text || ""; form.elements.note.value = row.note || "";
    dialog.querySelector("[data-hall-dialog-title]").textContent = `${space?.space_name || "연회장"} 현재 세팅`;
    dialog.querySelector("[data-hall-dialog-hint]").textContent = !saved && row.source === "event_inherited" ? "마지막 종료 행사 정보를 참고값으로 채웠습니다. 저장할 때만 사용자 확인 상태가 됩니다." : "저장하면 사용자 확인 상태로 기록됩니다.";
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }

  async function saveHallState(event) {
    event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]'); const space = hallState.spaces.find((item) => item.id === form.elements.spaceId.value);
    if (!space) return;
    const user = (() => { try { return JSON.parse(localStorage.getItem(window.BANQUET_ERP_CONSTANTS?.authStorageKey) || "null"); } catch { return null; } })();
    const payload = { space_id: space.id, space_key: space.space_code || null, venue_name: space.space_name, layout_type: form.elements.layoutType.value.trim() || null, seats: nullableInteger(form.elements.seats.value), tables: nullableInteger(form.elements.tables.value), equipment: form.elements.equipment.value.trim() ? { text: form.elements.equipment.value.trim() } : {}, note: form.elements.note.value.trim() || null, source: "manual_confirmed", source_event_order_id: null, source_layout_id: null, confidence: 1, confirmed_at: new Date().toISOString(), confirmed_by: user?.label || user?.id || "ERP 사용자", updated_at: new Date().toISOString() };
    submit.disabled = true; submit.textContent = "저장 중…";
    try { await hallRequest("hall_current_states?on_conflict=space_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) }); hallState.dialog.close(); await loadHallStates(); }
    catch (error) { console.error("hall current state save failed", { status: error.status, body: error.body, error }); dialogAlert(form, `현재 상태 저장 실패 (${hallEscape(error.message)})`); }
    finally { submit.disabled = false; submit.textContent = "현재 상태 확인 저장"; }
  }

  function dialogAlert(form, message) { const hint = form.querySelector("[data-hall-dialog-hint]"); hint.textContent = message; hint.classList.add("is-error"); }

  function initHallCurrentStatesWidget() {
    const widget = document.querySelector("#hallCurrentStatesWidget"); if (!widget) return;
    widget.addEventListener("click", (event) => { const row = event.target.closest("[data-hall-space-id]"); if (row) openHallDialog(row.dataset.hallSpaceId); });
    widget.querySelector("[data-hall-refresh]")?.addEventListener("click", loadHallStates);
    loadHallStates();
  }

  window.BANQUET_ERP_HALL_STATES = { setupChangeRequired, normalizeLayout, buildEventSuggestions };

  function setupDashboardAiOverlay(home) {
    const widget = home.querySelector(".dashboard-ai-widget");
    const expandButton = widget?.querySelector("[data-ai-fullscreen]");
    const widgetHeader = widget?.querySelector(".ai-chat-header");
    if (!widget || !expandButton || !widgetHeader) return;

    expandButton.textContent = "⛶ 펼치기";
    expandButton.setAttribute("aria-haspopup", "dialog");
    widgetHeader.append(expandButton);

    const dialog = document.createElement("dialog");
    dialog.className = "ai-widget-modal";
    dialog.setAttribute("aria-labelledby", "aiWidgetModalTitle");
    dialog.innerHTML = `<header class="ai-widget-modal-header"><h2 id="aiWidgetModalTitle">AI 비서</h2><div><button class="secondary-button" type="button" data-ai-page-link>전체 AI 비서 페이지로 이동</button><button class="secondary-button ai-widget-modal-close" type="button" data-ai-modal-close aria-label="AI 비서 확대창 닫기">닫기 ×</button></div></header><div class="ai-widget-modal-body"></div>`;
    document.body.append(dialog);

    const modalBody = dialog.querySelector(".ai-widget-modal-body");
    let placeholder = null;

    const restoreWidget = () => {
      if (!placeholder?.isConnected) return;
      widget.classList.remove("is-expanded");
      placeholder.replaceWith(widget);
      placeholder = null;
    };

    const closeOverlay = () => {
      restoreWidget();
      if (dialog.open) dialog.close();
      expandButton.focus();
    };

    expandButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (dialog.open) return;
      placeholder = document.createComment("dashboard-ai-widget-position");
      widget.before(placeholder);
      modalBody.append(widget);
      widget.classList.add("is-expanded");
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      requestAnimationFrame(() => widget.querySelector("#chatInput")?.focus());
    });

    dialog.querySelector("[data-ai-modal-close]").addEventListener("click", closeOverlay);
    dialog.querySelector("[data-ai-page-link]").addEventListener("click", () => {
      closeOverlay();
      document.querySelector('.sidebar-nav-item[data-dashboard-target="ai"]')?.click();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeOverlay();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeOverlay();
    });
  }

  function decorateChrome() {
    const topbar = document.querySelector(".hotel-topbar");
    const title = topbar?.querySelector(".brand-title");
    if (title) title.textContent = "연회 운영 대시보드";
    const actions = topbar?.querySelector(".topbar-actions");
    if (actions && !actions.querySelector(".hero-date")) {
      const date = document.createElement("time");
      date.className = "hero-date";
      date.dateTime = new Date().toISOString().slice(0, 10);
      date.textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
      actions.prepend(date);
    }
    const icons = {
      home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
      calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
      assets: '<path d="M21 8a2 2 0 0 0-2-2h-5l-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z"/>',
      layouts: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>',
      ai: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/>',
    };
    document.querySelectorAll(".sidebar-nav-item[data-dashboard-target]").forEach((button) => {
      if (button.querySelector(".sidebar-nav-icon")) return;
      const icon = document.createElement("span");
      icon.className = "sidebar-nav-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = `<svg viewBox="0 0 24 24">${icons[button.dataset.dashboardTarget] || icons.home}</svg>`;
      button.prepend(icon);
    });
  }

  function applyItem(item) {
    const shell = grid.querySelector(`[data-widget-id="${item.id}"]`);
    if (!shell) return;
    shell.style.setProperty("--col-span", item.colSpan);
    shell.style.setProperty("--row-span", item.rowSpan);
    shell.dataset.colSpan = item.colSpan;
    shell.dataset.rowSpan = item.rowSpan;
    shell.dataset.widgetCompact = item.colSpan <= 4 && item.rowSpan <= 4;
    shell.hidden = !item.visible;
    shell.querySelector("[data-widget-col-label]").textContent = `W ${item.colSpan}/12`;
    shell.querySelector("[data-widget-row-label]").textContent = `H ${item.rowSpan}`;
    const definition = definitionFor(item.id);
    shell.querySelector('[data-widget-col-delta="-1"]').disabled = item.colSpan <= definition.minColSpan;
    shell.querySelector('[data-widget-col-delta="1"]').disabled = item.colSpan >= GRID_COLUMNS;
    shell.querySelector('[data-widget-row-delta="-1"]').disabled = item.rowSpan <= definition.minRowSpan;
    shell.querySelector('[data-widget-row-delta="1"]').disabled = item.rowSpan >= MAX_ROW_SPAN;
  }

  function apply(layout) {
    layout.forEach((item) => {
      applyItem(item);
      const shell = grid.querySelector(`[data-widget-id="${item.id}"]`);
      if (shell) grid.append(shell);
    });
    renderAddPanel();
  }

  function resizeLayout(layout, id, changes) {
    const next = clone(layout);
    const item = next.find((entry) => entry.id === id);
    const definition = definitionFor(id);
    if (!item || !definition) return next;
    if (changes.colSpan != null) item.colSpan = clamp(changes.colSpan, definition.minColSpan, GRID_COLUMNS, item.colSpan);
    if (changes.rowSpan != null) item.rowSpan = clamp(changes.rowSpan, definition.minRowSpan, MAX_ROW_SPAN, item.rowSpan);
    return next;
  }

  function resizeBy(id, changes) {
    draft = resizeLayout(draft, id, changes);
    applyItem(draft.find((item) => item.id === id));
  }

  function bind() {
    editor.querySelector("[data-dashboard-edit]").onclick = () => setEditing(true);
    editor.querySelector("[data-widget-add]").onclick = () => { addPanel.hidden = !addPanel.hidden; renderAddPanel(); };
    editor.querySelector("[data-widget-cancel]").onclick = () => { draft = clone(beforeEdit); apply(draft); setEditing(false); };
    editor.querySelector("[data-widget-save]").onclick = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); setEditing(false); };
    editor.querySelector("[data-widget-reset]").onclick = () => { draft = defaults(); apply(draft); };
    grid.addEventListener("click", handleGridClick);
    grid.addEventListener("keydown", handleGridKeydown);
    grid.addEventListener("dragstart", handleDragStart);
    grid.addEventListener("dragover", handleDragOver);
    grid.addEventListener("drop", handleDrop);
    grid.addEventListener("dragend", clearDragFeedback);
    grid.addEventListener("pointerdown", handlePointerDown);
    grid.addEventListener("pointermove", handlePointerDragMove);
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", finishPointerInteraction);
    window.addEventListener("pointercancel", cancelPointerInteraction);
  }

  function handleGridClick(event) {
    const shell = event.target.closest("[data-widget-id]");
    if (!shell || !editing) return;
    const item = draft.find((entry) => entry.id === shell.dataset.widgetId);
    if (event.target.matches("[data-widget-hide]")) {
      item.visible = false;
      apply(draft);
      return;
    }
    const colButton = event.target.closest("[data-widget-col-delta]");
    const rowButton = event.target.closest("[data-widget-row-delta]");
    if (colButton) resizeBy(item.id, { colSpan: item.colSpan + Number(colButton.dataset.widgetColDelta) });
    if (rowButton) resizeBy(item.id, { rowSpan: item.rowSpan + Number(rowButton.dataset.widgetRowDelta) });
  }

  function handleGridKeydown(event) {
    if (!editing || !event.target.matches(".widget-drag-handle") || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const id = event.target.closest("[data-widget-id]").dataset.widgetId;
    const index = draft.findIndex((item) => item.id === id);
    const target = draft[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (!target) return;
    reorder(id, target.id);
    grid.querySelector(`[data-widget-id="${id}"] .widget-drag-handle`)?.focus();
  }

  function handleDragStart(event) {
    if (!editing || !event.target.matches(".widget-drag-handle")) return event.preventDefault();
    clearPointerDrag();
    clearDragFeedback();
    event.target.closest("[data-widget-id]").classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", event.target.closest("[data-widget-id]").dataset.widgetId);
  }

  function handleDragOver(event) {
    if (!editing) return;
    event.preventDefault();
    markDropTarget(event.target.closest("[data-widget-id]"));
  }

  function handleDrop(event) {
    if (!editing) return;
    event.preventDefault();
    reorder(event.dataTransfer.getData("text/plain"), event.target.closest("[data-widget-id]")?.dataset.widgetId);
    clearDragFeedback();
  }

  function handlePointerDown(event) {
    if (!editing) return;
    if (event.target.matches(".widget-resize-handle")) {
      startResize(event);
      return;
    }
    if (event.target.matches(".widget-drag-handle")) {
      pointerDragId = event.target.closest("[data-widget-id]").dataset.widgetId;
      pointerDragTargetId = pointerDragId;
      clearDragFeedback();
      event.target.closest("[data-widget-id]").classList.add("is-dragging");
    }
  }

  function handlePointerDragMove(event) {
    if (!pointerDragId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-widget-id]");
    if (target) {
      pointerDragTargetId = target.dataset.widgetId;
      markDropTarget(target);
    }
  }

  function startResize(event) {
    event.preventDefault();
    event.stopPropagation();
    const shell = event.target.closest("[data-widget-id]");
    const item = draft.find((entry) => entry.id === shell.dataset.widgetId);
    const styles = getComputedStyle(grid);
    const gapX = Number.parseFloat(styles.columnGap) || 0;
    const gapY = Number.parseFloat(styles.rowGap) || 0;
    const columnWidth = (grid.getBoundingClientRect().width - gapX * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    const rowHeight = Number.parseFloat(styles.gridAutoRows) || 48;
    resizeState = {
      id: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startColSpan: item.colSpan,
      startRowSpan: item.rowSpan,
      columnStep: columnWidth + gapX,
      rowStep: rowHeight + gapY,
    };
    shell.classList.add("is-resizing");
    event.target.setPointerCapture?.(event.pointerId);
  }

  function handleResizeMove(event) {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    event.preventDefault();
    resizeBy(resizeState.id, {
      colSpan: resizeState.startColSpan + Math.round((event.clientX - resizeState.startX) / resizeState.columnStep),
      rowSpan: resizeState.startRowSpan + Math.round((event.clientY - resizeState.startY) / resizeState.rowStep),
    });
  }

  function finishPointerInteraction(event) {
    if (resizeState && event.pointerId === resizeState.pointerId) finishResize();
    finishPointerDrag();
  }

  function cancelPointerInteraction(event) {
    if (resizeState && event.pointerId === resizeState.pointerId) {
      resizeBy(resizeState.id, { colSpan: resizeState.startColSpan, rowSpan: resizeState.startRowSpan });
      finishResize();
    }
    clearPointerDrag();
    clearDragFeedback();
  }

  function finishResize() {
    grid.querySelector(".is-resizing")?.classList.remove("is-resizing");
    resizeState = null;
  }

  function ensureQuickActions(home) {
    const quickGrid = home.querySelector(".dashboard-widget-grid");
    if (!quickGrid || quickGrid.querySelector('[data-quick-action="layouts"]')) return;
    const button = document.createElement("button");
    button.className = "dashboard-widget";
    button.type = "button";
    button.dataset.quickAction = "layouts";
    button.innerHTML = '<span class="widget-icon" aria-hidden="true"><svg class="lucide-icon" viewBox="0 0 24 24"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/></svg><span class="widget-code">LAY</span></span><strong>공간·레이아웃</strong><small>연회장 공간과 도면을 관리하세요.</small>';
    button.onclick = () => document.querySelector('.sidebar-nav-item[data-dashboard-target="layouts"]')?.click();
    quickGrid.append(button);
  }

  function clearDragFeedback() {
    grid?.querySelectorAll(".is-dragging,.is-drop-target").forEach((shell) => shell.classList.remove("is-dragging", "is-drop-target"));
  }

  function markDropTarget(shell) {
    grid?.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    if (shell && !shell.classList.contains("is-dragging")) shell.classList.add("is-drop-target");
  }

  function clearPointerDrag() {
    pointerDragId = "";
    pointerDragTargetId = "";
  }

  function finishPointerDrag() {
    if (pointerDragId) reorder(pointerDragId, pointerDragTargetId);
    clearPointerDrag();
    clearDragFeedback();
  }

  function reorderLayout(layout, sourceId, targetId) {
    const next = clone(layout);
    if (!sourceId || !targetId || sourceId === targetId) return next;
    const sourceIndex = next.findIndex((item) => item.id === sourceId);
    const targetIndex = next.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return next;
    const [source] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    return next;
  }

  function reorder(sourceId, targetId) {
    draft = reorderLayout(draft, sourceId, targetId);
    apply(draft);
  }

  function setEditing(value) {
    editing = value;
    if (value) beforeEdit = clone(draft);
    document.getElementById("homeSection").classList.toggle("dashboard-editing", value);
    editor.querySelector("[data-dashboard-edit]").hidden = value;
    editor.querySelectorAll("[data-widget-add],[data-widget-reset],[data-widget-cancel],[data-widget-save]").forEach((button) => { button.hidden = !value; });
    grid.querySelectorAll(".widget-drag-handle").forEach((handle) => { handle.draggable = value; });
    if (!value) {
      addPanel.hidden = true;
      finishResize();
      clearPointerDrag();
      clearDragFeedback();
    }
  }

  function renderAddPanel() {
    if (!addPanel) return;
    const hidden = draft.filter((item) => !item.visible);
    addPanel.innerHTML = hidden.length
      ? hidden.map((item) => `<button type="button" data-add-widget="${item.id}">+ ${definitionFor(item.id).name}</button>`).join("")
      : "<span>숨겨진 위젯이 없습니다.</span>";
    addPanel.querySelectorAll("[data-add-widget]").forEach((button) => {
      button.onclick = () => {
        draft.find((item) => item.id === button.dataset.addWidget).visible = true;
        apply(draft);
      };
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.BANQUET_ERP_DASHBOARD_WIDGETS = { init, defaults, normalize, reorderLayout, resizeLayout };
})();
