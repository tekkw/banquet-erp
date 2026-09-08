(function registerDashboardWidgets() {
  const STORAGE_KEY = "banquet-erp-dashboard-layout-v1";
  const definitions = [
    { id: "quick", name: "빠른 메뉴", size: "small", selector: ".dashboard-widget-grid" },
    { id: "today-operations", name: "오늘 운영 일정", size: "medium", selector: ".today-operations-card" },
    { id: "mini-calendar", name: "미니 캘린더", size: "medium", selector: ".dashboard-month-card" },
    { id: "operations-status", name: "운영 현황", size: "medium", selector: ".operations-status-grid" },
    { id: "today-board", name: "오늘 운영보드", size: "large", selector: "#todayOperationBoard" },
    { id: "weekly-setup", name: "이번 주 세팅 할 일", size: "medium", selector: "#weeklySetupWidget" },
  ];
  let grid; let editor; let addPanel; let editing = false; let draft; let beforeEdit; let pointerDragId = ""; let pointerDragTargetId = "";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const defaults = () => definitions.map((item) => ({ id: item.id, visible: true, size: item.size }));
  function load() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); return normalize(saved); } catch { return defaults(); } }
  function normalize(value) { const input = Array.isArray(value) ? value : []; const byId = new Map(input.map((item) => [item.id, item])); const orderedIds = [...input.map((item) => item.id).filter((id) => definitions.some((definition) => definition.id === id)), ...definitions.map((item) => item.id).filter((id) => !byId.has(id))]; return orderedIds.map((id) => { const definition = definitions.find((item) => item.id === id); const saved = byId.get(id); return { id, visible: saved?.visible !== false, size: ["small", "medium", "large"].includes(saved?.size) ? saved.size : definition.size }; }); }
  function init() {
    const home = document.getElementById("homeSection"); if (!home || home.querySelector(".dashboard-widget-layout")) return;
    const header = document.createElement("header"); header.className = "dashboard-home-header"; header.innerHTML = `<div><span class="dashboard-today">${new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date())}</span><small>연회 운영 대시보드</small></div><div class="dashboard-edit-actions"><button class="secondary-button" type="button" data-dashboard-edit>대시보드 편집</button><button class="secondary-button" type="button" data-widget-add hidden>+ 위젯 추가</button><button class="secondary-button" type="button" data-widget-reset hidden>기본 배치로 초기화</button><button class="secondary-button" type="button" data-widget-cancel hidden>취소</button><button class="primary-button" type="button" data-widget-save hidden>저장</button></div>`;
    grid = document.createElement("div"); grid.className = "dashboard-widget-layout";
    definitions.forEach((definition) => { const content = home.querySelector(definition.selector); if (!content) return; const shell = document.createElement("section"); shell.className = "dashboard-widget-shell"; shell.dataset.widgetId = definition.id; shell.innerHTML = `<div class="widget-edit-bar"><span class="widget-drag-handle" role="button" tabindex="0" title="드래그하여 이동">⋮⋮</span><strong>${definition.name}</strong><select aria-label="${definition.name} 크기"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select><button type="button" data-widget-up aria-label="${definition.name} 위로">↑</button><button type="button" data-widget-down aria-label="${definition.name} 아래로">↓</button><button type="button" data-widget-hide>숨기기</button></div>`; content.parentNode.insertBefore(shell, content); shell.append(content); grid.append(shell); });
    home.prepend(header); header.after(grid); editor = header; addPanel = document.createElement("div"); addPanel.className = "widget-add-panel"; addPanel.hidden = true; header.after(addPanel);
    draft = load(); apply(draft); bind();
  }
  function apply(layout) { layout.forEach((item) => { const shell = grid.querySelector(`[data-widget-id="${item.id}"]`); if (!shell) return; shell.dataset.widgetSize = item.size; shell.hidden = !item.visible; shell.querySelector("select").value = item.size; grid.append(shell); }); renderAddPanel(); }
  function bind() {
    editor.querySelector("[data-dashboard-edit]").onclick = () => setEditing(true);
    editor.querySelector("[data-widget-add]").onclick = () => { addPanel.hidden = !addPanel.hidden; renderAddPanel(); };
    editor.querySelector("[data-widget-cancel]").onclick = () => { draft = clone(beforeEdit); apply(draft); setEditing(false); };
    editor.querySelector("[data-widget-save]").onclick = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); setEditing(false); };
    editor.querySelector("[data-widget-reset]").onclick = () => { draft = defaults(); apply(draft); };
    grid.addEventListener("click", (event) => { const shell = event.target.closest("[data-widget-id]"); if (!shell || !editing) return; const index = draft.findIndex((item) => item.id === shell.dataset.widgetId); if (event.target.matches("[data-widget-hide]")) draft[index].visible = false; if (event.target.matches("[data-widget-up]") && index > 0) [draft[index - 1], draft[index]] = [draft[index], draft[index - 1]]; if (event.target.matches("[data-widget-down]") && index < draft.length - 1) [draft[index + 1], draft[index]] = [draft[index], draft[index + 1]]; apply(draft); });
    grid.addEventListener("change", (event) => { if (!editing || event.target.tagName !== "SELECT") return; const item = draft.find((entry) => entry.id === event.target.closest("[data-widget-id]").dataset.widgetId); item.size = event.target.value; apply(draft); });
    grid.addEventListener("dragstart", (event) => { if (!editing || !event.target.matches(".widget-drag-handle")) return event.preventDefault(); event.dataTransfer.setData("text/plain", event.target.closest("[data-widget-id]").dataset.widgetId); });
    grid.addEventListener("dragover", (event) => { if (editing) event.preventDefault(); });
    grid.addEventListener("drop", (event) => { event.preventDefault(); reorder(event.dataTransfer.getData("text/plain"), event.target.closest("[data-widget-id]")?.dataset.widgetId); });
    grid.addEventListener("pointerdown", (event) => { if (editing && event.target.matches(".widget-drag-handle")) { pointerDragId = event.target.closest("[data-widget-id]").dataset.widgetId; pointerDragTargetId = pointerDragId; } });
    grid.addEventListener("pointermove", (event) => { if (!pointerDragId) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-widget-id]"); if (target) pointerDragTargetId = target.dataset.widgetId; });
    grid.addEventListener("pointerup", () => { if (pointerDragId) reorder(pointerDragId, pointerDragTargetId); pointerDragId = ""; pointerDragTargetId = ""; });
  }
  function reorderLayout(layout, sourceId, targetId) { const next = clone(layout); if (!sourceId || !targetId || sourceId === targetId) return next; const sourceIndex = next.findIndex((item) => item.id === sourceId); const targetIndex = next.findIndex((item) => item.id === targetId); if (sourceIndex < 0 || targetIndex < 0) return next; const [source] = next.splice(sourceIndex, 1); next.splice(targetIndex, 0, source); return next; }
  function reorder(sourceId, targetId) { draft = reorderLayout(draft, sourceId, targetId); apply(draft); }
  function setEditing(value) { editing = value; if (value) beforeEdit = clone(draft); document.getElementById("homeSection").classList.toggle("dashboard-editing", value); editor.querySelector("[data-dashboard-edit]").hidden = value; editor.querySelectorAll("[data-widget-add],[data-widget-reset],[data-widget-cancel],[data-widget-save]").forEach((button) => button.hidden = !value); grid.querySelectorAll(".widget-drag-handle").forEach((handle) => handle.draggable = value); if (!value) addPanel.hidden = true; }
  function renderAddPanel() { if (!addPanel) return; const hidden = draft.filter((item) => !item.visible); addPanel.innerHTML = hidden.length ? hidden.map((item) => `<button type="button" data-add-widget="${item.id}">+ ${definitions.find((definition) => definition.id === item.id).name}</button>`).join("") : "<span>숨겨진 위젯이 없습니다.</span>"; addPanel.querySelectorAll("[data-add-widget]").forEach((button) => button.onclick = () => { draft.find((item) => item.id === button.dataset.addWidget).visible = true; apply(draft); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
  window.BANQUET_ERP_DASHBOARD_WIDGETS = { init, defaults, normalize, reorderLayout };
})();
