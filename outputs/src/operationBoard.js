(function registerOperationBoard() {
  const STORAGE_KEY = "banquet-erp-operation-board-v1";
  const REMINDER_DEFAULT_KEY = "banquet-erp-operation-reminder-default-v1";
  const SELECTED_DATE_KEY = "banquet-erp-operation-board-selected-date-v2";
  const OPEN_GROUPS_KEY = "banquet-erp-operation-board-open-groups-v2";
  const TYPES = { start: "행사 시작", schedule: "운영 일정", lunch: "중식", dinner: "석식", coffee: "커피브레이크", checkin: "체크인", checkout: "체크아웃", end: "행사 종료", next_setup: "다음 세팅", manual: "직접 작업" };
  const VENUE_GROUP_LABELS = { CONVENTION_A: "컨벤션A", CONVENTION_B: "컨벤션B", CONVENTION_AB: "컨벤션AB", BURANO_1: "부라노1", BURANO_2: "부라노2", BURANO_3: "부라노3", BURANO_ALL: "부라노전체", CAPRI_1: "카프리1", CAPRI_2: "카프리2", CAPRI_3: "카프리3", CAPRI_ALL: "카프리전체", FESTA: "페스타", OLIVIA: "올리비아" };
  const SPACE_GROUP_ORDER = [...Object.values(VENUE_GROUP_LABELS), "기타"];
  const COLORS = ["#2563eb", "#0f766e", "#9333ea", "#c2410c", "#be123c", "#4f46e5", "#15803d", "#a16207"];
  let root;
  let weeklyRoot;
  let currentEvents = [];
  let state = loadState();
  let remoteStatus = "idle";
  const remoteLoadedDates = new Set();
  const remoteLoadingDates = new Set();
  let defaultReminder = localStorage.getItem(REMINDER_DEFAULT_KEY) || "none";
  let mobileOpenGroups = loadOpenGroups();
  let activeBoardTab = "operations";

  function dateKey(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }
  function storedSelectedDate() {
    try {
      const value = sessionStorage.getItem(SELECTED_DATE_KEY);
      return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : dateKey();
    } catch { return dateKey(); }
  }
  let selectedDate = storedSelectedDate();
  function selectDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return;
    selectedDate = value;
    try { sessionStorage.setItem(SELECTED_DATE_KEY, selectedDate); } catch { /* session storage unavailable */ }
  }
  function loadOpenGroups() {
    try {
      const stored = sessionStorage.getItem(OPEN_GROUPS_KEY);
      return stored === null ? null : new Set(JSON.parse(stored));
    } catch { return null; }
  }
  function saveOpenGroups() {
    try { sessionStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...mobileOpenGroups])); } catch { /* session storage unavailable */ }
  }
  function normalize(value) { return String(value || "").trim().replace(/\s+/g, " "); }
  function timeValue(value) {
    const match = normalize(value).match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/);
    return match ? `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}` : "";
  }
  function classifySchedule(content) {
    const text = normalize(content).toLowerCase();
    if (/체크\s*인|check[ -]?in/.test(text)) return "checkin";
    if (/체크\s*아웃|check[ -]?out/.test(text)) return "checkout";
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
    const dateText = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const full = dateText.match(/(\d{4})\s*(?:[.\/-]|년)\s*(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?/);
    if (full) return `${full[1]}-${String(Number(full[2])).padStart(2, "0")}-${String(Number(full[3])).padStart(2, "0")}`;
    const partial = dateText.match(/(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?/);
    if (partial) {
      const month = String(Number(partial[1])).padStart(2, "0");
      const day = String(Number(partial[2])).padStart(2, "0");
      const suffix = `-${month}-${day}`;
      const matched = eventDates(event).find((value) => value.endsWith(suffix));
      if (matched) return matched;
      const eventYear = eventDates(event).map((value) => String(value).match(/^(\d{4})-/)?.[1]).find(Boolean);
      if (eventYear) return `${eventYear}-${month}-${day}`;
    }
    return !raw && eventDates(event).length === 1 ? eventDates(event)[0] : "";
  }
  function normalizedScheduleRows(event) {
    let inheritedDate = "";
    return (event.schedule || []).map((row, index) => {
      const explicitDate = scheduleDate({ ...row, date: row.date }, event);
      if (normalize(row.date) && explicitDate) inheritedDate = explicitDate;
      const day = explicitDate || inheritedDate;
      return { row, index, day, time: timeValue(row.time), endTime: scheduleEndTime(row) };
    });
  }
  function venueName(row, event) { return normalize(row.venue || event.venue) || "장소 미입력"; }
  function eventDisplayTitle(event, fallback = "행사") { return window.BANQUET_ERP_EVENT_DISPLAY?.getEventDisplayTitle(event, fallback) || event.eventName || fallback; }
  function eventSecondaryTitle(event) { return window.BANQUET_ERP_EVENT_DISPLAY?.getEventSecondaryTitle(event) || ""; }
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
  function isFirenzeSchedule(row, event) {
    return window.BANQUET_ERP_AI_KNOWLEDGE_RULES?.matchesVenue(scheduleContext(row, event), "피렌체")
      ?? /피렌체/.test(scheduleContext(row, event));
  }
  function isHiddenHotelSchedule(row, event) {
    return ["checkin", "checkout"].includes(classifySchedule(row.content)) || isFrontSchedule(row, event);
  }
  function visibleScheduleType(row, event) {
    const type = classifySchedule(row.content);
    if (isHiddenHotelSchedule(row, event)) return "";
    return isFirenzeSchedule(row, event) && !["lunch", "dinner"].includes(type) ? "" : type;
  }
  function isBoundarySchedule(row, event) {
    if (isHiddenHotelSchedule(row, event) || isFirenzeSchedule(row, event)) return false;
    return !["lunch", "dinner", "coffee", "checkout"].includes(classifySchedule(row.content));
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
      const canonical = window.BANQUET_ERP_VENUE_UTILS?.normalizeVenue(value);
      if (canonical) {
        const [family, member] = canonical.toLowerCase().split("_");
        keys.add(`place:${family}:${member === "all" || canonical === "CONVENTION_AB" ? "*" : member}`);
        return;
      }
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
  function isAuxiliaryNextSetupSpace(space) {
    const role = normalize(space?.role || space?.roleLabel).toLowerCase();
    const name = normalize(space?.spaceName || space?.spaceCode).toLowerCase();
    return ["dining", "front", "checkin", "checkout", "accommodation"].includes(role)
      || /피렌체|firenze|florence|프론트|front/.test(`${role} ${name}`);
  }
  function nextSetupPhysicalSpaceKeys(event, row = {}) {
    return physicalSpaceKeys({
      ...event,
      eventSpaces: (event?.eventSpaces || []).filter((space) => !isAuxiliaryNextSetupSpace(space)),
    }, row);
  }
  function physicalSpaceKeysOverlap(leftKeys, rightKeys) {
    const places = (keys) => (keys || []).filter((key) => key.startsWith("place:")).map((key) => {
      const [, family, member] = key.split(":"); return { family, member };
    });
    const preferSpecificChildren = (items) => items.filter((item) => item.member !== "*"
      || !items.some((candidate) => candidate.family === item.family && candidate.member !== "*"));
    const leftPlaces = preferSpecificChildren(places(leftKeys)); const rightPlaces = preferSpecificChildren(places(rightKeys));
    if (leftPlaces.length && rightPlaces.length) {
      return leftPlaces.some((left) => rightPlaces.some((rightPlace) => left.family === rightPlace.family
        && (left.member === "*" || rightPlace.member === "*" || left.member === rightPlace.member)));
    }
    const right = new Set(rightKeys || []);
    return (leftKeys || []).some((key) => key.startsWith("id:") && right.has(key));
  }
  function spacesOverlap(currentEvent, futureEvent, currentRow = {}, futureRow = {}) {
    const venueUtils = window.BANQUET_ERP_VENUE_UTILS;
    const currentVenue = venueName(currentRow, currentEvent); const futureVenue = venueName(futureRow, futureEvent);
    if (venueUtils?.normalizeVenue(currentVenue) && venueUtils?.normalizeVenue(futureVenue)) return venueUtils.spacesOverlap(currentVenue, futureVenue);
    const existingResult = physicalSpaceKeysOverlap(physicalSpaceKeys(currentEvent, currentRow), physicalSpaceKeys(futureEvent, futureRow));
    const knowledgeResult = window.BANQUET_ERP_AI_KNOWLEDGE_RULES?.spacesOverlapOverride(currentEvent, futureEvent, currentRow, futureRow);
    return knowledgeResult ?? existingResult;
  }
  function getVenueGroup(rawVenue) {
    const canonical = window.BANQUET_ERP_VENUE_UTILS?.normalizeVenue(rawVenue) || "";
    return VENUE_GROUP_LABELS[canonical] || "기타";
  }
  function spaceGroupFromKeys(keys) {
    const place = (keys || []).find((key) => key.startsWith("place:"));
    if (!place) return "기타";
    const [, family, member] = place.split(":");
    return getVenueGroup(`${family}${member === "*" ? "전체" : member || ""}`);
  }
  function spaceGroupForBlock(block) {
    return getVenueGroup(block.venue);
  }
  function groupBlocksBySpace(blocks) {
    const groups = new Map();
    (blocks || []).forEach((block) => {
      const name = spaceGroupForBlock(block);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(block);
    });
    return SPACE_GROUP_ORDER.filter((name) => groups.has(name)).map((name) => {
      const groupBlocks = groups.get(name);
      const venues = new Map();
      groupBlocks.forEach((block) => {
        const venue = normalize(block.venue) || "장소 미입력";
        const venueKey = `${venue}\u0000${block.eventOrderId || "general"}`;
        if (!venues.has(venueKey)) venues.set(venueKey, { name: venue, eventOrderId: block.eventOrderId || null, blocks: [] });
        venues.get(venueKey).blocks.push(block);
      });
      return {
        name,
        blocks: groupBlocks,
        venues: [...venues.values()].sort((left, right) => left.name.localeCompare(right.name, "ko") || String(left.eventOrderId || "").localeCompare(String(right.eventOrderId || ""))).map((venue) => ({ ...venue, blocks: venue.blocks.sort((left, right) => String(left.time).localeCompare(String(right.time))) })),
      };
    });
  }
  function colorForSpace(key) {
    let hash = 0;
    for (const char of String(key || "")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return COLORS[Math.abs(hash) % COLORS.length];
  }
  function blockKey(event, row, type, index, day = scheduleDate(row, event)) { return `auto:${event.id}:${day}:${timeValue(row.time)}:${type}:${index}`; }
  function buildAutoBlocks(events, today = dateKey()) {
    const blocks = [];
    events.forEach((event) => {
      const scheduleRows = normalizedScheduleRows(event);
      const boundaryRows = scheduleRows.filter((item) => item.day === today && item.time && isBoundarySchedule(item.row, event)).sort((a, b) => a.time.localeCompare(b.time));
      scheduleRows.forEach(({ row, index, day }) => {
        if (day !== today || isHiddenHotelSchedule(row, event)) return;
        const classifiedType = visibleScheduleType(row, event);
        if (!classifiedType && (isFrontSchedule(row, event) || isFirenzeSchedule(row, event))) return;
        const type = classifiedType || (normalize(row.content) && timeValue(row.time) ? "schedule" : "");
        if (!type) return;
        const key = blockKey(event, row, type, index, day);
        const title = type === "start" ? eventDisplayTitle(event, "행사 시작") : type === "schedule" ? normalize(row.content) : TYPES[type];
        blocks.push({ key, kind: "auto", type, date: today, time: timeValue(row.time) || "시간 미정", venue: venueName(row, event), spaceId: spaceKey(row, event), physicalSpaces: physicalSpaceKeys(event, row), nextSetupSpaces: nextSetupPhysicalSpaceKeys(event, row), eventOrderId: event.id, title, eventName: eventDisplayTitle(event), eventSubtitle: eventSecondaryTitle(event), people: row.people || event.guestCount || "", completed: !!state.completions[key] });
      });
      if (boundaryRows.length && !blocks.some((block) => block.key.startsWith(`auto:${event.id}:`) && block.type === "start")) {
        const first = boundaryRows[0]; const key = blockKey(event, first.row, "start", first.index, first.day);
        blocks.push({ key, kind: "auto", type: "start", date: today, time: first.time, venue: venueName(first.row, event), spaceId: spaceKey(first.row, event), physicalSpaces: physicalSpaceKeys(event, first.row), eventOrderId: event.id, title: eventDisplayTitle(event, "행사 시작"), eventName: eventDisplayTitle(event), eventSubtitle: eventSecondaryTitle(event), people: first.row.people || event.guestCount || "", completed: !!state.completions[key] });
      }
      if (boundaryRows.length && !blocks.some((block) => block.key.startsWith(`auto:${event.id}:`) && block.type === "end")) {
        const last = boundaryRows.slice().sort((a, b) => a.endTime.localeCompare(b.endTime)).at(-1); const endTime = last.endTime; const key = `${blockKey(event, last.row, "end", last.index, last.day)}:${endTime}`;
        blocks.push({ key, kind: "auto", type: "end", date: today, time: endTime, venue: venueName(last.row, event), spaceId: spaceKey(last.row, event), physicalSpaces: physicalSpaceKeys(event, last.row), nextSetupSpaces: nextSetupPhysicalSpaceKeys(event, last.row), eventOrderId: event.id, title: TYPES.end, eventName: eventDisplayTitle(event), eventSubtitle: eventSecondaryTitle(event), people: "", completed: !!state.completions[key] });
      }
      const isSelectedEvent = eventDates(event).includes(today);
      const hasEventBlock = blocks.some((block) => block.eventOrderId === event.id && block.date === today);
      const fallbackRows = scheduleRows.filter((item) => !item.day || item.day === today);
      const fallbackCandidates = fallbackRows.length ? fallbackRows : scheduleRows;
      const firstVisibleSchedule = fallbackCandidates.find((item) => !isHiddenHotelSchedule(item.row, event));
      if (isSelectedEvent && !hasEventBlock && (firstVisibleSchedule || (!scheduleRows.length && !isFrontSchedule({}, event)))) {
        const firstSchedule = firstVisibleSchedule?.row || {};
        const key = `auto:${event.id}:${today}:fallback`;
        const fallbackVenue = normalize(event.venue || firstSchedule.venue) || "장소 미입력";
        blocks.push({
          key, kind: "auto", type: "schedule", date: today, time: timeValue(event.eventDateTime) || "시간 미정",
          venue: fallbackVenue, spaceId: spaceKey({ ...firstSchedule, venue: fallbackVenue }, event),
          physicalSpaces: physicalSpaceKeys(event, { ...firstSchedule, venue: fallbackVenue }), eventOrderId: event.id,
          title: eventDisplayTitle(event), eventName: eventDisplayTitle(event), eventSubtitle: eventSecondaryTitle(event), people: event.guestCount || "",
          needsScheduleReview: true, completed: !!state.completions[key],
        });
      }
    });
    const endedBySpace = new Map(blocks.filter((b) => b.type === "end").map((b) => [b.spaceId, b]));
    endedBySpace.forEach((ended, key) => {
      const candidates = [];
      events.forEach((event) => {
        if (event.id === ended.eventOrderId) return;
        normalizedScheduleRows(event).forEach(({ row, day }) => {
          if (isHiddenHotelSchedule(row, event)) return;
          const candidateSpaces = nextSetupPhysicalSpaceKeys(event, row);
          const existingOverlap = spacesOverlap({ venue: ended.venue }, { venue: venueName(row, event) });
          const knowledgeOverlap = null;
          if (window.BANQUET_ERP_DEBUG_NEXT_SETUP === true) console.debug("next_setup overlap check", {
            endedVenue: ended.venue, endedSpaceId: ended.spaceId, endedPhysicalSpaces: ended.physicalSpaces,
            endedNextSetupSpaces: ended.nextSetupSpaces, candidateVenue: venueName(row, event), candidatePhysicalSpaceKeys: candidateSpaces,
            existingOverlap, knowledgeOverlap,
          });
          if (day > today && day <= addDays(today, 30) && existingOverlap) candidates.push({ day, event, row });
        });
      });
      candidates.sort((a, b) => a.day.localeCompare(b.day) || timeValue(a.row.time).localeCompare(timeValue(b.row.time)));
      const next = candidates[0];
      const itemKey = `next:${today}:${key}`;
      blocks.push({ key: itemKey, kind: "next_setup", type: "next_setup", date: today, time: ended.time, venue: ended.venue, spaceId: key, physicalSpaces: ended.physicalSpaces, eventOrderId: next?.event.id || ended.eventOrderId, title: "다음 세팅", eventName: ended.eventName, eventSubtitle: ended.eventSubtitle, completed: !!state.completions[itemKey], next: next ? { eventOrderId: next.event.id, date: next.day, time: timeValue(next.row.time), name: eventDisplayTitle(next.event), subtitle: eventSecondaryTitle(next.event), people: next.row.people || next.event.guestCount || "", layoutType: inferLayoutType(next.event), recommendation: recommendLayout(next.event.venueLayouts || [], inferLayoutType(next.event), next.row.people || next.event.guestCount) } : null });
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
      const baseScore = (typeMatch ? 2 : 0) + (rangeMatch ? 1 : 0);
      const score = window.BANQUET_ERP_AI_KNOWLEDGE_RULES?.adjustLayoutScore(layout, { layoutType: type, eventType: type, people: count }, baseScore) ?? baseScore;
      return { layout, score };
    }).sort((a, b) => b.score - a.score);
    return ranked[0]?.score ? ranked[0].layout.layout_name : "추천 레이아웃 없음";
  }
  function loadState() {
    try { return { completions: {}, plans: {}, reminders: {}, pins: {}, setupOverrides: {}, manual: [], checklist: [], fieldNotes: [], ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
    catch { return { completions: {}, plans: {}, reminders: {}, pins: {}, setupOverrides: {}, manual: [], checklist: [], fieldNotes: [] }; }
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  const ASSET_AUDIT_TITLES = new Set(["create_asset", "increase_asset_quantity", "decrease_asset_quantity", "move_asset", "update_asset_location"]);
  function isAssetAuditRow(row) {
    const metadata = row?.metadata || {}; const source = String(metadata.source || "").toLowerCase(); const recordType = String(metadata.recordType || "").toLowerCase();
    return source === "board_asset_ai" || /asset.*(?:audit|change|movement|log)|(?:audit|change|movement).*asset/.test(recordType) || ((source.includes("audit") || recordType.includes("audit")) && ASSET_AUDIT_TITLES.has(String(row?.title || "")));
  }
  async function remoteRequest(path, options = {}) {
    const config = window.BANQUET_ERP_CONSTANTS?.supabaseConfig;
    if (!config?.url || !config?.anonKey) throw new Error("Supabase 설정 없음");
    const response = await fetch(`${config.url}/rest/v1/${path}`, { ...options, headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const text = await response.text();
    if (!response.ok) throw new Error(`operation board storage ${response.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }
  async function hydrateRemote(boardDate = selectedDate) {
    if (remoteStatus === "fallback" || remoteLoadedDates.has(boardDate) || remoteLoadingDates.has(boardDate)) return;
    remoteStatus = "loading";
    remoteLoadingDates.add(boardDate);
    try {
      const [items, checklist] = await Promise.all([
        remoteRequest(`operation_board_items?select=*&board_date=eq.${boardDate}`),
        remoteRequest(`operation_board_checklist_items?select=*&board_date=eq.${boardDate}&order=sort_order.asc`),
      ]);
      (items || []).forEach((row) => {
        if (isAssetAuditRow(row)) { state.manual = state.manual.filter((item) => item.key !== row.item_key); return; }
        state.completions[row.item_key] = !!row.is_completed;
        state.pins[row.item_key] = !!row.metadata?.pinned;
        if (row.metadata?.setupOverride) state.setupOverrides[row.item_key] = row.metadata.setupOverride;
        if (row.metadata?.plannedDate) state.plans[row.item_key] = row.metadata.plannedDate;
        if (row.metadata?.reminderOverride != null) state.reminders[row.item_key] = String(row.metadata.reminderOverride);
        if (row.metadata?.noteType === "field_note") {
          state.fieldNotes = [...state.fieldNotes.filter((x) => x.key !== row.item_key), { key: row.item_key, date: row.board_date, eventOrderId: row.event_order_id, venue: row.venue_name, content: row.memo || row.title }];
        } else if (row.metadata?.recordType !== "board_ai_change_log" && row.item_kind === "manual") state.manual = [...state.manual.filter((x) => x.key !== row.item_key), { key: row.item_key, id: row.item_key, kind: "manual", type: row.metadata?.taskType || "manual", date: row.board_date, time: String(row.item_time || "").slice(0, 5), venue: row.venue_name, spaceId: row.space_id || row.metadata?.spaceKey || `venue:${row.venue_name}`, eventOrderId: row.event_order_id || row.metadata?.eventOrderId || null, title: row.title, memo: row.memo || "", completed: !!row.is_completed, metadataSource: row.metadata?.source || "" }];
      });
      state.checklist = [...state.checklist.filter((item) => item.date !== boardDate), ...(checklist || []).map((row) => ({ id: row.id, parentKey: row.parent_item_key, date: boardDate, name: row.item_name, quantity: row.quantity || "", unit: row.unit || "", memo: row.memo || "", completed: !!row.is_completed }))];
      remoteLoadedDates.add(boardDate);
      saveState(); remoteStatus = "ready";
      if (selectedDate === boardDate || document.getElementById("todayRemainingScheduleWidget")) render();
    } catch (error) { remoteStatus = "fallback"; console.info("운영보드 DB migration 적용 전: 브라우저 저장소를 사용합니다.", error.message); }
    finally { remoteLoadingDates.delete(boardDate); }
  }
  function syncItem(item, options = {}) {
    const override = state.reminders[item.key]; const resolved = override == null || override === "default" ? defaultReminder : override;
    const payload = { board_date: item.date || dateKey(), item_key: item.key, item_kind: item.kind === "manual" ? "manual" : item.type === "next_setup" || item.type === "weekly_setup" ? "next_setup" : "auto", event_order_id: item.eventOrderId || null, space_id: /^[0-9a-f-]{36}$/i.test(item.spaceId || "") ? item.spaceId : null, item_time: /^\d\d:\d\d$/.test(item.time || "") ? item.time : null, venue_name: item.venue || "", title: item.title || "", people: Number(item.people) || null, memo: item.memo || "", is_completed: !!item.completed, metadata: { source: item.kind === "manual" ? "manual_board_task" : item.metadataSource || "operation_board", boardDate: item.date || dateKey(), venue: item.venue || "", eventOrderId: item.eventOrderId || null, createdAt: item.createdAt || new Date().toISOString(), spaceKey: item.spaceId, plannedDate: item.plannedDate || null, taskType: item.type, pinned: !!state.pins[item.key], setupOverride: state.setupOverrides[item.key] || null, reminderOverride: override ?? "default", reminderEnabled: resolved !== "none" && !item.completed, reminderOffsetMinutes: resolved === "none" ? null : Number(resolved), ...(item.metadata || {}) } };
    const pending = remoteRequest("operation_board_items?on_conflict=board_date,item_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(payload) });
    return options.throwOnError ? pending : pending.catch((error) => console.error("운영보드 저장 실패", error));
  }
  function syncChecklist(item, removed = false, options = {}) {
    if (removed) { remoteRequest(`operation_board_checklist_items?id=eq.${item.id}`, { method: "DELETE" }).catch(console.error); return; }
    const pending = remoteRequest("operation_board_checklist_items?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: item.id, board_date: item.date || selectedDate, parent_item_key: item.parentKey, item_name: item.name, quantity: Number(item.quantity) || null, unit: item.unit || null, memo: item.memo || "", is_completed: !!item.completed }) });
    return options.throwOnError ? pending : pending.catch(console.error);
  }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function allBlocks(boardDate = selectedDate, events = currentEvents) {
    return [...buildAutoBlocks(events, boardDate), ...state.manual.filter((x) => x.date === boardDate && !String(x.key || "").startsWith("board-asset-ai:") && x.metadataSource !== "board_asset_ai")].map(applySetupOverride).sort((a, b) => String(a.time).localeCompare(String(b.time)) || a.venue.localeCompare(b.venue, "ko"));
  }
  function applySetupOverride(item) {
    const value = state.setupOverrides[item.key]; if (!value) return item;
    const linkedNext = value.eventOrderId ? { ...(item.next || {}), eventOrderId: value.eventOrderId, date: value.eventDate || item.next?.date, time: value.time || item.next?.time, name: value.eventTitle || item.next?.name, subtitle: value.eventSubtitle || item.next?.subtitle, people: value.people || item.next?.people } : item.next;
    return { ...item, venue: value.venue || item.venue, time: value.time || item.time, title: value.title || item.title, memo: value.memo ?? item.memo, eventOrderId: value.eventOrderId || item.eventOrderId, next: linkedNext };
  }
  function agendaBlocks(blocks) { return (blocks || []).filter((block) => block.kind === "auto" || block.kind === "manual"); }
  function isOverdue(block, boardDate = selectedDate, now = new Date()) {
    if (boardDate !== dateKey(now) || block.completed || !/^\d\d:\d\d$/.test(block.time || "")) return false;
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return block.time < currentTime;
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
        tasks.set(key, { key, kind: "weekly_setup", type: "weekly_setup", eventOrderId: event.id, spaceId: space.id, venue: space.spaceName || event.venue || "장소 미입력", date: today, eventDate, plannedDate, title: eventDisplayTitle(event), subtitle: eventSecondaryTitle(event), people: event.guestCount || "", layoutType, recommendation: recommendLayout(layouts, layoutType, event.guestCount), completed: !!state.completions[key] });
      });
    });
    return [...tasks.values()].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.eventDate.localeCompare(b.eventDate));
  }
  function render({ events = currentEvents } = {}) {
    root = root || document.getElementById("todayOperationBoard");
    weeklyRoot = weeklyRoot || document.getElementById("weeklySetupWidget");
    if (!root) return;
    currentEvents = events;
    hydrateRemote(selectedDate);
    const actualToday = seoulDateKey();
    if (actualToday !== selectedDate) hydrateRemote(actualToday);
    const blocks = allBlocks(selectedDate);
    const selectedEvents = currentEvents.filter((event) => eventDates(event).includes(selectedDate));
    const counts = { lunch: 0, dinner: 0, coffee: 0, next_setup: 0 };
    blocks.forEach((b) => { if (counts[b.type] !== undefined) counts[b.type] += 1; });
    const operationBlocks = blocks.filter((block) => block.type !== "next_setup");
    const setupBlocks = blocks.filter((block) => block.type === "next_setup");
    const agenda = agendaBlocks(operationBlocks);
    const activeAgenda = agenda.filter((block) => !block.completed);
    const completedAgenda = agenda.filter((block) => block.completed);
    const spaceGroups = groupBlocksBySpace(operationBlocks.filter((block) => !block.completed));
    const showStandaloneMobileAgenda = window.location?.pathname?.includes("/board/");
    const beverageWarning = window.BANQUET_ERP_BEVERAGE_INVENTORY?.warningHtml(currentEvents) || "";
    root.innerHTML = `<div class="operation-board-heading"><div><span class="eyebrow">Daily Operations</span><h2>운영보드</h2></div><div class="operation-board-actions"><button class="secondary-button" type="button" data-push-toggle>🔔 휴대폰 알림 켜기</button><label>운영 알림 기본값 ${reminderSelect("default", defaultReminder, true)}</label></div></div>
      ${beverageWarning}
      <div class="operation-date-controls" aria-label="운영보드 날짜 선택"><button type="button" data-board-date-step="-1" aria-label="이전 날짜">◀</button><input type="date" data-board-date value="${escapeHtml(selectedDate)}" aria-label="운영 날짜"><button type="button" data-board-date-step="1" aria-label="다음 날짜">▶</button><button type="button" data-board-today>오늘</button></div>
      <div class="operation-briefing-counts"><span>행사 <strong>${selectedEvents.length}</strong>건</span><span>중식 <strong>${counts.lunch}</strong>건</span><span>석식 <strong>${counts.dinner}</strong>건</span><span>커피브레이크 <strong>${counts.coffee}</strong>건</span><span>다음 세팅 <strong>${counts.next_setup}</strong>건</span></div>
      <nav class="operation-board-tabs" aria-label="운영보드 보기"><button type="button" data-board-tab="operations" aria-selected="${activeBoardTab === "operations"}">운영</button><button type="button" data-board-tab="setup" aria-selected="${activeBoardTab === "setup"}">다음 세팅</button></nav>
      <section class="operation-board-tab-panel" data-board-tab-panel="operations" ${activeBoardTab === "operations" ? "" : "hidden"}>
        ${showStandaloneMobileAgenda ? renderTodayAgenda(activeAgenda, completedAgenda) : ""}
        <div class="operation-timeline">${spaceGroups.length ? renderSpaceGroups(spaceGroups) : '<div class="operation-board-empty">이 날짜에 등록된 운영 일정이 없습니다.<br><button class="primary-button" type="button" data-general-board-add>일반 작업 추가</button></div>'}</div>
      </section>
      <section class="operation-board-tab-panel" data-board-tab-panel="setup" ${activeBoardTab === "setup" ? "" : "hidden"}>
        <div class="setup-tab-toolbar"><button type="button" class="primary-button" data-setup-create>+ 다음 세팅 추가</button></div>
        ${renderSetupTaskBoard(blocks)}
        ${renderSetupCandidates(setupBlocks)}
      </section>
      <dialog class="operation-dialog"><form data-board-form><h3>운영 작업</h3><input name="id" type="hidden"><input name="eventOrderId" type="hidden"><input name="spaceId" type="hidden"><label>시간<input name="time" type="time" required></label><label>장소<input name="venue" list="operationVenueList" required></label><datalist id="operationVenueList">${[...new Set(currentEvents.flatMap((e) => [e.venue, ...(e.schedule || []).map((s) => s.venue)]).filter(Boolean))].map((v) => `<option value="${escapeHtml(v)}">`).join("")}</datalist><label>작업명<input name="title" required></label><label>메모<textarea name="memo"></textarea></label><div class="operation-dialog-actions"><button type="button" data-board-cancel>취소</button><button class="primary-button" type="submit">저장</button></div></form></dialog>
      <dialog class="operation-dialog operation-detail-dialog" data-operation-detail><div data-operation-detail-content></div></dialog>
      <dialog class="setup-editor-dialog" data-setup-editor></dialog>`;
    blocks.forEach((block) => {
      const count = state.fieldNotes.filter((note) => note.date === selectedDate && String(note.eventOrderId) === String(block.eventOrderId)).length;
      const title = root.querySelector(`[data-key="${CSS.escape(block.key)}"] h4`);
      if (count && title) title.insertAdjacentHTML("beforeend", `<span class="field-note-badge">현장 메모 ${count}</span>`);
    });
    if (weeklyRoot) weeklyRoot.innerHTML = renderWeeklySetupSection(buildWeeklySetupTasks(currentEvents));
    bindEvents();
    renderDashboardAgendaWidget();
    window.dispatchEvent(new CustomEvent("banquet:operation-board-rendered"));
  }
  function setupBoardTasks(blocks) {
    return (blocks || []).filter((item) => state.pins[item.key] && !item.completed);
  }
  function renderSetupTaskBoard(blocks) {
    const tasks = setupBoardTasks(blocks);
    const card = (item) => {
      const checklist = state.checklist.filter((child) => child.parentKey === item.key);
      const next = item.next || {}; const eventTitle = next.name || item.title; const eventDate = next.date || state.setupOverrides[item.key]?.eventDate || "";
      const childSummary = checklist.map((child) => `${child.name}${child.quantity ? ` ${child.quantity}${child.unit || ""}` : ""}`).join(" · ");
      const sourceBadge = item.metadataSource === "manual_setup_task" ? "수동" : "자동";
      return `<article class="setup-task-card" data-key="${escapeHtml(item.key)}"><div class="setup-task-main"><span class="setup-venue-badge">${escapeHtml(window.BANQUET_ERP_VENUE_UTILS?.formatVenueShort(item.venue) || item.venue)}</span><div><strong>${escapeHtml(eventTitle)}</strong><small>${escapeHtml([eventDate && eventDate.slice(5).replace("-", "/"), item.next?.time || item.time].filter(Boolean).join(" "))}</small></div><span class="setup-source-badge">${sourceBadge}</span></div>${childSummary ? `<p class="setup-task-summary">${escapeHtml(childSummary)}</p>` : ""}<div class="setup-task-actions">${renderOriginalAction(item.eventOrderId)}<button type="button" data-setup-edit>수정</button><button type="button" data-setup-pin>고정 해제</button><button type="button" data-complete>완료</button></div></article>`;
    };
    return `<section class="setup-task-board"><div class="setup-task-heading"><h3>다음 세팅 / 고정 작업</h3><strong>${tasks.length}건</strong></div><div class="setup-task-list">${tasks.map((item) => card(item)).join("") || '<p>상단에 고정된 작업이 없습니다.</p>'}</div></section>`;
  }
  function renderSetupCandidates(blocks) {
    const active = blocks.filter((item) => !item.completed);
    const completed = blocks.filter((item) => item.completed);
    const completedRow = (item) => `<div class="completed-setup-row" data-key="${escapeHtml(item.key)}"><span><strong>${escapeHtml(window.BANQUET_ERP_VENUE_UTILS?.formatVenueShort(item.venue) || item.venue)}</strong> · ${escapeHtml(item.next?.name || item.title)}</span><button type="button" data-restore-complete>복원</button></div>`;
    return `<section class="next-setup-candidates"><div class="setup-task-heading"><h3>다음 세팅 후보</h3><strong>${active.length}건</strong></div><div class="next-setup-candidate-list">${active.map(renderBlock).join("") || '<p>예정된 다음 세팅이 없습니다.</p>'}</div><details class="setup-task-completed"><summary>완료된 세팅 보기 (${completed.length})</summary>${completed.map(completedRow).join("") || '<p>완료된 세팅이 없습니다.</p>'}</details></section>`;
  }
  function renderTodayAgenda(active, completed) {
    const row = (block) => `<label class="operation-agenda-row" data-key="${escapeHtml(block.key)}"><input type="checkbox" data-complete><time>${escapeHtml(block.time)}</time><span><strong>${escapeHtml(block.venue)}</strong> · ${escapeHtml(block.title)}</span>${isOverdue(block) ? '<small>지연</small>' : ""}</label>`;
    const completedRow = (block) => `<div class="operation-agenda-row completed" data-key="${escapeHtml(block.key)}"><time>${escapeHtml(block.time)}</time><span><strong>${escapeHtml(block.venue)}</strong> · ${escapeHtml(block.title)}</span><button type="button" data-restore-complete>되돌리기</button></div>`;
    return `<section class="operation-agenda" aria-labelledby="operationAgendaTitle"><div class="operation-agenda-heading"><h3 id="operationAgendaTitle">오늘 남은 일정</h3><strong>${active.length}건</strong></div><div class="operation-agenda-list">${active.map(row).join("") || '<p class="operation-agenda-empty">남은 일정이 없습니다.</p>'}</div><details class="operation-completed-list"><summary>완료 ${completed.length}건 보기</summary>${completed.map(completedRow).join("") || '<p class="operation-agenda-empty">완료한 일정이 없습니다.</p>'}</details></section>`;
  }
  function renderDashboardAgendaWidget() {
    const widget = document.getElementById("todayRemainingScheduleWidget"); if (!widget) return;
    const today = seoulDateKey(); const active = agendaBlocks(allBlocks(today, currentEvents)).filter((block) => !block.completed); const visible = active.slice(0, 8); const remaining = active.length - visible.length;
    const rows = visible.map((block) => `<label class="dashboard-agenda-row" data-dashboard-agenda-key="${escapeHtml(block.key)}"><input type="checkbox"><time>${escapeHtml(block.time)}</time><span><strong>${escapeHtml(window.BANQUET_ERP_VENUE_UTILS?.formatVenueShort(block.venue) || block.venue)}</strong> · ${escapeHtml(block.title)}</span></label>`).join("");
    widget.innerHTML = `<div class="dashboard-agenda-heading"><div><span class="eyebrow">Today remaining</span><h2>오늘 남은 일정</h2></div><strong>${active.length}건</strong></div><div class="dashboard-agenda-list">${rows || '<p>남은 일정이 없습니다.</p>'}</div>${remaining > 0 ? `<button type="button" data-dashboard-agenda-more>+ ${remaining}건 더 보기</button>` : ""}`;
    widget.querySelectorAll("[data-dashboard-agenda-key] input").forEach((input) => input.onchange = () => completeBoardItem(input.closest("[data-dashboard-agenda-key]").dataset.dashboardAgendaKey, true, today));
    widget.querySelector("[data-dashboard-agenda-more]")?.addEventListener("click", () => { selectDate(today); render(); requestAnimationFrame(() => root?.scrollIntoView({ behavior: "smooth", block: "start" })); });
  }
  function renderSpaceGroups(groups) {
    const mobile = window.matchMedia?.("(max-width: 768px)").matches;
    return `<div class="operation-space-groups">${groups.map((group, index) => {
      const open = !mobile || (mobileOpenGroups ? mobileOpenGroups.has(group.name) : index === 0);
      const venues = group.venues.map((venue) => {
        const targets = [...new Map(venue.blocks.filter((block) => block.eventOrderId && block.type !== "next_setup").map((block) => [String(block.eventOrderId), block])).values()];
        const addActions = targets.map((target) => { const event = currentEvents.find((item) => String(item.id) === String(target.eventOrderId)); const label = targets.length > 1 ? `+ ${event?.eventName || "행사"} 작업 추가` : "+ 작업 추가"; return `<button type="button" class="operation-venue-add" data-venue-task-add data-event-order-id="${escapeHtml(target.eventOrderId)}" data-venue="${escapeHtml(venue.name)}" data-space-id="${escapeHtml(target.spaceId || "")}">${escapeHtml(label)}</button>`; }).join("");
        return `<section class="operation-venue-group" data-venue-group="${escapeHtml(venue.name)}"><h4>${escapeHtml(venue.name)}</h4>${venue.blocks.map((block) => `<section class="operation-time-group"><time>${escapeHtml(block.time)}</time><div>${renderBlock(block)}</div></section>`).join("")}${addActions}</section>`;
      }).join("");
      return `<section class="operation-space-group" data-space-group-section="${escapeHtml(group.name)}"><button class="operation-space-group-toggle" type="button" data-space-group-toggle="${escapeHtml(group.name)}" aria-expanded="${open}"><span aria-hidden="true">${open ? "▼" : "▶"}</span><strong>${escapeHtml(group.name)}</strong><small>${group.blocks.length}건</small></button><div class="operation-space-group-body">${venues}</div></section>`;
    }).join("")}</div>`;
  }
  function renderWeeklySetupSection(tasks) {
    const active = tasks.filter((item) => !item.completed); const completed = tasks.filter((item) => item.completed);
    const originalAction = (item) => renderOriginalAction(item.eventOrderId);
    const row = (item) => `<article class="weekly-setup-item" data-setup-key="${escapeHtml(item.key)}"><label><input type="checkbox" data-setup-complete ${item.completed ? "checked" : ""}><span><strong>${escapeHtml(item.venue)} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.eventDate)} · ${escapeHtml(item.people || "-")}명${item.subtitle ? ` · ${escapeHtml(item.subtitle)}` : ""}</small></span></label><label class="setup-plan-date">세팅 예정일<input type="date" data-setup-date value="${escapeHtml(item.plannedDate)}"></label>${originalAction(item)}</article>`;
    return `<section class="weekly-setup-section"><div class="operation-board-title"><div><span class="eyebrow">Next Setup</span><h3>다음 세팅 할 일</h3></div><strong>${active.length}건</strong></div><div class="weekly-setup-list">${active.map(row).join("") || "<p>예정된 세팅이 없습니다.</p>"}</div><details class="completed-setup-list"><summary>완료한 세팅 보기 (${completed.length})</summary>${completed.map(row).join("") || "<p>완료한 세팅이 없습니다.</p>"}</details></section>`;
  }
  function renderOriginalAction(eventOrderId) {
    const event = currentEvents.find((item) => String(item.id) === String(eventOrderId));
    return event?.storagePath ? `<div class="setup-original-action"><button type="button" data-setup-original="${escapeHtml(event.id)}">원본 엑셀 보기</button></div>` : "";
  }
  function openEventOriginal(eventOrderId) {
    const event = currentEvents.find((item) => String(item.id) === String(eventOrderId));
    if (!event?.storagePath) return;
    window.openStoredExcel(event.storagePath, { eventOrderId: event.id, originalFilename: event.originalFilename || "" });
  }
  function renderBlock(block) {
    const checklist = block.type === "next_setup" ? state.checklist.filter((x) => x.parentKey === block.key) : [];
    const typeLabel = TYPES[block.type] || TYPES.manual;
    const noteCount = state.fieldNotes.filter((note) => note.date === selectedDate && String(note.eventOrderId) === String(block.eventOrderId)).length;
    const mobileNextSummary = block.next ? `<div class="next-setup-mobile-summary"><strong>다음 세팅</strong><time>${escapeHtml(block.next.date)}</time><span>${escapeHtml(block.next.name)}</span><small>${escapeHtml(block.next.people || "-")}명${block.next.subtitle ? ` · ${escapeHtml(block.next.subtitle)}` : ""}</small><button type="button" data-next-detail-toggle aria-expanded="false">상세 보기</button></div>` : "";
    const reminderValue = state.reminders[block.key] ?? "default";
    const reminderUnavailable = !/^\d\d:\d\d$/.test(block.time || "") ? '<span class="operation-reminder-unavailable">시간 미정 · 알림 예약 불가</span>' : "";
    const setupActions = `<div class="operation-block-actions">${block.type === "next_setup" ? '<button type="button" data-setup-edit>수정</button>' : block.kind === "manual" ? '<button type="button" data-edit>수정</button><button type="button" data-delete>삭제</button>' : ""}<button type="button" data-setup-pin>${state.pins[block.key] ? "고정 해제" : "상단 고정"}</button></div>`;
    return `<article class="operation-block ${block.completed ? "completed" : ""}" style="--space-color:${colorForSpace(block.spaceId)}" data-key="${escapeHtml(block.key)}" data-detail-key="${escapeHtml(block.key)}" tabindex="0"><label class="operation-check"><input type="checkbox" data-complete ${block.completed ? "checked" : ""}><span class="operation-check-mark"></span><span class="operation-mobile-only">완료</span></label><div class="operation-block-body"><div class="operation-block-mobile-header"><time>${escapeHtml(block.time)}</time><strong>${escapeHtml(block.venue)}</strong><span>${escapeHtml(typeLabel)}</span></div><div class="operation-block-meta"><strong>${escapeHtml(block.venue)}</strong><span>${escapeHtml(typeLabel)}</span>${block.people ? `<span>${escapeHtml(block.people)}명</span>` : ""}${block.needsScheduleReview ? "<span>세부 일정 확인 필요</span>" : ""}</div><h4>${escapeHtml(block.title)}</h4>${block.eventSubtitle && block.title === block.eventName ? `<p>${escapeHtml(block.eventSubtitle)}</p>` : ""}<div class="operation-block-mobile-support">${block.people ? `<span>${escapeHtml(block.people)}명</span>` : ""}${block.needsScheduleReview ? "<span>세부 일정 확인 필요</span>" : ""}${reminderUnavailable}</div>${block.memo ? `<p>${escapeHtml(block.memo)}</p>` : ""}${mobileNextSummary}${block.next ? `<div class="next-setup-detail"><span>행사 종료: ${escapeHtml(block.eventName)}</span><span>다음 행사: ${escapeHtml(block.next.date)} · ${escapeHtml(block.next.name)} · ${escapeHtml(block.next.people || "-")}명</span>${block.next.subtitle ? `<span>${escapeHtml(block.next.subtitle)}</span>` : ""}<span>형태: ${escapeHtml(block.next.layoutType || "미지정")}</span><strong>${escapeHtml(block.next.recommendation)}</strong>${renderOriginalAction(block.next.eventOrderId)}</div>` : block.type === "next_setup" ? '<div class="next-setup-detail">같은 장소의 다음 행사가 없습니다.</div>' : ""}${block.type === "next_setup" ? `<div class="setup-checklist">${checklist.map((item) => `<div class="setup-item ${item.completed ? "completed" : ""}" data-item-id="${item.id}"><input type="checkbox" data-check-item ${item.completed ? "checked" : ""}><span>${escapeHtml(item.name)}${item.quantity ? ` ${escapeHtml(item.quantity)}${escapeHtml(item.unit || "")}` : ""}${item.memo ? ` · ${escapeHtml(item.memo)}` : ""}</span><button type="button" data-edit-item>수정</button><button type="button" data-delete-item>삭제</button></div>`).join("")}<button type="button" data-add-item>+ 세팅 항목</button></div>` : ""}</div><label class="operation-reminder">알림 ${reminderSelect(block.key, reminderValue)}</label><div class="operation-mobile-reminder"><button type="button" data-mobile-reminder-toggle aria-expanded="false">🔔 ${escapeHtml(reminderLabel(reminderValue))}</button><div class="operation-mobile-reminder-menu" hidden>${[["default","기본값"],["30","30분 전"],["60","1시간 전"],["none","없음"]].map(([value,label]) => `<button type="button" data-mobile-reminder-value="${value}">${label}</button>`).join("")}</div></div>${setupActions}</article>`;
  }
  function reminderLabel(value) { return ({ default: "기본값", "30": "30분 전", "60": "1시간 전", none: "없음" })[String(value)] || `${value}분 전`; }
  function reminderSelect(key, value, isDefault = false) {
    const options = isDefault ? [["none", "없음"], ["10", "10분 전"], ["30", "30분 전"], ["60", "1시간 전"], ["custom", "직접 설정"]] : [["default", "기본값"], ["none", "없음"], ["10", "10분 전"], ["30", "30분 전"], ["60", "1시간 전"], ["custom", "직접 설정"]];
    return `<select data-reminder-key="${escapeHtml(key)}">${options.map(([id, label]) => `<option value="${id}" ${String(value) === id ? "selected" : ""}>${label}</option>`).join("")}${!options.some(([id]) => id === String(value)) ? `<option value="${escapeHtml(value)}" selected>${escapeHtml(value)}분 전</option>` : ""}</select>`;
  }
  function detailFoodText(event, block) {
    const meals = Array.isArray(event?.mealTypes) ? event.mealTypes.map((item) => typeof item === "object" ? item.label || item.name || item.key : item) : [];
    return [...meals, event?.beveragesText, ["lunch", "dinner", "coffee"].includes(block.type) ? TYPES[block.type] : ""].filter(Boolean).join(" · ") || "-";
  }
  function openDetailDialog(block) {
    const dialog = root.querySelector("[data-operation-detail]");
    const event = currentEvents.find((item) => String(item.id) === String(block.eventOrderId));
    const eventName = event?.eventName || block.next?.name || block.eventName || block.title;
    dialog.querySelector("[data-operation-detail-content]").innerHTML = `<div class="operation-detail-header"><h3>운영 일정 상세</h3><button type="button" data-detail-close aria-label="닫기">×</button></div><dl class="operation-detail-list"><div><dt>행사명</dt><dd>${escapeHtml(eventName || "-")}</dd></div><div><dt>시간</dt><dd>${escapeHtml(block.time || "-")}</dd></div><div><dt>장소</dt><dd>${escapeHtml(block.venue || "-")}</dd></div><div><dt>인원</dt><dd>${escapeHtml(block.people || event?.guestCount || "-")}</dd></div><div><dt>행사유형</dt><dd>${escapeHtml(event?.eventType || TYPES[block.type] || "-")}</dd></div><div><dt>식사/커피 정보</dt><dd>${escapeHtml(detailFoodText(event, block))}</dd></div></dl><div class="operation-detail-actions">${event?.storagePath ? '<button type="button" data-detail-original>원본 엑셀 보기</button>' : ""}${block.kind === "manual" ? '<button type="button" data-detail-edit>수정</button><button type="button" data-detail-delete>삭제</button>' : ""}</div>`;
    dialog.querySelector("[data-detail-close]").onclick = () => dialog.close();
    dialog.querySelector("[data-detail-original]")?.addEventListener("click", () => { dialog.close(); openEventOriginal(event.id); });
    dialog.querySelector("[data-detail-edit]")?.addEventListener("click", () => { dialog.close(); openDialog(state.manual.find((item) => item.key === block.key)); });
    dialog.querySelector("[data-detail-delete]")?.addEventListener("click", () => { dialog.close(); deleteManual(block.key); });
    dialog.showModal();
  }
  function deleteManual(key) {
    const item = state.manual.find((manual) => manual.key === key);
    state.manual = state.manual.filter((manual) => manual.key !== key);
    delete state.completions[key];
    saveState();
    if (item) remoteRequest(`operation_board_items?board_date=eq.${item.date}&item_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }).catch(console.error);
    render();
  }
  function setSetupPin(key, pinned) {
    state.pins[key] = !!pinned;
    const item = allBlocks().find((block) => block.key === key);
    saveState();
    if (item) syncItem(item);
    render();
  }
  function completeBoardItem(key, completed, boardDate = selectedDate) {
    state.completions[key] = completed;
    const block = allBlocks(boardDate, currentEvents).find((item) => item.key === key); if (block) block.completed = completed;
    const manual = state.manual.find((item) => item.key === key); if (manual) manual.completed = completed;
    saveState(); if (block) syncItem(block); render();
  }
  function updateSetupTask(key, changes) {
    state.setupOverrides[key] = { ...(state.setupOverrides[key] || {}), ...changes };
    const item = allBlocks().find((block) => block.key === key);
    saveState();
    if (item) syncItem(item);
    render();
  }
  function seoulDateKey(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
  function setupCandidateDateRange(today = seoulDateKey()) {
    const start = new Date(`${today}T12:00:00+09:00`); const day = start.getUTCDay();
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + ((7 - day) % 7) + 7);
    return { start: today, end: end.toISOString().slice(0, 10) };
  }
  function setupEventDetails(event, preferredDate = "") {
    const dates = eventDates(event).sort();
    const eventDate = preferredDate || dates.find((day) => day >= seoulDateKey()) || dates[0] || "";
    const row = normalizedScheduleRows(event).filter((entry) => !eventDate || entry.day === eventDate).sort((left, right) => left.time.localeCompare(right.time))[0];
    return { eventDate, time: row?.time || timeValue(event.eventDateTime), venue: venueName(row?.row || {}, event), title: eventDisplayTitle(event), subtitle: eventSecondaryTitle(event), people: row?.row?.people || event.guestCount || "" };
  }
  function setupEventCandidates(venue, today = seoulDateKey()) {
    const range = setupCandidateDateRange(today);
    return currentEvents.flatMap((event) => { const eventDate = eventDates(event).sort().find((day) => day >= range.start && day <= range.end); if (!eventDate) return []; const details = setupEventDetails(event, eventDate); return [{ event, details, overlap: spacesOverlap({ venue }, event) }]; })
      .sort((left, right) => left.details.eventDate.localeCompare(right.details.eventDate) || String(left.details.time).localeCompare(String(right.details.time)) || Number(right.overlap) - Number(left.overlap) || left.details.title.localeCompare(right.details.title, "ko"));
  }
  function formatSetupCandidateLabel(details, includeSecondary = false) {
    return [details.eventDate?.slice(5).replace("-", "/"), details.title, includeSecondary && details.subtitle, window.BANQUET_ERP_VENUE_UTILS?.formatVenueShort(details.venue) || details.venue, details.people && `${details.people}명`].filter(Boolean).join(" · ");
  }
  function renderSetupEventOptions(venue, selectedId) {
    const candidates = setupEventCandidates(venue); const titleCounts = candidates.reduce((counts, item) => { counts[item.details.title] = (counts[item.details.title] || 0) + 1; return counts; }, {});
    const selectedOutside = selectedId && !candidates.some(({ event }) => String(event.id) === String(selectedId)) ? currentEvents.find((event) => String(event.id) === String(selectedId)) : null;
    const currentOption = selectedOutside ? `<option value="${escapeHtml(selectedOutside.id)}" selected>현재 · ${escapeHtml(formatSetupCandidateLabel(setupEventDetails(selectedOutside)))}</option>` : "";
    return `<option value="">연결 행사 없음</option>${currentOption}${candidates.map(({ event, details, overlap }) => `<option value="${escapeHtml(event.id)}" ${String(event.id) === String(selectedId) ? "selected" : ""}>${overlap ? "★ " : ""}${escapeHtml(formatSetupCandidateLabel(details, titleCounts[details.title] > 1))}</option>`).join("")}`;
  }
  function renderSetupEditorChildren(key) {
    return state.checklist.filter((item) => item.parentKey === key).map((item) => `<div class="setup-editor-child" data-item-id="${item.id}"><input type="checkbox" data-editor-child-complete ${item.completed ? "checked" : ""} aria-label="완료"><input data-editor-child-name value="${escapeHtml(item.name)}" placeholder="세팅 항목"><input data-editor-child-quantity value="${escapeHtml(item.quantity || "")}" placeholder="수량"><input data-editor-child-unit value="${escapeHtml(item.unit || "")}" placeholder="단위"><button type="button" data-editor-child-delete>삭제</button></div>`).join("");
  }
  function setupVenueCodes(event) {
    const utils = window.BANQUET_ERP_VENUE_UTILS;
    return utils?.collapseCodes([event?.venue, ...(event?.schedule || []).map((row) => row.venue)].flatMap((value) => utils.parseVenueCodes(value))) || [];
  }
  function renderSetupVenueOptions(selectedVenue, query = "") {
    const utils = window.BANQUET_ERP_VENUE_UTILS; const selectedCode = utils.normalizeVenue(selectedVenue);
    const options = utils.buildVenueOptions(query); const groups = ["컨벤션", "부라노", "카프리", "기타"];
    const placeholder = `<option value="">대상 공간을 선택하세요</option>`;
    return placeholder + groups.map((group) => { const rows = options.filter((item) => item.group === group); return rows.length ? `<optgroup label="${group}">${rows.map((item) => `<option value="${item.label}" ${item.code === selectedCode ? "selected" : ""}>${item.label}</option>`).join("")}</optgroup>` : ""; }).join("");
  }
  function setupScheduledDate(item) { return item?.next?.date || state.setupOverrides[item?.key]?.eventDate || item?.metadata?.setupOverride?.eventDate || ""; }
  function findLocalSetupDuplicate(eventOrderId, venue, eventDate, blocks = null) {
    if (!blocks) { const range = setupCandidateDateRange(); blocks = []; for (let day = range.start; day <= range.end; day = addDays(day, 1)) blocks.push(...allBlocks(day)); }
    return blocks.find((item) => item.type === "next_setup" && String(item.eventOrderId) === String(eventOrderId) && normalize(item.venue) === normalize(venue) && setupScheduledDate(item) === eventDate) || null;
  }
  async function findSetupDuplicate(eventOrderId, venue, eventDate) {
    const local = findLocalSetupDuplicate(eventOrderId, venue, eventDate); if (local) return { key: local.key, boardDate: local.date || seoulDateKey() };
    const rows = await remoteRequest(`operation_board_items?select=board_date,item_key,item_kind,event_order_id,venue_name,metadata&event_order_id=eq.${encodeURIComponent(eventOrderId)}&is_completed=eq.false`);
    const row = (rows || []).find((item) => item.metadata?.taskType === "next_setup" && normalize(item.venue_name) === normalize(venue) && item.metadata?.setupOverride?.eventDate === eventDate);
    return row ? { key: row.item_key, boardDate: row.board_date } : null;
  }
  function createSetupTask() {
    const dialog = root.querySelector("[data-setup-editor]"); const key = `manual-setup:${crypto.randomUUID()}`; const boardDate = seoulDateKey(); let children = [];
    const childRows = () => children.map((item) => `<div class="setup-editor-child" data-item-id="${item.id}"><input type="checkbox" disabled aria-label="완료"><input data-new-child-name value="${escapeHtml(item.name)}" placeholder="세팅 항목"><input data-new-child-quantity value="${escapeHtml(item.quantity)}" placeholder="수량"><input data-new-child-unit value="${escapeHtml(item.unit)}" placeholder="단위"><button type="button" data-new-child-delete>삭제</button></div>`).join("");
    dialog.innerHTML = `<form method="dialog" data-setup-create-form><header><div><span class="eyebrow">Manual setup</span><h3>다음 세팅 추가</h3></div><button type="button" data-setup-editor-close aria-label="닫기">×</button></header><label class="setup-venue-picker">공간<input type="search" data-setup-venue-search placeholder="공간 검색 (예: 부, 카2, 컨A)" autocomplete="off"><select name="venue" required>${renderSetupVenueOptions("")}</select></label><label>연결 행사<select name="eventOrderId" required>${renderSetupEventOptions("", "")}</select></label><p class="setup-event-secondary" data-setup-event-secondary></p><div class="setup-editor-grid"><label>예정 날짜<input name="eventDate" type="date" required></label><label>예정 시간<input name="time" type="time"></label></div><label>메모<textarea name="memo"></textarea></label><section class="setup-editor-items"><div><strong>하위 세팅 항목</strong><button type="button" data-editor-child-add>+ 세팅 항목</button></div><div data-editor-child-list></div></section><label class="setup-pin-option"><input name="pinned" type="checkbox" checked> 상단 고정</label><p class="setup-create-status" data-setup-create-status></p><footer><button type="button" data-setup-editor-close>취소</button><button type="submit" class="primary-button">저장</button></footer></form>`;
    const form = dialog.querySelector("form"); const eventSelect = form.elements.eventOrderId; const childList = form.querySelector("[data-editor-child-list]");
    const refreshEvent = (autoSelectVenue = false) => { const selected = currentEvents.find((event) => String(event.id) === eventSelect.value); const details = selected ? setupEventDetails(selected) : null; form.querySelector("[data-setup-event-secondary]").textContent = details?.subtitle || ""; if (details) { form.elements.eventDate.value = details.eventDate; form.elements.time.value = details.time; } if (autoSelectVenue && selected) { const codes = setupVenueCodes(selected); form.elements.venue.value = codes.length === 1 ? window.BANQUET_ERP_VENUE_UTILS.venueLabel(codes[0]) : ""; } };
    const renderChildren = () => { childList.innerHTML = childRows(); childList.querySelectorAll("[data-item-id]").forEach((row) => { const item = children.find((entry) => entry.id === row.dataset.itemId); row.querySelector("[data-new-child-name]").oninput = (event) => { item.name = event.target.value; }; row.querySelector("[data-new-child-quantity]").oninput = (event) => { item.quantity = event.target.value; }; row.querySelector("[data-new-child-unit]").oninput = (event) => { item.unit = event.target.value; }; row.querySelector("[data-new-child-delete]").onclick = () => { children = children.filter((entry) => entry.id !== item.id); renderChildren(); }; }); };
    form.elements.venue.onchange = () => { const selectedId = eventSelect.value; eventSelect.innerHTML = renderSetupEventOptions(form.elements.venue.value, selectedId); refreshEvent(); };
    eventSelect.onchange = () => refreshEvent(true);
    form.querySelector("[data-setup-venue-search]").oninput = (event) => { const selected = form.elements.venue.value; form.elements.venue.innerHTML = renderSetupVenueOptions(selected, event.target.value); };
    form.querySelector("[data-editor-child-add]").onclick = () => { children.push({ id: crypto.randomUUID(), parentKey: key, date: boardDate, name: "", quantity: "", unit: "", memo: "", completed: false }); renderChildren(); };
    form.querySelectorAll("[data-setup-editor-close]").forEach((button) => button.onclick = () => dialog.close());
    form.onsubmit = async (event) => {
      event.preventDefault(); const data = Object.fromEntries(new FormData(form)); const linkedEvent = currentEvents.find((entry) => String(entry.id) === String(data.eventOrderId)); if (!linkedEvent) return;
      const details = setupEventDetails(linkedEvent, data.eventDate); const venue = data.venue; let duplicate;
      try { duplicate = await findSetupDuplicate(linkedEvent.id, venue, data.eventDate); }
      catch (error) { console.error("setup duplicate lookup failed", error); alert("기존 다음 세팅 작업을 확인하지 못했습니다. 다시 시도해주세요."); return; }
      if (duplicate) {
        const status = form.querySelector("[data-setup-create-status]"); status.innerHTML = `이미 다음 세팅 작업이 있습니다. <button type="button" data-open-existing-setup>기존 작업 열기</button>`;
        status.querySelector("[data-open-existing-setup]").onclick = async () => { dialog.close(); activeBoardTab = "setup"; selectDate(duplicate.boardDate); await hydrateRemote(duplicate.boardDate); render(); requestAnimationFrame(() => root.querySelector(`[data-key="${CSS.escape(duplicate.key)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })); };
        return;
      }
      const item = { key, id: key, kind: "manual", type: "next_setup", date: boardDate, time: data.time || details.time || "", venue, spaceId: `venue:${venue.toLowerCase().replace(/\s+/g, "")}`, eventOrderId: linkedEvent.id, title: details.title || linkedEvent.eventName || "다음 세팅", memo: normalize(data.memo), completed: false, metadataSource: "manual_setup_task", metadata: { source: "manual_setup_task", recordType: "manual_next_setup" }, createdAt: new Date().toISOString() };
      state.manual.push(item); state.pins[key] = data.pinned === "on"; state.setupOverrides[key] = { venue, eventOrderId: linkedEvent.id, eventDate: data.eventDate, time: item.time, memo: item.memo, eventTitle: details.title || "", eventSubtitle: details.subtitle || "", people: details.people || "" };
      children = children.filter((child) => normalize(child.name)).map((child) => ({ ...child, name: normalize(child.name) })); state.checklist.push(...children); saveState();
      try { await syncItem(item, { throwOnError: true }); await Promise.all(children.map((child) => syncChecklist(child, false, { throwOnError: true }))); }
      catch (error) {
        console.error("manual setup task save failed", error); state.manual = state.manual.filter((entry) => entry.key !== key); state.checklist = state.checklist.filter((entry) => entry.parentKey !== key); delete state.pins[key]; delete state.setupOverrides[key]; saveState();
        await Promise.all([remoteRequest(`operation_board_items?board_date=eq.${boardDate}&item_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => null), ...children.map((child) => remoteRequest(`operation_board_checklist_items?id=eq.${child.id}`, { method: "DELETE" }).catch(() => null))]); alert("다음 세팅 작업을 저장하지 못했습니다. 다시 시도해주세요."); return;
      }
      dialog.close(); activeBoardTab = "setup"; selectDate(boardDate); render();
    };
    dialog.showModal();
  }
  function editSetupTask(item) {
    const dialog = root.querySelector("[data-setup-editor]");
    const initialVenue = window.BANQUET_ERP_VENUE_UTILS.venueLabel(item.venue);
    dialog.innerHTML = `<form method="dialog" data-setup-editor-form data-key="${escapeHtml(item.key)}"><header><div><span class="eyebrow">Pinned setup</span><h3>세팅 작업 수정</h3></div><button type="button" data-setup-editor-close aria-label="닫기">×</button></header><label class="setup-venue-picker">공간<input type="search" data-setup-venue-search placeholder="공간 검색 (예: 부, 카2, 컨A)" autocomplete="off"><select name="venue" required>${renderSetupVenueOptions(initialVenue)}</select></label><label>연결 행사<select name="eventOrderId">${renderSetupEventOptions(initialVenue, item.eventOrderId)}</select></label><p class="setup-event-secondary" data-setup-event-secondary></p><div class="setup-editor-grid"><label>예정 날짜<input name="eventDate" type="date" value="${escapeHtml(item.next?.date || "")}"></label><label>예정 시간<input name="time" type="time" value="${escapeHtml(item.next?.time || item.time || "")}"></label></div><label>메모<textarea name="memo">${escapeHtml(item.memo || "")}</textarea></label><section class="setup-editor-items"><div><strong>하위 세팅 항목</strong><button type="button" data-editor-child-add>+ 세팅 항목</button></div><div data-editor-child-list>${renderSetupEditorChildren(item.key)}</div></section><footer><button type="button" data-setup-editor-close>취소</button><button type="submit" class="primary-button">저장</button></footer></form>`;
    const form = dialog.querySelector("form"); const eventSelect = form.elements.eventOrderId;
    const refreshEvent = (autoSelectVenue = false) => { const selected = currentEvents.find((event) => String(event.id) === eventSelect.value); const details = selected ? setupEventDetails(selected) : null; form.querySelector("[data-setup-event-secondary]").textContent = details?.subtitle || ""; if (details) { form.elements.eventDate.value = details.eventDate; form.elements.time.value = details.time; } if (autoSelectVenue && selected) { const codes = setupVenueCodes(selected); form.elements.venue.value = codes.length === 1 ? window.BANQUET_ERP_VENUE_UTILS.venueLabel(codes[0]) : ""; } };
    const bindChildren = () => {
      form.querySelectorAll("[data-editor-child-name], [data-editor-child-quantity], [data-editor-child-unit], [data-editor-child-complete]").forEach((input) => input.onchange = () => { const row = input.closest("[data-item-id]"); const child = state.checklist.find((entry) => entry.id === row.dataset.itemId); if (!child) return; child.name = normalize(row.querySelector("[data-editor-child-name]").value) || "새 세팅 항목"; child.quantity = row.querySelector("[data-editor-child-quantity]").value; child.unit = row.querySelector("[data-editor-child-unit]").value; child.completed = row.querySelector("[data-editor-child-complete]").checked; saveState(); syncChecklist(child); });
      form.querySelectorAll("[data-editor-child-delete]").forEach((button) => button.onclick = () => { const id = button.closest("[data-item-id]").dataset.itemId; const child = state.checklist.find((entry) => entry.id === id); state.checklist = state.checklist.filter((entry) => entry.id !== id); if (child) syncChecklist(child, true); saveState(); form.querySelector("[data-editor-child-list]").innerHTML = renderSetupEditorChildren(item.key); bindChildren(); });
    };
    eventSelect.onchange = () => refreshEvent(true);
    form.querySelector("[data-setup-venue-search]").oninput = (event) => { const selected = form.elements.venue.value; form.elements.venue.innerHTML = renderSetupVenueOptions(selected, event.target.value); };
    form.elements.venue.onchange = () => { const selectedId = eventSelect.value; eventSelect.innerHTML = renderSetupEventOptions(form.elements.venue.value, selectedId); refreshEvent(); };
    form.querySelector("[data-editor-child-add]").onclick = () => { const child = { id: crypto.randomUUID(), parentKey: item.key, date: selectedDate, name: "새 세팅 항목", quantity: "", unit: "", memo: "", completed: false }; state.checklist.push(child); saveState(); syncChecklist(child); form.querySelector("[data-editor-child-list]").innerHTML = renderSetupEditorChildren(item.key); bindChildren(); };
    form.querySelectorAll("[data-setup-editor-close]").forEach((button) => button.onclick = () => dialog.close()); bindChildren(); refreshEvent();
    form.onsubmit = (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); const linkedEvent = currentEvents.find((entry) => String(entry.id) === String(data.eventOrderId)); const details = linkedEvent ? setupEventDetails(linkedEvent) : {}; updateSetupTask(item.key, { venue: data.venue, eventOrderId: data.eventOrderId, eventDate: data.eventDate, time: data.time, memo: normalize(data.memo), eventTitle: details.title || "", eventSubtitle: details.subtitle || "", people: details.people || "" }); dialog.close(); };
    dialog.showModal();
  }
  function bindEvents() {
    root.querySelectorAll("[data-board-tab]").forEach((button) => button.onclick = () => {
      activeBoardTab = button.dataset.boardTab;
      root.querySelectorAll("[data-board-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.boardTab === activeBoardTab)));
      root.querySelectorAll("[data-board-tab-panel]").forEach((panel) => { panel.hidden = panel.dataset.boardTabPanel !== activeBoardTab; });
    });
    [root, weeklyRoot].filter(Boolean).forEach((container) => {
      container.querySelectorAll("[data-setup-original]").forEach((button) => {
        button.onclick = () => {
          const event = currentEvents.find((item) => String(item.id) === button.dataset.setupOriginal);
          if (event?.storagePath) openEventOriginal(event.id);
        };
      });
    });
    root.querySelector("[data-general-board-add]")?.addEventListener("click", () => openDialog());
    root.querySelector("[data-setup-create]")?.addEventListener("click", createSetupTask);
    root.querySelectorAll("[data-venue-task-add]").forEach((button) => button.onclick = () => openDialog(null, { eventOrderId: button.dataset.eventOrderId, venue: button.dataset.venue, spaceId: button.dataset.spaceId }));
    root.querySelector("[data-board-cancel]").onclick = () => closeDialog();
    root.querySelector("[data-board-date]").onchange = (event) => { selectDate(event.target.value); render(); };
    root.querySelectorAll("[data-board-date-step]").forEach((button) => button.onclick = () => { selectDate(addDays(selectedDate, Number(button.dataset.boardDateStep))); render(); });
    root.querySelector("[data-board-today]").onclick = () => { selectDate(dateKey()); render(); };
    root.querySelectorAll("[data-space-group-toggle]").forEach((button) => button.onclick = () => {
      if (!window.matchMedia?.("(max-width: 768px)").matches) return;
      if (!mobileOpenGroups) mobileOpenGroups = new Set([root.querySelector("[data-space-group-toggle]")?.dataset.spaceGroupToggle].filter(Boolean));
      const name = button.dataset.spaceGroupToggle;
      if (mobileOpenGroups.has(name)) mobileOpenGroups.delete(name); else mobileOpenGroups.add(name);
      saveOpenGroups(); render();
    });
    if (window.matchMedia?.("(max-width: 768px)").matches) root.querySelectorAll("[data-detail-key]").forEach((card) => {
      const open = (event) => {
        if (event.target.closest("button,input,select,textarea,a,label")) return;
        const block = allBlocks().find((item) => item.key === card.dataset.detailKey);
        if (block) openDetailDialog(block);
      };
      card.onclick = open;
      card.onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(event); } };
    });
    root.querySelectorAll("[data-next-detail-toggle]").forEach((button) => button.onclick = () => {
      const card = button.closest(".operation-block"); const expanded = card.classList.toggle("next-setup-expanded");
      button.setAttribute("aria-expanded", String(expanded)); button.textContent = expanded ? "접기" : "상세 보기";
    });
    root.querySelectorAll("[data-mobile-reminder-toggle]").forEach((button) => button.onclick = () => {
      const menu = button.nextElementSibling; const open = menu.hidden;
      root.querySelectorAll(".operation-mobile-reminder-menu").forEach((item) => { item.hidden = true; });
      menu.hidden = !open; button.setAttribute("aria-expanded", String(open));
    });
    root.querySelectorAll("[data-mobile-reminder-value]").forEach((button) => button.onclick = () => {
      const key = button.closest("[data-key]").dataset.key;
      applyReminderValue(key, button.dataset.mobileReminderValue);
    });
    root.querySelectorAll("[data-reminder-key]").forEach((select) => select.onchange = () => {
      let value = select.value;
      if (value === "custom") { const entered = prompt("몇 분 전에 알릴까요?", "45"); value = String(Math.max(1, Number.parseInt(entered, 10) || 45)); }
      applyReminderValue(select.dataset.reminderKey, value);
    });
    const dialog = root.querySelector(".operation-dialog");
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
    weeklyRoot?.querySelectorAll("[data-setup-complete]").forEach((input) => input.onchange = () => { const key = input.closest("[data-setup-key]").dataset.setupKey; const task = buildWeeklySetupTasks(currentEvents).find((item) => item.key === key); state.completions[key] = input.checked; if (task) { task.completed = input.checked; syncItem(task); } saveState(); render(); });
    weeklyRoot?.querySelectorAll("[data-setup-date]").forEach((input) => input.onchange = () => { const key = input.closest("[data-setup-key]").dataset.setupKey; const task = buildWeeklySetupTasks(currentEvents).find((item) => item.key === key); state.plans[key] = input.value; if (task) { task.plannedDate = input.value; syncItem(task); } saveState(); render(); });
    root.querySelectorAll("[data-complete]").forEach((control) => { const complete = () => completeBoardItem(control.closest("[data-key]").dataset.key, control.matches('input[type="checkbox"]') ? control.checked : true); if (control.matches('input[type="checkbox"]')) control.onchange = complete; else control.onclick = complete; });
    root.querySelectorAll("[data-restore-complete]").forEach((button) => button.onclick = () => completeBoardItem(button.closest("[data-key]").dataset.key, false));
    root.querySelectorAll("[data-edit]").forEach((button) => button.onclick = () => openDialog(state.manual.find((x) => x.key === button.closest("[data-key]").dataset.key)));
    root.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => deleteManual(button.closest("[data-key]").dataset.key));
    root.querySelectorAll("[data-setup-pin]").forEach((button) => button.onclick = () => { const key = button.closest("[data-key]").dataset.key; setSetupPin(key, !state.pins[key]); });
    root.querySelectorAll("[data-setup-edit]").forEach((button) => button.onclick = () => { const item = allBlocks().find((block) => block.key === button.closest("[data-key]").dataset.key); if (item) editSetupTask(item); });
    root.querySelectorAll("[data-add-item]").forEach((button) => button.onclick = () => { const name = prompt("세팅 항목명"); if (!normalize(name)) return; const quantity = prompt("수량 (선택)", "") || ""; const unit = prompt("단위 (선택)", "") || ""; const memo = prompt("메모 (선택)", "") || ""; const item = { id: crypto.randomUUID(), parentKey: button.closest("[data-key]").dataset.key, date: selectedDate, name: normalize(name), quantity, unit, memo, completed: false }; state.checklist.push(item); saveState(); syncChecklist(item); render(); });
    root.querySelectorAll("[data-check-item]").forEach((input) => input.onchange = () => { const item = state.checklist.find((x) => x.id === input.closest("[data-item-id]").dataset.itemId); if (item) { item.completed = input.checked; syncChecklist(item); } saveState(); render(); });
    root.querySelectorAll("[data-edit-item]").forEach((button) => button.onclick = () => { const item = state.checklist.find((entry) => entry.id === button.closest("[data-item-id]").dataset.itemId); if (!item) return; const name = prompt("세팅 항목명", item.name); if (!normalize(name)) return; const quantity = prompt("수량 (선택)", item.quantity || ""); if (quantity === null) return; const unit = prompt("단위 (선택)", item.unit || ""); if (unit === null) return; const memo = prompt("메모 (선택)", item.memo || ""); if (memo === null) return; Object.assign(item, { name: normalize(name), quantity, unit, memo }); saveState(); syncChecklist(item); render(); });
    root.querySelectorAll("[data-delete-item]").forEach((button) => button.onclick = () => { const id = button.closest("[data-item-id]").dataset.itemId; const item = state.checklist.find((x) => x.id === id); state.checklist = state.checklist.filter((x) => x.id !== id); saveState(); if (item) syncChecklist(item, true); render(); });
    const detailDialog = root.querySelector("[data-operation-detail]");
    detailDialog.addEventListener("cancel", (event) => { event.preventDefault(); detailDialog.close(); });
    detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) detailDialog.close(); });
  }
  function reminderTriggerAt(block, minutesBefore) {
    if (!block || !/^\d{4}-\d{2}-\d{2}$/.test(block.date || "") || !/^\d\d:\d\d$/.test(block.time || "")) return null;
    return new Date(new Date(`${block.date}T${block.time}:00+09:00`).getTime() - Number(minutesBefore) * 60000);
  }
  async function applyReminderValue(key, value) {
    const block = key === "default" ? null : allBlocks().find((item) => item.key === key);
    let pushSubscription = null;
    if (value !== "none" && block && !reminderTriggerAt(block, value === "default" ? defaultReminder : value)) { alert("시간 미정 일정은 알림을 예약할 수 없습니다."); return; }
    if (value !== "none") {
      try {
        if (!window.BANQUET_ERP_PUSH_NOTIFICATIONS) throw new Error("알림 서비스를 초기화하지 못했습니다.");
        pushSubscription = await window.BANQUET_ERP_PUSH_NOTIFICATIONS.ensureEnabled();
      }
      catch (error) { alert(error.message || "휴대폰 알림을 활성화하지 못했습니다."); return; }
    }
    if (key === "default") {
      const previous = defaultReminder;
      defaultReminder = value;
      try { await Promise.all(allBlocks().map((item) => syncItem(item, { throwOnError: true }))); }
      catch (error) { defaultReminder = previous; console.error("[Operation Reminder] save failed", error); alert("알림 설정을 저장하지 못했습니다. 다시 시도해주세요."); return; }
      localStorage.setItem(REMINDER_DEFAULT_KEY, value);
    } else {
      const previous = state.reminders[key];
      state.reminders[key] = value; saveState();
      if (block) {
        const minutesBefore = value === "default" ? defaultReminder : value;
        try { await syncItem(block, { throwOnError: true }); }
        catch (error) {
          if (previous == null) delete state.reminders[key]; else state.reminders[key] = previous;
          saveState(); console.error("[Operation Reminder] save failed", error); alert("알림 설정을 저장하지 못했습니다. 다시 시도해주세요."); return;
        }
        console.debug("[Operation Reminder] reminder saved", { key, eventTime: `${block.date} ${block.time}`, minutesBefore: Number(minutesBefore), triggerAt: reminderTriggerAt(block, minutesBefore)?.toISOString(), permission: window.Notification?.permission || "unsupported", subscriptionExists: Boolean(pushSubscription), completed: block.completed });
      }
    }
    render();
  }
  function closeDialog() { const dialog = root.querySelector(".operation-dialog"); dialog.querySelector("form").reset(); dialog.close(); }
  function openDialog(item, context = null) {
    const dialog = root.querySelector(".operation-dialog"); const form = dialog.querySelector("form"); form.reset();
    if (item) Object.entries(item).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
    if (context) Object.entries(context).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value || ""; });
    form.elements.venue.readOnly = Boolean(context?.venue || item?.eventOrderId); dialog.showModal(); form.onsubmit = (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); const existing = state.manual.find((x) => x.key === data.id); const key = existing?.key || `manual:${crypto.randomUUID()}`; const venue = normalize(data.venue); const next = { key, id: key, kind: "manual", type: "manual", date: existing?.date || selectedDate, time: data.time, venue, spaceId: data.spaceId || existing?.spaceId || `venue:${venue.toLowerCase().replace(/\s+/g, "")}`, eventOrderId: data.eventOrderId || existing?.eventOrderId || null, title: normalize(data.title), memo: normalize(data.memo), completed: existing?.completed || false, metadataSource: "manual_board_task", createdAt: existing?.createdAt || new Date().toISOString() }; state.manual = existing ? state.manual.map((x) => x.key === key ? next : x) : [...state.manual, next]; saveState(); syncItem(next); closeDialog(); render(); };
  }
  window.addEventListener?.("banquet:beverage-inventory-updated", () => { if (root) render({ events: currentEvents }); });
  window.BANQUET_ERP_OPERATION_BOARD = { render, renderDashboardAgendaWidget, completeBoardItem, classifySchedule, normalizedScheduleRows, colorForSpace, physicalSpaceKeys, physicalSpaceKeysOverlap, spacesOverlap, inferLayoutType, getVenueGroup, spaceGroupFromKeys, spaceGroupForBlock, groupBlocksBySpace, formatEventSpaceSummary, formatEventSpaceDetails, buildAutoBlocks, buildWeeklySetupTasks, recommendLayout, isAssetAuditRow, allBlocks, agendaBlocks, setupBoardTasks, setupCandidateDateRange, setupEventDetails, setupEventCandidates, formatSetupCandidateLabel, setupVenueCodes, renderSetupVenueOptions, findLocalSetupDuplicate, isOverdue, reminderTriggerAt, setSetupPin, updateSetupTask, normalizeVenue: (value) => window.BANQUET_ERP_VENUE_UTILS?.normalizeVenue(value) || "", getSelectedDate: () => selectedDate, setSelectedDate(value) { selectDate(value); }, addFieldNote(note) { state.fieldNotes = [...state.fieldNotes.filter((x) => x.key !== note.key), note]; saveState(); render(); }, async addManualTasks(tasks) { for (const task of tasks) { const next = { key: task.key || `manual:${crypto.randomUUID()}`, id: task.key || `manual:${crypto.randomUUID()}`, kind: "manual", type: "manual", date: task.date || selectedDate, time: task.time || "", venue: normalize(task.venue), spaceId: task.spaceId || `venue:${normalize(task.venue).toLowerCase().replace(/\s+/g, "")}`, eventOrderId: task.eventOrderId || null, title: normalize(task.title), memo: normalize(task.memo), completed: false, metadataSource: task.metadata?.source || "manual_board_task", metadata: task.metadata || {}, createdAt: new Date().toISOString() }; next.id = next.key; state.manual.push(next); await syncItem(next); } saveState(); render(); }, _setEventsForTest(value) { currentEvents = value || []; }, _setStateForTest(value) { state = { completions: {}, plans: {}, reminders: {}, manual: [], checklist: [], fieldNotes: [], pins: {}, setupOverrides: {}, ...value }; } };
})();
