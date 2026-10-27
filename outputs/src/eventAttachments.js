(function registerEventAttachments(global) {
  const constants = global.BANQUET_ERP_CONSTANTS;
  const config = constants?.supabaseConfig || {};
  const bucket = config.bucket || "event-orders";
  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
  const fieldNotePrefix = "[field_note] ";
  let pendingEventFiles = [];

  function headers(extra = {}) { return { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, ...extra }; }
  async function request(path, options = {}) {
    const response = await fetch(`${config.url}/rest/v1/${path}`, { ...options, headers: headers({ "Content-Type": "application/json", ...(options.headers || {}) }) });
    const text = await response.text();
    if (!response.ok) throw new Error(text || `Supabase ${response.status}`);
    return text ? JSON.parse(text) : null;
  }
  function extensionOf(fileName) { return global.BANQUET_ERP_STORAGE?.fileExtension?.(fileName) || String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ""; }
  function resolvedMimeType(file) { return global.BANQUET_ERP_STORAGE?.resolveFileContentType?.(file) || file?.type || "application/octet-stream"; }
  function safePathSegment(value, fallback) { return String(value || fallback || "item").replace(/[^0-9A-Za-z_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || fallback || "item"; }
  function buildAttachmentStoragePath({ entityType = "event_order", eventOrderId = "", fileName = "", extension = "", now = Date.now(), randomId = crypto.randomUUID() } = {}) {
    const ext = safePathSegment(extension || extensionOf(fileName), "bin").toLowerCase(); const entity = safePathSegment(entityType, "event_order"); const id = safePathSegment(eventOrderId, "unlinked"); const unique = safePathSegment(randomId, "file");
    return `attachments/${entity}/${id}/${Number(now)}_${unique}.${ext}`;
  }
  function fileType(file) { const mimeType = resolvedMimeType(file); return mimeType === "application/pdf" ? "pdf" : mimeType.startsWith("image/") ? "image" : "file"; }
  function storedPath(file) {
    const saved = String(file?.storage_path || file?.storagePath || "").replace(/^\/+/, ""); if (saved) return saved;
    try { const marker = `/storage/v1/object/public/${file?.bucket || bucket}/`; const pathname = decodeURIComponent(new URL(file?.public_url || file?.publicUrl || "").pathname); return pathname.includes(marker) ? pathname.split(marker)[1] : ""; } catch { return ""; }
  }
  function publicUrl(file) { const path = storedPath(file); if (!path && (file?.public_url || file?.publicUrl)) return file.public_url || file.publicUrl; return `${config.url}/storage/v1/object/public/${encodeURIComponent(file.bucket || bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`; }
  function validateFiles(files, imagesOnly = false) {
    const list = [...(files || [])];
    const invalid = list.find((file) => !allowedTypes.has(resolvedMimeType(file)) || (imagesOnly && !resolvedMimeType(file).startsWith("image/")));
    if (invalid) throw new Error(`${invalid.name}: JPG, PNG, WEBP, PDF, XLSX, XLS, DOCX, DOC, PPTX, PPT 파일만 첨부할 수 있습니다.`);
    return list;
  }
  async function compressImage(file, maxSide = 1800, quality = .82) {
    const mimeType = resolvedMimeType(file); if (!mimeType.startsWith("image/") || mimeType === "image/webp" && file.size < 1200000) return file;
    const bitmap = await createImageBitmap(file); const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1800000) { bitmap.close(); return file; }
    const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  }
  async function verifyStorageObject(storagePath) {
    const encoded = storagePath.split("/").map(encodeURIComponent).join("/"); const options = { method: "GET", headers: headers({ Range: "bytes=0-0" }), cache: "no-store" };
    let response = await fetch(publicUrl({ bucket, storage_path: storagePath }), { method: "GET", headers: { Range: "bytes=0-0" }, cache: "no-store" });
    if (!response.ok) response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`, options);
    if (!response.ok) throw new Error("업로드된 첨부파일을 다시 확인하지 못했습니다.");
  }
  function debugUpload(detail) { if (/^(?:localhost|127\.0\.0\.1)$/.test(global.location?.hostname || "")) console.debug("[Event attachment]", detail); }
  async function uploadFile(entityType, entityId, linkType, sourceFile, sortOrder = 0) {
    const sourceMimeType = resolvedMimeType(sourceFile); const normalizedSource = sourceFile.type === sourceMimeType ? sourceFile : new File([sourceFile], sourceFile.name, { type: sourceMimeType, lastModified: sourceFile.lastModified });
    const file = sourceMimeType.startsWith("image/") ? await compressImage(normalizedSource) : normalizedSource; const mimeType = resolvedMimeType(file);
    const storagePath = buildAttachmentStoragePath({ entityType, eventOrderId: entityId, fileName: file.name }); debugUpload({ originalName: sourceFile.name, storagePath, bucket, mimeType });
    const upload = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: headers({ "Content-Type": mimeType, "x-upsert": "false" }), body: file });
    if (!upload.ok) throw new Error(await upload.text() || "첨부파일 업로드에 실패했습니다.");
    await verifyStorageObject(storagePath);
    const rows = await request("files?select=*", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ bucket, storage_path: storagePath, public_url: publicUrl({ bucket, storage_path: storagePath }), original_filename: sourceFile.name, file_type: fileType(file), mime_type: mimeType, file_size: file.size, description: sourceFile.name }) });
    const saved = rows?.[0]; if (!saved?.id) throw new Error("첨부파일 메타데이터를 저장하지 못했습니다.");
    await request("file_links", { method: "POST", body: JSON.stringify({ file_id: saved.id, entity_type: entityType, entity_id: entityId, link_type: linkType, sort_order: sortOrder }) });
    return saved;
  }
  async function uploadEventAttachments(eventOrderId, files) {
    const saved = await Promise.all(validateFiles(files).map((file, index) => uploadFile("event_order", eventOrderId, "event_attachment", file, index)));
    global.dispatchEvent(new CustomEvent("banquet:event-attachments-uploaded", { detail: { eventOrderId, files: saved } }));
    return saved;
  }
  function normalizeCandidate(value) { return String(value || "").trim().replace(/\s+/g, " "); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
  function candidateTime(value) { const match = normalizeCandidate(value).match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/); return match ? `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}` : ""; }
  function extractScheduleCandidates(text, fallbackYear = new Date().getFullYear()) {
    let inheritedDate = "";
    return String(text || "").split(/\r?\n/).map((line) => normalizeCandidate(line)).filter(Boolean).map((line) => {
      const dateMatch = line.match(/(?:(20\d{2})[.\/-])?(\d{1,2})[.\/-](\d{1,2})/); if (dateMatch) inheritedDate = `${dateMatch[1] || fallbackYear}-${String(Number(dateMatch[2])).padStart(2, "0")}-${String(Number(dateMatch[3])).padStart(2, "0")}`;
      const range = line.match(/(\d{1,2}\s*[:시]\s*\d{0,2})\s*[~\-]\s*(\d{1,2}\s*[:시]\s*\d{0,2})/); const time = candidateTime(range?.[1] || line); if (!inheritedDate || !time) return null;
      const content = normalizeCandidate(line.replace(dateMatch?.[0] || "", "").replace(range?.[0] || time, "").replace(/^[·\-\s]+/, ""));
      if (!content || !/(식사|중식|석식|등록|세션|발표|특별|행사|종료|세팅|뷔페|커피)/i.test(content)) return null;
      return { date: inheritedDate, time, endTime: range ? candidateTime(range[2]) : "", venue: "", content };
    }).filter(Boolean);
  }
  function recordAttachmentAnalysis(eventOrderId, eventTitle, analysisText, existingSchedules = [], metadata = {}) {
    const existing = new Set((existingSchedules || []).map((item) => `${normalizeCandidate(item.date)}|${candidateTime(item.time)}|${normalizeCandidate(item.venue)}|${normalizeCandidate(item.content)}`));
    const candidates = extractScheduleCandidates(analysisText, metadata.fallbackYear).filter((item) => !existing.has(`${item.date}|${item.time}|${normalizeCandidate(item.venue)}|${normalizeCandidate(item.content)}`));
    return global.BANQUET_ERP_OPERATION_BOARD?.registerAttachmentScheduleCandidates(eventOrderId, eventTitle, candidates, metadata) || null;
  }
  async function analyzeScheduleAttachments(eventOrderId, eventTitle, files = []) {
    if (!files.length) throw new Error("분석할 첨부자료가 없습니다.");
    if (!config.functionUrl) throw new Error("AI 분석 연결을 확인하지 못했습니다.");
    const response = await fetch(config.functionUrl, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ question: "첨부자료에서 날짜, 시간, 장소, 식사, 등록, 세션, 특별행사, 행사 종료, 세팅 요청만 추출해 scheduleCandidates 배열 JSON으로 답해주세요. 없는 내용은 추측하지 마세요.", attachments: files.map((file) => ({ id: file.id, name: file.original_filename, originalFilename: file.original_filename, mimeType: file.mime_type, type: file.file_type, publicUrl: publicUrl(file), storageBucket: file.bucket, storagePath: file.storage_path })), eventContext: { id: eventOrderId, eventName: eventTitle } }) });
    const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || "첨부자료 분석에 실패했습니다.");
    let candidates = body.analysis?.scheduleCandidates || body.scheduleCandidates || []; const answer = String(body.answer || body.output_text || body.rawText || "");
    if (!Array.isArray(candidates) || !candidates.length) { try { candidates = JSON.parse(answer.match(/\{[\s\S]*\}/)?.[0] || "{}").scheduleCandidates || []; } catch { candidates = []; } }
    const existingRows = await request(`event_schedules?select=schedule_date,schedule_time,venue,content&event_order_id=eq.${encodeURIComponent(eventOrderId)}`).catch(() => []);
    const existing = (existingRows || []).map((item) => ({ date: item.schedule_date, time: item.schedule_time, venue: item.venue, content: item.content }));
    if (!Array.isArray(candidates) || !candidates.length) return recordAttachmentAnalysis(eventOrderId, eventTitle, answer, existing, { attachmentIds: files.map((file) => file.id) });
    const existingKeys = new Set(existing.map((item) => `${normalizeCandidate(item.date)}|${candidateTime(item.time)}|${normalizeCandidate(item.venue)}|${normalizeCandidate(item.content)}`));
    const normalized = candidates.map((item) => ({ date: normalizeCandidate(item.date), time: candidateTime(item.time), endTime: candidateTime(item.endTime || item.end_time), venue: normalizeCandidate(item.venue || item.location), content: normalizeCandidate(item.content || item.title || item.activity), people: Number(item.people) || null })).filter((item) => item.date && item.time && item.content && !existingKeys.has(`${item.date}|${item.time}|${item.venue}|${item.content}`));
    return global.BANQUET_ERP_OPERATION_BOARD?.registerAttachmentScheduleCandidates(eventOrderId, eventTitle, normalized, { attachmentIds: files.map((file) => file.id) }) || null;
  }
  async function approveScheduleCandidates(eventOrderId, candidates) {
    const existing = await request(`event_schedules?select=schedule_date,schedule_time,venue,content&event_order_id=eq.${encodeURIComponent(eventOrderId)}`);
    const keys = new Set((existing || []).map((item) => `${normalizeCandidate(item.schedule_date)}|${candidateTime(item.schedule_time)}|${normalizeCandidate(item.venue)}|${normalizeCandidate(item.content)}`));
    const rows = (candidates || []).filter((item) => !keys.has(`${normalizeCandidate(item.date)}|${candidateTime(item.time)}|${normalizeCandidate(item.venue)}|${normalizeCandidate(item.content)}`)).map((item) => ({ event_order_id: eventOrderId, schedule_date: item.date || "", schedule_time: item.endTime ? `${item.time} ~ ${item.endTime}` : item.time || "", venue: item.venue || "", content: item.content || "", people: Number(item.people) || null }));
    if (rows.length) await request("event_schedules", { method: "POST", body: JSON.stringify(rows) });
    global.dispatchEvent(new CustomEvent("banquet:event-schedules-updated", { detail: { eventOrderId, count: rows.length } })); return rows;
  }
  function openScheduleCandidates(eventOrderId, candidates = [], title = "첨부 일정 후보") {
    const dialog = document.createElement("dialog"); dialog.className = "field-note-editor field-notes-viewer";
    dialog.innerHTML = `<div class="field-notes-viewer-header"><h3>${escapeHtml(title || "첨부 일정 후보")}</h3><button type="button" data-cancel aria-label="닫기">×</button></div><p class="attachment-empty">승인한 일정만 행사 일정에 저장됩니다.</p><form>${candidates.map((item, index) => `<label class="event-attachment-row"><input type="checkbox" name="candidate" value="${index}" checked><span>${escapeHtml(item.date || "날짜 미정")} ${escapeHtml(item.time || "시간 미정")}${item.endTime ? `~${escapeHtml(item.endTime)}` : ""} ${escapeHtml(item.venue || "")} · ${escapeHtml(item.content || "")}</span></label>`).join("") || '<p class="attachment-empty">확인할 일정 후보가 없습니다.</p>'}<footer><button type="button" data-cancel>취소</button><button type="submit" class="primary-button"${candidates.length ? "" : " disabled"}>선택 일정 저장</button></footer></form>`;
    dialog.querySelectorAll("[data-cancel]").forEach((button) => { button.onclick = () => { dialog.close(); dialog.remove(); }; });
    dialog.querySelector("form").onsubmit = async (event) => { event.preventDefault(); const selected = [...dialog.querySelectorAll('input[name="candidate"]:checked')].map((input) => candidates[Number(input.value)]).filter(Boolean); try { await approveScheduleCandidates(eventOrderId, selected); dialog.close(); dialog.remove(); } catch (error) { alert(error.message || "일정 후보를 저장하지 못했습니다."); } };
    document.body.append(dialog); dialog.showModal();
  }
  async function linkedFiles(entityType, entityId, linkType) {
    const links = await request(`file_links?select=file_id,link_type,sort_order,created_at&entity_type=eq.${entityType}&entity_id=eq.${encodeURIComponent(entityId)}&link_type=eq.${linkType}&order=sort_order.asc,created_at.asc`);
    const ids = [...new Set((links || []).map((row) => row.file_id).filter(Boolean))]; if (!ids.length) return [];
    const files = await request(`files?select=id,bucket,storage_path,original_filename,file_type,mime_type,file_size,description,created_at&id=in.(${ids.map(encodeURIComponent).join(",")})`);
    return ids.map((id) => ({ ...(files || []).find((file) => file.id === id), linkType })).filter((file) => file.id);
  }
  function ensureViewer() {
    let dialog = document.querySelector("[data-attachment-viewer]"); if (dialog) return dialog;
    dialog = document.createElement("dialog"); dialog.className = "attachment-viewer"; dialog.dataset.attachmentViewer = "";
    dialog.addEventListener("click", (event) => { if (event.target === dialog || event.target.closest("[data-attachment-close]")) dialog.close(); }); document.body.append(dialog); return dialog;
  }
  function openFile(file, download = false) {
    const url = publicUrl(file);
    if (download) { const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.original_filename || "attachment"; anchor.rel = "noopener"; anchor.click(); return; }
    if (file.file_type === "image" || String(file.mime_type).startsWith("image/")) { const dialog = ensureViewer(); dialog.innerHTML = `<button type="button" data-attachment-close aria-label="닫기">×</button><img src="${url}" alt="${String(file.original_filename || "첨부 이미지").replace(/"/g, "&quot;")}">`; dialog.showModal(); return; }
    window.open(url, "_blank", "noopener");
  }
  async function deleteFile(file) {
    const links = await request(`file_links?select=id&file_id=eq.${encodeURIComponent(file.id)}`); if ((links || []).length > 1) throw new Error("다른 기록에서도 사용하는 파일은 여기서 삭제할 수 없습니다.");
    const storagePath = storedPath(file); if (!storagePath) throw new Error("저장된 첨부파일 경로를 확인하지 못했습니다.");
    const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(file.bucket || bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE", headers: headers() });
    if (!response.ok && response.status !== 404) throw new Error("Storage 파일을 삭제하지 못했습니다.");
    await request(`files?id=eq.${encodeURIComponent(file.id)}`, { method: "DELETE" });
  }
  function fileRow(file, onDelete = null) {
    const row = document.createElement("div"); row.className = "event-attachment-row";
    const name = document.createElement("strong"); name.textContent = file.original_filename || file.description || "첨부자료";
    const actions = document.createElement("div"); const view = document.createElement("button"); view.type = "button"; view.textContent = file.file_type === "image" ? "보기" : "미리보기"; view.onclick = () => openFile(file);
    const download = document.createElement("button"); download.type = "button"; download.textContent = "다운로드"; download.onclick = () => openFile(file, true); actions.append(view, download);
    if (onDelete) { const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "삭제"; remove.onclick = async () => { if (!confirm(`${file.original_filename || "첨부자료"}을 삭제할까요?`)) return; try { await deleteFile(file); await onDelete(); } catch (error) { alert(error.message); } }; actions.append(remove); }
    row.append(name, actions); return row;
  }
  async function renderEventAttachments(container, eventOrderId, allowAdd = true, eventTitle = "") {
    container.innerHTML = '<p class="attachment-empty">첨부자료를 불러오는 중입니다.</p>';
    const files = await linkedFiles("event_order", eventOrderId, "event_attachment").catch(() => []); container.innerHTML = "";
    if (!files.length) container.insertAdjacentHTML("beforeend", '<p class="attachment-empty">등록된 첨부자료가 없습니다.</p>'); else files.forEach((file) => container.append(fileRow(file, allowAdd ? () => renderEventAttachments(container, eventOrderId, allowAdd, eventTitle) : null)));
    if (files.length) { const analyze = document.createElement("button"); analyze.type = "button"; analyze.className = "secondary-button"; analyze.textContent = "첨부 분석"; analyze.onclick = async () => { try { analyze.disabled = true; analyze.textContent = "분석 중..."; const alertItem = await analyzeScheduleAttachments(eventOrderId, eventTitle, files); analyze.textContent = alertItem ? "일정 후보 확인 필요" : "추가 일정 없음"; } catch (error) { analyze.textContent = "첨부 분석"; alert(error.message); } finally { analyze.disabled = false; } }; container.append(analyze); }
    if (allowAdd) { const input = document.createElement("input"); input.type = "file"; input.multiple = true; input.accept = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.doc,.docx,.ppt,.pptx"; input.hidden = true;
      const add = document.createElement("button"); add.type = "button"; add.className = "secondary-button"; add.textContent = "+ 첨부자료"; add.onclick = () => input.click(); input.onchange = async () => { try { add.disabled = true; await uploadEventAttachments(eventOrderId, input.files); await renderEventAttachments(container, eventOrderId, allowAdd, eventTitle); } catch (error) { alert(error.message); } finally { add.disabled = false; } }; container.append(add, input); }
  }
  function openEventAttachments(eventOrderId, eventName = "") {
    const dialog = document.createElement("dialog"); dialog.className = "field-note-editor field-notes-viewer"; const header = document.createElement("div"); header.className = "field-notes-viewer-header"; const title = document.createElement("h3"); title.textContent = `${eventName || "행사"} 첨부자료`; const close = document.createElement("button"); close.type = "button"; close.textContent = "×"; close.setAttribute("aria-label", "닫기"); const content = document.createElement("div"); content.dataset.eventAttachments = ""; close.onclick = () => { dialog.close(); dialog.remove(); }; header.append(title, close); dialog.append(header, content); document.body.append(dialog); renderEventAttachments(content, eventOrderId, true, eventName); dialog.showModal();
  }
  function noteText(note) { return String(note?.content || "").startsWith(fieldNotePrefix) ? String(note.content).slice(fieldNotePrefix.length) : ""; }
  function isFieldNote(note) { return Boolean(noteText(note)); }
  async function fieldNotes(eventOrderId) {
    const notes = await request(`event_notes?select=id,event_order_id,note_type,content,created_at&event_order_id=eq.${encodeURIComponent(eventOrderId)}&note_type=eq.others&order=created_at.asc`);
    const selected = (notes || []).filter(isFieldNote); return Promise.all(selected.map(async (note) => ({ ...note, text: noteText(note), images: await linkedFiles("event_note", note.id, "field_note_image").catch(() => []) })));
  }
  async function saveFieldNote(eventOrderId, text, images) {
    if (!String(text || "").trim()) throw new Error("특이사항 내용을 입력해주세요.");
    const rows = await request("event_notes?select=*", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ event_order_id: eventOrderId, note_type: "others", content: fieldNotePrefix + String(text).trim() }) });
    const note = rows?.[0]; if (!note?.id) throw new Error("특이사항을 저장하지 못했습니다.");
    await Promise.all(validateFiles(images, true).map((file, index) => uploadFile("event_note", note.id, "field_note_image", file, index)));
    global.dispatchEvent(new CustomEvent("banquet:field-note-saved", { detail: { eventOrderId } })); return note;
  }
  function noteRow(note, onDelete = null) { const row = document.createElement("article"); row.className = "field-note-row"; const time = document.createElement("time"); time.textContent = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(note.created_at)); const text = document.createElement("p"); text.textContent = note.text; const images = document.createElement("div"); images.className = "field-note-images"; note.images.forEach((file) => { const image = document.createElement("img"); image.src = publicUrl(file); image.alt = file.original_filename || "현장 사진"; image.loading = "lazy"; image.onclick = () => openFile(file); images.append(image); }); row.append(time, text, images); if (onDelete) { const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "특이사항 삭제"; remove.onclick = async () => { if (!confirm("이 특이사항과 첨부 사진을 삭제할까요?")) return; try { for (const file of note.images) await deleteFile(file); await request(`event_notes?id=eq.${encodeURIComponent(note.id)}`, { method: "DELETE" }); global.dispatchEvent(new CustomEvent("banquet:field-note-saved", { detail: { eventOrderId: note.event_order_id } })); await onDelete(); } catch (error) { alert(error.message); } }; row.append(remove); } return row; }
  async function renderFieldNotes(container, eventOrderId, allowAdd = true) {
    container.innerHTML = '<p class="attachment-empty">특이사항을 불러오는 중입니다.</p>'; const notes = await fieldNotes(eventOrderId).catch(() => []); container.innerHTML = "";
    if (!notes.length) container.insertAdjacentHTML("beforeend", '<p class="attachment-empty">등록된 현장 특이사항이 없습니다.</p>'); else notes.forEach((note) => container.append(noteRow(note, allowAdd ? () => renderFieldNotes(container, eventOrderId, allowAdd) : null)));
    if (allowAdd) { const add = document.createElement("button"); add.type = "button"; add.className = "secondary-button"; add.textContent = "+ 특이사항"; add.onclick = () => openFieldNoteEditor(eventOrderId, container); container.append(add); }
  }
  function openFieldNoteEditor(eventOrderId, refreshContainer = null) {
    const dialog = document.createElement("dialog"); dialog.className = "field-note-editor"; dialog.innerHTML = `<form method="dialog"><h3>현장 특이사항</h3><textarea name="note" rows="4" placeholder="예: 무대 위치 고객 요청으로 변경" required></textarea><div class="field-note-file-actions"><label>촬영<input name="camera" type="file" accept="image/*" capture="environment" hidden></label><label>사진 선택<input name="gallery" type="file" accept="image/*" multiple hidden></label></div><div data-field-note-files></div><footer><button type="button" data-cancel>취소</button><button type="submit" class="primary-button">저장</button></footer></form>`;
    const form = dialog.querySelector("form"); let images = []; const summary = form.querySelector("[data-field-note-files]"); const update = () => { summary.textContent = images.length ? `사진 ${images.length}장 선택` : "사진 첨부 없음"; };
    form.elements.camera.onchange = () => { images.push(...form.elements.camera.files); update(); }; form.elements.gallery.onchange = () => { images.push(...form.elements.gallery.files); update(); };
    form.querySelector("[data-cancel]").onclick = () => { dialog.close(); dialog.remove(); }; form.onsubmit = async (event) => { event.preventDefault(); const save = form.querySelector('[type="submit"]'); try { save.disabled = true; await saveFieldNote(eventOrderId, form.elements.note.value, images); dialog.close(); dialog.remove(); if (refreshContainer) await renderFieldNotes(refreshContainer, eventOrderId, true); } catch (error) { alert(error.message); save.disabled = false; } }; document.body.append(dialog); update(); dialog.showModal();
  }
  function openFieldNotes(eventOrderId, eventName = "") {
    const dialog = document.createElement("dialog"); dialog.className = "field-note-editor field-notes-viewer"; dialog.innerHTML = `<div class="field-notes-viewer-header"><h3>${eventName || "행사"} 특이사항</h3><button type="button" data-cancel aria-label="닫기">×</button></div><div data-event-field-notes></div>`;
    dialog.querySelector("[data-cancel]").onclick = () => { dialog.close(); dialog.remove(); }; document.body.append(dialog); renderFieldNotes(dialog.querySelector("[data-event-field-notes]"), eventOrderId, true); dialog.showModal();
  }
  function mountPendingPicker(container) {
    const input = document.createElement("input"); input.type = "file"; input.multiple = true; input.accept = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.doc,.docx,.ppt,.pptx"; input.hidden = true;
    const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button"; button.textContent = "+ 첨부자료"; const summary = document.createElement("span"); summary.className = "pending-attachment-summary"; const update = () => { summary.textContent = pendingEventFiles.length ? `${pendingEventFiles.length}개 선택됨` : "선택된 첨부자료 없음"; };
    button.onclick = () => input.click(); input.onchange = () => { try { pendingEventFiles.push(...validateFiles(input.files)); update(); } catch (error) { alert(error.message); } input.value = ""; }; container.append(button, input, summary); update();
  }
  global.BANQUET_ERP_EVENT_ATTACHMENTS = { mountPendingPicker, getPendingFiles: () => [...pendingEventFiles], clearPendingFiles: () => { pendingEventFiles = []; }, uploadEventAttachments, renderEventAttachments, openEventAttachments, extractScheduleCandidates, recordAttachmentAnalysis, analyzeScheduleAttachments, openScheduleCandidates, approveScheduleCandidates, renderFieldNotes, openFieldNoteEditor, openFieldNotes, fieldNotes, isFieldNote, noteText, compressImage, openFile, deleteFile, buildAttachmentStoragePath, resolvedMimeType, storedPath, publicUrl };
})(window);
