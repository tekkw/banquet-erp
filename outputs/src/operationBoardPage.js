(function initializeOperationBoardPage() {
  const constants = window.BANQUET_ERP_CONSTANTS;
  const board = window.BANQUET_ERP_OPERATION_BOARD;
  const settingAdvisor = window.BANQUET_ERP_SETTING_ADVISOR;
  const cacheKey = "banquet-erp-events-cache-v6";
  const layoutRecommendations = window.BANQUET_ERP_BOARD_LAYOUT_RECOMMENDATIONS;
  const correctionLogKey = "banquetErp.eventOrderCorrections.v1";
  const app = document.getElementById("boardApp");
  const login = document.getElementById("boardLogin");
  const status = document.getElementById("boardSyncStatus");
  const dateLabel = document.getElementById("boardDateLabel");
  const aiForm = document.getElementById("boardAiForm");
  const aiInput = document.getElementById("boardAiInput");
  const aiResult = document.getElementById("boardAiResult");
  const aiContextLabel = document.getElementById("boardAiContext");
  const aiPlusButton = document.getElementById("boardAiPlusButton");
  const aiPlusMenu = document.getElementById("boardAiPlusMenu");
  const assetPhotoButton = document.getElementById("boardAssetPhotoButton");
  const assetPhotoInput = document.getElementById("boardAssetPhotoInput");
  const visualCamera = document.getElementById("boardVisualCamera");
  const visualVideo = document.getElementById("boardVisualVideo");
  const visualCanvas = document.getElementById("boardVisualCanvas");
  const visualCameraButton = document.getElementById("boardVisualCameraButton");
  const visualCaptureButton = document.getElementById("boardVisualCaptureButton");
  const visualCloseButton = document.getElementById("boardVisualCloseButton");
  const speechButton = document.getElementById("boardSpeechButton");
  const speechStatus = document.getElementById("boardSpeechStatus");
  const voiceReplyButton = document.getElementById("boardVoiceReplyButton");
  const voiceReplyStatus = document.getElementById("boardVoiceReplyStatus");
  const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceReplyStorageKey = "banquetBoard.voiceReplyEnabled";
  const activeEventContextKey = "banquetBoard.activeEventContext.v1";
  const settingAdvisorContextKey = "banquetBoard.settingAdvisorContext.v1";
  const speechSynthesisApi = window.speechSynthesis;
  const SpeechSynthesisUtteranceApi = window.SpeechSynthesisUtterance;
  let events = [];
  let pendingProposal = null;
  let pendingHallStateProposal = null;
  let pendingLayoutRecommendation = null;
  let pendingAssetProposal = null;
  let pendingAssetContext = null;
  let pendingAssetQuery = null;
  let selectedAssetImageFile = null;
  let uploadedAssetImage = null;
  let selectedAssetPreviewUrl = "";
  let selectedAssetFileDataUrl = "";
  let visualStream = null;
  let visualSession = null;
  let recentConversation = [];
  let activeEventContexts = loadActiveEventContexts();
  let settingAdvisorContext = loadSettingAdvisorContext();
  let settingAdvisorRows = [];
  let pendingEventQuery = null;
  let speechRecognition = null;
  let speechListening = false;
  let speechBaseText = "";
  let speechFinalText = "";
  let speechErrorMessage = "";
  let fieldAiAutoSubmit = false;
  let fieldAiAwaitingAnswer = false;
  let voiceReplyEnabled = false;
  let lastSpokenText = "";

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
  function rememberConversation(user, answer) { recentConversation.push({ user, answer }); recentConversation = recentConversation.slice(-3); }
  function loadActiveEventContexts() { try { const value = JSON.parse(sessionStorage.getItem(activeEventContextKey) || "[]"); return Array.isArray(value) ? value.slice(0, 3) : []; } catch { return []; } }
  function loadSettingAdvisorContext() { try { return JSON.parse(sessionStorage.getItem(settingAdvisorContextKey) || "null"); } catch { return null; } }
  function rememberSettingAdvisor(row) {
    settingAdvisorContext = { space: row.space, currentEventOrderId: row.currentEvent.id, nextEventOrderId: row.nextEvent.id, anchorDate: row.anchorDate };
    try { sessionStorage.setItem(settingAdvisorContextKey, JSON.stringify(settingAdvisorContext)); } catch { /* session storage unavailable */ }
    rememberActiveEvent(row.nextEvent);
    renderAiContext();
  }
  function renderAiContext() {
    if (!aiContextLabel) return;
    const context = settingAdvisorContext; const active = activeEventContexts[0];
    const event = context ? events.find((item) => item.id === context.nextEventOrderId) : active ? events.find((item) => item.id === active.eventOrderId) : null;
    if (!event) { aiContextLabel.hidden = true; aiContextLabel.textContent = ""; return; }
    const advisorRow = context ? settingAdvisorRows.find((row) => row.nextEvent.id === event.id) : null; const fallbackPoint = context ? settingAdvisor.schedulePoints(event).filter((point) => point.date >= context.anchorDate).sort((left, right) => left.startAt - right.startAt)[0] : null;
    const date = context ? advisorRow?.nextDate || fallbackPoint?.date : active?.eventDate;
    const time = context ? advisorRow?.nextStart || fallbackPoint?.start : "";
    aiContextLabel.textContent = `현재: ${context?.space || active?.venue || event.venue || "행사"} · ${[date, time, event.eventName].filter(Boolean).join(" ")}`;
    aiContextLabel.hidden = false;
  }
  function rememberActiveEvent(event) {
    const context = { eventOrderId: event.id, eventName: event.eventName, venue: event.venue || event.schedule?.map((row) => row.venue).find(Boolean) || "", eventDate: eventDateKeys(event)[0] || "", storagePath: event.storagePath || "", originalFilename: event.originalFilename || "" };
    activeEventContexts = [context, ...activeEventContexts.filter((item) => item.eventOrderId !== context.eventOrderId)].slice(0, 3);
    try { sessionStorage.setItem(activeEventContextKey, JSON.stringify(activeEventContexts)); } catch { /* session storage unavailable */ }
    renderAiContext();
  }
  async function refresh() {
    status.textContent = "최신 일정 동기화 중";
    try {
      const rows = await request("event_orders?select=*&order=created_at.desc"); const ids = rows.map((row) => row.id);
      if (!ids.length) { events = []; render(); return { ok: true }; }
      const [dates, schedules, items, notes] = await Promise.all([childRows("event_calendar_dates", ids, "calendar_date.asc,id.asc"), childRows("event_schedules", ids, "created_at.asc,id.asc"), childRows("event_items", ids, "created_at.asc,id.asc"), childRows("event_notes", ids, "created_at.asc,id.asc")]);
      const byDate = grouped(dates); const bySchedule = grouped(schedules); const byItem = grouped(items); const byNote = grouped(notes);
      events = rows.map((row) => ({ id: row.id, eventName: row.event_name || "", startDate: row.start_date || "", endDate: row.end_date || "", eventDateTime: row.event_datetime || "", venue: row.venue || "", guestCount: row.guest_count ?? "", eventType: row.event_type || "", mealTypes: row.meal_types || [], internalMemo: row.internal_memo || "", storagePath: row.storage_path || "", originalFilename: row.original_filename || "", layoutText: row.layout_text || row.layout_type || row.layout || "", calendarDates: (byDate[row.id] || []).map((item) => item.calendar_date), schedule: (bySchedule[row.id] || []).map((item) => ({ id: item.id, date: item.schedule_date || "", time: item.schedule_time || "", content: item.content || "", venue: item.venue || "", people: item.people ?? "" })), items: byItem[row.id] || [], notes: byNote[row.id] || [] }));
      localStorage.setItem(cacheKey, JSON.stringify({ version: 6, savedAt: Date.now(), events })); render(); status.textContent = "최신 일정 동기화 완료"; return { ok: true };
    } catch (error) { console.error(error); status.textContent = events.length ? "저장된 일정 표시 중 · 동기화 재시도 필요" : "일정을 불러오지 못했습니다"; return { ok: false, error }; }
  }
  function selectedEvents(date = board.getSelectedDate()) { return events.filter((event) => eventDateKeys(event).includes(date)); }
  function boardCommandDate(text) { if (/내일/.test(text)) return shiftDateKey(seoulTodayKey(), 1); if (/오늘/.test(text)) return seoulTodayKey(); return board.getSelectedDate(); }
  function commandVenueMatches(event, text) {
    const source = normalizedVenue(text).replace(/센터/g, ""); const values = [event.venue, ...(event.schedule || []).map((row) => row.venue)].map((value) => normalizedVenue(value).replace(/센터/g, ""));
    if (/컨벤션AB|컨벤션전체/.test(source)) return values.some((value) => /컨벤션AB|컨벤션전체/.test(value));
    if (/컨벤션A(?!B)/.test(source)) return values.some((value) => /컨벤션A(?!B)|컨벤션[12](?:$|[^0-9])/.test(value));
    if (/컨벤션B/.test(source)) return values.some((value) => /컨벤션B|컨벤션3(?:$|[^0-9])/.test(value));
    const numbered = source.match(/(카프리|부라노)([123])/); if (numbered) return values.some((value) => value.includes(numbered[0]));
    const generic = venueTerm(text); return generic ? eventVenueMatches(event, generic) : true;
  }
  function aiContext(question = "") {
    const selectedDate = boardCommandDate(question); const candidates = selectedEvents(selectedDate).filter((event) => commandVenueMatches(event, question));
    return { selectedDate, expandedSpaceGroups: [...document.querySelectorAll("[data-space-group-toggle][aria-expanded=true]")].map((node) => node.dataset.spaceGroupToggle), events: candidates.map((event) => ({ eventOrderId: event.id, eventName: event.eventName, venue: event.venue || eventVenue(event), guestCount: event.guestCount, schedules: event.schedule.map((row) => ({ scheduleId: row.id, date: row.date, time: row.time, content: row.content, venue: row.venue, people: row.people })) })), recentConversation: recentConversation.slice(-3) };
  }
  function scheduleTimeFromText(text) {
    const match = String(text).match(/(?:(오전|오후)\s*)?(\d{1,2})\s*시(?:\s*(?:(\d{1,2})\s*분|(반)))?/); if (!match) return "";
    let hour = Number(match[2]); const minute = match[4] ? 30 : Number(match[3] || 0); if (match[1] === "오후" && hour < 12) hour += 12; if (match[1] === "오전" && hour === 12) hour = 0;
    return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : "";
  }
  async function interpret(userText, selection = null) {
    const boardContext = aiContext(userText); const response = await fetch(`${constants.supabaseConfig.url}/functions/v1/event-order-ai-chat`, { method: "POST", headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "board_command", question: userText, boardContext, selection }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.message || "AI 해석 실패"); const proposal = body.proposal || {};
    if (proposal.intent === "add_schedule") { proposal.change ||= {}; proposal.change.date = boardContext.selectedDate; proposal.change.time = scheduleTimeFromText(userText); if (!proposal.change.time) { proposal.needsClarification = true; proposal.question = "몇 시 일정인가요?"; } }
    return proposal;
  }
  function seoulTodayKey() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`;
  }
  function shiftDateKey(key, days) { const date = new Date(`${key}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
  function queryPeriod(text, anchorDate = board.getSelectedDate()) {
    const today = seoulTodayKey(); const anchor = /^\d{4}-\d{2}-\d{2}$/.test(anchorDate || "") ? anchorDate : today; const weekday = new Date(`${anchor}T00:00:00Z`).getUTCDay(); const mondayOffset = weekday === 0 ? -6 : 1 - weekday; const weekStart = shiftDateKey(anchor, mondayOffset);
    if (/지난\s*주/.test(text)) { const start = shiftDateKey(weekStart, -7); return { start, end: shiftDateKey(start, 6), label: "지난 주" }; }
    if (/다음\s*주/.test(text)) { const start = shiftDateKey(weekStart, 7); return { start, end: shiftDateKey(start, 6), label: "다음 주" }; }
    if (/이번\s*주/.test(text)) return { start: weekStart, end: shiftDateKey(weekStart, 6), label: "이번 주" };
    if (/다음\s*달/.test(text)) { const next = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); const start = next.toISOString().slice(0, 10); next.setUTCMonth(next.getUTCMonth() + 1); return { start, end: shiftDateKey(next.toISOString().slice(0, 10), -1), label: "다음 달" }; }
    if (/이번\s*달/.test(text)) { const start = `${anchor.slice(0, 7)}-01`; const next = new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1); return { start, end: shiftDateKey(next.toISOString().slice(0, 10), -1), label: "이번 달" }; }
    if (/내일/.test(text)) { const key = shiftDateKey(today, 1); return { start: key, end: key, label: "내일" }; }
    if (/오늘/.test(text)) return { start: today, end: today, label: "오늘" };
    const direct = text.match(/(?:(\d{4})\s*(?:년|[.\/-]))?\s*(\d{1,2})\s*(?:월|[.\/-])\s*(\d{1,2})\s*(?:일)?/);
    if (direct) { const key = `${direct[1] || today.slice(0, 4)}-${String(direct[2]).padStart(2, "0")}-${String(direct[3]).padStart(2, "0")}`; return { start: key, end: key, label: `${Number(direct[2])}/${Number(direct[3])}` }; }
    return null;
  }
  function normalizedVenue(value) { const normalized = String(value || "").toUpperCase().replace(/\s+/g, "").replace(/CONVENTION/g, "컨벤션").replace(/BURANO/g, "부라노").replace(/CAPRI/g, "카프리"); return normalized.replace(/카프리(I{1,3}(?:\+I{1,3})*)/g, (_, units) => `카프리${units.split("+").map((unit) => ({ I: "1", II: "2", III: "3" })[unit] || unit).join("+")}`); }
  function venueTerm(text) { const normalized = normalizedVenue(text); const capri = normalized.match(/카프리(?:[123](?:\+[123])*)?/); if (capri) return capri[0]; return ["컨벤션", "부라노", "페스타", "포이어"].find((name) => normalized.includes(name)) || ""; }
  function eventVenueMatches(event, term) { if (!term) return true; return [event.venue, ...(event.schedule || []).map((row) => row.venue)].map(normalizedVenue).some((value) => value.includes(normalizedVenue(term))); }
  function eventDateKeys(event) { return [...new Set([...(event.calendarDates || []), event.startDate, event.endDate, String(event.eventDateTime || "").slice(0, 10), ...(event.schedule || []).map((row) => row.date)].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort(); }
  function eventInPeriod(event, period) {
    if (!period) return true;
    const calendarDates = (event.calendarDates || []).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key));
    if (calendarDates.some((key) => key >= period.start && key <= period.end)) return true;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(event.startDate || "") ? event.startDate : String(event.eventDateTime || "").slice(0, 10);
    const end = /^\d{4}-\d{2}-\d{2}$/.test(event.endDate || "") ? event.endDate : start;
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) && start <= period.end && (end || start) >= period.start) return true;
    return (event.schedule || []).some((row) => row.date >= period.start && row.date <= period.end);
  }
  function eventQueryType(text) { if (/(원본|엑셀|파일).*(띄워|열어|보여|보기)|(?:띄워|열어|보여).*(원본|엑셀)/i.test(text)) return "open_event_original"; if (/레이아웃|배치|스쿨식|극장식|라운드/i.test(text)) return "get_event_layout"; if (/인원|몇\s*명|guest/i.test(text)) return "get_event_guest_count"; if (/일정|스케줄|몇\s*시|커피\s*브레이크|커피브레이크/i.test(text)) return "get_event_schedule"; if (/메뉴|품목|아이템|식음|장비/i.test(text)) return "get_event_items"; return "find_events_by_period_space"; }
  function isEventQueryRequest(text) { if (/(바꿔|변경|수정)/.test(text)) return false; if (/(추가|넣어|생겼|등록해)/.test(text) && /(일정|커피\s*브레이크|커피브레이크|체크인|중식|석식|프리미팅|리허설|행사\s*(?:시작|종료))/.test(text)) return false; const hasContext = activeEventContexts.length > 0; const hasContextReference = /(그\s*행사|그거|해당\s*행사)/.test(text) && hasContext; const contextFollowup = hasContext && /원본|엑셀|레이아웃|배치|인원|몇\s*명|일정|스케줄|몇\s*시|커피\s*브레이크|커피브레이크|메뉴|품목/.test(text); const explicitEventData = /행사|이벤\s*오더|이벤트\s*오더|원본|엑셀|몇\s*명|인원|커피\s*브레이크|커피브레이크/.test(text); return Boolean(hasContextReference || contextFollowup || ((explicitEventData || (queryPeriod(text) && /레이아웃|배치/.test(text))) && (queryPeriod(text) || venueTerm(text) || hasContext))); }
  function displayEventDate(event, period = null) { const keys = eventDateKeys(event); const key = (period ? keys.find((value) => value >= period.start && value <= period.end) : "") || keys[0] || "날짜 미등록"; return /^\d{4}-/.test(key) ? `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}` : key; }
  function eventVenue(event) { return event.venue || event.schedule?.map((row) => row.venue).find(Boolean) || "장소 미등록"; }
  function eventChoiceLabel(event, period = null) { return `${displayEventDate(event, period)} ${eventVenue(event)} ${event.eventName || "행사명 미등록"}`; }
  function textValues(row) { return Object.values(row || {}).filter((value) => ["string", "number"].includes(typeof value)).map(String); }
  function explicitLayoutTexts(event) {
    const pattern = /(레이아웃|배치|스쿨식|극장식|라운드|U\s*자|좌석|테이블)/i;
    return [...new Set([event.layoutText, ...(event.notes || []).filter((row) => row.note_type === "layout_eqp" || pattern.test(row.content || "")).map((row) => row.content), ...(event.items || []).map((row) => row.item_name).filter((value) => pattern.test(value || "")), ...(event.schedule || []).map((row) => row.content).filter((value) => pattern.test(value || ""))].map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 8);
  }
  function extractedLayoutTexts(event) { return [...new Set([event.layoutText, ...(event.notes || []).filter((row) => row.note_type === "layout_eqp").map((row) => row.content)].map((value) => String(value || "").trim()).filter(Boolean))]; }
  function fallbackLayoutTexts(event) { const pattern = /(레이아웃|배치|스쿨식|극장식|라운드|class\s*type|school|theater|round|U\s*자|좌석|테이블)/i; return [...new Set([...(event.notes || []).filter((row) => row.note_type !== "layout_eqp" && pattern.test(row.content || "")).map((row) => row.content), ...(event.items || []).map((row) => row.item_name).filter((value) => pattern.test(value || "")), ...(event.schedule || []).map((row) => row.content).filter((value) => pattern.test(value || ""))].map((value) => String(value || "").trim()).filter(Boolean))]; }
  async function savedEventLayout(event) {
    try { const states = await request(`hall_current_states?select=source_layout_id&source_event_order_id=eq.${encodeURIComponent(event.id)}&source_layout_id=not.is.null&order=updated_at.desc&limit=1`); if (!states?.[0]?.source_layout_id) return null; const layouts = await request(`venue_layouts?select=id,layout_name,layout_type,table_type,table_count,min_people,max_people,layout_notes&id=eq.${encodeURIComponent(states[0].source_layout_id)}&is_active=eq.true&limit=1`); return layouts?.[0] || null; } catch (error) { console.warn("saved event layout lookup skipped", error); return null; }
  }
  function showEventChoices(result, userText) {
    pendingEventQuery = { result, userText }; const label = [result.period?.label, result.venue, "행사"].filter(Boolean).join(" "); const answer = `${label || "조건에 맞는 행사"}는 ${result.events.length}건입니다.`;
    aiResult.innerHTML = `<div class="board-event-query-result"><h3>${escapeHtml(label || "등록 행사 검색")}</h3><p>${escapeHtml(answer)} 하나를 선택해주세요.</p><div class="board-ai-choices">${result.events.map((event, index) => `<button class="board-ai-choice" type="button" data-event-query-choice="${index}">${escapeHtml(eventChoiceLabel(event, result.period))}</button>`).join("")}</div></div>`;
    rememberConversation(userText, answer); speakBoardReply(`${answer} 화면에서 하나를 선택해주세요.`); finishFieldAiAnswer();
  }
  async function showEventAnswer(event, queryType, userText, period = null) {
    rememberActiveEvent(event); pendingEventQuery = null; let answer = ""; let details = ""; let sourceBadge = "";
    if (queryType === "open_event_original") { if (!event.storagePath) answer = "등록된 원본 파일이 없습니다."; else { answer = `${event.eventName || "선택한 행사"}의 원본 엑셀을 열었습니다.`; window.openStoredExcel(event.storagePath); } }
    else if (queryType === "get_event_guest_count") answer = event.guestCount !== "" && event.guestCount != null ? `${event.eventName || "선택한 행사"}의 등록 인원은 ${event.guestCount}명입니다.` : "등록된 이벤오더에서 인원 정보를 찾지 못했습니다.";
    else if (queryType === "get_event_schedule") { const rows = (event.schedule || []).filter((row) => !/커피\s*브레이크|커피브레이크/i.test(userText) || /커피\s*브레이크|커피브레이크/i.test(row.content)); answer = rows.length ? `${event.eventName || "선택한 행사"}의 등록 일정입니다.` : "등록된 이벤오더에서 일정 정보를 찾지 못했습니다."; details = rows.map((row) => [row.date, row.time, row.content, row.venue].filter(Boolean).join(" · ")).join("\n"); }
    else if (queryType === "get_event_items") { const rows = event.items || []; answer = rows.length ? `${event.eventName || "선택한 행사"}의 등록 품목입니다.` : "등록된 이벤오더에서 품목 정보를 찾지 못했습니다."; details = rows.slice(0, 20).map((row) => [row.item_name, row.quantity, row.amount].filter((value) => value !== "" && value != null).join(" · ")).join("\n"); }
    else if (queryType === "get_event_layout") { const saved = await savedEventLayout(event); const extracted = extractedLayoutTexts(event); const fallback = fallbackLayoutTexts(event); if (saved) { sourceBadge = "저장 레이아웃"; answer = `${event.eventName || "선택한 행사"}의 저장 레이아웃은 ${saved.layout_name || saved.layout_type}입니다.`; details = [saved.layout_type, saved.table_type, saved.table_count != null ? `${saved.table_count}T` : "", saved.layout_notes].filter(Boolean).join(" · "); } else if (extracted.length) { sourceBadge = "원본 이벤오더 기준"; answer = `원본 이벤오더에는 ${extracted.join(", ")}으로 기재되어 있습니다.`; details = extracted.join("\n"); } else if (fallback.length) { sourceBadge = "등록 운영 데이터"; answer = `${event.eventName || "선택한 행사"}의 등록 데이터에서 레이아웃 정보를 찾았습니다.`; details = fallback.join("\n"); } else answer = "등록된 이벤오더에서 레이아웃 정보를 찾지 못했습니다."; }
    else answer = `${displayEventDate(event, period)} · ${eventVenue(event)}\n${event.eventName || "행사명 미등록"}${event.guestCount !== "" ? `\n${event.guestCount}명` : ""}`;
    const actions = `<div class="board-ai-actions">${event.storagePath ? '<button type="button" data-event-query-action="open_event_original">원본 엑셀 보기</button>' : ""}<button type="button" data-event-query-action="get_event_schedule">일정 보기</button><button type="button" data-event-query-action="get_event_layout">레이아웃 보기</button></div>`;
    aiResult.innerHTML = `<article class="board-event-query-card" data-event-order-id="${escapeHtml(event.id)}"><h3>${escapeHtml(displayEventDate(event, period))} · ${escapeHtml(eventVenue(event))}</h3><strong>${escapeHtml(event.eventName || "행사명 미등록")}</strong>${sourceBadge ? `<small class="board-event-source-badge">${escapeHtml(sourceBadge)}</small>` : ""}<p>${escapeHtml(answer).replace(/\n/g, "<br>")}</p>${details ? `<pre>${escapeHtml(details)}</pre>` : ""}${actions}</article>`;
    rememberConversation(userText, answer); speakBoardReply(answer); finishFieldAiAnswer();
  }
  async function handleEventQuery(text, selectedEvent = null, forcedType = "") {
    const queryType = forcedType || eventQueryType(text); const anchorDate = board.getSelectedDate(); const hasRelativePeriod = /(이번|다음|지난)\s*(?:주|달)/.test(text); let period = queryPeriod(text, anchorDate); const venue = venueTerm(text); const allowAll = /전체\s*(?:보여|알려|검색)?/.test(text); let matches = [];
    if (hasRelativePeriod && !period) { showMessage("요청한 기간을 해석하지 못했습니다. 이번 주, 다음 주처럼 다시 말씀해주세요.", true); return; }
    if (!period && venue && !allowAll) period = queryPeriod("이번 주", anchorDate);
    if (selectedEvent) matches = [selectedEvent]; else if (!period && !venue && activeEventContexts[0]) matches = events.filter((event) => event.id === activeEventContexts[0].eventOrderId); else matches = events.filter((event) => eventInPeriod(event, period) && eventVenueMatches(event, venue));
    matches.sort((left, right) => { const leftDate = eventDateKeys(left).find((key) => !period || (key >= period.start && key <= period.end)) || eventDateKeys(left)[0] || "9999-99-99"; const rightDate = eventDateKeys(right).find((key) => !period || (key >= period.start && key <= period.end)) || eventDateKeys(right)[0] || "9999-99-99"; return leftDate.localeCompare(rightDate) || String(left.eventName).localeCompare(String(right.eventName), "ko"); });
    console.debug("event query debug", { inputText: text, anchorDate, resolvedPeriod: period, venueTerm: venue, totalEvents: events.length, periodMatched: events.filter((event) => eventInPeriod(event, period)).length, venueMatched: events.filter((event) => eventVenueMatches(event, venue)).length, finalMatched: matches.length });
    if (!matches.length) { const answer = "등록된 이벤오더에서 조건에 맞는 행사를 찾지 못했습니다."; rememberConversation(text, answer); showMessage(answer, true); return; }
    const queryResult = { queryType, resolvedPeriod: period ? { start: period.start, end: period.end } : null, matchedCount: matches.length, period, venue, events: matches };
    if (matches.length > 1) { showEventChoices(queryResult, text); return; }
    await showEventAnswer(matches[0], queryType, text, period);
  }
  function isAssetAnalyticsRequest(text) { return /(재고.*(?:이하|부족|낮은|적은)|(?:오늘|어제|이번\s*주|지난\s*주|이번\s*달|지난\s*달|최근\s*(?:7|30)일).*(?:썼|사용|소모|들어온|입고|추가된|옮|이동|자산\s*현황)|(?:가장|많이|순위|top).*(?:사용|썼|소모|옮|이동)|자산.*(?:현황|요약|활동))/i.test(text); }
  function isAssetQueryRequest(text) { return isAssetAnalyticsRequest(text) || /(어디|어느\s*위치|위치.*(?:알려|보여|뭐)|몇\s*(?:개|장|박스|세트|대|병|롤|팩)?\s*(?:있|남)|뭐\s*(?:있|있지|보여)|목록|사진\s*(?:보여|있)|찾아\s*줘|검색\s*해|보유\s*(?:수량|현황)|이동\s*이력|최근\s*이동|마지막.*옮)/i.test(text); }
  function isAssetDecreaseRequest(text) { return /(?:\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:개|ea|box|박스|세트|대|병|롤|팩)/i.test(text) && /(썼|사용(?:했|해|함|\s*$)|소모|가져갔|가져감|출고|나갔|꺼냈|소비)/i.test(text); }
  function isAssetMoveRequest(text) { return /(창고|사무실|선반|린넨|부라노|컨벤션|\d+\s*(?:층|f))/i.test(text) && /(옮겼|옮겨|이동(?:했|해|함)?|위치\s*변경)/i.test(text); }
  function isAssetIntakeRequest(text) { const explicitMutation = isAssetDecreaseRequest(text) || isAssetMoveRequest(text) || (/(자산|비품|소모품|장비|서무|종이컵|멀티탭|수량|위치|보관)/i.test(text) && /(?:등록해|등록했|넣었|추가해|추가했|입고했|늘려|증가시켜|옮겼|옮겨|이동했|위치\s*바꿔|위치\s*변경해|보관했|발견했)/i.test(text)); if (!explicitMutation) return false; return !/(?:알려\s*줘?|뭐야|어디\s*(?:있어|야)|몇\s*(?:개|장|명|박스|세트|대|병|롤|팩)?|보여\s*줘?|추천해\s*줘?)/i.test(text) || isAssetDecreaseRequest(text) || isAssetMoveRequest(text); }
  function isBoardCommandRequest(text) { return /(일정|스케줄|커피\s*브레이크|커피브레이크|체크인|중식|석식|프리미팅|리허설|행사\s*(?:시작|종료)|인원|게스트|메모)/i.test(text) && /(추가|넣어|수정|변경|바꿔|등록|남겨|적어)/i.test(text); }
  function isVisualQueryRequest(text) { return /(이거|이것|사진|화면|보이|몇\s*개|자산에|등록돼|세팅|장면|다시.*(?:봐|보)|이상한|문제)/i.test(text); }
  function isDeicticVisualQuery(text) { return /(?:이거|이것|저거|저것|이\s*물건|지금\s*보이는|앞에\s*있는|이\s*세팅)/i.test(text); }
  function isHallStateQueryRequest(text) { return /(부라노|컨벤션|카프리|페스타|포이어|foyer)/i.test(text) && /(?:지금|현재).*(?:세팅|상태).*(?:보여|알려|뭐|어떻게)|(?:세팅|상태).*(?:보여|알려)/i.test(text); }
  function isHallStateConfirmationRequest(text) { return /(스쿨식|라운드|극장식|u자|세팅|좌석|테이블|\d+\s*(?:석|t)|비어\s*있|철수)/i.test(text) && /(그대로|현재|지금|확인|세팅|상태|변경|바꿨|바꿨어|비어\s*있|철수)/i.test(text); }
  function hallStateLayout(text) { return /비어\s*있|철수|empty/i.test(text) ? "empty" : /스쿨|school/i.test(text) ? "스쿨식" : /라운드|round|원형/i.test(text) ? "라운드" : /극장|theater/i.test(text) ? "극장식" : /u\s*자|u[- ]?shape/i.test(text) ? "U자" : ""; }
  function normalizeHallName(text) { return String(text || "").toUpperCase().replace(/\s+/g, "").replace(/CONVENTION/g, "컨벤션").replace(/BURANO/g, "부라노").replace(/CAPRI/g, "카프리").replace(/FESTA/g, "페스타"); }
  function currentStateConventionUnit(value) { const text = normalizeHallName(value).replace(/센터/g, ""); if (/컨벤션(?:AB|전체|ALL)/i.test(text)) return "AB"; if (/컨벤션(?:A|1|2)(?:$|[^0-9])/i.test(text)) return "A"; if (/컨벤션(?:B|3)(?:$|[^0-9])/i.test(text)) return "B"; return ""; }
  function operationalHallMatches(spaces, text) {
    const unit = currentStateConventionUnit(text); if (unit) {
      const convention = spaces.filter((space) => /^컨벤션(?:센터)?\s*[123]$/i.test(String(space.space_name || "").replace(/\s+/g, ""))); const member = (number) => convention.find((space) => new RegExp(`${number}$`).test(String(space.space_name || ""))); const one = member(1); const two = member(2); const three = member(3);
      if (!one || !two || !three) return [];
      return [{ ...(unit === "B" ? three : one), space_name: `컨벤션 ${unit}`, space_code: `CONV_${unit}`, memberSpaceIds: unit === "A" ? [one.id, two.id] : unit === "B" ? [three.id] : [one.id, two.id, three.id], conventionUnit: unit }];
    }
    const normalized = normalizeHallName(text); return spaces.filter((space) => normalized.includes(normalizeHallName(space.space_name)));
  }
  async function currentHallState(space) {
    const ids = space.memberSpaceIds || [space.id]; const rows = await request(`hall_current_states?select=*&space_id=in.(${ids.join(",")})&order=updated_at.desc`);
    if (!space.conventionUnit) return rows?.[0] || null;
    if (space.conventionUnit === "AB") return rows.find((row) => row.space_key === "CONV_AB" || currentStateConventionUnit(row.venue_name) === "AB") || null;
    return rows.find((row) => row.space_key !== "CONV_AB" && currentStateConventionUnit(row.venue_name) !== "AB") || null;
  }
  async function interpretHallState(text) {
    const spaces = await request("venue_spaces?select=id,space_name,space_code,floor&is_active=eq.true&order=space_name.asc");
    const matches = operationalHallMatches(spaces, text);
    if (matches.length !== 1) throw new Error(matches.length ? "확인할 연회장을 하나만 입력해주세요." : "연회장 이름을 함께 입력해주세요. 예: 부라노1 30석 스쿨식 그대로야");
    const seats = text.match(/(\d+)\s*석/i); const tables = text.match(/(\d+)\s*(?:t|테이블)/i); const layoutType = hallStateLayout(text); const empty = layoutType === "empty";
    if (!layoutType && !seats && !tables) throw new Error("레이아웃 타입이나 좌석·테이블 수를 입력해주세요.");
    const existing = await currentHallState(matches[0]);
    return { space: matches[0], previous: existing, layoutType: layoutType || existing?.layout_type || null, seats: empty ? 0 : seats ? Number(seats[1]) : existing?.seats ?? null, tables: empty ? 0 : tables ? Number(tables[1]) : existing?.tables ?? null, userText: text };
  }
  async function showHallStateQuery(text) {
    const spaces = await request("venue_spaces?select=id,space_name,space_code&is_active=eq.true&order=space_name.asc"); const matches = operationalHallMatches(spaces, text);
    if (matches.length !== 1) throw new Error("확인할 연회장 이름을 하나만 입력해주세요.");
    const state = await currentHallState(matches[0]);
    if (!state) { const answer = `${matches[0].space_name} 현재 세팅은 아직 확인되지 않았습니다.`; rememberConversation(text, answer); showMessage(answer); return; }
    const layouts = state.source_layout_id ? await request(`venue_layouts?select=id,layout_name&id=eq.${encodeURIComponent(state.source_layout_id)}&is_active=eq.true&limit=1`) : []; const layout = layouts?.[0];
    const answer = `${matches[0].space_name}은 현재 ${[state.layout_type, state.tables != null ? `${state.tables}T` : "", state.seats != null ? `${state.seats}석` : ""].filter(Boolean).join(" · ")}으로 확인되어 있습니다.`;
    aiResult.innerHTML = `<div class="board-ai-proposal"><h3>${escapeHtml(matches[0].space_name)} 현재 세팅</h3><p>${escapeHtml(answer)}</p><p class="board-ai-status">${state.source_layout_id ? layout ? `현재 도면: ${escapeHtml(layout.layout_name)}` : "연결된 도면을 찾을 수 없습니다." : "연결된 도면 없음"}</p>${layout ? `<div class="board-ai-actions"><a class="secondary-button" href="../index.html?layoutPreview=${encodeURIComponent(layout.id)}">현재 도면 보기</a></div>` : ""}</div>`; rememberConversation(text, answer); speakBoardReply(answer); finishFieldAiAnswer();
  }
  function showHallStateProposal(proposal) {
    pendingHallStateProposal = proposal; pendingProposal = null;
    aiResult.innerHTML = `<div class="board-ai-proposal"><h3>현재 세팅 확인</h3><p><strong>${escapeHtml(proposal.space.space_name)}</strong></p><p>${escapeHtml([proposal.layoutType, proposal.tables != null ? `${proposal.tables}T` : "", proposal.seats != null ? `${proposal.seats}석` : ""].filter(Boolean).join(" · ") || "세팅 상세 미입력")}</p><p class="board-ai-status">사용자가 확인한 현재 상태로 저장합니다. 행사 종료 후에도 유지됩니다.</p><div class="board-ai-actions"><button type="button" class="primary-button" data-hall-state-approve>현재 상태 확인</button><button type="button" class="secondary-button" data-hall-state-cancel>취소</button></div></div>`;
    speakBoardReply(`${proposal.space.space_name} 현재 세팅 내용을 확인해주세요.`); finishFieldAiAnswer();
  }
  async function applyHallStateProposal(proposal) {
    const user = storedUser(); const payload = { space_id: proposal.space.id, space_key: proposal.space.space_code || null, venue_name: proposal.space.space_name, layout_type: proposal.layoutType, seats: proposal.seats, tables: proposal.tables, equipment: proposal.previous?.equipment || {}, note: proposal.previous?.note || null, source: "manual_confirmed", source_event_order_id: null, source_layout_id: null, confidence: 1, confirmed_at: new Date().toISOString(), confirmed_by: user?.label || user?.id || "ERP 사용자", updated_at: new Date().toISOString() };
    const rows = await request("hall_current_states?on_conflict=space_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) });
    if (!rows?.[0]?.id) throw new Error("현재 세팅 저장 결과가 없습니다.");
    pendingHallStateProposal = null; aiInput.value = ""; showMessage(`${proposal.space.space_name} 현재 세팅을 확인 상태로 저장했습니다.`, true);
  }
  function isLayoutRecommendationRequest(text) {
    if (!layoutRecommendations || /(이|그|해당)\s*행사/.test(text)) return false;
    const parsed = layoutRecommendations.parseRequest(text);
    const knownType = ["school", "round", "u_shape", "box_shape", "t_shape", "theater"].includes(parsed.layoutType);
    return knownType && /(부라노|컨벤션|카프리|페스타|포이어|foyer)/i.test(text) && /(추천|레이아웃|배치|세팅|보여|알려)/i.test(text);
  }
  function isSettingAdvisorRequest(text) {
    if (/(다음\s*(?:세팅|행사)|오늘.*끝나고.*세팅|끝나.*(?:세팅|준비)|밤에.*세팅|내일\s*행사\s*준비|(?:뭐부터|뭘)\s*(?:준비|세팅)|세팅\s*상담|지금\s*바꿔야|오늘.*해두는\s*게|오늘.*세팅.*(?:낫|좋)|오늘\s*뭐부터\s*세팅)/i.test(text)) return true;
    return Boolean((settingAdvisorContext || settingAdvisorRows.length) && (/(컨벤션|부라노|카프리|페스타|포이어).*(?:부터\s*보자|상담)|다음\s*행사|인원|몇\s*명|몇\s*시\s*(?:시작|끝)|레이아웃\s*뭐|테이블.*(?:몇|였나)|현재\s*세팅|의자\s*몇|원본.*(?:보여|열어)|오늘\s*바로|오늘.*해야|밤에.*(?:해두|세팅)/i.test(text)));
  }
  function boardAiRoute(text) {
    if (isSettingAdvisorRequest(text)) return "setting_advisor";
    if (isEventQueryRequest(text)) return "event_query";
    if (isLayoutRecommendationRequest(text)) return "recommend_layouts";
    if (isHallStateQueryRequest(text)) return "hall_state_query";
    if (isAssetQueryRequest(text)) return "asset_query";
    if (isBoardCommandRequest(text)) return "board_command";
    if (isAssetIntakeRequest(text)) return "asset_intake";
    return "board_command";
  }
  function settingLayoutLabel(layout) { return layout?.layoutType ? layoutRecommendations.layoutTypeLabel(layout.layoutType) : "미확인"; }
  async function buildSettingAdvisorRows(text) {
    const anchor = settingAdvisor.anchorDate(text, board.getSelectedDate(), seoulTodayKey());
    const baseRows = settingAdvisor.buildCandidates(events, anchor, board.spacesOverlap);
    const [spaces, states] = await Promise.all([request("venue_spaces?select=id,space_name,space_code&is_active=eq.true&order=space_name.asc"), request("hall_current_states?select=*&order=updated_at.desc")]);
    const enriched = await Promise.all(baseRows.map(async (row) => {
      const matchedSpaces = operationalHallMatches(spaces, row.space); const ids = new Set(matchedSpaces.flatMap((space) => space.memberSpaceIds || [space.id]));
      const currentState = states.find((state) => ids.has(state.space_id) || normalizeHallName(state.venue_name) === normalizeHallName(row.space)) || null;
      const saved = await savedEventLayout(row.nextEvent); const currentLayout = settingAdvisor.layoutFacts(currentState || {}); const eventLayout = settingAdvisor.layoutFacts(row.nextEvent); const savedLayout = settingAdvisor.layoutFacts(saved || {}); const nextLayout = { ...eventLayout, ...savedLayout, layoutType: savedLayout.layoutType || eventLayout.layoutType, tables: savedLayout.tables ?? eventLayout.tables, seats: savedLayout.seats ?? eventLayout.seats, sourceLayoutId: savedLayout.sourceLayoutId || eventLayout.sourceLayoutId }; const change = settingAdvisor.compare(currentLayout, nextLayout);
      return { ...row, currentState, savedLayout: saved, currentLayout, nextLayout, change, advice: settingAdvisor.recommendation(row, change), taskSummary: settingAdvisor.taskSummary(currentLayout, nextLayout, change) };
    }));
    return settingAdvisor.prioritize(enriched);
  }
  function settingAdvisorCard(row, index) {
    return `<button type="button" class="board-setting-advisor-card" data-setting-advisor-select="${index}"><time>${escapeHtml(row.nextDate.slice(5).replace("-", "/"))} ${escapeHtml(row.nextStart)}</time><strong>${escapeHtml(row.space)}</strong><span>${escapeHtml(row.nextEvent.eventName || "행사명 미등록")}</span></button>`;
  }
  async function showSettingAdvisorList(text = "") {
    settingAdvisorRows = await buildSettingAdvisorRows(text); settingAdvisorContext = null; try { sessionStorage.removeItem(settingAdvisorContextKey); } catch { /* session storage unavailable */ }
    renderAiContext();
    if (!settingAdvisorRows.length) { showMessage("선택 날짜 종료 후 30일 이내에 이어지는 세팅을 찾지 못했습니다."); return; }
    aiResult.innerHTML = `<section><h3>다음 행사 준비</h3><p class="board-ai-status">${escapeHtml(settingAdvisorRows[0].anchorDate)} 종료 후 준비할 다음 행사 ${settingAdvisorRows.length}건</p><div class="board-setting-advisor-list">${settingAdvisorRows.map(settingAdvisorCard).join("")}</div></section>`;
    speakBoardReply(`${Number(settingAdvisorRows[0].anchorDate.slice(8))}일 종료 후 준비할 다음 행사는 ${settingAdvisorRows.length}건입니다. 화면을 확인해주세요.`); finishFieldAiAnswer();
  }
  function currentSettingAdvisorRow() { return settingAdvisorRows.find((row) => row.currentEvent.id === settingAdvisorContext?.currentEventOrderId && row.nextEvent.id === settingAdvisorContext?.nextEventOrderId) || null; }
  function showSettingAdvisorDetail(row) {
    rememberSettingAdvisor(row); const answer = `${row.nextDate.slice(5).replace("-", "/")} ${row.nextStart} ${row.space} ${row.nextEvent.eventName || "행사명 미등록"}을 선택했습니다.`;
    aiResult.innerHTML = `<article class="board-setting-advisor-card"><h3>행사 선택됨</h3><p>${escapeHtml(answer)}</p><p class="board-ai-status">인원, 레이아웃, 종료 시각, 현재 세팅 차이 또는 원본을 물어보세요.</p><div class="board-ai-actions"><button type="button" data-setting-advisor-back>전체 목록</button></div></article>`; rememberConversation("행사 선택", answer); speakBoardReply(answer); finishFieldAiAnswer();
  }
  async function handleSettingAdvisor(text) {
    if (!settingAdvisorRows.length || !settingAdvisorContext) settingAdvisorRows = await buildSettingAdvisorRows(text);
    const named = settingAdvisorRows.find((row) => normalizedVenue(text).includes(normalizedVenue(row.space).replace(/센터/g, "")) || normalizedVenue(row.space).includes(venueTerm(text)));
    if (named && /부터\s*보자|상담/.test(text)) { showSettingAdvisorDetail(named); return; }
    const row = currentSettingAdvisorRow() || named;
    if (!row) { await showSettingAdvisorList(text); return; }
    if (/원본|엑셀/.test(text)) { if (row.nextEvent.storagePath) { rememberActiveEvent(row.nextEvent); window.openStoredExcel(row.nextEvent.storagePath); showMessage(`${row.nextEvent.eventName || "다음 행사"} 원본 엑셀을 열었습니다.`, true); } else showMessage("다음 행사에 등록된 원본 파일이 없습니다."); return; }
    let answer = "";
    if (/몇\s*명|인원/.test(text)) answer = row.nextEvent.guestCount !== "" ? `다음 행사 등록 인원은 ${row.nextEvent.guestCount}명입니다.` : "등록된 데이터에서 다음 행사 인원을 확인하지 못했습니다.";
    else if (/몇\s*시.*시작/.test(text)) answer = `다음 행사는 ${row.nextDate} ${row.nextStart}에 시작합니다.`;
    else if (/몇\s*시.*끝/.test(text)) answer = row.nextEnd ? `다음 행사는 ${row.nextEnd}에 끝납니다.` : "등록된 데이터에서 다음 행사 종료 시간을 확인하지 못했습니다.";
    else if (/테이블|\d+\s*t/i.test(text)) { const claimed = text.match(/(\d+)\s*t/i); const tables = row.nextLayout.tables; answer = tables == null || (claimed && Number(claimed[1]) !== Number(tables)) ? "등록된 데이터에서 테이블 수를 확인하지 못했습니다." : `원본 이벤오더에는 등록 테이블 ${tables}T로 기재되어 있습니다.`; }
    else if (/레이아웃/.test(text)) answer = row.nextLayout.layoutType ? `다음 행사 레이아웃은 ${settingLayoutLabel(row.nextLayout)}${row.nextLayout.tables != null ? ` ${row.nextLayout.tables}T` : ""}입니다.` : "등록된 데이터에서 다음 행사 레이아웃을 확인하지 못했습니다.";
    else if (/현재\s*세팅.*(?:뭐|알려)|현재\s*세팅\s*$/.test(text)) answer = row.currentLayout.layoutType ? `현재 세팅은 ${settingLayoutLabel(row.currentLayout)}${row.currentLayout.seats != null ? ` ${row.currentLayout.seats}석` : ""}${row.currentLayout.tables != null ? ` ${row.currentLayout.tables}T` : ""}입니다.` : "현재 세팅 정보를 확인하지 못했습니다.";
    else if (/현재\s*세팅|뭐가\s*달라|차이|의자\s*몇/.test(text)) answer = `${row.advice}. ${row.taskSummary}`;
    else if (/오늘\s*바로|오늘.*해야|밤에.*(?:해두|세팅)/.test(text)) answer = `${row.advice}. ${row.taskSummary}`;
    else { showSettingAdvisorDetail(row); return; }
    aiResult.innerHTML = `<article class="board-setting-advisor-card"><h3>${escapeHtml(row.space)} 세팅 상담</h3><p>${escapeHtml(answer)}</p><div class="board-ai-actions"><button type="button" data-setting-advisor-back>전체 목록</button></div></article>`; rememberConversation(text, answer); speakBoardReply(answer); finishFieldAiAnswer();
  }
  function recommendationSpaceMatches(spaces, text) {
    const recommendationVenueName = (value) => normalizedVenue(value).replace(/센터/g, "");
    const normalizedText = recommendationVenueName(text);
    const convention = currentStateConventionUnit(text);
    if (convention) {
      const conventionSpaces = spaces.filter((space) => /컨벤션[123]$/.test(recommendationVenueName(space.space_name)));
      const member = (number) => conventionSpaces.find((space) => recommendationVenueName(space.space_name).endsWith(`컨벤션${number}`)); const one = member(1); const two = member(2); const three = member(3);
      if (!one || !two || !three) return [];
      return [{ ...(convention === "B" ? three : one), space_name: `컨벤션 ${convention}`, space_code: `CONV_${convention}`, memberSpaceIds: convention === "A" ? [one.id, two.id] : convention === "B" ? [three.id] : [one.id, two.id, three.id], conventionUnit: convention }];
    }
    const exactNumber = normalizedText.match(/(부라노|카프리)([123])/);
    if (exactNumber) return spaces.filter((space) => recommendationVenueName(space.space_name).endsWith(exactNumber[0]));
    const whole = normalizedText.match(/(부라노|카프리)(?:전체|전관|ALL)/);
    if (whole) return spaces.filter((space) => { const name = recommendationVenueName(space.space_name); return name === whole[1] || name === `${whole[1]}전체`; });
    const simple = normalizedText.match(/(부라노|카프리|페스타|포이어)/);
    if (!simple) return [];
    return spaces.filter((space) => recommendationVenueName(space.space_name) === simple[1]);
  }
  function layoutPreviewImage(file) {
    if (!file) return "";
    if (file.public_url) return file.public_url;
    if (!file.bucket || !file.storage_path) return "";
    return `${constants.supabaseConfig.url}/storage/v1/object/public/${encodeURIComponent(file.bucket)}/${encodeStoragePath(file.storage_path)}`;
  }
  function recommendationLabel(layout, requestData, index) {
    if (index === 0 && requestData.people != null && layout.recommendationCapacity === requestData.people) return "정원 일치";
    if (index === 0 && requestData.seatsPerTable != null && Number(layout.seats_per_table) === requestData.seatsPerTable) return "좌석 구성 일치";
    return index === 0 ? "가장 가까운 구성" : "유사 구성";
  }
  function renderLayoutRecommendations(result) {
    pendingLayoutRecommendation = result;
    const cards = result.layouts.map((layout, index) => {
      const image = layout.previewUrl ? `<img src="${escapeHtml(layout.previewUrl)}" alt="${escapeHtml(layout.layout_name || "레이아웃")} 썸네일">` : '<div class="board-layout-placeholder">저장 미리보기</div>';
      const summary = [layoutRecommendations.layoutTypeLabel(layout.layout_type), layout.recommendationCapacity != null ? `${layout.recommendationCapacity}석` : "좌석수 미입력", layout.table_count != null ? `${layout.table_count}T` : "테이블수 미입력", layout.seats_per_table != null ? `테이블당 ${layout.seats_per_table}석` : ""].filter(Boolean).join(" · ");
      return `<article class="board-layout-recommendation-card">${image}<div><small>${escapeHtml(recommendationLabel(layout, result.request, index))}</small><h3>${escapeHtml(layout.layout_name || "이름 없는 레이아웃")}</h3><p>${escapeHtml(summary)}</p><div class="board-ai-actions"><a class="secondary-button" href="../index.html?layoutPreview=${encodeURIComponent(layout.id)}" target="_blank" rel="noopener">미리보기</a><button type="button" data-layout-recommend-select="${escapeHtml(layout.id)}">현재 세팅으로 선택</button></div></div></article>`;
    }).join("");
    const answer = `${result.space.space_name} ${layoutRecommendations.layoutTypeLabel(result.request.layoutType)} 저장 레이아웃 ${result.layouts.length}건을 추천합니다.`;
    aiResult.innerHTML = `<section class="board-layout-recommendations"><p class="board-ai-status">${escapeHtml(answer)}</p>${cards}</section>`;
    rememberConversation(result.userText, answer); speakBoardReply(`가장 가까운 추천은 ${result.layouts[0].layout_name || "첫 번째 레이아웃"}입니다.`); finishFieldAiAnswer();
  }
  async function handleLayoutRecommendation(text) {
    const parsed = layoutRecommendations.parseRequest(text);
    const spaces = await request("venue_spaces?select=id,space_name,space_code,floor&is_active=eq.true&order=space_name.asc");
    const matches = recommendationSpaceMatches(spaces, text);
    if (matches.length !== 1) throw new Error(matches.length ? "추천할 공간을 하나만 정확히 입력해주세요." : "저장된 공간을 정확히 입력해주세요. 예: 부라노1, 카프리1, 컨벤션 A");
    const space = matches[0]; const memberIds = space.memberSpaceIds || [space.id];
    const layouts = await request(`venue_layouts?select=*&space_id=in.(${memberIds.join(",")})&is_active=eq.true&order=updated_at.desc`);
    const sameType = (layouts || []).filter((layout) => layoutRecommendations.normalizeLayoutType(layout.layout_type) === parsed.layoutType);
    if (!sameType.length) { showMessage(`${space.space_name}에 저장된 ${layoutRecommendations.layoutTypeLabel(parsed.layoutType)} 레이아웃이 없습니다.`, true); return; }
    const ids = sameType.map((layout) => layout.id); const objects = await request(`venue_layout_objects?select=layout_id,object_type,seat_count&layout_id=in.(${ids.join(",")})&is_active=eq.true`);
    const objectInfo = (objects || []).reduce((map, row) => { const item = map[row.layout_id] ||= { seats: 0, tables: 0 }; item.seats += Number(row.seat_count || 0); if (/table/i.test(row.object_type || "")) item.tables += 1; return map; }, {});
    const enriched = sameType.map((layout) => ({ ...layout, object_seats: objectInfo[layout.id]?.seats || null, table_count: layout.table_count ?? objectInfo[layout.id]?.tables ?? null }));
    const ranked = layoutRecommendations.rankLayouts(parsed, enriched, 3);
    const previewIds = [...new Set(ranked.map((layout) => layout.preview_file_id).filter(Boolean))];
    const files = previewIds.length ? await request(`files?select=id,public_url,storage_path,bucket&id=in.(${previewIds.join(",")})`) : [];
    const fileMap = new Map((files || []).map((file) => [String(file.id), file]));
    renderLayoutRecommendations({ queryType: "recommend_layouts", userText: text, request: parsed, space, layouts: ranked.map((layout) => ({ ...layout, previewUrl: layoutPreviewImage(fileMap.get(String(layout.preview_file_id || ""))) })) });
  }
  function showLayoutSelectionProposal(layout) {
    const result = pendingLayoutRecommendation; if (!result) return;
    const current = result.currentState || null; const changeLevel = layoutRecommendations.compareLayouts(current, layout);
    pendingLayoutRecommendation = { ...result, selectedLayout: layout, changeLevel };
    const changeText = ({ same: "현재 세팅과 동일", minor_change: "같은 타입의 좌석·테이블 변경", major_change: "레이아웃 타입 변경" })[changeLevel] || "현재 상태 미확인";
    aiResult.innerHTML = `<div class="board-ai-proposal"><h3>현재 세팅으로 선택</h3><p><strong>${escapeHtml(result.space.space_name)}</strong></p><p>${escapeHtml(layout.layout_name || "이름 없는 레이아웃")} · ${escapeHtml(changeText)}</p><p class="board-ai-status">승인하면 저장된 레이아웃을 현재 세팅에 연결합니다.</p><div class="board-ai-actions"><button type="button" class="primary-button" data-layout-recommend-approve>선택 확인</button><button type="button" class="secondary-button" data-layout-recommend-cancel>취소</button></div></div>`;
    speakBoardReply(`${layout.layout_name || "선택한 레이아웃"}을 현재 세팅으로 선택할까요?`); finishFieldAiAnswer();
  }
  async function applyLayoutRecommendation(result) {
    const layout = result.selectedLayout; const user = storedUser(); const previous = await currentHallState(result.space);
    const payload = { space_id: result.space.id, space_key: result.space.space_code || null, venue_name: result.space.space_name, layout_type: layoutRecommendations.layoutTypeLabel(layout.layout_type), seats: layout.recommendationCapacity, tables: layout.table_count ?? null, equipment: previous?.equipment || {}, note: previous?.note || null, source: "manual_confirmed", source_event_order_id: /이\s*행사에/.test(result.userText) ? activeEventContexts[0]?.eventOrderId || null : null, source_layout_id: layout.id, confidence: 1, confirmed_at: new Date().toISOString(), confirmed_by: user?.label || user?.id || "ERP 사용자", updated_at: new Date().toISOString() };
    const rows = await request("hall_current_states?on_conflict=space_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) });
    if (!rows?.[0]?.id || rows[0].source_layout_id !== layout.id) throw new Error("현재 세팅 저장 결과를 확인하지 못했습니다.");
    pendingLayoutRecommendation = null; showMessage(`${result.space.space_name} 현재 세팅을 ${layout.layout_name || "선택한 레이아웃"}으로 연결했습니다.`, true);
  }
  function requestsDetailedReview(text) { return /(사진|이미지|장면).*(다시|자세히)|다시.*(봐|보|분석)/i.test(text); }
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
    selectedAssetFileDataUrl = "";
    if (keepStoredImage) uploadedAssetImage = null;
  }
  async function openVisualCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저에서는 카메라를 사용할 수 없습니다.");
    if (visualStream) return;
    visualStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    visualVideo.srcObject = visualStream; visualCamera.hidden = false; await visualVideo.play();
  }
  function closeVisualCamera() {
    if (visualStream) visualStream.getTracks().forEach((track) => track.stop());
    visualStream = null; visualVideo.srcObject = null; visualCamera.hidden = true;
  }
  function storedVoiceReplyEnabled() { try { return localStorage.getItem(voiceReplyStorageKey) === "true"; } catch { return false; } }
  function updateVoiceReplyButton() { voiceReplyButton.textContent = voiceReplyEnabled ? "🔊 음성 답변 ON" : "🔊 음성 답변 OFF"; voiceReplyButton.setAttribute("aria-pressed", String(voiceReplyEnabled)); }
  function cancelBoardSpeech() { if (speechSynthesisApi) speechSynthesisApi.cancel(); }
  function conciseBoardReply(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= 220) return clean;
    const firstSentence = clean.match(/^.{1,180}?(?:[.!?]|다\.|요\.|니다\.)/)?.[0] || `${clean.slice(0, 180).trim()}…`;
    return `${firstSentence} 자세한 내용은 화면을 확인해주세요.`;
  }
  function speakBoardReply(text) {
    const spokenText = conciseBoardReply(text);
    if (speechListening || !voiceReplyEnabled || !speechSynthesisApi || !SpeechSynthesisUtteranceApi || !spokenText || spokenText === lastSpokenText) return;
    try {
      speechSynthesisApi.cancel();
      const utterance = new SpeechSynthesisUtteranceApi(spokenText); utterance.lang = "ko-KR"; utterance.rate = 1;
      const koreanVoice = speechSynthesisApi.getVoices().find((voice) => String(voice.lang || "").toLowerCase().startsWith("ko"));
      if (koreanVoice) utterance.voice = koreanVoice;
      utterance.onerror = (event) => { if (!["canceled", "interrupted"].includes(event.error)) console.warn("board voice reply failed", event.error); };
      lastSpokenText = spokenText; speechSynthesisApi.speak(utterance);
    } catch (error) { console.warn("board voice reply failed", error); }
  }
  function setVoiceReplyEnabled(enabled) {
    voiceReplyEnabled = Boolean(enabled); lastSpokenText = ""; updateVoiceReplyButton();
    try { localStorage.setItem(voiceReplyStorageKey, String(voiceReplyEnabled)); } catch { /* storage unavailable */ }
    if (!voiceReplyEnabled) cancelBoardSpeech();
  }
  function toggleVoiceReply() { setVoiceReplyEnabled(!voiceReplyEnabled); }
  function setSpeechStatus(message = "", isError = false) {
    speechStatus.textContent = message; speechStatus.hidden = !message; speechStatus.dataset.error = String(isError);
  }
  function setSpeechButtonState(state) {
    speechButton.dataset.state = state;
    speechButton.textContent = state === "listening" ? "🔴" : state === "processing" ? "●" : "🎙";
    speechButton.setAttribute("aria-label", state === "listening" ? "음성 입력 중지" : state === "processing" ? "음성을 텍스트로 변환 중" : "음성 입력");
  }
  function speechInputValue(transcript) { return [speechBaseText, transcript.trim()].filter(Boolean).join(" "); }
  function resizeAiInput() { aiInput.style.height = "auto"; aiInput.style.height = `${Math.min(aiInput.scrollHeight, 112)}px`; }
  function ensureSpeechRecognition() {
    if (speechRecognition || !SpeechRecognitionApi) return speechRecognition;
    speechRecognition = new SpeechRecognitionApi();
    speechRecognition.lang = "ko-KR"; speechRecognition.interimResults = true; speechRecognition.continuous = false;
    speechRecognition.onstart = () => { speechListening = true; setSpeechButtonState("listening"); setSpeechStatus("듣고 있습니다..."); };
    speechRecognition.onresult = (event) => {
      let finalText = ""; let interimText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || "";
        if (event.results[index].isFinal) finalText += transcript; else interimText += transcript;
      }
      speechFinalText = finalText.trim(); aiInput.value = speechInputValue(`${speechFinalText} ${interimText}`); resizeAiInput();
    };
    speechRecognition.onerror = (event) => {
      fieldAiAutoSubmit = false; fieldAiAwaitingAnswer = false;
      speechErrorMessage = event.error === "not-allowed" || event.error === "service-not-allowed" ? "마이크 권한이 필요합니다." : event.error === "no-speech" || event.error === "audio-capture" ? "음성을 인식하지 못했습니다. 다시 시도해주세요." : "음성 입력 중 오류가 발생했습니다. 다시 시도해주세요.";
      setSpeechStatus(speechErrorMessage, true);
    };
    speechRecognition.onend = () => {
      speechListening = false; setSpeechButtonState("idle");
      if (speechFinalText) {
        aiInput.value = speechInputValue(speechFinalText); resizeAiInput();
        if (fieldAiAutoSubmit) { fieldAiAutoSubmit = false; fieldAiAwaitingAnswer = true; setSpeechButtonState("processing"); setSpeechStatus(`● 확인 중 · “${speechFinalText}”`); aiForm.requestSubmit(); }
        else setSpeechStatus("인식된 문장을 확인한 후 보내기를 눌러주세요.");
      }
      else { aiInput.value = speechBaseText; resizeAiInput(); if (!speechErrorMessage) setSpeechStatus("음성을 인식하지 못했습니다. 다시 시도해주세요.", true); }
    };
    return speechRecognition;
  }
  function toggleSpeechRecognition() {
    if (speechListening) { setSpeechButtonState("processing"); setSpeechStatus("텍스트 변환 중..."); speechRecognition.stop(); return; }
    fieldAiAwaitingAnswer = false; cancelBoardSpeech();
    const recognition = ensureSpeechRecognition();
    if (!recognition) { setSpeechStatus("이 브라우저에서는 음성 입력을 지원하지 않습니다.", true); return; }
    fieldAiAutoSubmit = true; speechBaseText = ""; speechFinalText = ""; speechErrorMessage = ""; setSpeechButtonState("processing"); setSpeechStatus("마이크를 준비하고 있습니다...");
    try { recognition.start(); } catch (error) { console.error("speech recognition start failed", error); setSpeechButtonState("idle"); setSpeechStatus("음성 입력을 시작하지 못했습니다. 다시 시도해주세요.", true); }
  }
  async function waitForVisualFrame() {
    if (visualVideo.videoWidth && visualVideo.videoHeight) return;
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error("카메라 화면이 준비되지 않았습니다.")), 3000); visualVideo.addEventListener("loadeddata", () => { clearTimeout(timeout); resolve(); }, { once: true }); });
  }
  async function captureOneFrameForFieldAi(text) {
    await openVisualCamera(); await waitForVisualFrame();
    visualSession = { id: crypto.randomUUID(), imageDataUrl: captureVisualFrame(), visualSummary: null, recentConversation: [] };
    closeVisualCamera();
    return requestVisualQuery(text, true);
  }
  function finishFieldAiAnswer() { if (!fieldAiAwaitingAnswer) return; fieldAiAwaitingAnswer = false; setSpeechButtonState("idle"); setSpeechStatus("● 답변 완료"); }
  function captureVisualFrame() {
    const width = visualVideo.videoWidth; const height = visualVideo.videoHeight;
    if (!width || !height) throw new Error("카메라 화면이 준비되지 않았습니다.");
    const scale = Math.min(1, 1280 / Math.max(width, height));
    visualCanvas.width = Math.max(1, Math.round(width * scale)); visualCanvas.height = Math.max(1, Math.round(height * scale));
    visualCanvas.getContext("2d").drawImage(visualVideo, 0, 0, visualCanvas.width, visualCanvas.height);
    return visualCanvas.toDataURL("image/jpeg", 0.78);
  }
  async function requestVisualQuery(userText, includeImage = false) {
    if (!visualSession) throw new Error("먼저 카메라 화면을 캡처해주세요.");
    const visualContext = { visualSummary: visualSession.visualSummary || null, recentConversation: visualSession.recentConversation.slice(-3) };
    const response = await fetch(`${constants.supabaseConfig.url}/functions/v1/event-order-ai-chat`, { method: "POST", headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "visual_query", userText, capturedImage: includeImage ? visualSession.imageDataUrl : null, visualContext, reanalyze: includeImage && !!visualSession.visualSummary }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `시각 분석 실패 (${response.status})`);
    visualSession.visualSummary = body.visualSummary || visualSession.visualSummary;
    visualSession.recentConversation.push({ question: userText, answer: body.answer || "" });
    visualSession.recentConversation = visualSession.recentConversation.slice(-3);
    return body;
  }
  function showVisualResult(result) {
    pendingProposal = null; pendingAssetProposal = null; pendingAssetContext = null; pendingAssetQuery = null;
    const detected = Array.isArray(result.visualSummary?.detectedObjects) ? result.visualSummary.detectedObjects.slice(0, 5) : [];
    const objects = detected.length ? `<p class="board-visual-objects">감지: ${detected.map((item) => `${escapeHtml(item.name)}${item.approximateCount == null ? "" : ` 약 ${escapeHtml(item.approximateCount)}개`}`).join(" · ")}</p>` : "";
    const assetResult = result.assetResult; const assetCards = Array.isArray(assetResult?.assets) ? assetResult.assets.map((asset) => assetResultCard(asset, assetResult.queryType)).join("") : "";
    const finalAnswer = result.answer || "확인할 내용을 찾지 못했습니다.";
    aiResult.innerHTML = `<div class="board-visual-result"><span class="board-visual-current">현재 캡처 기준</span><div class="board-visual-answer">${escapeHtml(finalAnswer)}</div>${objects}${assetCards}<div class="board-ai-actions"><button type="button" data-visual-register-asset>이 사진 자산에 등록</button><button type="button" data-visual-clear>캡처 종료</button></div></div>`;
    rememberConversation(visualSession?.recentConversation?.at(-1)?.question || "시각 질문", finalAnswer); speakBoardReply(finalAnswer);
    finishFieldAiAnswer();
  }
  async function captureAndAnalyzeVisual() {
    const imageDataUrl = captureVisualFrame();
    visualSession = { id: crypto.randomUUID(), imageDataUrl, visualSummary: null, recentConversation: [] };
    const text = aiInput.value.trim() || "이 장면에서 보이는 물품과 특이사항을 알려줘.";
    showTransientMessage("현재 프레임 한 장을 AI가 확인하고 있습니다…");
    const result = await requestVisualQuery(text, true); aiInput.value = ""; showVisualResult(result);
  }
  async function useVisualCaptureForAssetIntake() {
    if (!visualSession?.imageDataUrl) return;
    const blob = await (await fetch(visualSession.imageDataUrl)).blob();
    selectedAssetImageFile = new File([blob], `visual-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    selectedAssetPreviewUrl = visualSession.imageDataUrl; uploadedAssetImage = null; assetPhotoButton.dataset.selected = "true"; visualSession = null;
    aiResult.innerHTML = `<p class="board-ai-status">캡처 사진을 자산 등록에 연결했습니다. 품명·수량·보관 위치를 입력해주세요.</p>`; aiInput.focus();
  }
  function readImageFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error || new Error("사진을 읽지 못했습니다.")); reader.readAsDataURL(file); }); }
  async function useSelectedImageForVisualQuery(text) {
    selectedAssetFileDataUrl ||= await readImageFile(selectedAssetImageFile);
    visualSession = { id: crypto.randomUUID(), imageDataUrl: selectedAssetFileDataUrl, visualSummary: null, recentConversation: [] };
    const result = await requestVisualQuery(text || "이 사진에 무엇이 있는지 알려줘.", true); showVisualResult(result); aiInput.value = "";
  }
  async function interpretAsset(userText, selection = null, context = null) {
    const imageAttachment = await uploadSelectedAssetImage();
    const previousContext = context ? { previousUserText: context.latestUserText || context.originalUserText || "", previousProposal: context.latestProposal || null, accumulatedAsset: context.asset || {} } : null;
    const response = await fetch(`${constants.supabaseConfig.url}/functions/v1/event-order-ai-chat`, { method: "POST", headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "asset_intake", userText, imageAttachment, selection, previousContext }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.message || `AI 해석 실패 (${response.status})`); error.status = response.status; throw error; }
    return body.proposal;
  }
  async function handleAssetQuery(text, selection = null, offset = 0) {
    const response = await fetch(`${constants.supabaseConfig.url}/functions/v1/event-order-ai-chat`, { method: "POST", headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "asset_query", userText: text, selection, offset }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `자산 조회 실패 (${response.status})`);
    return body.result;
  }
  function assetUnit(asset) {
    if (asset.unit) return asset.unit;
    return String(asset.spec || "").match(/(?:^|\|)\s*단위:\s*([^|]+)/)?.[1]?.trim() || "개";
  }
  function assetLocation(asset) { return [asset.floor, asset.location].filter(Boolean).join(" ") || "위치 미입력"; }
  function safeAssetImageUrl(value) { try { const url = new URL(String(value || ""), window.location.href); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
  function assetResultCard(asset, queryType) {
    const imageUrl = safeAssetImageUrl(asset.image_url);
    const photo = imageUrl ? `<a class="board-asset-photo-link" href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener"><img class="board-asset-query-thumbnail" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(asset.asset_name)} 사진"><span>사진 보기</span></a>` : queryType === "find_asset_photo" ? `<p class="board-asset-no-photo">등록된 사진이 없습니다.</p>` : "";
    const quantity = asset.quantity == null ? "수량 미입력" : `${asset.quantity}${assetUnit(asset)}`;
    return `<article class="board-asset-query-card" data-asset-query-id="${escapeHtml(asset.id)}"><div><strong>${escapeHtml(asset.asset_name)}</strong><b>${escapeHtml(quantity)}</b><span>📍 ${escapeHtml(assetLocation(asset))}</span></div>${photo}<div class="board-asset-query-actions"><button type="button" data-asset-query-action="increase" data-asset-id="${escapeHtml(asset.id)}">수량 추가</button><button type="button" data-asset-query-action="decrease" data-asset-id="${escapeHtml(asset.id)}">사용</button><button type="button" data-asset-query-action="location" data-asset-id="${escapeHtml(asset.id)}">위치 변경</button><button type="button" data-asset-query-action="movement" data-asset-id="${escapeHtml(asset.id)}">이동 이력</button></div></article>`;
  }
  function movementPlace(floor, location) { return [floor, location].filter(Boolean).join(" ") || "위치 미입력"; }
  function movementResultCard(movement) {
    const createdAt = movement.createdAt ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(movement.createdAt)) : "시간 미확인";
    return `<article class="board-asset-movement-card"><strong>${escapeHtml(movement.assetName || "자산")}</strong><span>${escapeHtml(movementPlace(movement.fromFloor, movement.fromLocation))} → ${escapeHtml(movementPlace(movement.toFloor, movement.toLocation))}</span><time>${escapeHtml(createdAt)}</time></article>`;
  }
  function analysisResultCard(item) { return `<article class="board-asset-analysis-card"><strong>${escapeHtml(item.label || "자산")}</strong><b>${escapeHtml(item.value || "")}</b>${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}</article>`; }
  function showAssetQueryResult(result, userText) {
    pendingProposal = null; pendingAssetProposal = null; pendingAssetContext = null; pendingAssetQuery = { result, userText };
    if (result.needsClarification) {
      const choices = Array.isArray(result.choices) ? result.choices : [];
      aiResult.innerHTML = `<h3>자산 선택</h3><p>${escapeHtml(result.question || "어떤 자산을 찾으시나요?")}</p><div class="board-ai-choices">${choices.map((choice, index) => `<button class="board-ai-choice" type="button" data-asset-query-choice="${index}">${escapeHtml(choice.label)}</button>`).join("")}</div><div class="board-ai-actions"><button type="button" data-asset-query-close>닫기</button></div>`;
      speakBoardReply(result.question || "어떤 자산을 찾으시나요?"); finishFieldAiAnswer(); return;
    }
    const assets = Array.isArray(result.assets) ? result.assets : [];
    const movements = Array.isArray(result.movements) ? result.movements.slice(0, 10) : [];
    const analysisItems = Array.isArray(result.analysisItems) ? result.analysisItems.slice(0, 10) : [];
    const finalAnswer = result.answer || "등록된 자산에서 찾지 못했습니다.";
    aiResult.innerHTML = `<div class="board-asset-query-result">${result.analysisTitle ? `<h3>${escapeHtml(result.analysisTitle)}</h3>` : ""}<p class="board-ai-status">${escapeHtml(finalAnswer)}</p>${analysisItems.map(analysisResultCard).join("")}${movements.map(movementResultCard).join("")}${assets.map((asset) => assetResultCard(asset, result.queryType)).join("")}${result.hasMore ? `<button class="board-asset-more" type="button" data-asset-query-more>더 보기</button>` : ""}<div class="board-ai-actions"><button type="button" data-asset-query-close>닫기</button></div></div>`;
    const needsScreenDetail = movements.length > 0 || result.queryType === "list_assets_by_location";
    rememberConversation(userText, finalAnswer); speakBoardReply(result.speechText || (needsScreenDetail ? `${finalAnswer} 자세한 내용은 화면을 확인해주세요.` : finalAnswer));
    finishFieldAiAnswer();
  }
  function beginAssetUpdateFromQuery(asset, action) {
    const intent = action === "increase" ? "increase_asset_quantity" : action === "decrease" ? "decrease_asset_quantity" : "update_asset_location";
    const question = action === "increase" ? "몇 개 추가했나요?" : action === "decrease" ? "몇 개 사용했나요?" : "새 보관 위치를 알려주세요.";
    const proposal = { intent, confidence: 1, needsClarification: true, question, choices: [], targetAssetId: asset.id, asset: { assetName: asset.asset_name, category: "기타", quantity: asset.quantity, unit: assetUnit(asset), floor: asset.floor || "", location: asset.location || "", description: "" } };
    const actionLabel = action === "increase" ? "수량 추가" : action === "decrease" ? "사용" : "위치 변경";
    showAssetProposal(proposal, null, `${asset.asset_name} ${actionLabel}`); aiInput.value = ""; aiInput.focus();
  }
  function assetIntentLabel(intent) { return intent === "create_asset" ? "새 자산 등록" : intent === "increase_asset_quantity" ? "기존 자산 수량 추가" : intent === "decrease_asset_quantity" ? "자산 사용 제안" : "자산 위치 변경"; }
  function startsNewAssetRequest(text) { return /(?:새|다른|별도|새로운)\s*(?:자산|물품|비품).*(?:등록|추가|시작)|(?:새로|별도로)\s*(?:등록|시작)/i.test(text); }
  function buildAssetContext(proposal, userText, previous = null) {
    const previousAsset = previous?.asset || {};
    const nextAsset = proposal.asset || {};
    const asset = { ...previousAsset };
    Object.entries(nextAsset).forEach(([key, value]) => { if (value !== "" && value !== null && value !== undefined) asset[key] = value; else if (!(key in asset)) asset[key] = value; });
    proposal.asset = asset;
    const createIsComplete = proposal.intent === "create_asset" && String(asset.assetName || "").trim() && Number.isInteger(Number(asset.quantity)) && Number(asset.quantity) >= 0 && String(asset.location || "").trim();
    const hasConflict = (Array.isArray(proposal.choices) && proposal.choices.length > 0) || (Array.isArray(proposal.possibleMatches) && proposal.possibleMatches.length > 0);
    if (createIsComplete && Number(proposal.confidence) >= 0.7 && !hasConflict) proposal.needsClarification = false;
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
    pendingProposal = null; pendingAssetQuery = null; pendingAssetContext = buildAssetContext(proposal, userText, context); pendingAssetProposal = pendingAssetContext.latestProposal;
    const thumbnail = uploadedAssetImage?.publicUrl || selectedAssetPreviewUrl;
    const image = thumbnail ? `<img class="board-asset-thumbnail" src="${escapeHtml(thumbnail)}" alt="선택한 자산 사진">` : "";
    if (proposal.intent === "unsupported") { aiResult.innerHTML = `<p class="board-ai-status">현재는 등록 / 수량 추가 / 위치 변경만 지원합니다.</p><div class="board-ai-actions"><button type="button" data-asset-cancel>닫기</button></div>`; speakBoardReply("현재는 등록, 수량 추가, 위치 변경만 지원합니다."); finishFieldAiAnswer(); return; }
    if (proposal.intent === "update_asset_location" && proposal.partialMoveUnsupported) { aiResult.innerHTML = `<div class="board-asset-proposal"><h3>일부 수량 이동 미지원</h3><p class="board-ai-status">${escapeHtml(proposal.question || "일부 수량 이동은 아직 지원하지 않습니다.")}</p><div class="board-ai-actions"><button type="button" data-asset-cancel>확인</button></div></div>`; speakBoardReply(proposal.question || "일부 수량 이동은 아직 지원하지 않습니다."); finishFieldAiAnswer(); return; }
    if (proposal.needsClarification || Number(proposal.confidence) < 0.7) {
      const choices = Array.isArray(proposal.choices) ? proposal.choices : [];
      aiResult.innerHTML = `<div class="board-asset-proposal"><div class="board-asset-heading">${image}<div><h3>자산 정보 확인</h3>${currentAssetSummary(pendingAssetContext.asset)}<p>${escapeHtml(proposal.question || "수량과 보관 위치를 알려주세요.")}</p></div></div>${choices.length ? `<div class="board-ai-choices">${choices.map((choice, index) => `<button class="board-ai-choice" type="button" data-asset-choice="${index}">${escapeHtml(choice.label)}</button>`).join("")}</div>` : ""}<div class="board-ai-actions"><button type="button" data-asset-cancel>취소</button></div></div>`;
      speakBoardReply(proposal.question || "수량과 보관 위치를 알려주세요."); finishFieldAiAnswer(); return;
    }
    const asset = proposal.asset || {};
    const current = proposal.intent === "increase_asset_quantity" ? `<p class="board-asset-current">현재 ${proposal.currentQuantity ?? 0}${escapeHtml(asset.unit || "")} + ${proposal.addQuantity ?? 0}${escapeHtml(asset.unit || "")} → ${proposal.newQuantity ?? 0}${escapeHtml(asset.unit || "")}</p>` : proposal.intent === "decrease_asset_quantity" ? `<p class="board-asset-current">현재 ${proposal.currentQuantity ?? 0}${escapeHtml(asset.unit || "")}<br>사용 ${proposal.decreaseQuantity ?? 0}${escapeHtml(asset.unit || "")}<br>${proposal.currentQuantity ?? 0} → ${proposal.newQuantity ?? 0}</p>` : proposal.intent === "update_asset_location" ? `<p class="board-asset-current"><strong>현재 위치</strong><br>${escapeHtml(movementPlace(proposal.currentFloor, proposal.currentLocation))}<br><strong>변경 위치</strong><br>${escapeHtml(movementPlace(asset.floor, asset.location))}</p>` : "";
    const approveText = proposal.intent === "increase_asset_quantity" || proposal.intent === "decrease_asset_quantity" ? `${proposal.newQuantity ?? "새 수량"}으로 반영` : proposal.intent === "update_asset_location" ? "위치 변경" : "자산 등록";
    const createAlternative = proposal.intent === "increase_asset_quantity" ? `<button type="button" data-asset-create-new>새 자산으로 등록</button>` : "";
    aiResult.innerHTML = `<div class="board-asset-proposal"><div class="board-asset-heading">${image}<div><h3>${assetIntentLabel(proposal.intent)}</h3><p>${escapeHtml(proposal.confirmationText || "이 내용으로 반영할까요?")}</p>${current}</div></div><form id="boardAssetProposalForm">${renderAssetFields(asset, true)}</form><div class="board-ai-actions"><button type="button" data-asset-approve>${approveText}</button><button type="button" data-asset-edit>수정</button>${createAlternative}<button type="button" data-asset-cancel>취소</button></div></div>`;
    speakBoardReply(proposal.confirmationText || "변경 내용을 확인해주세요."); finishFieldAiAnswer();
  }
  function readAssetFields() {
    const form = document.getElementById("boardAssetProposalForm");
    const read = (name) => String(form?.elements?.namedItem(name)?.value || "").trim();
    const quantityText = read("quantity");
    return { assetName: read("assetName"), category: read("category"), quantity: quantityText === "" ? null : Number(quantityText), unit: read("unit"), floor: read("floor"), location: read("location"), description: read("description") };
  }
  function assetSpec(asset) { return [`분류: ${asset.category || "기타"}`, asset.unit ? `단위: ${asset.unit}` : "", asset.description || ""].filter(Boolean).join(" | "); }
  async function insertBanquetAsset(payload) {
    console.info("asset insert request", { assetName: payload.asset_name, quantity: payload.quantity, floor: payload.floor, location: payload.location, hasImage: Boolean(payload.image_url) });
    let response;
    try {
      response = await fetch(`${constants.supabaseConfig.url}/rest/v1/banquet_assets`, { method: "POST", headers: { apikey: constants.supabaseConfig.anonKey, Authorization: `Bearer ${constants.supabaseConfig.anonKey}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) });
    } catch (cause) {
      console.error("asset insert fail", { status: null, body: "network error", cause });
      throw new Error("자산 저장 실패 (네트워크 오류)");
    }
    const text = await response.text();
    if (!response.ok) { const error = new Error(`자산 저장 실패 (Supabase ${response.status})`); error.status = response.status; error.body = text; console.error("asset insert fail", { status: response.status, body: text }); throw error; }
    const rows = text ? JSON.parse(text) : [];
    console.info("asset insert success", { status: response.status, assetId: rows?.[0]?.id || null });
    return rows;
  }
  async function getAsset(id) { const rows = await request(`banquet_assets?id=eq.${encodeURIComponent(id)}&select=id,asset_name,floor,quantity,spec,location,image_url&limit=1`); return rows?.[0] || null; }
  async function tryPersistAssetAudit(proposal, userText, before, after, assetId) {
    const createdAt = new Date().toISOString();
    const metadata = proposal.intent === "update_asset_location" ? { source: "board_asset_ai", action: "move_asset", assetId, assetName: after?.asset_name || before?.asset_name || proposal.asset?.assetName || "", fromFloor: before?.floor || "", fromLocation: before?.location || "", toFloor: after?.floor || "", toLocation: after?.location || "", quantity: after?.quantity ?? before?.quantity ?? null, userText, createdAt } : { source: "board_asset_ai", action: proposal.intent, userText, before, decreaseQuantity: proposal.decreaseQuantity ?? null, after, assetId, imagePath: uploadedAssetImage?.storagePath || null, createdAt };
    try { await request("operation_board_items", { method: "POST", body: JSON.stringify({ board_date: board.getSelectedDate(), item_key: `board-asset-ai:${crypto.randomUUID()}`, item_kind: "manual", event_order_id: null, space_id: null, item_time: null, venue_name: after?.location || before?.location || "", title: proposal.intent, people: null, memo: userText, is_completed: true, metadata }) }); return true; } catch (error) { console.error("board asset AI audit failed", { status: error.status, body: error.body, error }); return false; }
  }
  function assetApplyError(code, message, detail = {}) { const error = new Error(message); error.code = code; Object.assign(error, detail); return error; }
  function showDecreaseGuard(proposal, context, error) {
    pendingAssetProposal = proposal; pendingAssetContext = context;
    const unit = proposal.asset?.unit || "개";
    if (error.code === "decrease_exceeds_stock") {
      aiResult.innerHTML = `<p class="board-ai-status">${escapeHtml(error.message)}</p><div class="board-ai-actions"><button type="button" data-asset-use-all>${escapeHtml(error.latestQuantity)}${escapeHtml(unit)} 전부 사용</button><button type="button" data-asset-reenter-decrease>수량 다시 입력</button><button type="button" data-asset-cancel>취소</button></div>`;
      return;
    }
    aiResult.innerHTML = `<p class="board-ai-status">${escapeHtml(error.message)}<br>${escapeHtml(error.decreaseQuantity)}${escapeHtml(unit)} 사용 후 ${escapeHtml(error.nextQuantity)}${escapeHtml(unit)}로 반영할까요?</p><div class="board-ai-actions"><button type="button" data-asset-confirm-latest>${escapeHtml(error.nextQuantity)}${escapeHtml(unit)}로 반영</button><button type="button" data-asset-cancel>취소</button></div>`;
  }
  async function applyConfirmedDecrease(proposal, context) {
    showTransientMessage("확인된 자산 사용량을 저장하고 있습니다…");
    try { await applyAssetProposal(proposal, proposal.asset || {}); }
    catch (error) { console.error("board asset decrease apply failed", { status: error.status, body: error.body, error }); if (["decrease_exceeds_stock", "asset_quantity_changed"].includes(error.code)) { proposal._latestQuantity = error.latestQuantity; proposal._nextQuantity = error.nextQuantity; showDecreaseGuard(proposal, context, error); } else { showAssetProposal(proposal, context, context?.latestUserText || proposal.userText || ""); aiResult.insertAdjacentHTML("afterbegin", `<p class="board-ai-status">${escapeHtml(error.message || "자산 저장에 실패했습니다. 기존 데이터는 유지됩니다.")}</p>`); } }
  }
  function locationKey(asset) { return `${String(asset?.floor || "").trim()}\n${String(asset?.location || "").trim()}`; }
  function locationFilter(field, value) { return value === null || value === undefined ? `${field}=is.null` : `${field}=eq.${encodeURIComponent(String(value))}`; }
  function showLocationGuard(proposal, context, error) {
    pendingAssetProposal = proposal; pendingAssetContext = context; proposal._latestFloor = error.latestFloor; proposal._latestLocation = error.latestLocation;
    aiResult.innerHTML = `<p class="board-ai-status">현재 위치가 ${escapeHtml(movementPlace(error.proposedFloor, error.proposedLocation))}에서 ${escapeHtml(movementPlace(error.latestFloor, error.latestLocation))}로 변경되었습니다.<br>${escapeHtml(movementPlace(error.latestFloor, error.latestLocation))} → ${escapeHtml(movementPlace(proposal.asset?.floor, proposal.asset?.location))}로 이동할까요?</p><div class="board-ai-actions"><button type="button" data-asset-confirm-location>위치 변경</button><button type="button" data-asset-cancel>취소</button></div>`;
  }
  async function applyConfirmedLocation(proposal, context) {
    showTransientMessage("최신 위치를 기준으로 변경하고 있습니다…");
    try { await applyAssetProposal(proposal, proposal.asset || {}); }
    catch (error) { console.error("board asset location apply failed", { status: error.status, body: error.body, error }); if (error.code === "asset_location_changed") showLocationGuard(proposal, context, error); else { showAssetProposal(proposal, context, context?.latestUserText || proposal.userText || ""); aiResult.insertAdjacentHTML("afterbegin", `<p class="board-ai-status">${escapeHtml(error.message || "위치 변경에 실패했습니다. 기존 데이터는 유지됩니다.")}</p>`); } }
  }
  async function applyAssetProposal(proposal, approvedAsset = null) {
    console.info("asset apply entered", { intent: proposal?.intent, hasProposal: Boolean(proposal) });
    const asset = approvedAsset || readAssetFields();
    const userText = proposal.userText || aiInput.value.trim();
    let before = null; let after = null;
    if (proposal.intent === "create_asset") {
      if (!asset.assetName || !Number.isInteger(asset.quantity) || asset.quantity < 0 || !asset.location) throw new Error("자산명, 수량, 위치를 확인해주세요.");
      const rows = await insertBanquetAsset({ asset_name: asset.assetName, floor: asset.floor || null, quantity: asset.quantity, spec: assetSpec(asset), location: asset.location, image_url: uploadedAssetImage?.publicUrl || null });
      after = rows?.[0];
    } else if (proposal.intent === "increase_asset_quantity") {
      before = await getAsset(proposal.targetAssetId); if (!before) throw new Error("기존 자산을 찾지 못했습니다.");
      const addQuantity = Number(proposal.addQuantity); if (!Number.isInteger(addQuantity) || addQuantity <= 0) throw new Error("추가 수량을 확인해주세요.");
      const payload = { quantity: Number(before.quantity || 0) + addQuantity, ...(uploadedAssetImage?.publicUrl ? { image_url: uploadedAssetImage.publicUrl } : {}) };
      const rows = await request(`banquet_assets?id=eq.${encodeURIComponent(proposal.targetAssetId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) }); after = rows?.[0];
    } else if (proposal.intent === "decrease_asset_quantity") {
      before = await getAsset(proposal.targetAssetId); if (!before) throw new Error("기존 자산을 찾지 못했습니다.");
      const latestQuantity = Number(before.quantity); const proposedQuantity = Number(proposal.currentQuantity); const decreaseQuantity = Number(proposal.decreaseQuantity);
      if (!Number.isInteger(latestQuantity) || latestQuantity < 0 || !Number.isInteger(decreaseQuantity) || decreaseQuantity <= 0) throw new Error("사용 수량을 확인해주세요.");
      if (decreaseQuantity > latestQuantity) throw assetApplyError("decrease_exceeds_stock", `현재 수량은 ${latestQuantity}${asset.unit || "개"}인데 ${decreaseQuantity}${asset.unit || "개"} 사용으로 입력되었습니다.`, { latestQuantity, decreaseQuantity });
      if (latestQuantity !== proposedQuantity && Number(proposal.confirmedLatestQuantity) !== latestQuantity) throw assetApplyError("asset_quantity_changed", `재고가 ${proposedQuantity}에서 ${latestQuantity}으로 변경되었습니다.`, { latestQuantity, decreaseQuantity, nextQuantity: latestQuantity - decreaseQuantity });
      const nextQuantity = latestQuantity - decreaseQuantity;
      const rows = await request(`banquet_assets?id=eq.${encodeURIComponent(proposal.targetAssetId)}&quantity=eq.${latestQuantity}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ quantity: nextQuantity, ...(uploadedAssetImage?.publicUrl ? { image_url: uploadedAssetImage.publicUrl } : {}) }) });
      if (!Array.isArray(rows) || rows.length !== 1) { const newest = await getAsset(proposal.targetAssetId); const newestQuantity = Number(newest?.quantity ?? latestQuantity); throw assetApplyError("asset_quantity_changed", "승인 중 재고가 다시 변경되었습니다.", { latestQuantity: newestQuantity, decreaseQuantity, nextQuantity: newestQuantity - decreaseQuantity }); }
      after = rows[0];
    } else if (proposal.intent === "update_asset_location") {
      before = await getAsset(proposal.targetAssetId); if (!before) throw new Error("기존 자산을 찾지 못했습니다.");
      if (!asset.floor && !asset.location) throw new Error("변경할 위치를 입력해주세요.");
      const moveQuantity = proposal.moveQuantity == null ? null : Number(proposal.moveQuantity); const latestQuantity = Number(before.quantity ?? 0);
      if (moveQuantity != null && moveQuantity !== latestQuantity) throw assetApplyError("partial_move_unsupported", `현재 자산은 ${latestQuantity}${asset.unit || "개"}입니다. 일부 ${moveQuantity}${asset.unit || "개"} 이동은 아직 지원하지 않습니다.`);
      const proposedLocation = { floor: proposal.currentFloor ?? null, location: proposal.currentLocation ?? null };
      if (locationKey(before) !== locationKey(proposedLocation) && locationKey(before) !== proposal.confirmedLocationKey) throw assetApplyError("asset_location_changed", "승인 전 자산 위치가 변경되었습니다.", { proposedFloor: proposal.currentFloor, proposedLocation: proposal.currentLocation, latestFloor: before.floor, latestLocation: before.location });
      const payload = { floor: asset.floor || null, location: asset.location || null, ...(uploadedAssetImage?.publicUrl ? { image_url: uploadedAssetImage.publicUrl } : {}) };
      const rows = await request(`banquet_assets?id=eq.${encodeURIComponent(proposal.targetAssetId)}&${locationFilter("floor", before.floor)}&${locationFilter("location", before.location)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
      if (!Array.isArray(rows) || rows.length !== 1) { const newest = await getAsset(proposal.targetAssetId); throw assetApplyError("asset_location_changed", "승인 중 자산 위치가 다시 변경되었습니다.", { proposedFloor: before.floor, proposedLocation: before.location, latestFloor: newest?.floor, latestLocation: newest?.location }); }
      after = rows[0];
    } else throw new Error("지원하지 않는 자산 작업입니다.");
    if (!after?.id) throw new Error(proposal.intent === "create_asset" ? "자산 저장 결과가 없습니다." : "자산 저장 결과를 확인하지 못했습니다.");
    const auditSaved = await tryPersistAssetAudit(proposal, userText, before, after, after.id);
    const actionLabel = proposal.intent === "create_asset" ? "자산을 등록했습니다." : proposal.intent === "increase_asset_quantity" ? `수량을 ${after.quantity}으로 반영했습니다.` : proposal.intent === "decrease_asset_quantity" ? `${asset.assetName} ${proposal.decreaseQuantity}${asset.unit || "개"} 사용 처리했습니다.\n현재 재고: ${after.quantity}${asset.unit || "개"}` : "보관 위치를 변경했습니다.";
    resetAssetImage(true); aiInput.value = ""; window.dispatchEvent(new CustomEvent("banquet:assets-changed", { detail: { assetId: after.id } }));
    showMessage(auditSaved ? actionLabel : proposal.intent === "update_asset_location" ? "위치는 변경했지만 이동 기록 저장은 실패했습니다." : `${actionLabel} 변경 기록 저장은 실패했습니다.`, true);
  }
  function showMessage(message, shouldSpeak = false) { pendingProposal = null; pendingAssetProposal = null; pendingAssetContext = null; pendingAssetQuery = null; aiResult.innerHTML = `<p class="board-ai-status">${escapeHtml(message)}</p>`; if (shouldSpeak || fieldAiAwaitingAnswer) speakBoardReply(message); finishFieldAiAnswer(); }
  function showTransientMessage(message) { aiResult.innerHTML = `<p class="board-ai-status">${escapeHtml(message)}</p>`; }
  function proposalSummary(proposal) {
    if (proposal.intent === "update_schedule_time") return `${proposal.target?.venue || "행사"} · ${proposal.target?.content || "일정"}\n${proposal.target?.currentTime || "-"} → ${proposal.change?.time || "-"}`;
    if (proposal.intent === "add_schedule") return `${proposal.change?.venue || proposal.target?.venue || "행사"}\n${proposal.change?.time || "-"}\n${proposal.change?.content || "일정"}`;
    if (proposal.intent === "update_guest_count") return `${proposal.target?.venue || proposal.target?.eventName || "행사"}\n${proposal.target?.currentGuestCount ?? "-"}명 → ${proposal.change?.guestCount ?? "-"}명`;
    return `${proposal.target?.venue || proposal.target?.eventName || "현장"}\n${proposal.change?.note || ""}`;
  }
  function showProposal(proposal) {
    pendingProposal = proposal;
    if (proposal.needsClarification || Number(proposal.confidence) < 0.7) {
      const choices = Array.isArray(proposal.choices) ? proposal.choices : [];
      aiResult.innerHTML = `<h3>대상 확인</h3><p>${escapeHtml(proposal.question || "어느 행사를 변경할까요?")}</p><div class="board-ai-choices">${choices.map((choice, index) => `<button class="board-ai-choice" type="button" data-ai-choice="${index}">${escapeHtml(choice.label)}</button>`).join("")}</div><div class="board-ai-actions"><button type="button" data-ai-cancel>취소</button></div>`; speakBoardReply(proposal.question || "대상을 확인해주세요."); finishFieldAiAnswer(); return;
    }
    if (!["update_schedule_time", "update_guest_count", "add_field_note", "add_schedule"].includes(proposal.intent)) { showMessage("현재 현장 AI에서는 시간/인원/메모/일정 추가만 가능합니다."); return; }
    const isAddSchedule = proposal.intent === "add_schedule";
    aiResult.innerHTML = `<h3>${isAddSchedule ? "일정 추가" : "변경 제안"}</h3><p class="board-ai-change">${escapeHtml(proposalSummary(proposal))}</p><p>${escapeHtml(proposal.confirmationText || (isAddSchedule ? "이 일정을 추가할까요?" : "변경할까요?"))}</p><div class="board-ai-actions"><button type="button" data-ai-approve>${isAddSchedule ? "추가" : "변경하기"}</button><button type="button" data-ai-edit>수정</button><button type="button" data-ai-cancel>취소</button></div>`;
    speakBoardReply(proposal.confirmationText || "변경 내용을 확인해주세요."); finishFieldAiAnswer();
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
    } else if (proposal.intent === "add_schedule") {
      const change = proposal.change || {}; const content = String(change.content || "").trim(); const venue = String(change.venue || proposal.target?.venue || "").trim();
      if (!proposal.target?.eventOrderId || !/^\d{4}-\d{2}-\d{2}$/.test(change.date || "") || !/^\d{2}:\d{2}$/.test(change.time || "") || !content) throw boardAiError("schedule_target_missing", "invalid add schedule proposal");
      const existing = await request(`event_schedules?select=id,schedule_date,schedule_time,content,venue&event_order_id=eq.${encodeURIComponent(proposal.target.eventOrderId)}&schedule_date=eq.${encodeURIComponent(change.date)}`);
      const comparable = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();
      const duplicate = (existing || []).find((row) => row.schedule_time === change.time && comparable(row.content) === comparable(content) && comparable(row.venue) === comparable(venue));
      if (duplicate) throw boardAiError("schedule_duplicate", `${Number(change.time.slice(0, 2))}시${change.time.slice(3) === "00" ? "" : ` ${Number(change.time.slice(3))}분`} ${content} 일정이 이미 있습니다.`);
      const inserted = await request("event_schedules", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ event_order_id: proposal.target.eventOrderId, schedule_date: change.date, schedule_time: change.time, content, venue: venue || null, people: change.people ?? null }) });
      if (!Array.isArray(inserted) || inserted.length !== 1 || !inserted[0]?.id) throw boardAiError("schedule_insert_failed", "schedule insert returned no row");
      proposal.target.scheduleId = inserted[0].id; auditSaved = await tryPersistAudit(proposal, userText, "", `${change.date} ${change.time} ${content}`);
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
    const success = proposal.intent === "update_schedule_time" ? `${proposal.change.time}으로 변경했습니다.` : proposal.intent === "add_schedule" ? `${Number(proposal.change.time.slice(0, 2))}시${proposal.change.time.slice(3) === "00" ? "" : ` ${Number(proposal.change.time.slice(3))}분`} ${proposal.change.content}를 추가했습니다.` : proposal.intent === "update_guest_count" ? `${proposal.change.guestCount}명으로 변경했습니다.` : "현장 메모를 추가했습니다.";
    showMessage(!refreshResult?.ok ? `${success} 화면 동기화에 실패해 새로고침이 필요합니다.` : !auditSaved ? `${success} 변경 기록 저장은 실패했습니다.` : success, true); aiInput.value = "";
  }
  function start() { login.hidden = true; app.hidden = false; events = cachedEvents(); render(); renderAiContext(); status.textContent = events.length ? "저장된 일정 표시 중" : "최신 일정 불러오는 중"; refresh(); }

  if (!speechSynthesisApi || !SpeechSynthesisUtteranceApi) { voiceReplyButton.disabled = true; voiceReplyButton.textContent = "🔇 음성 답변 미지원"; voiceReplyButton.title = "이 브라우저에서는 음성 답변을 지원하지 않습니다."; voiceReplyStatus.textContent = "이 브라우저에서는 음성 답변을 지원하지 않습니다."; voiceReplyStatus.hidden = false; }
  else { voiceReplyEnabled = storedVoiceReplyEnabled(); updateVoiceReplyButton(); voiceReplyButton.addEventListener("click", toggleVoiceReply); }
  visualCameraButton.addEventListener("click", async () => { aiPlusMenu.hidden = true; aiPlusButton.setAttribute("aria-expanded", "false"); try { await openVisualCamera(); } catch (error) { console.error("camera open failed", error); showMessage(error.name === "NotAllowedError" ? "카메라 권한이 필요합니다." : error.message || "카메라를 열지 못했습니다."); } });
  aiPlusButton?.addEventListener("click", () => { const open = aiPlusMenu.hidden; aiPlusMenu.hidden = !open; aiPlusButton.setAttribute("aria-expanded", String(open)); });
  document.querySelectorAll("[data-board-ai-quick]").forEach((button) => button.addEventListener("click", () => { aiInput.value = button.dataset.boardAiQuick; aiForm.requestSubmit(); }));
  if (!SpeechRecognitionApi) { speechButton.disabled = true; speechButton.title = "이 브라우저에서는 음성 입력을 지원하지 않습니다."; setSpeechStatus("이 브라우저에서는 음성 입력을 지원하지 않습니다.", true); }
  else speechButton.addEventListener("click", toggleSpeechRecognition);
  visualCloseButton.addEventListener("click", closeVisualCamera);
  visualCaptureButton.addEventListener("click", async () => { visualCaptureButton.disabled = true; try { await captureAndAnalyzeVisual(); } catch (error) { console.error("visual capture failed", error); showMessage(error.message || "현재 화면을 분석하지 못했습니다."); } finally { visualCaptureButton.disabled = false; } });
  assetPhotoButton.addEventListener("click", () => { aiPlusMenu.hidden = true; aiPlusButton.setAttribute("aria-expanded", "false"); assetPhotoInput.click(); });
  assetPhotoInput.addEventListener("change", () => {
    const file = assetPhotoInput.files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith("image/")) { assetPhotoInput.value = ""; showMessage("이미지 파일만 선택할 수 있습니다."); return; }
    if (selectedAssetPreviewUrl) URL.revokeObjectURL(selectedAssetPreviewUrl);
    selectedAssetImageFile = file; uploadedAssetImage = null; selectedAssetFileDataUrl = ""; selectedAssetPreviewUrl = URL.createObjectURL(file); assetPhotoButton.dataset.selected = "true";
    aiResult.innerHTML = `<div class="board-asset-heading"><img class="board-asset-thumbnail" src="${escapeHtml(selectedAssetPreviewUrl)}" alt="선택한 사진"><p class="board-ai-status">사진을 선택했습니다. 무엇을 확인하거나 등록할지 질문해주세요.</p></div>`;
  });
  aiForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const text = aiInput.value.trim(); if (!text && !selectedAssetImageFile) return;
    if (pendingProposal?.intent === "add_schedule" && /^(?:추가해|추가|응|네|예|확인|좋아|진행해)[.!\s]*$/i.test(text)) { const proposal = pendingProposal; showTransientMessage("승인된 일정을 저장하고 있습니다…"); try { await applyProposal(proposal); } catch (error) { console.error("board schedule add failed", error); showMessage(error.code === "schedule_duplicate" ? error.message : "일정 저장에 실패했습니다. 기존 일정은 유지됩니다.", true); } return; }
    if (pendingProposal?.intent === "add_schedule" && pendingProposal.needsClarification) { const time = scheduleTimeFromText(text); if (time && pendingProposal.target?.eventOrderId) { pendingProposal.change ||= {}; pendingProposal.change.time = time; pendingProposal.needsClarification = false; pendingProposal.confidence = Math.max(0.7, Number(pendingProposal.confidence) || 0); pendingProposal.confirmationText = `${pendingProposal.change.venue || pendingProposal.target.venue || "행사"}에 ${time} ${pendingProposal.change.content || "일정"}을 추가할까요?`; pendingProposal.userText = `${pendingProposal.userText || ""} ${text}`.trim(); aiInput.value = ""; showProposal(pendingProposal); return; } }
    let followupContext = pendingAssetProposal?.needsClarification ? pendingAssetContext : null;
    let explicitNewAsset = false;
    if (followupContext && startsNewAssetRequest(text)) { explicitNewAsset = true; await deleteUnlinkedAssetImage(); resetAssetImage(); pendingAssetProposal = null; pendingAssetContext = null; followupContext = null; }
    const attachedAssetMutation = selectedAssetImageFile && /(?:자산.*등록|등록해|등록해\s*줘|수량.*추가|입고|사용했|옮겼|위치.*바꿔)/i.test(text);
    const route = followupContext ? "asset_intake" : selectedAssetImageFile ? attachedAssetMutation ? "asset_intake" : "visual_query" : boardAiRoute(text);
    if (route === "setting_advisor") { showTransientMessage("다음 행사와 현재 세팅을 비교하고 있습니다…"); try { await handleSettingAdvisor(text); aiInput.value = ""; } catch (error) { console.error("setting advisor failed", error); showMessage(error.message || "세팅 상담을 불러오지 못했습니다."); } return; }
    if (route === "event_query") { showTransientMessage("등록된 이벤오더를 확인하고 있습니다…"); try { await handleEventQuery(text); aiInput.value = ""; } catch (error) { console.error("event query failed", error); showMessage("등록된 이벤오더를 확인하지 못했습니다.", true); } return; }
    if (route === "recommend_layouts") { showTransientMessage("저장된 레이아웃을 비교하고 있습니다…"); try { await handleLayoutRecommendation(text); aiInput.value = ""; } catch (error) { console.error("layout recommendation failed", error); showMessage(error.message || "저장된 레이아웃을 추천하지 못했습니다.", true); } return; }
    if (route === "visual_query" && selectedAssetImageFile) { showTransientMessage("선택한 사진을 확인하고 있습니다…"); try { await useSelectedImageForVisualQuery(text); } catch (error) { console.error("selected image query failed", error); showMessage(error.message || "사진을 확인하지 못했습니다."); } return; }
    if (!followupContext && !selectedAssetImageFile && !visualSession && isDeicticVisualQuery(text)) {
      showTransientMessage("현재 화면에서 한 프레임을 확인하고 있습니다…");
      try { const result = await captureOneFrameForFieldAi(text); showVisualResult(result); aiInput.value = ""; } catch (error) { console.error("field AI visual capture failed", error); showMessage(error.name === "NotAllowedError" ? "카메라 권한이 필요합니다." : "정보를 확인하지 못했습니다."); }
      return;
    }
    if (!followupContext && !selectedAssetImageFile && visualSession?.visualSummary && isVisualQueryRequest(text)) {
      const includeImage = requestsDetailedReview(text);
      showTransientMessage(includeImage ? "같은 캡처를 다시 자세히 확인하고 있습니다…" : "현재 캡처 요약을 기준으로 답변하고 있습니다…");
      try { const result = await requestVisualQuery(text, includeImage); showVisualResult(result); aiInput.value = ""; } catch (error) { console.error("visual follow-up failed", error); showMessage(error.message || "시각 질문에 답하지 못했습니다."); }
      return;
    }
    if (route === "hall_state_query") { showTransientMessage("현재 세팅 상태를 조회하고 있습니다…"); try { await showHallStateQuery(text); aiInput.value = ""; } catch (error) { console.error("hall state query failed", error); showMessage(error.message || "현재 세팅 상태를 조회하지 못했습니다."); } return; }
    if (!followupContext && !selectedAssetImageFile && isHallStateConfirmationRequest(text)) {
      showTransientMessage("현재 세팅 상태를 확인하고 있습니다…");
      try { showHallStateProposal(await interpretHallState(text)); } catch (error) { console.error("hall state intake failed", error); showMessage(error.message || "현재 세팅 상태를 확인하지 못했습니다."); }
      return;
    }
    if (!explicitNewAsset && route === "asset_query") {
      showTransientMessage("자산 정보를 조회하고 있습니다…");
      try { const result = await handleAssetQuery(text); showAssetQueryResult(result, text); aiInput.value = ""; } catch (error) { console.error("asset query failed", error); showMessage(error.message || "자산 조회에 실패했습니다."); }
      return;
    }
    if (followupContext || explicitNewAsset || selectedAssetImageFile || route === "asset_intake") {
      showTransientMessage(followupContext ? "이전 자산 정보에 답변을 반영하고 있습니다…" : selectedAssetImageFile ? "사진을 업로드하고 자산 내용을 확인하고 있습니다…" : "자산 내용을 확인하고 있습니다…");
      try { const proposal = await interpretAsset(text, null, followupContext); proposal.userText = text; showAssetProposal(proposal, followupContext, text); aiInput.value = ""; }
      catch (error) { console.error("asset intake failed", { status: error.status, body: error.body, error }); await deleteUnlinkedAssetImage(); resetAssetImage(); showMessage(error.message || "자산 확인에 실패했습니다. 저장된 내용은 없습니다."); }
      return;
    }
    showTransientMessage("변경 내용을 확인하고 있습니다…"); try { const proposal = await interpret(text); proposal.userText = text; recentConversation.push({ user: text, proposal }); recentConversation = recentConversation.slice(-3); showProposal(proposal); } catch (error) { console.error(error); showMessage("정보를 확인하지 못했습니다."); }
  });
  aiInput.addEventListener("input", resizeAiInput);
  aiResult.addEventListener("click", async (event) => {
    const settingSelect = event.target.closest("[data-setting-advisor-select]");
    if (settingSelect) { const row = settingAdvisorRows[Number(settingSelect.dataset.settingAdvisorSelect)]; if (row) showSettingAdvisorDetail(row); return; }
    const settingEvent = event.target.closest("[data-setting-advisor-event]");
    if (settingEvent) { const row = settingAdvisorRows[Number(settingEvent.dataset.settingAdvisorEvent)]; if (row) await showEventAnswer(row.nextEvent, "find_events_by_period_space", "다음 행사 보기", { start: row.nextDate, end: row.nextDate }); return; }
    const settingOriginal = event.target.closest("[data-setting-advisor-original]");
    if (settingOriginal) { const row = settingAdvisorRows[Number(settingOriginal.dataset.settingAdvisorOriginal)]; if (row?.nextEvent.storagePath) window.openStoredExcel(row.nextEvent.storagePath); return; }
    if (event.target.closest("[data-setting-advisor-current-original]")) { const row = currentSettingAdvisorRow(); if (row?.nextEvent.storagePath) window.openStoredExcel(row.nextEvent.storagePath); return; }
    if (event.target.closest("[data-setting-advisor-back]")) { await showSettingAdvisorList(settingAdvisorContext?.anchorDate || ""); return; }
    const layoutSelection = event.target.closest("[data-layout-recommend-select]");
    if (layoutSelection && pendingLayoutRecommendation) { const layout = pendingLayoutRecommendation.layouts.find((item) => String(item.id) === String(layoutSelection.dataset.layoutRecommendSelect)); if (layout) { try { pendingLayoutRecommendation.currentState = await currentHallState(pendingLayoutRecommendation.space); showLayoutSelectionProposal(layout); } catch (error) { console.error("layout current state lookup failed", error); showMessage("현재 세팅을 확인하지 못했습니다."); } } return; }
    if (event.target.closest("[data-layout-recommend-cancel]") && pendingLayoutRecommendation) { const result = { ...pendingLayoutRecommendation, selectedLayout: null }; renderLayoutRecommendations(result); return; }
    if (event.target.closest("[data-layout-recommend-approve]") && pendingLayoutRecommendation?.selectedLayout) { const result = pendingLayoutRecommendation; showTransientMessage("선택한 레이아웃을 현재 세팅에 연결하고 있습니다…"); try { await applyLayoutRecommendation(result); } catch (error) { console.error("layout recommendation apply failed", error); showLayoutSelectionProposal(result.selectedLayout); aiResult.insertAdjacentHTML("afterbegin", `<p class="board-ai-status">${escapeHtml(error.message || "현재 세팅 저장에 실패했습니다.")}</p>`); } return; }
    const eventChoice = event.target.closest("[data-event-query-choice]");
    if (eventChoice && pendingEventQuery) { const selected = pendingEventQuery.result.events[Number(eventChoice.dataset.eventQueryChoice)]; if (selected) await handleEventQuery(pendingEventQuery.userText, selected, pendingEventQuery.result.queryType); return; }
    const eventAction = event.target.closest("[data-event-query-action]");
    if (eventAction && activeEventContexts[0]) { const selected = events.find((item) => item.id === activeEventContexts[0].eventOrderId); if (selected) await handleEventQuery(eventAction.textContent || "그 행사", selected, eventAction.dataset.eventQueryAction); return; }
    if (event.target.closest("[data-hall-state-cancel]")) { pendingHallStateProposal = null; showMessage("현재 세팅 확인을 취소했습니다."); return; }
    if (event.target.closest("[data-hall-state-approve]") && pendingHallStateProposal) { const proposal = pendingHallStateProposal; showTransientMessage("현재 세팅 상태를 저장하고 있습니다…"); try { await applyHallStateProposal(proposal); } catch (error) { console.error("hall state save failed", { status: error.status, body: error.body, error }); showHallStateProposal(proposal); aiResult.insertAdjacentHTML("afterbegin", `<p class="board-ai-status">${escapeHtml(error.message || "현재 세팅 상태 저장에 실패했습니다.")}</p>`); } return; }
    if (event.target.closest("[data-visual-register-asset]")) { try { await useVisualCaptureForAssetIntake(); } catch (error) { console.error(error); showMessage("캡처 사진을 자산 등록에 연결하지 못했습니다."); } return; }
    if (event.target.closest("[data-visual-clear]")) { visualSession = null; closeVisualCamera(); aiInput.value = ""; showMessage("시각 AI 캡처를 종료했습니다."); return; }
    if (event.target.closest("[data-asset-query-close]")) { showMessage(""); aiResult.innerHTML = ""; return; }
    const queryChoice = event.target.closest("[data-asset-query-choice]");
    if (queryChoice && pendingAssetQuery) { const selected = pendingAssetQuery.result.choices[Number(queryChoice.dataset.assetQueryChoice)]; const text = pendingAssetQuery.userText; showTransientMessage("선택한 자산을 조회하고 있습니다…"); try { showAssetQueryResult(await handleAssetQuery(text, selected), text); } catch (error) { console.error(error); showMessage(error.message || "자산 조회에 실패했습니다."); } return; }
    if (event.target.closest("[data-asset-query-more]") && pendingAssetQuery) { const previous = pendingAssetQuery; showTransientMessage("자산 목록을 더 불러오고 있습니다…"); try { const next = await handleAssetQuery(previous.userText, null, previous.result.assets.length); next.assets = [...previous.result.assets, ...(next.assets || [])]; next.answer = previous.result.answer; showAssetQueryResult(next, previous.userText); } catch (error) { console.error(error); showMessage(error.message || "자산 목록을 더 불러오지 못했습니다."); } return; }
    const queryAction = event.target.closest("[data-asset-query-action]");
    if (queryAction && pendingAssetQuery) { const asset = pendingAssetQuery.result.assets.find((item) => String(item.id) === String(queryAction.dataset.assetId)); if (asset && queryAction.dataset.assetQueryAction === "movement") { const text = `${asset.asset_name} 이동 이력 보여줘`; showTransientMessage("이동 이력을 조회하고 있습니다…"); try { showAssetQueryResult(await handleAssetQuery(text, { assetId: asset.id }), text); } catch (error) { console.error(error); showMessage(error.message || "이동 이력을 불러오지 못했습니다."); } } else if (asset) beginAssetUpdateFromQuery(asset, queryAction.dataset.assetQueryAction); return; }
    if (event.target.closest("[data-asset-use-all]") && pendingAssetProposal) { const proposal = pendingAssetProposal; const context = pendingAssetContext; proposal.currentQuantity = Number(proposal._latestQuantity); proposal.confirmedLatestQuantity = Number(proposal._latestQuantity); proposal.decreaseQuantity = Number(proposal._latestQuantity); proposal.newQuantity = 0; proposal.needsClarification = false; await applyConfirmedDecrease(proposal, context); return; }
    if (event.target.closest("[data-asset-reenter-decrease]") && pendingAssetProposal) { pendingAssetProposal.needsClarification = true; pendingAssetProposal.question = "사용한 수량을 다시 입력해주세요."; pendingAssetProposal.choices = []; showAssetProposal(pendingAssetProposal, pendingAssetContext, pendingAssetContext?.latestUserText || ""); aiInput.focus(); return; }
    if (event.target.closest("[data-asset-confirm-latest]") && pendingAssetProposal) { const proposal = pendingAssetProposal; const context = pendingAssetContext; proposal.currentQuantity = Number(proposal._latestQuantity); proposal.confirmedLatestQuantity = Number(proposal._latestQuantity); proposal.newQuantity = Number(proposal._nextQuantity); proposal.needsClarification = false; await applyConfirmedDecrease(proposal, context); return; }
    if (event.target.closest("[data-asset-confirm-location]") && pendingAssetProposal) { const proposal = pendingAssetProposal; const context = pendingAssetContext; proposal.currentFloor = proposal._latestFloor; proposal.currentLocation = proposal._latestLocation; proposal.confirmedLocationKey = locationKey({ floor: proposal._latestFloor, location: proposal._latestLocation }); proposal.needsClarification = false; await applyConfirmedLocation(proposal, context); return; }
    if (event.target.closest("[data-asset-cancel]")) { await deleteUnlinkedAssetImage(); resetAssetImage(); aiInput.value = ""; showMessage("자산 반영을 취소했습니다. 저장된 내용은 없습니다."); return; }
    if (event.target.closest("[data-asset-edit]") && pendingAssetProposal) { document.querySelectorAll("#boardAssetProposalForm input").forEach((input) => { input.disabled = false; }); document.querySelector("#boardAssetProposalForm input")?.focus(); return; }
    if (event.target.closest("[data-asset-create-new]") && pendingAssetProposal) { const asset = readAssetFields(); const proposal = { ...pendingAssetProposal, intent: "create_asset", targetAssetId: null, needsClarification: !asset.assetName || asset.quantity == null || !asset.location, asset, confirmationText: "기존 자산과 합치지 않고 새 자산으로 등록할까요?" }; showAssetProposal(proposal, pendingAssetContext, pendingAssetContext?.latestUserText || ""); return; }
    const assetChoice = event.target.closest("[data-asset-choice]");
    if (assetChoice && pendingAssetProposal) { const selected = pendingAssetProposal.choices[Number(assetChoice.dataset.assetChoice)]; const originalText = pendingAssetContext?.latestUserText || pendingAssetProposal.userText || aiInput.value.trim(); showTransientMessage("선택한 자산을 확인하고 있습니다…"); try { const proposal = await interpretAsset(originalText, selected, pendingAssetContext); proposal.userText = originalText; showAssetProposal(proposal, pendingAssetContext, originalText); } catch (error) { console.error(error); await deleteUnlinkedAssetImage(); resetAssetImage(); showMessage(error.message || "대상을 확인하지 못했습니다. 저장된 내용은 없습니다."); } return; }
    if (event.target.closest("[data-asset-approve]") && pendingAssetProposal) {
      const proposal = pendingAssetProposal; const context = pendingAssetContext; const approvedAsset = readAssetFields();
      console.info("asset approve clicked", { intent: proposal.intent, pendingAssetProposal: proposal });
      console.info("asset fields read", approvedAsset);
      proposal.asset = { ...(proposal.asset || {}), ...approvedAsset };
      showTransientMessage("승인된 자산 변경을 저장하고 있습니다…");
      try { await applyAssetProposal(proposal, approvedAsset); }
      catch (error) { console.error("board asset AI apply failed", { status: error.status, body: error.body, error }); if (["decrease_exceeds_stock", "asset_quantity_changed"].includes(error.code)) { proposal._latestQuantity = error.latestQuantity; proposal._nextQuantity = error.nextQuantity; showDecreaseGuard(proposal, context, error); } else if (error.code === "asset_location_changed") showLocationGuard(proposal, context, error); else if (error.code === "partial_move_unsupported") showMessage(error.message); else { showAssetProposal(proposal, context, context?.latestUserText || proposal.userText || ""); aiResult.insertAdjacentHTML("afterbegin", `<p class="board-ai-status">${escapeHtml(error.message || "자산 저장에 실패했습니다. 기존 데이터는 유지됩니다.")}</p>`); } }
      return;
    }
    if (event.target.closest("[data-ai-cancel]")) { showMessage("변경을 취소했습니다."); return; }
    if (event.target.closest("[data-ai-edit]")) { aiInput.focus(); aiInput.select(); return; }
    const choice = event.target.closest("[data-ai-choice]");
    if (choice && pendingProposal) { const selected = pendingProposal.choices[Number(choice.dataset.aiChoice)]; const originalText = pendingProposal.userText || aiInput.value.trim(); showMessage("선택한 대상을 확인하고 있습니다…"); try { const proposal = await interpret(originalText, selected); proposal.userText = originalText; showProposal(proposal); } catch (error) { console.error(error); showMessage("대상을 확인하지 못했습니다."); } return; }
    if (event.target.closest("[data-ai-approve]") && pendingProposal) { const proposal = pendingProposal; showTransientMessage("승인된 변경을 저장하고 있습니다…"); try { await applyProposal(proposal); } catch (error) { console.error("board AI apply failed", { code: error.code, error }); showMessage(error.code === "schedule_duplicate" ? error.message : error.code === "schedule_not_found" || error.code === "schedule_target_missing" ? "변경할 일정을 찾지 못했습니다. 최신 일정을 다시 불러와주세요." : error.code === "schedule_patch_failed" || error.code === "schedule_insert_failed" ? "일정 저장에 실패했습니다. 기존 일정은 유지됩니다." : "변경 저장에 실패했습니다. 기존 데이터는 유지됩니다.", true); } }
  });
  document.querySelectorAll("[data-board-page-step]").forEach((button) => button.onclick = () => moveBoardDate(Number(button.dataset.boardPageStep)));
  document.querySelector("[data-board-page-today]").onclick = () => { board.setSelectedDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)); render(); };
  document.getElementById("boardLoginForm").onsubmit = (event) => { event.preventDefault(); const id = document.getElementById("boardLoginId").value.trim(); const password = document.getElementById("boardLoginPassword").value; const account = constants.loginAccounts.find((item) => item.id === id && item.password === password); if (!account) { document.getElementById("boardLoginError").textContent = "아이디 또는 비밀번호가 올바르지 않습니다."; return; } localStorage.setItem(constants.authStorageKey, JSON.stringify({ id: account.id, role: account.role, label: account.label })); start(); };
  window.openStoredExcel = (path) => window.open(`../index.html?excelPreview=${encodeURIComponent(String(path))}`, "_blank", "noopener");
  window.addEventListener("beforeunload", () => { closeVisualCamera(); cancelBoardSpeech(); if (speechRecognition && speechListening) speechRecognition.abort(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("../push-sw.js").catch(console.warn);
  if (storedUser()) start(); else { login.hidden = false; app.hidden = true; }
})();
