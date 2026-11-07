(function registerDashboardMemos() {
  const RECORD_TYPE = "dashboard_postit";
  const SOURCE = "dashboard_postit";
  const BOARD_DATE = "1970-01-01";
  const SAVE_DELAY_MS = 500;
  const MIN_WIDTH = 180;
  const MIN_HEIGHT = 100;
  const COLORS = Object.freeze({ yellow: "#FDE68A", blue: "#BFDBFE", mint: "#A7F3D0", pink: "#FBCFE8", gray: "#D1D5DB" });
  let home = null; let layer = null; let listPanel = null; let rows = []; let drag = null; let resizeObserver = null;
  const saveTimers = new Map();

  function clamp(value, min, max) { return Math.min(Math.max(Number(value) || 0, min), Math.max(min, max)); }
  function normalizeMemoMetadata(metadata = {}) {
    return { ...metadata, source: SOURCE, recordType: RECORD_TYPE, text: String(metadata.text || ""), xRatio: clamp(metadata.xRatio, 0, 1), yRatio: clamp(metadata.yRatio, 0, 1), width: Math.max(MIN_WIDTH, Number(metadata.width) || 240), height: Math.max(MIN_HEIGHT, Number(metadata.height) || 150), collapsed: Boolean(metadata.collapsed), color: COLORS[metadata.color] ? metadata.color : "yellow", zIndex: Math.max(1, Number(metadata.zIndex) || 1) };
  }
  function memoPosition(metadata, bounds) {
    const width = clamp(metadata.width, MIN_WIDTH, Math.max(MIN_WIDTH, bounds.width)); const height = clamp(metadata.height, MIN_HEIGHT, Math.max(MIN_HEIGHT, bounds.height));
    return { width, height, left: clamp(metadata.xRatio, 0, 1) * Math.max(0, bounds.width - width), top: clamp(metadata.yRatio, 0, 1) * Math.max(0, bounds.height - height) };
  }
  function memoRatios(left, top, width, height, bounds) { return { xRatio: clamp(left / Math.max(1, bounds.width - width), 0, 1), yRatio: clamp(top / Math.max(1, bounds.height - height), 0, 1) }; }
  function config() { return window.BANQUET_ERP_CONSTANTS?.supabaseConfig || {}; }
  async function request(path, options = {}) {
    const cfg = config(); const response = await fetch(`${cfg.url}/rest/v1/${path}`, { ...options, headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(body?.message || "메모 저장 요청에 실패했습니다."); Object.assign(error, body || {}, { status: response.status }); throw error; }
    return body;
  }
  function payload(row) { const metadata = normalizeMemoMetadata(row.metadata); return { board_date: BOARD_DATE, item_key: row.item_key, item_kind: "manual", event_order_id: null, space_id: null, item_time: null, venue_name: "", title: metadata.text.slice(0, 80) || "포스트잇 메모", people: null, memo: metadata.text, is_completed: false, metadata }; }
  async function load() {
    const result = await request(`operation_board_items?select=*&board_date=eq.${BOARD_DATE}&item_kind=eq.manual&metadata->>recordType=eq.${RECORD_TYPE}&order=created_at.asc`);
    rows = (result || []).map((row) => ({ ...row, metadata: normalizeMemoMetadata(row.metadata) })); render();
  }
  async function addMemo() {
    const key = `dashboard-postit:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`; const zIndex = Math.max(0, ...rows.map((row) => row.metadata.zIndex)) + 1;
    const row = { item_key: key, metadata: normalizeMemoMetadata({ xRatio: .06 + (rows.length % 4) * .04, yRatio: .05 + (rows.length % 4) * .05, zIndex }) };
    try { const saved = await request("operation_board_items?select=*", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload(row)) }); rows.push({ ...saved[0], metadata: normalizeMemoMetadata(saved[0].metadata) }); render(); requestAnimationFrame(() => layer?.querySelector(`[data-memo-id="${saved[0].id}"] textarea`)?.focus()); }
    catch (error) { reportError("memo create failed", error); }
  }
  function scheduleSave(row, immediate = false) { clearTimeout(saveTimers.get(row.id)); const run = () => saveRow(row); if (immediate) run(); else saveTimers.set(row.id, setTimeout(run, SAVE_DELAY_MS)); }
  async function saveRow(row) {
    saveTimers.delete(row.id);
    try { const saved = await request(`operation_board_items?id=eq.${encodeURIComponent(row.id)}&select=*`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload(row)) }); if (saved?.[0]) Object.assign(row, saved[0], { metadata: normalizeMemoMetadata(saved[0].metadata) }); }
    catch (error) { reportError("memo save failed", error); }
  }
  function reportError(label, error) { console.error(label, { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint, error }); window.alert?.("메모를 저장하지 못했습니다. 다시 시도해주세요."); }
  function bringFront(row) { const next = Math.max(0, ...rows.map((item) => item.metadata.zIndex)) + 1; row.metadata.zIndex = next; layer?.querySelector(`[data-memo-id="${row.id}"]`)?.style.setProperty("z-index", String(next)); scheduleSave(row); }
  function collapse(row) { row.metadata.collapsed = true; render(); scheduleSave(row, true); }
  function restore(row) { if (!row) return; row.metadata.collapsed = false; bringFront(row); render(); scheduleSave(row, true); }
  async function remove(row) { if (!row || !window.confirm?.("이 메모를 완전히 삭제할까요?")) return; try { await request(`operation_board_items?id=eq.${encodeURIComponent(row.id)}`, { method: "DELETE" }); rows = rows.filter((item) => item.id !== row.id); render(); } catch (error) { reportError("memo delete failed", error); } }
  function beginPointer(event, row, mode) {
    if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); bringFront(row); const card = event.currentTarget.closest(".dashboard-postit"); const bounds = layer.getBoundingClientRect();
    drag = { mode, row, card, bounds, startX: event.clientX, startY: event.clientY, left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
    window.addEventListener("pointermove", movePointer); window.addEventListener("pointerup", endPointer, { once: true });
  }
  function movePointer(event) {
    if (!drag) return; const dx = event.clientX - drag.startX; const dy = event.clientY - drag.startY;
    if (drag.mode === "move") { const left = clamp(drag.left + dx, 0, drag.bounds.width - drag.width); const top = clamp(drag.top + dy, 0, drag.bounds.height - drag.height); drag.card.style.left = `${left}px`; drag.card.style.top = `${top}px`; Object.assign(drag.row.metadata, memoRatios(left, top, drag.width, drag.height, drag.bounds)); }
    else { const width = clamp(drag.width + dx, MIN_WIDTH, drag.bounds.width - drag.left); const height = clamp(drag.height + dy, MIN_HEIGHT, drag.bounds.height - drag.top); drag.card.style.width = `${width}px`; drag.card.style.height = `${height}px`; drag.row.metadata.width = width; drag.row.metadata.height = height; Object.assign(drag.row.metadata, memoRatios(drag.left, drag.top, width, height, drag.bounds)); }
  }
  function endPointer() { if (!drag) return; scheduleSave(drag.row, true); drag = null; window.removeEventListener("pointermove", movePointer); }
  function render() {
    if (!layer) return; const bounds = layer.getBoundingClientRect(); layer.innerHTML = "";
    rows.filter((row) => !row.metadata.collapsed).forEach((row) => {
      const metadata = normalizeMemoMetadata(row.metadata); row.metadata = metadata; const position = memoPosition(metadata, bounds); const card = document.createElement("article"); card.className = "dashboard-postit"; card.dataset.memoId = row.id; card.style.cssText = `left:${position.left}px;top:${position.top}px;width:${position.width}px;height:${position.height}px;z-index:${metadata.zIndex};--memo-color:${COLORS[metadata.color]}`;
      card.innerHTML = `<header class="dashboard-postit-handle"><span>메모</span><select aria-label="메모 색상">${Object.keys(COLORS).map((color) => `<option value="${color}" ${color === metadata.color ? "selected" : ""}>${({yellow:"노랑",blue:"파랑",mint:"민트",pink:"핑크",gray:"회색"})[color]}</option>`).join("")}</select><button type="button" aria-label="메모 숨기기" data-memo-collapse>×</button></header><textarea aria-label="메모 내용" placeholder="잊지 말아야 할 내용을 입력하세요."></textarea><button class="dashboard-postit-resize" type="button" aria-label="메모 크기 조절"></button>`;
      card.querySelector("textarea").value = metadata.text; card.addEventListener("pointerdown", () => bringFront(row)); card.querySelector("header").addEventListener("pointerdown", (event) => { if (!event.target.closest("button,select")) beginPointer(event, row, "move"); }); card.querySelector(".dashboard-postit-resize").addEventListener("pointerdown", (event) => beginPointer(event, row, "resize"));
      card.querySelector("textarea").addEventListener("input", (event) => { row.metadata.text = event.target.value; scheduleSave(row); updateCount(); }); card.querySelector("[data-memo-collapse]").addEventListener("click", () => collapse(row)); card.querySelector("select").addEventListener("change", (event) => { row.metadata.color = event.target.value; render(); scheduleSave(row, true); }); layer.append(card);
    });
    updateCount(); renderList();
  }
  function updateCount() { const button = document.querySelector("[data-dashboard-memo-list]"); if (button) button.textContent = `메모 ${rows.length}`; }
  function renderList() {
    if (!listPanel) return; listPanel.innerHTML = `<header><strong>메모 목록</strong><button type="button" data-memo-list-close>×</button></header><section><h4>활성 메모</h4>${memoListRows(rows.filter((row) => !row.metadata.collapsed), false)}</section><section><h4>숨긴 메모</h4>${memoListRows(rows.filter((row) => row.metadata.collapsed), true)}</section>`;
    listPanel.querySelector("[data-memo-list-close]").onclick = () => { listPanel.hidden = true; }; listPanel.querySelectorAll("[data-memo-restore]").forEach((button) => button.onclick = () => restore(rows.find((row) => row.id === button.dataset.memoRestore))); listPanel.querySelectorAll("[data-memo-delete]").forEach((button) => button.onclick = () => remove(rows.find((row) => row.id === button.dataset.memoDelete)));
  }
  function memoListRows(items, hidden) { return items.length ? items.map((row) => `<div class="dashboard-memo-list-row"><span>${escapeHtml(row.metadata.text.slice(0, 48) || "빈 메모")}</span>${hidden ? `<button type="button" data-memo-restore="${row.id}">복원</button>` : ""}<button type="button" data-memo-delete="${row.id}">삭제</button></div>`).join("") : "<p>없음</p>"; }
  function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]); }
  function init() {
    home = document.getElementById("homeSection"); if (!home || document.querySelector("[data-dashboard-memo-add]")) return;
    const actions = home.querySelector(".dashboard-edit-actions"); if (!actions) { setTimeout(init, 0); return; }
    actions.insertAdjacentHTML("afterbegin", '<button class="secondary-button" type="button" data-dashboard-memo-add>+ 메모</button><button class="secondary-button" type="button" data-dashboard-memo-list>메모 0</button>');
    layer = document.createElement("div"); layer.className = "dashboard-memo-layer"; home.append(layer); listPanel = document.createElement("aside"); listPanel.className = "dashboard-memo-list-panel"; listPanel.hidden = true; home.append(listPanel);
    actions.querySelector("[data-dashboard-memo-add]").onclick = addMemo; actions.querySelector("[data-dashboard-memo-list]").onclick = () => { renderList(); listPanel.hidden = !listPanel.hidden; };
    resizeObserver = new ResizeObserver(() => render()); resizeObserver.observe(home); load().catch((error) => reportError("memo load failed", error));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
  window.BANQUET_ERP_DASHBOARD_MEMOS = { init, normalizeMemoMetadata, memoPosition, memoRatios, COLORS };
})();
