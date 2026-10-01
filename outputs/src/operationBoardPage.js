(function initializeOperationBoardPage() {
  const constants = window.BANQUET_ERP_CONSTANTS;
  const board = window.BANQUET_ERP_OPERATION_BOARD;
  const cacheKey = "banquet-erp-events-cache-v1";
  const correctionLogKey = "banquetErp.eventOrderCorrections.v1";
  const app = document.getElementById("boardApp");
  const login = document.getElementById("boardLogin");
  const status = document.getElementById("boardSyncStatus");
  const dateLabel = document.getElementById("boardDateLabel");
  const aiForm = document.getElementById("boardAiForm");
  const aiInput = document.getElementById("boardAiInput");
  const aiResult = document.getElementById("boardAiResult");
  let events = [];
  let pendingProposal = null;
  let recentConversation = [];

  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
  function storedUser() { try { const value = JSON.parse(localStorage.getItem(constants.authStorageKey) || "null"); return constants.loginAccounts.find((account) => account.id === value?.id && account.role === value?.role) || null; } catch { return null; } }
  function cachedEvents() { try { const value = JSON.parse(localStorage.getItem(cacheKey) || "null"); return Array.isArray(value?.events) ? value.events : []; } catch { return []; } }
  function formatDate(value) { return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date(`${value}T00:00:00`)); }
  function render() { board.render({ events }); dateLabel.textContent = formatDate(board.getSelectedDate()); }
  function localDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function moveBoardDate(step) {
    const current = board.getSelectedDate();
    const date = new Date(`${current}T12:00:00`);
    date.setDate(date.getDate() + step);
    const next = localDateKey(date);
    console.debug("board date move", { step, current, next });
    board.setSelectedDate(next);
    render();
  }
  async function request(path, options = {}) {
    const response = await fetch(`${constants.supabaseConfig.url}/rest/v1/${path}`, { ...options, headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`Supabase ${response.status}`); error.status = response.status; error.body = text;
      throw error;
    }
    return text ? JSON.parse(text) : null;
  }
  async function childRows(table, ids, order) {
    const result = []; const pageSize = 1000; const batchSize = 50;
    for (let start = 0; start < ids.length; start += batchSize) {
      const filter = `in.(${ids.slice(start, start + batchSize).join(",")})`;
      for (let offset = 0; ; offset += pageSize) { const page = await request(`${table}?select=*&event_order_id=${filter}&order=${order}&limit=${pageSize}&offset=${offset}`); result.push(...page); if (page.length < pageSize) break; }
    }
    return result;
  }
  function grouped(rows) { return rows.reduce((map, row) => { (map[row.event_order_id] ||= []).push(row); return map; }, {}); }
  async function refresh() {
    status.textContent = "최신 일정 동기화 중";
    try {
      const rows = await request("event_orders?select=*&order=created_at.desc"); const ids = rows.map((row) => row.id);
      if (!ids.length) { events = []; render(); return { ok: true }; }
      const [dates, schedules] = await Promise.all([childRows("event_calendar_dates", ids, "calendar_date.asc,id.asc"), childRows("event_schedules", ids, "created_at.asc,id.asc")]);
      const byDate = grouped(dates); const bySchedule = grouped(schedules);
      events = rows.map((row) => ({ id: row.id, eventName: row.event_name || "", startDate: row.start_date || "", endDate: row.end_date || "", eventDateTime: row.event_datetime || "", venue: row.venue || "", guestCount: row.guest_count ?? "", eventType: row.event_type || "", mealTypes: row.meal_types || [], internalMemo: row.internal_memo || "", storagePath: row.storage_path || "", calendarDates: (byDate[row.id] || []).map((item) => item.calendar_date), schedule: (bySchedule[row.id] || []).map((item) => ({ id: item.id, date: item.schedule_date || "", time: item.schedule_time || "", content: item.content || "", venue: item.venue || "", people: item.people ?? "" })) }));
      localStorage.setItem(cacheKey, JSON.stringify({ version: 1, savedAt: Date.now(), events })); render(); status.textContent = "최신 일정 동기화 완료"; return { ok: true };
    } catch (error) { console.error(error); status.textContent = events.length ? "저장된 일정 표시 중 · 동기화 재시도 필요" : "일정을 불러오지 못했습니다"; return { ok: false, error }; }
  }
  function selectedEvents() { const date = board.getSelectedDate(); return events.filter((event) => [...(event.calendarDates || []), event.startDate, event.endDate].includes(date)); }
  function aiContext() {
    return { selectedDate: board.getSelectedDate(), expandedSpaceGroups: [...document.querySelectorAll("[data-space-group-toggle][aria-expanded=true]")].map((node) => node.dataset.spaceGroupToggle), events: selectedEvents().map((event) => ({ eventOrderId: event.id, eventName: event.eventName, venue: event.venue, guestCount: event.guestCount, schedules: event.schedule.map((row) => ({ scheduleId: row.id, date: row.date, time: row.time, content: row.content, venue: row.venue, people: row.people })) })), recentConversation: recentConversation.slice(-2) };
  }
  async function interpret(userText, selection = null) {
    const response = await fetch(`${constants.supabaseConfig.url}/functions/v1/event-order-ai-chat`, { method: "POST", headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "board_command", question: userText, boardContext: aiContext(), selection }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.message || "AI 해석 실패"); return body.proposal;
  }
  function showMessage(message) { pendingProposal = null; aiResult.innerHTML = `<p class="board-ai-status">${escapeHtml(message)}</p>`; }
  function proposalSummary(proposal) {
    if (proposal.intent === "update_schedule_time") return `${proposal.target?.venue || "행사"} · ${proposal.target?.content || "일정"}\n${proposal.target?.currentTime || "-"} → ${proposal.change?.time || "-"}`;
    if (proposal.intent === "update_guest_count") return `${proposal.target?.venue || proposal.target?.eventName || "행사"}\n${proposal.target?.currentGuestCount ?? "-"}명 → ${proposal.change?.guestCount ?? "-"}명`;
    return `${proposal.target?.venue || proposal.target?.eventName || "현장"}\n${proposal.change?.note || ""}`;
  }
  function showProposal(proposal) {
    pendingProposal = proposal;
    if (proposal.needsClarification || Number(proposal.confidence) < 0.7) {
      const choices = Array.isArray(proposal.choices) ? proposal.choices : [];
      aiResult.innerHTML = `<h3>대상 확인</h3><p>${escapeHtml(proposal.question || "어느 행사를 변경할까요?")}</p><div class="board-ai-choices">${choices.map((choice, index) => `<button class="board-ai-choice" type="button" data-ai-choice="${index}">${escapeHtml(choice.label)}</button>`).join("")}</div><div class="board-ai-actions"><button type="button" data-ai-cancel>취소</button></div>`; return;
    }
    if (!["update_schedule_time", "update_guest_count", "add_field_note"].includes(proposal.intent)) { showMessage("현재 현장 AI에서는 시간/인원/메모 변경만 가능합니다."); return; }
    aiResult.innerHTML = `<h3>변경 제안</h3><p class="board-ai-change">${escapeHtml(proposalSummary(proposal))}</p><p>${escapeHtml(proposal.confirmationText || "변경할까요?")}</p><div class="board-ai-actions"><button type="button" data-ai-approve>변경하기</button><button type="button" data-ai-edit>수정</button><button type="button" data-ai-cancel>취소</button></div>`;
  }
  function logLocally(entry) { try { const rows = JSON.parse(localStorage.getItem(correctionLogKey) || "[]"); localStorage.setItem(correctionLogKey, JSON.stringify([...(Array.isArray(rows) ? rows : []), entry].slice(-500))); window.dispatchEvent(new CustomEvent("banquet:correction-recorded")); } catch { /* storage unavailable */ } }
  async function persistAudit(proposal, userText, before, after) {
    const createdAt = new Date().toISOString();
    await request("operation_board_items", { method: "POST", body: JSON.stringify({ board_date: board.getSelectedDate(), item_key: `board-ai-log:${crypto.randomUUID()}`, item_kind: "manual", event_order_id: proposal.target?.eventOrderId || null, item_time: null, venue_name: proposal.target?.venue || "", title: proposal.intent, memo: userText, is_completed: true, metadata: { recordType: "board_ai_change_log", source: "board_ai", action: proposal.intent, scheduleId: proposal.target?.scheduleId || null, before, after, userText, approved: true, createdAt } }) });
    logLocally({ source: "board_ai", action: proposal.intent, field: proposal.intent, eventOrderId: proposal.target?.eventOrderId || null, scheduleId: proposal.target?.scheduleId || null, originalValue: String(before ?? ""), correctedValue: String(after ?? ""), userText, approved: true, createdAt });
  }
  async function tryPersistAudit(proposal, userText, before, after) {
    try { await persistAudit(proposal, userText, before, after); return true; }
    catch (error) { console.error("board AI audit failed", { status: error.status, body: error.body, error }); return false; }
  }
  function boardAiError(code, message, cause) { const error = new Error(message); error.code = code; error.cause = cause; return error; }
  async function applyProposal(proposal) {
    const userText = proposal.userText || aiInput.value.trim();
    let auditSaved = true;
    if (proposal.intent === "update_schedule_time") {
      if (!proposal.target?.eventOrderId || !proposal.target?.scheduleId || !/^\d{2}:\d{2}$/.test(proposal.change?.time || "")) throw boardAiError("schedule_target_missing", "invalid schedule proposal");
      let updatedRows;
      try {
        updatedRows = await request(`event_schedules?id=eq.${encodeURIComponent(proposal.target.scheduleId)}&event_order_id=eq.${encodeURIComponent(proposal.target.eventOrderId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ schedule_time: proposal.change.time }) });
      } catch (error) {
        console.error("board AI schedule patch failed", { status: error.status, body: error.body, proposal, error });
        throw boardAiError("schedule_patch_failed", "schedule patch failed", error);
      }
      if (!Array.isArray(updatedRows) || updatedRows.length !== 1) {
        console.error("board AI schedule patch failed", { status: 200, body: updatedRows, updatedRowCount: Array.isArray(updatedRows) ? updatedRows.length : null, proposal });
        throw boardAiError("schedule_not_found", "schedule patch returned no exact row");
      }
      auditSaved = await tryPersistAudit(proposal, userText, proposal.target.currentTime, proposal.change.time);
    } else if (proposal.intent === "update_guest_count") {
      const count = Number(proposal.change?.guestCount); if (!proposal.target?.eventOrderId || !Number.isInteger(count) || count < 0) throw new Error("invalid guest proposal");
      await request(`event_orders?id=eq.${encodeURIComponent(proposal.target.eventOrderId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ guest_count: count }) });
      auditSaved = await tryPersistAudit(proposal, userText, proposal.target.currentGuestCount, count);
    } else if (proposal.intent === "add_field_note") {
      const note = String(proposal.change?.note || "").trim(); if (!proposal.target?.eventOrderId || !note) throw new Error("invalid note proposal");
      const key = `field-note:${crypto.randomUUID()}`;
      const payload = { board_date: board.getSelectedDate(), item_key: key, item_kind: "manual", event_order_id: proposal.target.eventOrderId, item_time: null, venue_name: proposal.target.venue || "", title: "현장 메모", memo: note, is_completed: false, metadata: { noteType: "field_note", source: "board_ai", boardDate: board.getSelectedDate(), venue: proposal.target.venue || "", createdAt: new Date().toISOString(), userText } };
      await request("operation_board_items", { method: "POST", body: JSON.stringify(payload) }); board.addFieldNote({ key, date: payload.board_date, eventOrderId: payload.event_order_id, venue: payload.venue_name, content: note }); auditSaved = await tryPersistAudit(proposal, userText, "", note);
    } else throw new Error("unsupported intent");
    const refreshResult = await (refresh)();
    if (!refreshResult?.ok) console.error("board AI refresh failed", { status: refreshResult?.error?.status, body: refreshResult?.error?.body, error: refreshResult?.error });
    const success = proposal.intent === "update_schedule_time" ? `${proposal.change.time}으로 변경했습니다.` : proposal.intent === "update_guest_count" ? `${proposal.change.guestCount}명으로 변경했습니다.` : "현장 메모를 추가했습니다.";
    showMessage(!refreshResult?.ok ? `${success} 화면 동기화에 실패해 새로고침이 필요합니다.` : !auditSaved ? `${success} 변경 기록 저장은 실패했습니다.` : success); aiInput.value = "";
  }
  function start() { login.hidden = true; app.hidden = false; events = cachedEvents(); render(); status.textContent = events.length ? "저장된 일정 표시 중" : "최신 일정 불러오는 중"; refresh(); }

  aiForm.addEventListener("submit", async (event) => { event.preventDefault(); const text = aiInput.value.trim(); if (!text) return; showMessage("변경 내용을 확인하고 있습니다…"); try { const proposal = await interpret(text); proposal.userText = text; recentConversation.push({ user: text, proposal }); showProposal(proposal); } catch (error) { console.error(error); showMessage("AI 확인에 실패했습니다. 잠시 후 다시 시도해주세요."); } });
  aiInput.addEventListener("input", () => { aiInput.style.height = "auto"; aiInput.style.height = `${Math.min(aiInput.scrollHeight, 112)}px`; });
  aiResult.addEventListener("click", async (event) => {
    if (event.target.closest("[data-ai-cancel]")) { showMessage("변경을 취소했습니다."); return; }
    if (event.target.closest("[data-ai-edit]")) { aiInput.focus(); aiInput.select(); return; }
    const choice = event.target.closest("[data-ai-choice]");
    if (choice && pendingProposal) { const selected = pendingProposal.choices[Number(choice.dataset.aiChoice)]; const originalText = pendingProposal.userText || aiInput.value.trim(); showMessage("선택한 대상을 확인하고 있습니다…"); try { const proposal = await interpret(originalText, selected); proposal.userText = originalText; showProposal(proposal); } catch (error) { console.error(error); showMessage("대상을 확인하지 못했습니다."); } return; }
    if (event.target.closest("[data-ai-approve]") && pendingProposal) { const proposal = pendingProposal; showMessage("승인된 변경을 저장하고 있습니다…"); try { await applyProposal(proposal); } catch (error) { console.error("board AI apply failed", { code: error.code, error }); showMessage(error.code === "schedule_not_found" || error.code === "schedule_target_missing" ? "변경할 일정을 찾지 못했습니다. 최신 일정을 다시 불러와주세요." : error.code === "schedule_patch_failed" ? "일정 수정에 실패했습니다. 기존 일정은 유지됩니다." : "변경 저장에 실패했습니다. 기존 데이터는 유지됩니다."); } }
  });
  document.querySelectorAll("[data-board-page-step]").forEach((button) => button.onclick = () => moveBoardDate(Number(button.dataset.boardPageStep)));
  document.querySelector("[data-board-page-today]").onclick = () => { board.setSelectedDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)); render(); };
  document.getElementById("boardLoginForm").onsubmit = (event) => { event.preventDefault(); const id = document.getElementById("boardLoginId").value.trim(); const password = document.getElementById("boardLoginPassword").value; const account = constants.loginAccounts.find((item) => item.id === id && item.password === password); if (!account) { document.getElementById("boardLoginError").textContent = "아이디 또는 비밀번호가 올바르지 않습니다."; return; } localStorage.setItem(constants.authStorageKey, JSON.stringify({ id: account.id, role: account.role, label: account.label })); start(); };
  window.openStoredExcel = (path) => window.open(`${constants.supabaseConfig.url}/storage/v1/object/public/${constants.supabaseConfig.bucket}/${String(path).split("/").map(encodeURIComponent).join("/")}`, "_blank", "noopener");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("../push-sw.js").catch(console.warn);
  if (storedUser()) start(); else { login.hidden = false; app.hidden = true; }
})();
