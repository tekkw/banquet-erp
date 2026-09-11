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
    { id: "today-board", name: "오늘 운영보드", selector: "#todayOperationBoard", colSpan: 8, rowSpan: 10, minColSpan: 6, minRowSpan: 6 },
    { id: "weekly-setup", name: "다음 세팅 할 일", selector: "#weeklySetupWidget", colSpan: 4, rowSpan: 10, minColSpan: 4, minRowSpan: 5 },
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
  }

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
