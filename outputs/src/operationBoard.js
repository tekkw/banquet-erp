(function registerOperationBoard() {
  const STORAGE_KEY = "banquet-erp-operation-board-v1";
  const REMINDER_DEFAULT_KEY = "banquet-erp-operation-reminder-default-v1";
  const TYPES = { start: "행사 시작", lunch: "중식", dinner: "석식", coffee: "커피브레이크", end: "행사 종료", next_setup: "다음 세팅", manual: "직접 작업" };
  const COLORS = ["#2563eb", "#0f766e", "#9333ea", "#c2410c", "#be123c", "#4f46e5", "#15803d", "#a16207"];
  let root;
  let weeklyRoot;
  let currentEvents = [];
  let state = loadState();
  let remoteStatus = "idle";
  let defaultReminder = localStorage.getItem(REMINDER_DEFAULT_KEY) || "none";

  function dateKey(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }
  function normalize(value) { return String(value || "").trim().replace(/\s+/g, " "); }
  function timeValue(value) {
    const match = normalize(value).match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/);
    return match ? `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}` : "";
  }
  function classifySchedule(content) {
    const text = normalize(content).toLowerCase();
    if (/중식|lunch/.test(text)) return "lunch";
    if (/석식|dinner|디너/.test(text)) return "dinner";
    if (/커피|coffee|다과|break/.test(text)) return "coffee";
    if (/종료|폐회|철수|end/.test(text)) return "end";
    if (/시작|개회|입장|start/.test(text)) return "start";
    return "";
  }
  function eventDates(event) { return [...new Set([...(event.calendarDates || []), event.startDate, event.endDate].filter(Boolean))]; }
  function scheduleDate(row, event) {
    const raw = normalize(row.date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const partial = raw.match(/(\d{1,2})\s*[.\/-]\s*(\d{1,2})/);
    if (partial) {
      const suffix = `-${String(Number(partial[1])).padStart(2, "0")}-${String(Number(partial[2])).padStart(2, "0")}`;
      const matched = eventDates(event).find((value) => value.endsWith(suffix));
      if (matched) return matched;
    }
    return eventDates(event).length === 1 ? eventDates(event)[0] : "";
  }
  function venueName(row, event) { return normalize(row.venue || event.venue) || "장소 미입력"; }
  function eventSpaceNames(event) {
    return [...new Set((event?.eventSpaces || []).map((space) => normalize(space?.spaceName))
      .filter(Boolean).map((name) => name.replace(/^컨벤션\s*센터\s*/i, "컨벤션")))];
  }
  function formatEventSpaceSummary(event, compact = false) {
    const names = eventSpaceNames(event);
    if (!names.length) return normalize(event?.venue) || "장소 미입력";
    return compact && names.length > 2 ? `${names[0]} 외 ${names.length - 1}곳` : names.join(" · ");
  }
  function formatEventSpaceDetails(event) {
    const spaces = event?.eventSpaces || [];
    if (!spaces.length) return normalize(event?.venue) || "장소 미입력";
    return spaces.map((space) => {
      const name = normalize(space?.spaceName).replace(/^컨벤션\s*센터\s*/i, "컨벤션");
      return `${normalize(space?.roleLabel) || "사용 공간"}: ${name}`;
    }).filter((value) => !value.endsWith(": ")).join("\n");
  }
  function scheduleContext(row, event) {
    const rowLocation = normalize([row.venue, row.location, row.place].filter(Boolean).join(" "));
    return normalize([rowLocation || event.venue, row.content].filter(Boolean).join(" ")).toLowerCase();
  }
  function isFrontSchedule(row, event) { return /프론트/.test(scheduleContext(row, event)); }
  function isFirenzeSchedule(row, event) { return /피렌체/.test(scheduleContext(row, event)); }
  function visibleScheduleType(row, event) {
    if (isFrontSchedule(row, event)) return "";
    const type = classifySchedule(row.content);
    return isFirenzeSchedule(row, event) && !["lunch", "dinner"].includes(type) ? "" : type;
  }
  function isBoundarySchedule(row, event) {
    if (isFrontSchedule(row, event) || isFirenzeSchedule(row, event)) return false;
    return !["lunch", "dinner", "coffee"].includes(classifySchedule(row.content));
  }
  function scheduleEndTime(row) { return normalize(row.time).match(/~\s*(\d{1,2}:\d{2})/)?.[1] || timeValue(row.time); }
  function spaceKey(row, event) {
    const explicit = row.spaceId || event.venueSpaceIds?.[0] || event.venueSpaces?.[0]?.id;
    return explicit || `venue:${venueName(row, event).toLowerCase().replace(/\s+/g, "")}`;
  }
  function physicalSpaceKeys(event, row = {}) {
    const keys = new Set();
    [row.spaceId, ...(row.venueSpaceIds || []), ...(event.venueSpaceIds || []),
      ...(row.venueSpaces || []).map((space) => space?.id), ...(event.venueSpaces || []).map((space) => space?.id)]
      .filter(Boolean).forEach((id) => keys.add(`id:${id}`));
    const names = [row.venue, row.location, row.place, event.venue, ...(event.venueSpaceNames || []),
      ...(row.venueSpaces || []).flatMap((space) => [space?.spaceName, space?.spaceCode]),
      ...(event.venueSpaces || []).flatMap((space) => [space?.spaceName, space?.spaceCode]),
      ...(event.eventSpaces || []).map((space) => space?.spaceName)];
    names.filter(Boolean).forEach((value) => {
      const normalized = String(value).toLowerCase().replace(/[Ⅰⅰ]/g, "1").replace(/[Ⅱⅱ]/g, "2").replace(/[Ⅲⅲ]/g, "3")
        .replace(/^\s*\d+\s*f\s*/i, "").replace(/[\s()[\]{}<>｜|/\\.,·ㆍ∙･_-]/g, "");
      if (!normalized) return;
      const allMatch = normalized.match(/^(.*?)(?:all|전체|전관)$/i);
      const memberMatch = normalized.match(/^(.*?)(\d+|[a-z])$/i);
      if (allMatch?.[1]) keys.add(`place:${allMatch[1]}:*`);
      else if (memberMatch?.[1]) keys.add(`place:${memberMatch[1]}:${memberMatch[2]}`);
      else keys.add(`place:${normalized}:*`);
    });
    return [...keys];
  }
  function physicalSpaceKeysOverlap(leftKeys, rightKeys) {
    const right = new Set(rightKeys || []);
    if ((leftKeys || []).some((key) => right.has(key))) return true;
    const places = (keys) => (keys || []).filter((key) => key.startsWith("place:")).map((key) => {
      const [, family, member] = key.split(":"); return { family, member };
    });
    return places(leftKeys).some((left) => places(rightKeys).some((rightPlace) => left.family === rightPlace.family
      && (left.member === "*" || rightPlace.member === "*" || left.member === rightPlace.member)));
  }
  function spacesOverlap(currentEvent, futureEvent, currentRow = {}, futureRow = {}) {
    return physicalSpaceKeysOverlap(physicalSpaceKeys(currentEvent, currentRow), physicalSpaceKeys(futureEvent, futureRow));
  }
  function colorForSpace(key) {
    let hash = 0;
    for (const char of String(key || "")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return COLORS[Math.abs(hash) % COLORS.length];
  }
  function blockKey(event, row, type, index) { return `auto:${event.id}:${scheduleDate(row, event)}:${timeValue(row.time)}:${type}:${index}`; }
  function buildAutoBlocks(events, today = dateKey()) {
    const blocks = [];
    events.forEach((event) => {
      const boundaryRows = (event.schedule || []).map((row, index) => ({ row, index, day: scheduleDate(row, event), time: timeValue(row.time), endTime: scheduleEndTime(row) })).filter((item) => item.day === today && item.time && isBoundarySchedule(item.row, event)).sort((a, b) => a.time.localeCompare(b.time));
      (event.schedule || []).forEach((row, index) => {
        if (scheduleDate(row, event) !== today) return;
        const type = visibleScheduleType(row, event);
        if (!type) return;
        const key = blockKey(event, row, type, index);
        blocks.push({ key, kind: "auto", type, time: timeValue(row.time) || "시간 미정", venue: venueName(row, event), spaceId: spaceKey(row, event), physicalSpaces: physicalSpaceKeys(event, row), title: type === "start" ? (event.eventName || "행사 시작") : TYPES[type], eventName: event.eventName || "행사", people: row.people || event.guestCount || "", completed: !!state.completions[key] });
      });
      if (boundaryRows.length && !blocks.some((block) => block.key.startsWith(`auto:${event.id}:`) && block.type === "start")) {
        const first = boundaryRows[0]; const key = blockKey(event, first.row, "start", first.index);
        blocks.push({ key, kind: "auto", type: "start", time: first.time, venue: venueName(first.row, event), spaceId: spaceKey(first.row, event), physicalSpaces: physicalSpaceKeys(event, first.row), title: event.eventName || "행사 시작", eventName: event.eventName || "행사", people: first.row.people || event.guestCount || "", completed: !!state.completions[key] });
      }
      if (boundaryRows.length && !blocks.some((block) => block.key.startsWith(`auto:${event.id}:`) && block.type === "end")) {
        const last = boundaryRows.slice().sort((a, b) => a.endTime.localeCompare(b.endTime)).at(-1); const endTime = last.endTime; const key = `${blockKey(event, last.row, "end", last.index)}:${endTime}`;
        blocks.push({ key, kind: "auto", type: "end", time: endTime, venue: venueName(last.row, event), spaceId: spaceKey(last.row, event), physicalSpaces: physicalSpaceKeys(event, last.row), title: TYPES.end, eventName: event.eventName || "행사", people: "", completed: !!state.completions[key] });
      }
    });
    const endedBySpace = new Map(blocks.filter((b) => b.type === "end").map((b) => [b.spaceId, b]));
    endedBySpace.forEach((ended, key) => {
      const candidates = [];
      events.forEach((event) => (event.schedule || []).forEach((row) => {
        const day = scheduleDate(row, event);
        if (day > today && physicalSpaceKeysOverlap(ended.physicalSpaces, physicalSpaceKeys(event, row))) candidates.push({ day, event, row });
      }));
      candidates.sort((a, b) => a.day.localeCompare(b.day));
      const next = candidates[0];
      const itemKey = `next:${today}:${key}`;
      blocks.push({ key: itemKey, kind: "next_setup", type: "next_setup", time: ended.time, venue: ended.venue, spaceId: key, title: "다음 세팅", eventName: ended.eventName, completed: !!state.completions[itemKey], next: next ? { date: next.day, name: next.event.eventName || "행사", people: next.row.people || next.event.guestCount || "", layoutType: inferLayoutType(next.event), recommendation: recommendLayout(next.event.venueLayouts || [], inferLayoutType(next.event), next.row.people || next.event.guestCount) } : null });
    });
    return blocks;
  }
  function inferLayoutType(event) {
    const text = [event.internalMemo, ...(event.layoutEqp || [])].join(" ");
    const options = [[/스쿨|school/i, "school"], [/라운드|round/i, "round"], [/극장|theater/i, "theater"], [/u자|u-shape/i, "u_shape"], [/연회|banquet/i, "banquet"]];
    return options.find(([pattern]) => pattern.test(text))?.[1] || "";
  }
  function recommendLayout(layouts, type, people) {
    const count = Number(people) || 0;
    const ranked = (layouts || []).filter((x) => x.is_active !== false).map((layout) => {
      const typeMatch = !!type && layout.layout_type === type;
      const rangeMatch = !!count && (!layout.min_people || count >= layout.min_people) && (!layout.max_people || count <= layout.max_people);
      return { layout, score: (typeMatch ? 2 : 0) + (rangeMatch ? 1 : 0) };
    }).sort((a, b) => b.score - a.score);
    return ranked[0]?.score ? ranked[0].layout.layout_name : "추천 레이아웃 없음";
  }
  function loadState() {
    try { return { completions: {}, plans: {}, reminders: {}, manual: [], checklist: [], ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
    catch { return { completions: {}, plans: {}, reminders: {}, manual: [], checklist: [] }; }
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  async function remoteRequest(path, options = {}) {
    const config = window.BANQUET_ERP_CONSTANTS?.supabaseConfig;
    if (!config?.url || !config?.anonKey) throw new Error("Supabase 설정 없음");
    const response = await fetch(`${config.url}/rest/v1/${path}`, { ...options, headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`operation board storage ${response.status}`);
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  async function hydrateRemote() {
    if (remoteStatus !== "idle") return;
    remoteStatus = "loading";
    const today = dateKey();
    try {
      const [items, checklist] = await Promise.all([
        remoteRequest(`operation_board_items?select=*&board_date=eq.${today}`),
        remoteRequest(`operation_board_checklist_items?select=*&board_date=eq.${today}&order=sort_order.asc`),
      ]);
      (items || []).forEach((row) => {
        state.completions[row.item_key] = !!row.is_completed;
        if (row.metadata?.plannedDate) state.plans[row.item_key] = row.metadata.plannedDate;
        if (row.metadata?.reminderOverride != null) state.reminders[row.item_key] = String(row.metadata.reminderOverride);
        if (row.item_kind === "manual") state.manual = [...state.manual.filter((x) => x.key !== row.item_key), { key: row.item_key, id: row.item_key, kind: "manual", type: "manual", date: row.board_date, time: String(row.item_time || "").slice(0, 5), venue: row.venue_name, spaceId: row.space_id || row.metadata?.spaceKey || `venue:${row.venue_name}`, title: row.title, memo: row.memo || "", completed: !!row.is_completed }];
      });
      state.checklist = (checklist || []).map((row) => ({ id: row.id, parentKey: row.parent_item_key, name: row.item_name, quantity: row.quantity || "", unit: row.unit || "", memo: row.memo || "", completed: !!row.is_completed }));
      saveState(); remoteStatus = "ready"; render();
    } catch (error) { remoteStatus = "fallback"; console.info("운영보드 DB migration 적용 전: 브라우저 저장소를 사용합니다.", error.message); }
  }
  function syncItem(item) {
    if (remoteStatus !== "ready") return;
    const override = state.reminders[item.key]; const resolved = override == null || override === "default" ? defaultReminder : override;
    const payload = { board_date: item.date || dateKey(), item_key: item.key, item_kind: item.kind === "manual" ? "manual" : item.type === "next_setup" || item.type === "weekly_setup" ? "next_setup" : "auto", event_order_id: item.eventOrderId || null, space_id: /^[0-9a-f-]{36}$/i.test(item.spaceId || "") ? item.spaceId : null, item_time: /^\d\d:\d\d$/.test(item.time || "") ? item.time : null, venue_name: item.venue || "", title: item.title || "", people: Number(item.people) || null, memo: item.memo || "", is_completed: !!item.completed, metadata: { spaceKey: item.spaceId, plannedDate: item.plannedDate || null, taskType: item.type, reminderOverride: override ?? "default", reminderEnabled: resolved !== "none" && !item.completed, reminderOffsetMinutes: resolved === "none" ? null : Number(resolved) } };
    remoteRequest("operation_board_items?on_conflict=board_date,item_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(payload) }).catch(console.error);
  }
  function syncChecklist(item, removed = false) {
    if (remoteStatus !== "ready") return;
    if (removed) { remoteRequest(`operation_board_checklist_items?id=eq.${item.id}`, { method: "DELETE" }).catch(console.error); return; }
    remoteRequest("operation_board_checklist_items?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: item.id, board_date: dateKey(), parent_item_key: item.parentKey, item_name: item.name, quantity: Number(item.quantity) || null, unit: item.unit || null, memo: item.memo || "", is_completed: !!item.completed }) }).catch(console.error);
  }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function allBlocks() {
    const today = dateKey();
    return [...buildAutoBlocks(currentEvents, today), ...state.manual.filter((x) => x.date === today)].sort((a, b) => String(a.time).localeCompare(String(b.time)) || a.venue.localeCompare(b.venue, "ko"));
  }
  function addDays(key, amount) { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + amount); return dateKey(date); }
  function buildWeeklySetupTasks(events, today = dateKey()) {
    const tasks = new Map();
    (events || []).forEach((event) => {
      const eventDate = eventDates(event).filter((day) => day >= today).sort()[0];
      if (!eventDate) return;
      const spaces = event.venueSpaces?.length ? event.venueSpaces : [{ id: spaceKey({}, event), spaceName: event.venue || "장소 미입력" }];
      spaces.forEach((space) => {
        const key = `weekly-setup:${event.id}:${space.id}`; if (tasks.has(key)) return;
        const priorEnd = (events || []).filter((other) => other.id !== event.id && (other.venueSpaceIds || []).includes(space.id)).flatMap((other) => eventDates(other)).filter((day) => day < eventDate).sort().pop();
        const suggested = priorEnd || addDays(eventDate, -4); const plannedDate = state.plans[key] || (suggested < today ? today : suggested);
        const layoutType = inferLayoutType(event); const layouts = (event.venueLayouts || []).filter((layout) => !layout.space_id || layout.space_id === space.id);
        tasks.set(key, { key, kind: "weekly_setup", type: "weekly_setup", eventOrderId: event.id, spaceId: space.id, venue: space.spaceName || event.venue || "장소 미입력", date: today, eventDate, plannedDate, title: event.eventName || "행사", people: event.guestCount || "", layoutType, recommendation: recommendLayout(layouts, layoutType, event.guestCount), completed: !!state.completions[key] });
      });
    });
    return [...tasks.values()].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.eventDate.localeCompare(b.eventDate));
  }
  function render({ events = currentEvents } = {}) {
    root = root || document.getElementById("todayOperationBoard");
    weeklyRoot = weeklyRoot || document.getElementById("weeklySetupWidget");
    if (!root) return;
    currentEvents = events;
    hydrateRemote();
    const blocks = allBlocks();
    const todayEvents = currentEvents.filter((event) => eventDates(event).includes(dateKey()));
    const counts = { lunch: 0, dinner: 0, coffee: 0, next_setup: 0 };
    blocks.forEach((b) => { if (counts[b.type] !== undefined) counts[b.type] += 1; });
    const groups = blocks.reduce((map, block) => { (map[block.time] ||= []).push(block); return map; }, {});
    root.innerHTML = `<div class="operation-board-heading"><div><span class="eyebrow">Daily Operations</span><h2>오늘 운영보드</h2></div><div class="operation-board-actions"><button class="secondary-button" type="button" data-push-toggle>🔔 휴대폰 알림 켜기</button><label>운영 알림 기본값 ${reminderSelect("default", defaultReminder, true)}</label><button class="primary-button" type="button" data-board-add>작업 추가</button></div></div>
      <div class="operation-briefing-counts"><span>오늘 행사 <strong>${todayEvents.length}</strong>건</span><span>중식 <strong>${counts.lunch}</strong>건</span><span>석식 <strong>${counts.dinner}</strong>건</span><span>커피브레이크 <strong>${counts.coffee}</strong>건</span><span>다음 세팅 <strong>${counts.next_setup}</strong>건</span></div>
      <div class="operation-timeline">${Object.keys(groups).length ? Object.entries(groups).map(([time, items]) => `<section class="operation-time-group"><time>${escapeHtml(time)}</time><div>${items.map(renderBlock).join("")}</div></section>`).join("") : '<p class="operation-board-empty">오늘 표시할 운영 일정이 없습니다. 직접 작업을 추가할 수 있습니다.</p>'}</div>
      <dialog class="operation-dialog"><form data-board-form><h3>운영 작업</h3><input name="id" type="hidden"><label>시간<input name="time" type="time" required></label><label>장소<input name="venue" list="operationVenueList" required></label><datalist id="operationVenueList">${[...new Set(currentEvents.flatMap((e) => [e.venue, ...(e.schedule || []).map((s) => s.venue)]).filter(Boolean))].map((v) => `<option value="${escapeHtml(v)}">`).join("")}</datalist><label>작업명<input name="title" required></label><label>메모<textarea name="memo"></textarea></label><div class="operation-dialog-actions"><button type="button" data-board-cancel>취소</button><button class="primary-button" type="submit">저장</button></div></form></dialog>`;
    if (weeklyRoot) weeklyRoot.innerHTML = renderWeeklySetupSection(buildWeeklySetupTasks(currentEvents));
    bindEvents();
    window.dispatchEvent(new CustomEvent("banquet:operation-board-rendered"));
  }
  function renderWeeklySetupSection(tasks) {
    const active = tasks.filter((item) => !item.completed); const completed = tasks.filter((item) => item.completed);
    const row = (item) => `<article class="weekly-setup-item" data-setup-key="${escapeHtml(item.key)}"><label><input type="checkbox" data-setup-complete ${item.completed ? "checked" : ""}><span><strong>${escapeHtml(item.venue)}</strong><small>${escapeHtml(item.eventDate)} · ${escapeHtml(item.title)} · ${escapeHtml(item.people || "-")}명</small></span></label><label class="setup-plan-date">세팅 예정일<input type="date" data-setup-date value="${escapeHtml(item.plannedDate)}"></label></article>`;
    return `<section class="weekly-setup-section"><div class="operation-board-title"><div><span class="eyebrow">Next Setup</span><h3>다음 세팅 할 일</h3></div><strong>${active.length}건</strong></div><div class="weekly-setup-list">${active.map(row).join("") || "<p>예정된 세팅이 없습니다.</p>"}</div><details class="completed-setup-list"><summary>완료한 세팅 보기 (${completed.length})</summary>${completed.map(row).join("") || "<p>완료한 세팅이 없습니다.</p>"}</details></section>`;
  }
  function renderBlock(block) {
    const checklist = block.type === "next_setup" ? state.checklist.filter((x) => x.parentKey === block.key) : [];
    return `<article class="operation-block ${block.completed ? "completed" : ""}" style="--space-color:${colorForSpace(block.spaceId)}" data-key="${escapeHtml(block.key)}"><label class="operation-check"><input type="checkbox" data-complete ${block.completed ? "checked" : ""}><span></span></label><div class="operation-block-body"><div class="operation-block-meta"><strong>${escapeHtml(block.venue)}</strong><span>${escapeHtml(TYPES[block.type] || TYPES.manual)}</span>${block.people ? `<span>${escapeHtml(block.people)}명</span>` : ""}</div><h4>${escapeHtml(block.title)}</h4>${block.memo ? `<p>${escapeHtml(block.memo)}</p>` : ""}${block.next ? `<div class="next-setup-detail"><span>오늘 종료: ${escapeHtml(block.eventName)}</span><span>다음 행사: ${escapeHtml(block.next.date)} · ${escapeHtml(block.next.name)} · ${escapeHtml(block.next.people || "-")}명</span><span>형태: ${escapeHtml(block.next.layoutType || "미지정")}</span><strong>${escapeHtml(block.next.recommendation)}</strong></div>` : block.type === "next_setup" ? '<div class="next-setup-detail">같은 장소의 다음 행사가 없습니다.</div>' : ""}${block.type === "next_setup" ? `<div class="setup-checklist">${checklist.map((item) => `<div class="setup-item ${item.completed ? "completed" : ""}" data-item-id="${item.id}"><input type="checkbox" data-check-item ${item.completed ? "checked" : ""}><span>${escapeHtml(item.name)}${item.quantity ? ` ${escapeHtml(item.quantity)}${escapeHtml(item.unit || "")}` : ""}${item.memo ? ` · ${escapeHtml(item.memo)}` : ""}</span><button type="button" data-delete-item>삭제</button></div>`).join("")}<button type="button" data-add-item>+ 세팅 항목</button></div>` : ""}</div><label class="operation-reminder">알림 ${reminderSelect(block.key, state.reminders[block.key] ?? "default")}</label>${block.kind === "manual" ? '<div class="operation-block-actions"><button type="button" data-edit>수정</button><button type="button" data-delete>삭제</button></div>' : ""}</article>`;
  }
  function reminderSelect(key, value, isDefault = false) {
    const options = isDefault ? [["none", "없음"], ["10", "10분 전"], ["30", "30분 전"], ["60", "1시간 전"], ["custom", "직접 설정"]] : [["default", "기본값"], ["none", "없음"], ["10", "10분 전"], ["30", "30분 전"], ["60", "1시간 전"], ["custom", "직접 설정"]];
    return `<select data-reminder-key="${escapeHtml(key)}">${options.map(([id, label]) => `<option value="${id}" ${String(value) === id ? "selected" : ""}>${label}</option>`).join("")}${!options.some(([id]) => id === String(value)) ? `<option value="${escapeHtml(value)}" selected>${escapeHtml(value)}분 전</option>` : ""}</select>`;
  }
  function bindEvents() {
    root.querySelector("[data-board-add]").onclick = () => openDialog();
    root.querySelector("[data-board-cancel]").onclick = () => closeDialog();
    root.querySelectorAll("[data-reminder-key]").forEach((select) => select.onchange = () => {
      let value = select.value;
      if (value === "custom") { const entered = prompt("몇 분 전에 알릴까요?", "45"); value = String(Math.max(1, Number.parseInt(entered, 10) || 45)); }
      if (select.dataset.reminderKey === "default") { defaultReminder = value; localStorage.setItem(REMINDER_DEFAULT_KEY, value); }
      else { state.reminders[select.dataset.reminderKey] = value; const block = allBlocks().find((item) => item.key === select.dataset.reminderKey); if (block) syncItem(block); saveState(); }
      render();
    });
    const dialog = root.querySelector(".operation-dialog");
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
    weeklyRoot?.querySelectorAll("[data-setup-complete]").forEach((input) => input.onchange = () => { const key = input.closest("[data-setup-key]").dataset.setupKey; const task = buildWeeklySetupTasks(currentEvents).find((item) => item.key === key); state.completions[key] = input.checked; if (task) { task.completed = input.checked; syncItem(task); } saveState(); render(); });
    weeklyRoot?.querySelectorAll("[data-setup-date]").forEach((input) => input.onchange = () => { const key = input.closest("[data-setup-key]").dataset.setupKey; const task = buildWeeklySetupTasks(currentEvents).find((item) => item.key === key); state.plans[key] = input.value; if (task) { task.plannedDate = input.value; syncItem(task); } saveState(); render(); });
    root.querySelectorAll("[data-complete]").forEach((input) => input.onchange = () => { const key = input.closest("[data-key]").dataset.key; state.completions[key] = input.checked; const block = allBlocks().find((x) => x.key === key); if (block) block.completed = input.checked; const manual = state.manual.find((x) => x.key === key); if (manual) manual.completed = input.checked; saveState(); if (block) syncItem(block); render(); });
    root.querySelectorAll("[data-edit]").forEach((button) => button.onclick = () => openDialog(state.manual.find((x) => x.key === button.closest("[data-key]").dataset.key)));
    root.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => { const key = button.closest("[data-key]").dataset.key; const item = state.manual.find((x) => x.key === key); state.manual = state.manual.filter((x) => x.key !== key); delete state.completions[key]; saveState(); if (remoteStatus === "ready" && item) remoteRequest(`operation_board_items?board_date=eq.${item.date}&item_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }).catch(console.error); render(); });
    root.querySelectorAll("[data-add-item]").forEach((button) => button.onclick = () => { const name = prompt("세팅 항목명"); if (!normalize(name)) return; const quantity = prompt("수량 (선택)", "") || ""; const unit = prompt("단위 (선택)", "") || ""; const memo = prompt("메모 (선택)", "") || ""; const item = { id: crypto.randomUUID(), parentKey: button.closest("[data-key]").dataset.key, name: normalize(name), quantity, unit, memo, completed: false }; state.checklist.push(item); saveState(); syncChecklist(item); render(); });
    root.querySelectorAll("[data-check-item]").forEach((input) => input.onchange = () => { const item = state.checklist.find((x) => x.id === input.closest("[data-item-id]").dataset.itemId); if (item) { item.completed = input.checked; syncChecklist(item); } saveState(); render(); });
    root.querySelectorAll("[data-delete-item]").forEach((button) => button.onclick = () => { const id = button.closest("[data-item-id]").dataset.itemId; const item = state.checklist.find((x) => x.id === id); state.checklist = state.checklist.filter((x) => x.id !== id); saveState(); if (item) syncChecklist(item, true); render(); });
  }
  function closeDialog() { const dialog = root.querySelector(".operation-dialog"); dialog.querySelector("form").reset(); dialog.close(); }
  function openDialog(item) {
    const dialog = root.querySelector(".operation-dialog"); const form = dialog.querySelector("form"); form.reset();
    if (item) Object.entries(item).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
    dialog.showModal(); form.onsubmit = (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); const existing = state.manual.find((x) => x.key === data.id); const key = existing?.key || `manual:${crypto.randomUUID()}`; const next = { key, id: key, kind: "manual", type: "manual", date: dateKey(), time: data.time, venue: normalize(data.venue), spaceId: `venue:${normalize(data.venue).toLowerCase().replace(/\s+/g, "")}`, title: normalize(data.title), memo: normalize(data.memo), completed: existing?.completed || false }; state.manual = existing ? state.manual.map((x) => x.key === key ? next : x) : [...state.manual, next]; saveState(); syncItem(next); closeDialog(); render(); };
  }
  window.BANQUET_ERP_OPERATION_BOARD = { render, classifySchedule, colorForSpace, physicalSpaceKeys, spacesOverlap, formatEventSpaceSummary, formatEventSpaceDetails, buildAutoBlocks, buildWeeklySetupTasks, recommendLayout, _setStateForTest(value) { state = { completions: {}, plans: {}, reminders: {}, manual: [], checklist: [], ...value }; } };
})();
