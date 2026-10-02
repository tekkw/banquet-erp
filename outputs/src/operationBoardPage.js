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
  const assetPhotoButton = document.getElementById("boardAssetPhotoButton");
  const assetPhotoInput = document.getElementById("boardAssetPhotoInput");
  let events = [];
  let pendingProposal = null;
  let pendingAssetProposal = null;
  let pendingAssetContext = null;
  let selectedAssetImageFile = null;
  let uploadedAssetImage = null;
  let selectedAssetPreviewUrl = "";
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
  function isAssetIntakeRequest(text) { return /(자산|비품|소모품|장비|서무|종이컵|멀티탭|수량.*(추가|늘|증가)|보관.*위치|위치.*변경|옮겼)/i.test(text); }
  function encodeStoragePath(path) { return String(path).split("/").map(encodeURIComponent).join("/"); }
  async function uploadSelectedAssetImage() {
    if (uploadedAssetImage) return uploadedAssetImage;
    if (!selectedAssetImageFile) return null;
    const extension = (selectedAssetImageFile.name.split(".").pop() || selectedAssetImageFile.type.split("/").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const storagePath = `assets/board-intake_${crypto.randomUUID()}.${extension}`;
    const response = await fetch(`${constants.supabaseConfig.url}/storage/v1/object/asset-images/${encodeStoragePath(storagePath)}`, { method: "POST", headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}`, "Content-Type": selectedAssetImageFile.type || "application/octet-stream", "x-upsert": "false" }, body: selectedAssetImageFile });
    const body = await response.text();
    if (!response.ok) { const error = new Error(`사진 업로드 실패 (Supabase ${response.status})`); error.status = response.status; error.body = body; throw error; }
    uploadedAssetImage = { storagePath, publicUrl: `${constants.supabaseConfig.url}/storage/v1/object/public/asset-images/${encodeStoragePath(storagePath)}` };
    return uploadedAssetImage;
  }
  async function deleteUnlinkedAssetImage() {
    if (!uploadedAssetImage?.storagePath) return;
    const image = uploadedAssetImage; uploadedAssetImage = null;
    try { await fetch(`${constants.supabaseConfig.url}/storage/v1/object/asset-images/${encodeStoragePath(image.storagePath)}`, { method: "DELETE", headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}` } }); } catch (error) { console.warn("unlinked asset image cleanup failed", error); }
  }
  function resetAssetImage(keepStoredImage = false) {
    selectedAssetImageFile = null;
    assetPhotoInput.value = "";
    assetPhotoButton.dataset.selected = "false";
    if (selectedAssetPreviewUrl) URL.revokeObjectURL(selectedAssetPreviewUrl);
    selectedAssetPreviewUrl = "";
    if (keepStoredImage) uploadedAssetImage = null;
  }
  async function interpretAsset(userText, selection = null, context = null) {
    const imageAttachment = await uploadSelectedAssetImage();
    const previousContext = context ? { previousUserText: context.latestUserText || context.originalUserText || "", previousProposal: context.latestProposal || null, accumulatedAsset: context.asset || {} } : null;
    const response = await fetch(`${constants.supabaseConfig.url}/functions/v1/event-order-ai-chat`, { method: "POST", headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "asset_intake", userText, imageAttachment, selection, previousContext }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.message || `AI 해석 실패 (${response.status})`); error.status = response.status; throw error; }
    return body.proposal;
  }
  function assetIntentLabel(intent) { return intent === "create_asset" ? "새 자산 등록" : intent === "increase_asset_quantity" ? "기존 자산 수량 추가" : "자산 위치 변경"; }
  function startsNewAssetRequest(text) { return /(?:새|다른|별도|새로운)\s*(?:자산|물품|비품).*(?:등록|추가|시작)|(?:새로|별도로)\s*(?:등록|시작)/i.test(text); }
  function buildAssetContext(proposal, userText, previous = null) {
    const previousAsset = previous?.asset || {};
    const nextAsset = proposal.asset || {};
    const asset = { ...previousAsset };
    Object.entries(nextAsset).forEach(([key, value]) => { if (value !== "" && value !== null && value !== undefined) asset[key] = value; else if (!(key in asset)) asset[key] = value; });
    proposal.asset = asset;
    return { originalUserText: previous?.originalUserText || userText, latestUserText: userText, latestProposal: proposal, asset, intent: proposal.intent, targetAssetId: proposal.targetAssetId || previous?.targetAssetId || null, imageAttachment: uploadedAssetImage || previous?.imageAttachment || null };
  }
  function currentAssetSummary(asset = {}) {
    const location = [asset.floor, asset.location].filter(Boolean).join(" · ") || "위치 미입력";
    return `<div class="board-asset-current"><strong>현재 확인된 정보</strong><br>${escapeHtml(asset.assetName || "품명 미입력")}<br>${escapeHtml(location)}<br>${asset.quantity == null ? "수량 미입력" : `수량 ${escapeHtml(asset.quantity)}`}<br>${escapeHtml(asset.unit ? `단위 ${asset.unit}` : "단위 미입력")}</div>`;
  }
  function renderAssetFields(asset = {}, disabled = true) {
    const field = (name, label, value, type = "text") => `<label>${escapeHtml(label)}<input name="${name}" type="${type}" value="${escapeHtml(value ?? "")}" ${disabled ? "disabled" : ""}></label>`;
    return `<div class="board-asset-fields">${field("assetName", "자산명", asset.assetName)}${field("category", "분류", asset.category)}${field("quantity", "수량", asset.quantity, "number")}${field("unit", "단위", asset.unit)}${field("floor", "층", asset.floor)}${field("location", "위치", asset.location)}${field("description", "설명", asset.description)}</div>`;
  }
  function showAssetProposal(proposal, context = null, userText = "") {
    pendingProposal = null; pendingAssetContext = buildAssetContext(proposal, userText, context); pendingAssetProposal = pendingAssetContext.latestProposal;
    const thumbnail = uploadedAssetImage?.publicUrl || selectedAssetPreviewUrl;
    const image = thumbnail ? `<img class="board-asset-thumbnail" src="${escapeHtml(thumbnail)}" alt="선택한 자산 사진">` : "";
    if (proposal.intent === "unsupported") { aiResult.innerHTML = `<p class="board-ai-status">현재는 등록 / 수량 추가 / 위치 변경만 지원합니다.</p><div class="board-ai-actions"><button type="button" data-asset-cancel>닫기</button></div>`; return; }
    if (proposal.needsClarification || Number(proposal.confidence) < 0.7) {
      const choices = Array.isArray(proposal.choices) ? proposal.choices : [];
      aiResult.innerHTML = `<div class="board-asset-proposal"><div class="board-asset-heading">${image}<div><h3>자산 정보 확인</h3>${currentAssetSummary(pendingAssetContext.asset)}<p>${escapeHtml(proposal.question || "수량과 보관 위치를 알려주세요.")}</p></div></div>${choices.length ? `<div class="board-ai-choices">${choices.map((choice, index) => `<button class="board-ai-choice" type="button" data-asset-choice="${index}">${escapeHtml(choice.label)}</button>`).join("")}</div>` : ""}<div class="board-ai-actions"><button type="button" data-asset-cancel>취소</button></div></div>`;
      return;
    }
    const asset = proposal.asset || {};
    const current = proposal.intent === "increase_asset_quantity" ? `<p class="board-asset-current">현재 ${proposal.currentQuantity ?? 0}${escapeHtml(asset.unit || "")} + ${proposal.addQuantity ?? 0}${escapeHtml(asset.unit || "")} → ${proposal.newQuantity ?? 0}${escapeHtml(asset.unit || "")}</p>` : "";
    const approveText = proposal.intent === "increase_asset_quantity" ? `${proposal.newQuantity ?? "새 수량"}으로 반영` : proposal.intent === "update_asset_location" ? "위치 변경" : "자산 등록";
    const createAlternative = proposal.intent === "increase_asset_quantity" ? `<button type="button" data-asset-create-new>새 자산으로 등록</button>` : "";
    aiResult.innerHTML = `<div class="board-asset-proposal"><div class="board-asset-heading">${image}<div><h3>${assetIntentLabel(proposal.intent)}</h3><p>${escapeHtml(proposal.confirmationText || "이 내용으로 반영할까요?")}</p>${current}</div></div><form id="boardAssetProposalForm">${renderAssetFields(asset, true)}</form><div class="board-ai-actions"><button type="button" data-asset-approve>${approveText}</button><button type="button" data-asset-edit>수정</button>${createAlternative}<button type="button" data-asset-cancel>취소</button></div></div>`;
  }
  function readAssetFields() {
    const form = document.getElementById("boardAssetProposalForm");
    const read = (name) => String(form?.elements?.namedItem(name)?.value || "").trim();
    const quantityText = read("quantity");
    return { assetName: read("assetName"), category: read("category"), quantity: quantityText === "" ? null : Number(quantityText), unit: read("unit"), floor: read("floor"), location: read("location"), description: read("description") };
  }
  function assetSpec(asset) { return [`분류: ${asset.category || "기타"}`, asset.unit ? `단위: ${asset.unit}` : "", asset.description || ""].filter(Boolean).join(" | "); }
  async function getAsset(id) { const rows = await request(`banquet_assets?id=eq.${encodeURIComponent(id)}&select=id,asset_name,floor,quantity,spec,location,image_url&limit=1`); return rows?.[0] || null; }
  async function tryPersistAssetAudit(proposal, userText, before, after, assetId) {
    try { await request("operation_board_items", { method: "POST", body: JSON.stringify({ board_date: board.getSelectedDate(), item_key: `board-asset-ai:${crypto.randomUUID()}`, item_kind: "manual", event_order_id: null, space_id: null, item_time: null, venue_name: after?.location || before?.location || "", title: proposal.intent, people: null, memo: userText, is_completed: true, metadata: { source: "board_asset_ai", action: proposal.intent, userText, before, after, assetId, imagePath: uploadedAssetImage?.storagePath || null, createdAt: new Date().toISOString() } }) }); return true; } catch (error) { console.error("board asset AI audit failed", { status: error.status, body: error.body, error }); return false; }
  }
  async function applyAssetProposal(proposal) {
    const asset = readAssetFields();
    const userText = proposal.userText || aiInput.value.trim();
    let before = null; let after = null;
    if (proposal.intent === "create_asset") {
      if (!asset.assetName || !Number.isInteger(asset.quantity) || asset.quantity < 0 || !asset.location) throw new Error("자산명, 수량, 위치를 확인해주세요.");
      const rows = await request("banquet_assets", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ asset_name: asset.assetName, floor: asset.floor || null, quantity: asset.quantity, spec: assetSpec(asset), location: asset.location, image_url: uploadedAssetImage?.publicUrl || null }) });
      after = rows?.[0];
    } else if (proposal.intent === "increase_asset_quantity") {
      before = await getAsset(proposal.targetAssetId); if (!before) throw new Error("기존 자산을 찾지 못했습니다.");
      const addQuantity = Number(proposal.addQuantity); if (!Number.isInteger(addQuantity) || addQuantity <= 0) throw new Error("추가 수량을 확인해주세요.");
      const payload = { quantity: Number(before.quantity || 0) + addQuantity, ...(uploadedAssetImage?.publicUrl ? { image_url: uploadedAssetImage.publicUrl } : {}) };
      const rows = await request(`banquet_assets?id=eq.${encodeURIComponent(proposal.targetAssetId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) }); after = rows?.[0];
    } else if (proposal.intent === "update_asset_location") {
      before = await getAsset(proposal.targetAssetId); if (!before) throw new Error("기존 자산을 찾지 못했습니다.");
      if (!asset.floor && !asset.location) throw new Error("변경할 위치를 입력해주세요.");
      const payload = { floor: asset.floor || null, location: asset.location || null, ...(uploadedAssetImage?.publicUrl ? { image_url: uploadedAssetImage.publicUrl } : {}) };
      const rows = await request(`banquet_assets?id=eq.${encodeURIComponent(proposal.targetAssetId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) }); after = rows?.[0];
    } else throw new Error("지원하지 않는 자산 작업입니다.");
    if (!after?.id) throw new Error("자산 저장 결과를 확인하지 못했습니다.");
    const auditSaved = await tryPersistAssetAudit(proposal, userText, before, after, after.id);
    const actionLabel = proposal.intent === "create_asset" ? "자산을 등록했습니다." : proposal.intent === "increase_asset_quantity" ? `수량을 ${after.quantity}으로 반영했습니다.` : "보관 위치를 변경했습니다.";
    resetAssetImage(true); aiInput.value = ""; window.dispatchEvent(new CustomEvent("banquet:assets-changed", { detail: { assetId: after.id } }));
    showMessage(auditSaved ? actionLabel : `${actionLabel} 변경 기록 저장은 실패했습니다.`);
  }
  function showMessage(message) { pendingProposal = null; pendingAssetProposal = null; pendingAssetContext = null; aiResult.innerHTML = `<p class="board-ai-status">${escapeHtml(message)}</p>`; }
  function showTransientMessage(message) { aiResult.innerHTML = `<p class="board-ai-status">${escapeHtml(message)}</p>`; }
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

  assetPhotoButton.addEventListener("click", () => assetPhotoInput.click());
  assetPhotoInput.addEventListener("change", () => {
    const file = assetPhotoInput.files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith("image/")) { assetPhotoInput.value = ""; showMessage("이미지 파일만 선택할 수 있습니다."); return; }
    if (selectedAssetPreviewUrl) URL.revokeObjectURL(selectedAssetPreviewUrl);
    selectedAssetImageFile = file; uploadedAssetImage = null; selectedAssetPreviewUrl = URL.createObjectURL(file); assetPhotoButton.dataset.selected = "true";
    aiResult.innerHTML = `<div class="board-asset-heading"><img class="board-asset-thumbnail" src="${escapeHtml(selectedAssetPreviewUrl)}" alt="선택한 자산 사진"><p class="board-ai-status">사진을 선택했습니다. 자산 설명을 입력하거나 바로 보내주세요.</p></div>`;
  });
  aiForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const text = aiInput.value.trim(); if (!text && !selectedAssetImageFile) return;
    let followupContext = pendingAssetProposal?.needsClarification ? pendingAssetContext : null;
    let explicitNewAsset = false;
    if (followupContext && startsNewAssetRequest(text)) { explicitNewAsset = true; await deleteUnlinkedAssetImage(); resetAssetImage(); pendingAssetProposal = null; pendingAssetContext = null; followupContext = null; }
    if (followupContext || explicitNewAsset || selectedAssetImageFile || isAssetIntakeRequest(text)) {
      showTransientMessage(followupContext ? "이전 자산 정보에 답변을 반영하고 있습니다…" : selectedAssetImageFile ? "사진을 업로드하고 자산 내용을 확인하고 있습니다…" : "자산 내용을 확인하고 있습니다…");
      try { const proposal = await interpretAsset(text, null, followupContext); proposal.userText = text; showAssetProposal(proposal, followupContext, text); aiInput.value = ""; }
      catch (error) { console.error("asset intake failed", { status: error.status, body: error.body, error }); await deleteUnlinkedAssetImage(); resetAssetImage(); showMessage(error.message || "자산 확인에 실패했습니다. 저장된 내용은 없습니다."); }
      return;
    }
    showMessage("변경 내용을 확인하고 있습니다…"); try { const proposal = await interpret(text); proposal.userText = text; recentConversation.push({ user: text, proposal }); showProposal(proposal); } catch (error) { console.error(error); showMessage("AI 확인에 실패했습니다. 잠시 후 다시 시도해주세요."); }
  });
  aiInput.addEventListener("input", () => { aiInput.style.height = "auto"; aiInput.style.height = `${Math.min(aiInput.scrollHeight, 112)}px`; });
  aiResult.addEventListener("click", async (event) => {
    if (event.target.closest("[data-asset-cancel]")) { await deleteUnlinkedAssetImage(); resetAssetImage(); aiInput.value = ""; showMessage("자산 반영을 취소했습니다. 저장된 내용은 없습니다."); return; }
    if (event.target.closest("[data-asset-edit]") && pendingAssetProposal) { document.querySelectorAll("#boardAssetProposalForm input").forEach((input) => { input.disabled = false; }); document.querySelector("#boardAssetProposalForm input")?.focus(); return; }
    if (event.target.closest("[data-asset-create-new]") && pendingAssetProposal) { const asset = readAssetFields(); const proposal = { ...pendingAssetProposal, intent: "create_asset", targetAssetId: null, needsClarification: !asset.assetName || asset.quantity == null || !asset.location, asset, confirmationText: "기존 자산과 합치지 않고 새 자산으로 등록할까요?" }; showAssetProposal(proposal, pendingAssetContext, pendingAssetContext?.latestUserText || ""); return; }
    const assetChoice = event.target.closest("[data-asset-choice]");
    if (assetChoice && pendingAssetProposal) { const selected = pendingAssetProposal.choices[Number(assetChoice.dataset.assetChoice)]; const originalText = pendingAssetContext?.latestUserText || pendingAssetProposal.userText || aiInput.value.trim(); showTransientMessage("선택한 자산을 확인하고 있습니다…"); try { const proposal = await interpretAsset(originalText, selected, pendingAssetContext); proposal.userText = originalText; showAssetProposal(proposal, pendingAssetContext, originalText); } catch (error) { console.error(error); await deleteUnlinkedAssetImage(); resetAssetImage(); showMessage(error.message || "대상을 확인하지 못했습니다. 저장된 내용은 없습니다."); } return; }
    if (event.target.closest("[data-asset-approve]") && pendingAssetProposal) { const proposal = pendingAssetProposal; aiResult.innerHTML = `<p class="board-ai-status">승인된 자산 변경을 저장하고 있습니다…</p>`; try { await applyAssetProposal(proposal); } catch (error) { console.error("board asset AI apply failed", { status: error.status, body: error.body, error }); aiResult.innerHTML = `<p class="board-ai-status">${escapeHtml(error.message || "자산 저장에 실패했습니다. 기존 데이터는 유지됩니다.")}</p><div class="board-ai-actions"><button type="button" data-asset-cancel>닫기</button></div>`; } return; }
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
