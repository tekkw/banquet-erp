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
  const speechSynthesisApi = window.speechSynthesis;
  const SpeechSynthesisUtteranceApi = window.SpeechSynthesisUtterance;
  let events = [];
  let pendingProposal = null;
  let pendingAssetProposal = null;
  let pendingAssetContext = null;
  let pendingAssetQuery = null;
  let selectedAssetImageFile = null;
  let uploadedAssetImage = null;
  let selectedAssetPreviewUrl = "";
  let visualStream = null;
  let visualSession = null;
  let recentConversation = [];
  let speechRecognition = null;
  let speechListening = false;
  let speechBaseText = "";
  let speechFinalText = "";
  let speechErrorMessage = "";
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
  function isAssetQueryRequest(text) { return /(어디|어느\s*위치|몇\s*(?:개|박스|세트|대|병|롤|팩)?\s*(?:있|남)|뭐\s*(?:있|있지|보여)|목록|사진\s*(?:보여|있)|찾아\s*줘|검색\s*해|보유\s*(?:수량|현황)|이동\s*이력|최근\s*이동|마지막.*옮)/i.test(text); }
  function isAssetDecreaseRequest(text) { return /(?:\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:개|ea|box|박스|세트|대|병|롤|팩)/i.test(text) && /(썼|사용(?:했|해|함|\s*$)|소모|가져갔|가져감|출고|나갔|꺼냈|소비)/i.test(text); }
  function isAssetMoveRequest(text) { return /(창고|사무실|선반|린넨|부라노|컨벤션|\d+\s*(?:층|f))/i.test(text) && /(옮겼|옮겨|이동(?:했|해|함)?|위치\s*변경)/i.test(text); }
  function isAssetIntakeRequest(text) { return isAssetDecreaseRequest(text) || isAssetMoveRequest(text) || (/(자산|비품|소모품|장비|서무|종이컵|멀티탭|수량|위치|보관)/i.test(text) && /(등록|넣었|추가|입고|늘려|증가|옮겼|옮겨|이동|변경|보관했|발견)/i.test(text)); }
  function isVisualQueryRequest(text) { return /(이거|이것|사진|화면|보이|몇\s*개|자산에|등록돼|세팅|장면|다시.*(?:봐|보)|이상한|문제)/i.test(text); }
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
    if (!voiceReplyEnabled || !speechSynthesisApi || !SpeechSynthesisUtteranceApi || !spokenText || spokenText === lastSpokenText) return;
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
    speechButton.textContent = state === "listening" ? "🔴 듣는 중" : state === "processing" ? "텍스트 변환 중..." : "🎤";
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
      speechErrorMessage = event.error === "not-allowed" || event.error === "service-not-allowed" ? "마이크 권한이 필요합니다." : event.error === "no-speech" || event.error === "audio-capture" ? "음성을 인식하지 못했습니다. 다시 시도해주세요." : "음성 입력 중 오류가 발생했습니다. 다시 시도해주세요.";
      setSpeechStatus(speechErrorMessage, true);
    };
    speechRecognition.onend = () => {
      speechListening = false; setSpeechButtonState("idle");
      if (speechFinalText) { aiInput.value = speechInputValue(speechFinalText); resizeAiInput(); setSpeechStatus("인식된 문장을 확인한 후 보내기를 눌러주세요."); }
      else { aiInput.value = speechBaseText; resizeAiInput(); if (!speechErrorMessage) setSpeechStatus("음성을 인식하지 못했습니다. 다시 시도해주세요.", true); }
    };
    return speechRecognition;
  }
  function toggleSpeechRecognition() {
    if (speechListening) { setSpeechButtonState("processing"); setSpeechStatus("텍스트 변환 중..."); speechRecognition.stop(); return; }
    cancelBoardSpeech();
    const recognition = ensureSpeechRecognition();
    if (!recognition) { setSpeechStatus("이 브라우저에서는 음성 입력을 지원하지 않습니다.", true); return; }
    speechBaseText = aiInput.value.trim(); speechFinalText = ""; speechErrorMessage = ""; setSpeechButtonState("processing"); setSpeechStatus("마이크를 준비하고 있습니다...");
    try { recognition.start(); } catch (error) { console.error("speech recognition start failed", error); setSpeechButtonState("idle"); setSpeechStatus("음성 입력을 시작하지 못했습니다. 다시 시도해주세요.", true); }
  }
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
    speakBoardReply(finalAnswer);
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
  function showAssetQueryResult(result, userText) {
    pendingProposal = null; pendingAssetProposal = null; pendingAssetContext = null; pendingAssetQuery = { result, userText };
    if (result.needsClarification) {
      const choices = Array.isArray(result.choices) ? result.choices : [];
      aiResult.innerHTML = `<h3>자산 선택</h3><p>${escapeHtml(result.question || "어떤 자산을 찾으시나요?")}</p><div class="board-ai-choices">${choices.map((choice, index) => `<button class="board-ai-choice" type="button" data-asset-query-choice="${index}">${escapeHtml(choice.label)}</button>`).join("")}</div><div class="board-ai-actions"><button type="button" data-asset-query-close>닫기</button></div>`;
      return;
    }
    const assets = Array.isArray(result.assets) ? result.assets : [];
    const movements = Array.isArray(result.movements) ? result.movements.slice(0, 10) : [];
    const finalAnswer = result.answer || "등록된 자산에서 찾지 못했습니다.";
    aiResult.innerHTML = `<div class="board-asset-query-result"><p class="board-ai-status">${escapeHtml(finalAnswer)}</p>${movements.map(movementResultCard).join("")}${assets.map((asset) => assetResultCard(asset, result.queryType)).join("")}${result.hasMore ? `<button class="board-asset-more" type="button" data-asset-query-more>더 보기</button>` : ""}<div class="board-ai-actions"><button type="button" data-asset-query-close>닫기</button></div></div>`;
    const needsScreenDetail = movements.length > 0 || result.queryType === "list_assets_by_location";
    speakBoardReply(needsScreenDetail ? `${finalAnswer} 자세한 내용은 화면을 확인해주세요.` : finalAnswer);
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
    if (proposal.intent === "unsupported") { aiResult.innerHTML = `<p class="board-ai-status">현재는 등록 / 수량 추가 / 위치 변경만 지원합니다.</p><div class="board-ai-actions"><button type="button" data-asset-cancel>닫기</button></div>`; return; }
    if (proposal.intent === "update_asset_location" && proposal.partialMoveUnsupported) { aiResult.innerHTML = `<div class="board-asset-proposal"><h3>일부 수량 이동 미지원</h3><p class="board-ai-status">${escapeHtml(proposal.question || "일부 수량 이동은 아직 지원하지 않습니다.")}</p><div class="board-ai-actions"><button type="button" data-asset-cancel>확인</button></div></div>`; return; }
    if (proposal.needsClarification || Number(proposal.confidence) < 0.7) {
      const choices = Array.isArray(proposal.choices) ? proposal.choices : [];
      aiResult.innerHTML = `<div class="board-asset-proposal"><div class="board-asset-heading">${image}<div><h3>자산 정보 확인</h3>${currentAssetSummary(pendingAssetContext.asset)}<p>${escapeHtml(proposal.question || "수량과 보관 위치를 알려주세요.")}</p></div></div>${choices.length ? `<div class="board-ai-choices">${choices.map((choice, index) => `<button class="board-ai-choice" type="button" data-asset-choice="${index}">${escapeHtml(choice.label)}</button>`).join("")}</div>` : ""}<div class="board-ai-actions"><button type="button" data-asset-cancel>취소</button></div></div>`;
      return;
    }
    const asset = proposal.asset || {};
    const current = proposal.intent === "increase_asset_quantity" ? `<p class="board-asset-current">현재 ${proposal.currentQuantity ?? 0}${escapeHtml(asset.unit || "")} + ${proposal.addQuantity ?? 0}${escapeHtml(asset.unit || "")} → ${proposal.newQuantity ?? 0}${escapeHtml(asset.unit || "")}</p>` : proposal.intent === "decrease_asset_quantity" ? `<p class="board-asset-current">현재 ${proposal.currentQuantity ?? 0}${escapeHtml(asset.unit || "")}<br>사용 ${proposal.decreaseQuantity ?? 0}${escapeHtml(asset.unit || "")}<br>${proposal.currentQuantity ?? 0} → ${proposal.newQuantity ?? 0}</p>` : proposal.intent === "update_asset_location" ? `<p class="board-asset-current"><strong>현재 위치</strong><br>${escapeHtml(movementPlace(proposal.currentFloor, proposal.currentLocation))}<br><strong>변경 위치</strong><br>${escapeHtml(movementPlace(asset.floor, asset.location))}</p>` : "";
    const approveText = proposal.intent === "increase_asset_quantity" || proposal.intent === "decrease_asset_quantity" ? `${proposal.newQuantity ?? "새 수량"}으로 반영` : proposal.intent === "update_asset_location" ? "위치 변경" : "자산 등록";
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
  function showMessage(message, shouldSpeak = false) { pendingProposal = null; pendingAssetProposal = null; pendingAssetContext = null; pendingAssetQuery = null; aiResult.innerHTML = `<p class="board-ai-status">${escapeHtml(message)}</p>`; if (shouldSpeak) speakBoardReply(message); }
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
    showMessage(!refreshResult?.ok ? `${success} 화면 동기화에 실패해 새로고침이 필요합니다.` : !auditSaved ? `${success} 변경 기록 저장은 실패했습니다.` : success, true); aiInput.value = "";
  }
  function start() { login.hidden = true; app.hidden = false; events = cachedEvents(); render(); status.textContent = events.length ? "저장된 일정 표시 중" : "최신 일정 불러오는 중"; refresh(); }

  if (!speechSynthesisApi || !SpeechSynthesisUtteranceApi) { voiceReplyButton.disabled = true; voiceReplyButton.textContent = "🔇 음성 답변 미지원"; voiceReplyButton.title = "이 브라우저에서는 음성 답변을 지원하지 않습니다."; voiceReplyStatus.textContent = "이 브라우저에서는 음성 답변을 지원하지 않습니다."; voiceReplyStatus.hidden = false; }
  else { voiceReplyEnabled = storedVoiceReplyEnabled(); updateVoiceReplyButton(); voiceReplyButton.addEventListener("click", toggleVoiceReply); }
  visualCameraButton.addEventListener("click", async () => { try { await openVisualCamera(); } catch (error) { console.error("camera open failed", error); showMessage(error.name === "NotAllowedError" ? "카메라 권한이 필요합니다." : error.message || "카메라를 열지 못했습니다."); } });
  if (!SpeechRecognitionApi) { speechButton.disabled = true; speechButton.title = "이 브라우저에서는 음성 입력을 지원하지 않습니다."; setSpeechStatus("이 브라우저에서는 음성 입력을 지원하지 않습니다.", true); }
  else speechButton.addEventListener("click", toggleSpeechRecognition);
  visualCloseButton.addEventListener("click", closeVisualCamera);
  visualCaptureButton.addEventListener("click", async () => { visualCaptureButton.disabled = true; try { await captureAndAnalyzeVisual(); } catch (error) { console.error("visual capture failed", error); showMessage(error.message || "현재 화면을 분석하지 못했습니다."); } finally { visualCaptureButton.disabled = false; } });
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
    if (!followupContext && !selectedAssetImageFile && visualSession?.visualSummary && isVisualQueryRequest(text)) {
      const includeImage = requestsDetailedReview(text);
      showTransientMessage(includeImage ? "같은 캡처를 다시 자세히 확인하고 있습니다…" : "현재 캡처 요약을 기준으로 답변하고 있습니다…");
      try { const result = await requestVisualQuery(text, includeImage); showVisualResult(result); aiInput.value = ""; } catch (error) { console.error("visual follow-up failed", error); showMessage(error.message || "시각 질문에 답하지 못했습니다."); }
      return;
    }
    if (!followupContext && !explicitNewAsset && !selectedAssetImageFile && isAssetQueryRequest(text)) {
      showTransientMessage("자산 정보를 조회하고 있습니다…");
      try { const result = await handleAssetQuery(text); showAssetQueryResult(result, text); aiInput.value = ""; } catch (error) { console.error("asset query failed", error); showMessage(error.message || "자산 조회에 실패했습니다."); }
      return;
    }
    if (followupContext || explicitNewAsset || selectedAssetImageFile || isAssetIntakeRequest(text)) {
      showTransientMessage(followupContext ? "이전 자산 정보에 답변을 반영하고 있습니다…" : selectedAssetImageFile ? "사진을 업로드하고 자산 내용을 확인하고 있습니다…" : "자산 내용을 확인하고 있습니다…");
      try { const proposal = await interpretAsset(text, null, followupContext); proposal.userText = text; showAssetProposal(proposal, followupContext, text); aiInput.value = ""; }
      catch (error) { console.error("asset intake failed", { status: error.status, body: error.body, error }); await deleteUnlinkedAssetImage(); resetAssetImage(); showMessage(error.message || "자산 확인에 실패했습니다. 저장된 내용은 없습니다."); }
      return;
    }
    showMessage("변경 내용을 확인하고 있습니다…"); try { const proposal = await interpret(text); proposal.userText = text; recentConversation.push({ user: text, proposal }); showProposal(proposal); } catch (error) { console.error(error); showMessage("AI 확인에 실패했습니다. 잠시 후 다시 시도해주세요."); }
  });
  aiInput.addEventListener("input", resizeAiInput);
  aiResult.addEventListener("click", async (event) => {
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
    if (event.target.closest("[data-ai-approve]") && pendingProposal) { const proposal = pendingProposal; showMessage("승인된 변경을 저장하고 있습니다…"); try { await applyProposal(proposal); } catch (error) { console.error("board AI apply failed", { code: error.code, error }); showMessage(error.code === "schedule_not_found" || error.code === "schedule_target_missing" ? "변경할 일정을 찾지 못했습니다. 최신 일정을 다시 불러와주세요." : error.code === "schedule_patch_failed" ? "일정 수정에 실패했습니다. 기존 일정은 유지됩니다." : "변경 저장에 실패했습니다. 기존 데이터는 유지됩니다."); } }
  });
  document.querySelectorAll("[data-board-page-step]").forEach((button) => button.onclick = () => moveBoardDate(Number(button.dataset.boardPageStep)));
  document.querySelector("[data-board-page-today]").onclick = () => { board.setSelectedDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)); render(); };
  document.getElementById("boardLoginForm").onsubmit = (event) => { event.preventDefault(); const id = document.getElementById("boardLoginId").value.trim(); const password = document.getElementById("boardLoginPassword").value; const account = constants.loginAccounts.find((item) => item.id === id && item.password === password); if (!account) { document.getElementById("boardLoginError").textContent = "아이디 또는 비밀번호가 올바르지 않습니다."; return; } localStorage.setItem(constants.authStorageKey, JSON.stringify({ id: account.id, role: account.role, label: account.label })); start(); };
  window.openStoredExcel = (path) => window.open(`${constants.supabaseConfig.url}/storage/v1/object/public/${constants.supabaseConfig.bucket}/${String(path).split("/").map(encodeURIComponent).join("/")}`, "_blank", "noopener");
  window.addEventListener("beforeunload", () => { closeVisualCamera(); cancelBoardSpeech(); if (speechRecognition && speechListening) speechRecognition.abort(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("../push-sw.js").catch(console.warn);
  if (storedUser()) start(); else { login.hidden = false; app.hidden = true; }
})();
