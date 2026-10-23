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
  let persistentSetupLoaded = false;
  let persistentSetupLoading = false;
  let activeBriefingCandidateKey = "";
  let activeBriefingOverride = null;
  let defaultReminder = localStorage.getItem(REMINDER_DEFAULT_KEY) || "none";
  let mobileOpenGroups = loadOpenGroups();
  let activeBoardTab = "operations";
  let todayRoleFilter = "all";
  let todayAssigneeFilter = "all";
  function coreRules() { return window.BANQUET_ERP_CORE_RULES; }
  function assignableUsers() { return (window.BANQUET_ERP_CONSTANTS?.loginAccounts || []).map(({ id, label, role }) => ({ id, label, role })); }
  function currentUser() { try { return JSON.parse(localStorage.getItem(window.BANQUET_ERP_CONSTANTS?.authStorageKey || "banquetErpCurrentUser.v1") || "null"); } catch { return null; } }

  function dateKey(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }
  function storedSelectedDate() {
    try {
      const value = sessionStorage.getItem(SELECTED_DATE_KEY);
      return coreRules()?.getSelectedBoardDate(value, coreRules()?.getActualTodaySeoul() || dateKey()) || dateKey();
    } catch { return coreRules()?.getActualTodaySeoul() || dateKey(); }
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
  function valueList(value) { return Array.isArray(value) ? value : value == null || value === "" ? [] : [value]; }
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
    if (venueUtils?.normalizeVenueSet(currentVenue).size && venueUtils?.normalizeVenueSet(futureVenue).size) return coreRules().spacesOverlap(currentVenue, futureVenue);
    const existingResult = physicalSpaceKeysOverlap(physicalSpaceKeys(currentEvent, currentRow), physicalSpaceKeys(futureEvent, futureRow));
    const knowledgeResult = window.BANQUET_ERP_AI_KNOWLEDGE_RULES?.spacesOverlapOverride(currentEvent, futureEvent, currentRow, futureRow);
    return knowledgeResult ?? existingResult;
  }
  function seoulNowParts(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const value = (type) => parts.find((part) => part.type === type)?.value || "";
    return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
  }
  function nextEventAfterParts(afterDateTime) {
    if (afterDateTime && typeof afterDateTime === "object") return { date: normalize(afterDateTime.date), time: timeValue(afterDateTime.time) || "00:00" };
    const text = normalize(afterDateTime); const match = text.match(/(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}:\d{2}))?/);
    return match ? { date: match[1], time: match[2] || "00:00" } : seoulNowParts();
  }
  function resolveNextEventForVenue({ venue, afterDateTime, events = currentEvents, excludeEventOrderId = null } = {}) {
    const venueUtils = window.BANQUET_ERP_VENUE_UTILS; const normalizedVenue = venueUtils?.normalizeVenue(venue) || normalize(venue);
    const venueSet = venueUtils?.normalizeVenueSet(normalizedVenue); if (!normalizedVenue || !venueSet?.size) return null;
    const after = nextEventAfterParts(afterDateTime); const afterKey = `${after.date}T${after.time}`; const candidates = [];
    (events || []).forEach((event) => {
      if (excludeEventOrderId != null && String(event.id) === String(excludeEventOrderId)) return;
      const rows = normalizedScheduleRows(event).filter(({ row, day }) => day && !isHiddenHotelSchedule(row, event) && venueUtils.normalizeVenueSet(venueName(row, event)).size && spacesOverlap({ venue: normalizedVenue }, { venue: venueName(row, event) }));
      rows.forEach(({ row, day, time }) => { const candidateTime = time || "23:59"; if (`${day}T${candidateTime}` > afterKey) candidates.push({ event, row, date: day, time, venue: venueName(row, event), dateTime: `${day}T${candidateTime}` }); });
      if (rows.length) return;
      const candidateVenue = normalize(event.venue); const candidateSet = venueUtils.normalizeVenueSet(venueUtils.normalizeVenue(candidateVenue) || candidateVenue);
      if (!candidateSet.size || !spacesOverlap({ venue: normalizedVenue }, { venue: candidateVenue })) return;
      eventDates(event).forEach((day) => { const time = timeValue(event.eventDateTime); const candidateTime = time || "23:59"; if (`${day}T${candidateTime}` > afterKey) candidates.push({ event, row: null, date: day, time, venue: candidateVenue, dateTime: `${day}T${candidateTime}` }); });
    });
    return coreRules().resolveNextEventForVenue({ venue: normalizedVenue, afterDateTime: afterKey, candidates });
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
    const endedBySpace = blocks.filter((block) => block.type === "end").flatMap((ended) => {
      const codes = window.BANQUET_ERP_VENUE_UTILS?.parseVenueCodes(ended.venue) || [];
      return (codes.length ? codes : [""]).map((code) => ({ ended, key: `${ended.spaceId}${codes.length > 1 ? `:${code}` : ""}`, scopeVenue: code || ended.venue }));
    });
    endedBySpace.forEach(({ ended, key, scopeVenue }) => {
      const next = resolveNextEventForVenue({ venue: scopeVenue, afterDateTime: { date: today, time: ended.time }, events, excludeEventOrderId: ended.eventOrderId });
      const itemKey = `next:${today}:${key}`;
      const displayVenue = window.BANQUET_ERP_VENUE_UTILS?.venueLabel(scopeVenue) || ended.venue;
      blocks.push({ key: itemKey, kind: "next_setup", type: "next_setup", date: today, time: ended.time, venue: displayVenue, spaceId: key, physicalSpaces: ended.physicalSpaces, eventOrderId: next?.event.id || ended.eventOrderId, sourceEventOrderId: ended.eventOrderId, afterDateTime: `${today}T${ended.time}`, title: "다음 세팅", eventName: ended.eventName, eventSubtitle: ended.eventSubtitle, completed: !!state.completions[itemKey], next: next ? { eventOrderId: next.event.id, date: next.date, time: next.time, name: eventDisplayTitle(next.event), subtitle: eventSecondaryTitle(next.event), people: next.row?.people || next.event.guestCount || "", layoutType: inferLayoutType(next.event), recommendation: recommendLayout(next.event.venueLayouts || [], inferLayoutType(next.event), next.row?.people || next.event.guestCount) } : null });
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
  function setupDocumentSummary(event = {}) {
    const notes = event.notes || []; const items = event.items || [];
    const linkedLayout = (event.venueLayouts || []).find((layout) => String(layout.id) === String(event.sourceLayoutId || event.source_layout_id || ""));
    const savedLayout = [event.savedLayout?.layout_name, event.savedLayout?.name, event.sourceLayout?.layout_name, event.sourceLayout?.name, linkedLayout?.layout_name, linkedLayout?.name].find(Boolean);
    const layout = [event.layoutText, ...valueList(event.layoutEqp), ...notes.filter((row) => row.note_type === "layout_eqp").map((row) => row.content)].find((value) => normalize(value));
    const others = [event.othersText, ...valueList(event.others), ...notes.filter((row) => ["others", "event_notes", "special_requests"].includes(row.note_type)).map((row) => row.content)].find((value) => normalize(value));
    const itemText = items.map((row) => normalize(row.item_name || row.name || row.content || row.memo)).filter(Boolean).join(" · ");
    const source = [savedLayout, layout, others, itemText].map(normalize).filter(Boolean).join(" · ");
    if (!source) return "등록된 세팅 정보 없음";
    const facts = [];
    if (/re[- ]?inform|재인폼/i.test(source)) facts.push("레이아웃 재인폼 예정");
    const classType = source.match(/(?:class\s*type|클래스\s*타입|스쿨식)[^\d]{0,12}(\d+)\s*석?/i);
    const layoutType = source.match(/(스쿨식|극장식|라운드|연회식|U\s*자)/i);
    if (classType) facts.push(`클래스 ${classType[1]}석`); else if (layoutType) facts.push(layoutType[1].replace(/\s+/g, ""));
    const registration = source.match(/(?:등록\s*테이블|등록대|registration\s*table)[^\d]{0,10}(\d+)\s*(?:T|EA|개)?/i);
    if (registration) facts.push(`등록 ${registration[1]}T`);
    const roundType = source.match(/(?:round\s*type|라운드)[^\d]{0,12}(\d+)\s*(?:T|석)?/i);
    if (roundType) facts.push(`라운드 ${roundType[1]}${/석/i.test(roundType[0]) ? "석" : "T"}`);
    const equipmentPatterns = [[/(?:무선\s*마이크)[^\d]{0,8}(\d+)\s*(?:EA|개)?/i, "무선마이크", "EA"], [/(?:유선\s*마이크)[^\d]{0,8}(\d+)?\s*(?:EA|개)?/i, "유선마이크", "EA"], [/(?:마이크|mic)[^\d]{0,8}(\d+)\s*(?:EA|개)?/i, "마이크", "EA"], [/(?:스크린|screen)[^\d]{0,8}(\d+)?\s*(?:EA|개)?/i, "스크린", "EA"], [/(?:빔\s*프로젝터|projector)[^\d]{0,8}(\d+)?\s*(?:EA|개)?/i, "빔프로젝터", "EA"], [/(?:무대|stage)[^\d]{0,8}(\d+)?/i, "무대", ""], [/(?:뷔페|buffet)/i, "뷔페", ""], [/(?:커피\s*브레이크|coffee\s*break)/i, "커피브레이크", ""]];
    equipmentPatterns.forEach(([pattern, label, unit]) => { if (label === "마이크" && /(?:무선|유선)\s*마이크/i.test(source)) return; const match = source.match(pattern); if (match) facts.push(`${label}${match[1] ? ` ${match[1]}${unit}` : ""}`); });
    return [...new Set(facts)].slice(0, 4).join(" · ") || source.slice(0, 90);
  }
  function buildDailyBriefing(events = currentEvents, today = seoulDateKey()) {
    const automatic = buildAutoBlocks(events, today).filter((item) => item.type === "next_setup" && item.next && !item.completed);
    const manualItems = state.manual.filter((item) => item.type === "next_setup").map((item) => ({ ...item, completed: !!state.completions[item.key] || !!item.completed }));
    const persistent = manualItems.filter((item) => !item.completed);
    const persistentQuestions = persistent.filter((item) => isSetupOverdue(item, today));
    const manualMatches = (candidate) => manualItems.some((item) => String(item.eventOrderId || "") === String(candidate.next?.eventOrderId || candidate.eventOrderId || "") && spacesOverlap({ venue: item.venue }, { venue: candidate.venue }));
    const candidates = sortSetupTasks([...persistentQuestions, ...automatic.filter((item) => !manualMatches(item))], today).map((item) => {
      const eventOrderId = item.next?.eventOrderId || item.eventOrderId; const event = events.find((entry) => String(entry.id) === String(eventOrderId));
      const automaticSource = item.kind !== "manual" || item.metadataSource === "daily_briefing";
      const summary = setupDocumentSummary(event);
      return { ...item, eventOrderId, nextEventOrderId: eventOrderId, organizer: normalize(event?.companyName || event?.organizer), eventName: normalize(event?.eventName), scheduledDate: setupScheduledDate(item), scheduledTime: item.next?.time || item.time || "", setupSummary: summary, completed: false, source: automaticSource ? "automatic" : "manual", sourceLabel: automaticSource ? "자동" : "수동", summary, eventTitle: item.next?.name || item.title || (event ? eventDisplayTitle(event) : "행사") };
    });
    const todayEventIds = new Set(buildAutoBlocks(events, today).filter((item) => item.type !== "next_setup" && window.BANQUET_ERP_VENUE_UTILS?.parseVenueCodes(item.venue).length).map((item) => String(item.eventOrderId)));
    const todayEvents = events.filter((event) => todayEventIds.has(String(event.id)));
    return { date: today, todayEvents, candidates, registered: persistent, registeredCount: persistent.length, count: candidates.length, prompt: candidates[0] ? `${candidates[0].venue} 세팅은 완료하셨나요?` : "확인할 다음 세팅이 없습니다." };
  }
  const ALERT_PRIORITY = { high: 0, medium: 1, normal: 2 };
  function alertHash(value) {
    let hash = 2166136261;
    for (const character of JSON.stringify(value ?? null)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function isAlertAcknowledged(id) { return Boolean(state.alertAcknowledgements?.[id]); }
  function layoutReinformText(event = {}) {
    const values = [event.layoutText, ...valueList(event.layoutEqp), event.othersText, ...valueList(event.others), ...(event.notes || []).filter((row) => ["layout_eqp", "others", "event_notes"].includes(row.note_type)).map((row) => row.content)];
    return values.map(normalize).find((value) => /re[- ]?inform|재인폼|추후\s*(?:재인폼|안내)|별도\s*안내/i.test(value)) || "";
  }
  function setupAlert(item, today) {
    const overdue = isSetupOverdue(item, today);
    return { ...item, id: `next_setup:${item.key}`, type: overdue ? "overdue_setup" : "next_setup", priority: overdue ? "high" : "normal", title: `${item.venue} 다음 세팅 확인`, summary: item.setupSummary, createdAt: item.scheduledDate || today, acknowledged: false, completed: false, sourceMetadata: { source: item.source, setupKey: item.key, sourceEventOrderId: item.sourceEventOrderId || null, afterDateTime: item.afterDateTime || null }, actions: ["complete", "later", "original", "attachments", "notes", "next"] };
  }
  function beverageShortageAlert(events, today) {
    const comparison = window.BANQUET_ERP_BEVERAGE_INVENTORY?.getComparison(events, today);
    if (!comparison?.snapshot || !comparison.shortageCount) return null;
    const shortages = Object.values(comparison.items).filter((item) => item.shortage > 0);
    const signature = alertHash({ uploadedAt: comparison.snapshot.uploadedAt, required: comparison.demand.required, details: comparison.demand.details, shortage: shortages.map((item) => [item.key, item.shortage]) });
    const id = `beverage_shortage:${signature}`;
    if (isAlertAcknowledged(id)) return null;
    return { id, key: id, type: "beverage_shortage", priority: "high", title: "음주류 발주 필요", summary: shortages.map((item) => `${item.label} ${item.shortage}${item.unit || "개"}`).join(", ") + " 부족", eventOrderId: null, venue: "", createdAt: comparison.snapshot.uploadedAt || new Date().toISOString(), acknowledged: false, completed: false, sourceMetadata: { signature, comparison }, actions: ["inventory", "demand", "acknowledge", "next"] };
  }
  function buildProactiveAlerts(events = currentEvents, today = seoulDateKey()) {
    const briefing = buildDailyBriefing(events, today); const alerts = [];
    briefing.candidates.forEach((item) => {
      alerts.push(setupAlert(item, today));
    });
    [...briefing.candidates, ...briefing.registered].forEach((item) => {
      const eventOrderId = item.nextEventOrderId || item.next?.eventOrderId || item.eventOrderId;
      const event = events.find((entry) => String(entry.id) === String(eventOrderId)); const reinform = layoutReinformText(event);
      const id = `layout_reinform:${eventOrderId}:${alertHash(reinform)}`;
      if (reinform && !isAlertAcknowledged(id)) alerts.push({ id, key: id, type: "layout_reinform", priority: "medium", title: `${item.venue} 레이아웃 확인 필요`, summary: `${item.organizer || item.eventName || item.eventTitle || eventDisplayTitle(event)} 행사는 LAY & OUT이 재인폼 상태입니다.`, eventOrderId, venue: item.venue, eventTitle: item.eventTitle || eventDisplayTitle(event), setupSummary: item.setupSummary || setupDocumentSummary(event), createdAt: item.scheduledDate || setupScheduledDate(item) || today, acknowledged: false, completed: false, sourceMetadata: { text: reinform, setupKey: item.key }, actions: ["original", "next", "acknowledge"] });
    });
    const beverage = beverageShortageAlert(events, today); if (beverage) alerts.push(beverage);
    (state.proactiveAlerts || []).filter((item) => !item.acknowledged && !item.completed && !isAlertAcknowledged(item.id)).forEach((item) => alerts.push(item));
    if (activeBriefingOverride && !alerts.some((item) => String(item.nextEventOrderId || item.eventOrderId) === String(activeBriefingOverride.nextEventOrderId) && ["next_setup", "overdue_setup"].includes(item.type))) alerts.push(activeBriefingOverride);
    const deduped = [...new Map(alerts.map((item) => [item.id, item])).values()].sort((left, right) => (ALERT_PRIORITY[left.priority] ?? 9) - (ALERT_PRIORITY[right.priority] ?? 9) || String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
    return { date: today, todayEvents: briefing.todayEvents, registeredCount: briefing.registeredCount, alerts: deduped, candidates: deduped, count: deduped.length, prompt: deduped[0]?.summary || "확인할 proactive alert가 없습니다." };
  }
  function proactiveAlertSummary(item) {
    if (!item) return "확인할 proactive alert가 없습니다.";
    if (item.type === "next_setup" || item.type === "overdue_setup") return briefingItemPrompt(item);
    if (item.type === "layout_reinform") return `${item.venue} 다음 행사는 레이아웃이 재인폼 상태입니다.\n확인 필요합니다.`;
    if (item.type === "beverage_shortage") return `다음주 일요일까지 기준으로 ${item.summary.replace(/, /g, "와 ")}합니다.`;
    return `${item.title}\n${item.summary}`;
  }
  function briefingItemPrompt(item) {
    if (!item) return "확인할 다음 세팅이 없습니다.";
    const venue = window.BANQUET_ERP_VENUE_UTILS?.venueLabel(item.venue) || item.venue;
    const eventTitle = item.organizer || item.eventName || item.eventTitle;
    const detail = item.setupSummary === "등록된 세팅 정보 없음" ? "등록된 세팅 정보는 없습니다." : item.setupSummary === "레이아웃 재인폼 예정" ? "레이아웃은 재인폼 예정입니다." : `${item.setupSummary}으로 적혀 있습니다.`;
    return `${venue} 다음 행사는 ${eventTitle}입니다.\n${detail}\n세팅 완료하셨나요?`;
  }
  function dailyBriefingConversation(events = currentEvents, today = seoulDateKey(), reset = false) {
    if (reset) activeBriefingOverride = null;
    const briefing = buildProactiveAlerts(events, today);
    let current = !reset && briefing.candidates.find((item) => item.key === activeBriefingCandidateKey);
    if (!current) current = briefing.candidates[0] || null;
    activeBriefingCandidateKey = current?.key || "";
    const outline = briefing.candidates.slice(0, 4).map((item) => `- ${item.title}`).join("\n");
    return { ...briefing, current, summary: `오늘 등록된 다음세팅 작업은 ${briefing.registeredCount}건입니다. 추가로 확인이 필요한 항목은 ${briefing.count}건입니다.${outline ? `\n${outline}` : ""}`, question: proactiveAlertSummary(current) };
  }
  function nextBriefingCandidate(events = currentEvents, today = seoulDateKey()) {
    const candidates = buildProactiveAlerts(events, today).candidates;
    const index = candidates.findIndex((item) => item.key === activeBriefingCandidateKey);
    const next = candidates[index >= 0 ? index + 1 : 0] || null;
    activeBriefingCandidateKey = next?.key || "";
    return next;
  }
  function activeDailyBriefingItem(events = currentEvents, today = seoulDateKey()) {
    return buildProactiveAlerts(events, today).candidates.find((item) => item.key === activeBriefingCandidateKey) || (activeBriefingOverride?.key === activeBriefingCandidateKey ? activeBriefingOverride : null);
  }
  function openBriefingResource(action, item, events = currentEvents) {
    const event = events.find((entry) => String(entry.id) === String(item?.nextEventOrderId || item?.eventOrderId));
    if (!item || !event) return "현재 확인 중인 다음 행사를 찾지 못했습니다.";
    if (action === "original") {
      if (!event.storagePath) return "등록된 원본 파일이 없습니다.";
      window.openStoredExcel?.(event.storagePath, { eventOrderId: event.id, originalFilename: event.originalFilename || "" });
      return `${item.eventTitle || item.title} 원본 엑셀을 열었습니다.`;
    }
    if (action === "attachments") { window.BANQUET_ERP_EVENT_ATTACHMENTS?.openEventAttachments(event.id, item.eventTitle || item.title); return `${item.eventTitle || item.title} 첨부자료를 열었습니다.`; }
    if (action === "notes") { window.BANQUET_ERP_EVENT_ATTACHMENTS?.openFieldNotes(event.id, item.eventTitle || item.title); return `${item.eventTitle || item.title} 특이사항을 열었습니다.`; }
    return "";
  }
  function dailyBriefingAction(action, events = currentEvents, today = seoulDateKey()) {
    const current = activeDailyBriefingItem(events, today) || dailyBriefingConversation(events, today).current;
    if (!current) return { message: "남은 다음 세팅이 없습니다.", current: null };
    if (["original", "attachments", "notes"].includes(action)) return { message: openBriefingResource(action, current, events), current };
    if (action === "inventory") { document.querySelector("#beverageInventoryWidget")?.scrollIntoView?.({ behavior: "smooth", block: "center" }); return { message: "음주류 재고 현황을 표시했습니다.", current }; }
    if (action === "demand") {
      const details = current.sourceMetadata?.comparison?.demand?.details || [];
      return { message: details.length ? details.map((item) => `${item.date.slice(5).replace("-", "/")} ${item.venue} · ${item.meal} · ${item.guests}명`).join("\n") : "집계 기간의 뷔페 행사가 없습니다.", current };
    }
    if (action === "candidates") { window.BANQUET_ERP_EVENT_ATTACHMENTS?.openScheduleCandidates?.(current.eventOrderId, current.sourceMetadata?.candidates || [], current.title); return { message: "첨부자료 일정 후보를 열었습니다. 승인 전에는 일정에 반영되지 않습니다.", current }; }
    if (action === "changes") return { message: current.sourceMetadata?.changes?.map((item) => `${item.label}: ${item.before || "-"} → ${item.after || "-"}`).join("\n") || current.summary, current };
    if (action === "acknowledge") {
      acknowledgeProactiveAlert(current, today);
      const next = buildProactiveAlerts(events, today).candidates[0] || null; activeBriefingCandidateKey = next?.key || "";
      return { message: next ? `확인 처리했습니다.\n${proactiveAlertSummary(next)}` : "확인 처리했습니다. 남은 proactive alert가 없습니다.", current: next };
    }
    if (action === "complete") {
      completeBoardItem(current.key, true, today);
      const next = buildProactiveAlerts(events, today).candidates[0] || null;
      activeBriefingCandidateKey = next?.key || "";
      return { message: next ? `${current.venue} 완료 처리했습니다.\n${proactiveAlertSummary(next)}` : `${current.venue} 완료 처리했습니다. 남은 alert가 없습니다.`, current: next };
    }
    const next = nextBriefingCandidate(events, today);
    const prefix = action === "later" ? `${current.venue} 세팅은 미완료 상태로 유지합니다.` : `${current.venue} 세팅은 건너뜁니다.`;
    return { message: next ? `${prefix}\n${proactiveAlertSummary(next)}` : `${prefix}\n이번 briefing에서 더 확인할 항목이 없습니다.`, current: next };
  }
  function correctionDateFromText(text, today) {
    if (/내일/.test(text)) return addDays(today, 1);
    const full = text.match(/(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})/); if (full) return `${full[1]}-${String(Number(full[2])).padStart(2, "0")}-${String(Number(full[3])).padStart(2, "0")}`;
    const monthDay = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/); if (monthDay) return `${today.slice(0, 4)}-${String(Number(monthDay[1])).padStart(2, "0")}-${String(Number(monthDay[2])).padStart(2, "0")}`;
    const day = text.match(/(?:^|\D)(\d{1,2})\s*일(?:\D|$)/); if (!day) return "";
    const date = new Date(`${today}T12:00:00+09:00`); date.setUTCDate(Number(day[1])); if (date.toISOString().slice(0, 10) < today) date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 10);
  }
  function correctBriefingNextEvent(question, events = currentEvents, today = seoulDateKey()) {
    const text = normalize(question); if (!/(?:있잖아|먼저(?:야|인데|지)|다음\s*행사\s*아니|그거\s*다음\s*행사)/i.test(text)) return "";
    const venueUtils = window.BANQUET_ERP_VENUE_UTILS; const active = activeDailyBriefingItem(events, today); const explicitCode = venueUtils?.parseVenueCodes(text)?.[0];
    const venue = explicitCode ? venueUtils.venueLabel(explicitCode) : active?.venue || ""; if (!venue) return "";
    const requestedDate = correctionDateFromText(text, today); const now = seoulNowParts(); const threshold = requestedDate ? { date: addDays(requestedDate, -1), time: "23:59" } : now;
    const resolved = resolveNextEventForVenue({ venue, afterDateTime: threshold, events }); if (!resolved || (requestedDate && resolved.date !== requestedDate)) return "";
    const queue = buildProactiveAlerts(events, today); let corrected = queue.candidates.find((item) => ["next_setup", "overdue_setup"].includes(item.type) && String(item.nextEventOrderId) === String(resolved.event.id) && spacesOverlap({ venue }, { venue: item.venue }));
    if (!corrected) {
      const setupSummary = setupDocumentSummary(resolved.event); const key = `corrected-next:${venueUtils.normalizeVenue(venue) || normalize(venue)}:${resolved.event.id}`;
      corrected = { key, id: `next_setup:${key}`, kind: "next_setup", type: "next_setup", priority: "normal", venue: venueUtils.venueLabel(venue) || venue, eventOrderId: resolved.event.id, nextEventOrderId: resolved.event.id, organizer: normalize(resolved.event.companyName || resolved.event.organizer), eventName: normalize(resolved.event.eventName), eventTitle: eventDisplayTitle(resolved.event), scheduledDate: resolved.date, scheduledTime: resolved.time, setupSummary, summary: setupSummary, source: "automatic", sourceLabel: "자동", createdAt: resolved.date, acknowledged: false, completed: false, sourceMetadata: { source: "user_correction" }, actions: ["complete", "later", "original", "attachments", "notes", "next"] };
      activeBriefingOverride = corrected;
    } else activeBriefingOverride = null;
    activeBriefingCandidateKey = corrected.key;
    const label = venueUtils.venueLabel(venue) || venue; const title = corrected.organizer || corrected.eventName || corrected.eventTitle;
    return `맞습니다. ${label}의 다음 행사는 ${Number(resolved.date.slice(5, 7))}월${Number(resolved.date.slice(8, 10))}일 ${title}입니다.\n다음 세팅 대상을 수정했습니다.`;
  }
  function dailyBriefingAnswer(question, events = currentEvents, today = seoulDateKey()) {
    const text = String(question || "");
    const correction = correctBriefingNextEvent(text, events, today); if (correction) return correction;
    if (/(?:오늘\s*브리핑|확인할\s*(?:거|것).*(?:있어|있나|알려)|다음\s*세팅.*(?:뭐|무엇).*남)/i.test(text)) {
      const briefing = dailyBriefingConversation(events, today, true);
      return briefing.count ? `${briefing.summary}\n${briefing.question}` : briefing.registeredCount ? briefing.summary : "오늘 확인할 게 없습니다.";
    }
    const active = activeDailyBriefingItem(events, today);
    if (active && /원본|엑셀/.test(text)) return openBriefingResource("original", active, events);
    if (active && /첨부/.test(text)) return openBriefingResource("attachments", active, events);
    if (active && /특이사항|현장\s*메모/.test(text)) return openBriefingResource("notes", active, events);
    if (active && /레이아웃|lay\s*&?\s*out/i.test(text)) return active.setupSummary;
    if (active && /재고\s*(?:보기|보여|열어)/.test(text)) return dailyBriefingAction("inventory", events, today).message;
    if (active && /수요\s*(?:상세|보기)|근거/.test(text)) return dailyBriefingAction("demand", events, today).message;
    if (active && /후보\s*(?:확인|보기)|일정\s*후보/.test(text)) return dailyBriefingAction("candidates", events, today).message;
    if (active && /변경\s*(?:내용|사항).*(?:보기|보여|확인)?/.test(text)) return dailyBriefingAction("changes", events, today).message;
    if (active && /^(?:아직|안\s*했어|미완료)[.!\s]*$/i.test(text)) return dailyBriefingAction("later", events, today).message;
    if (active && /^(?:다음|넘겨|건너뛰어)[.!\s]*$/i.test(text)) return dailyBriefingAction("next", events, today).message;
    if (active && !["next_setup", "overdue_setup"].includes(active.type) && /^(?:확인|확인했어|봤어|응|네)[.!\s]*$/i.test(text)) return dailyBriefingAction("acknowledge", events, today).message;
    if (active && ["next_setup", "overdue_setup"].includes(active.type) && /^(?:했어|했어요|완료|완료했어|끝냈어|응|네)[.!\s]*$/i.test(text)) {
      return dailyBriefingAction("complete", events, today).message;
    }
    if (!/(오늘\s*(?:뭐|무엇).*해야|다음\s*세팅.*(?:뭐|남)|어떻게\s*세팅|레이아웃.*(?:뭐|적)|재인폼)/i.test(String(question || ""))) return "";
    const briefing = buildProactiveAlerts(events, today); const venueSet = window.BANQUET_ERP_VENUE_UTILS?.normalizeVenueSet(question);
    const rows = venueSet?.size ? briefing.candidates.filter((item) => window.BANQUET_ERP_VENUE_UTILS.spacesOverlap(item.venue, question)) : /재인폼/.test(question) ? briefing.candidates.filter((item) => /재인폼/.test(item.summary)) : briefing.candidates;
    if (!rows.length) return "남은 다음 세팅이 없습니다.";
    activeBriefingCandidateKey = rows[0].key;
    return proactiveAlertSummary(rows[0]);
  }
  function loadState() {
    try { return { completions: {}, plans: {}, reminders: {}, pins: {}, setupOverrides: {}, alertAcknowledgements: {}, proactiveAlerts: [], manual: [], checklist: [], fieldNotes: [], ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
    catch { return { completions: {}, plans: {}, reminders: {}, pins: {}, setupOverrides: {}, alertAcknowledgements: {}, proactiveAlerts: [], manual: [], checklist: [], fieldNotes: [] }; }
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function proactiveAlertPayload(item, acknowledged = false, boardDate = seoulDateKey()) {
    return { board_date: boardDate, item_key: `proactive-alert:${item.id}`, item_kind: "manual", event_order_id: item.eventOrderId || null, space_id: null, item_time: null, venue_name: item.venue || "", title: item.title || "운영 알림", people: null, memo: item.summary || "", is_completed: acknowledged, metadata: { recordType: "proactive_alert", source: "proactive_alerts_v1", alertId: item.id, alertType: item.type, priority: item.priority, acknowledged, alert: { ...item, acknowledged, sourceMetadata: item.sourceMetadata || {} }, updatedAt: new Date().toISOString() } };
  }
  function persistProactiveAlert(item, acknowledged = false, boardDate = seoulDateKey()) {
    return remoteRequest("operation_board_items?on_conflict=board_date,item_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(proactiveAlertPayload(item, acknowledged, boardDate)) }).catch((error) => console.error("proactive alert 저장 실패", error));
  }
  function acknowledgeProactiveAlert(item, boardDate = seoulDateKey()) {
    if (!item?.id) return;
    state.alertAcknowledgements[item.id] = true;
    state.proactiveAlerts = (state.proactiveAlerts || []).map((entry) => entry.id === item.id ? { ...entry, acknowledged: true } : entry);
    saveState(); persistProactiveAlert(item, true, boardDate); render();
  }
  function registerProactiveAlert(item, boardDate = seoulDateKey()) {
    if (!item?.id || !item.type) return null;
    if (isAlertAcknowledged(item.id) || (state.proactiveAlerts || []).some((entry) => entry.id === item.id)) return item;
    const next = { priority: "medium", eventOrderId: null, venue: "", createdAt: new Date().toISOString(), acknowledged: false, completed: false, sourceMetadata: {}, ...item, key: item.id };
    state.proactiveAlerts = [...(state.proactiveAlerts || []), next]; saveState(); persistProactiveAlert(next, false, boardDate); render(); return next;
  }
  function comparableEventOrder(event = {}) {
    const schedule = (event.schedule || []).map((row) => [normalize(row.date), normalize(row.time), normalize(row.venue), normalize(row.content), Number(row.people) || 0]);
    const notes = event.notes || [];
    return { dates: eventDates(event).sort(), time: timeValue(event.eventDateTime) || normalize(event.eventDateTime), venue: normalize(event.venue), guests: Number(event.guestCount) || 0, schedule, layout: normalize([event.layoutText, ...valueList(event.layoutEqp), ...notes.filter((row) => row.note_type === "layout_eqp").map((row) => row.content)].filter(Boolean).join(" · ")), others: normalize([event.othersText, ...valueList(event.others), ...notes.filter((row) => row.note_type === "others").map((row) => row.content)].filter(Boolean).join(" · ")), beverage: normalize(event.beveragesText || event.beverage || event.bev), items: (event.items || []).map((row) => [normalize(row.itemName || row.item_name || row.name), Number(row.quantity) || 0]) };
  }
  function eventOrderChanges(before, after) {
    const left = comparableEventOrder(before); const right = comparableEventOrder(after); const labels = { dates: "행사 날짜", time: "시간", venue: "장소", guests: "인원", schedule: "일정", layout: "LAY & OUT", others: "OTHERS", beverage: "BEV", items: "주요 품목" };
    return Object.keys(labels).filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key])).map((key) => ({ field: key, label: labels[key], before: Array.isArray(left[key]) ? JSON.stringify(left[key]) : String(left[key] ?? ""), after: Array.isArray(right[key]) ? JSON.stringify(right[key]) : String(right[key] ?? "") }));
  }
  function registerEventOrderChange(before, after) {
    const changes = eventOrderChanges(before, after); if (!changes.length) return null;
    const signature = alertHash({ eventOrderId: before?.id || after?.id, changes }); const id = `event_order_changed:${before?.id || after?.id}:${signature}`;
    const today = seoulDateKey(); const eventDate = eventDates(after)[0] || ""; const priority = eventDate === today ? "high" : "medium";
    const first = changes[0]; const title = `${normalize(after?.companyName || after?.organizer || after?.eventName) || "행사"} 이벤오더 수정`;
    return registerProactiveAlert({ id, type: "event_order_changed", priority, title, summary: `${first.label} ${first.before || "-"} → ${first.after || "-"}${changes.length > 1 ? ` 외 ${changes.length - 1}건` : ""}`, eventOrderId: before?.id || after?.id || null, venue: after?.venue || before?.venue || "", sourceMetadata: { signature, changes }, actions: ["changes", "original", "acknowledge", "next"] }, today);
  }
  function registerAttachmentScheduleCandidates(eventOrderId, eventTitle, candidates = [], metadata = {}) {
    const unique = [...new Map((candidates || []).map((item) => [`${normalize(item.date)}|${timeValue(item.time) || normalize(item.time)}|${normalize(item.venue)}|${normalize(item.content)}`, item])).values()];
    if (!unique.length) return null;
    const signature = alertHash({ eventOrderId, candidates: unique });
    return registerProactiveAlert({ id: `attachment_schedule_candidates:${eventOrderId}:${signature}`, type: "attachment_schedule_candidates", priority: "medium", title: `${eventTitle || "행사"} 첨부 일정 확인`, summary: `첨부자료에서 추가 일정 ${unique.length}건을 찾았습니다.`, eventOrderId, venue: metadata.venue || "", sourceMetadata: { signature, candidates: unique, ...metadata }, actions: ["candidates", "attachments", "acknowledge", "next"] });
  }
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
        } else if (row.metadata?.recordType !== "board_ai_change_log" && row.item_kind === "manual") {
          const setupOverride = row.metadata?.setupOverride || {};
          state.manual = [...state.manual.filter((x) => x.recordId !== row.id && x.key !== row.item_key), { key: row.item_key, id: row.item_key, recordId: row.id, kind: "manual", type: row.metadata?.taskType || "manual", date: row.board_date, scheduledDate: row.metadata?.scheduledDate || setupOverride.scheduledDate || setupOverride.eventDate || row.board_date, scheduledTime: row.metadata?.scheduledTime || setupOverride.scheduledTime || setupOverride.time || String(row.item_time || "").slice(0, 5), time: String(row.item_time || "").slice(0, 5), venue: row.venue_name, spaceId: row.space_id || row.metadata?.spaceKey || `venue:${row.venue_name}`, eventOrderId: row.event_order_id || row.metadata?.eventOrderId || null, title: row.title, people: row.people ?? setupOverride.people ?? "", memo: row.memo || "", completed: !!row.is_completed, metadataSource: row.metadata?.source || "", metadata: row.metadata || {} }];
        }
      });
      state.checklist = [...state.checklist.filter((item) => item.date !== boardDate), ...(checklist || []).map((row) => ({ id: row.id, parentKey: row.parent_item_key, date: boardDate, name: row.item_name, quantity: row.quantity || "", unit: row.unit || "", memo: row.memo || "", completed: !!row.is_completed }))];
      remoteLoadedDates.add(boardDate);
      saveState(); remoteStatus = "ready";
      if (selectedDate === boardDate || document.getElementById("todayRemainingScheduleWidget")) render();
    } catch (error) { remoteStatus = "fallback"; console.info("운영보드 DB migration 적용 전: 브라우저 저장소를 사용합니다.", error.message); }
    finally { remoteLoadingDates.delete(boardDate); }
  }
  async function hydratePersistentSetupTasks() {
    if (remoteStatus === "fallback" || persistentSetupLoaded || persistentSetupLoading) return;
    persistentSetupLoading = true;
    try {
      const items = await remoteRequest("operation_board_items?select=*&item_kind=eq.manual&order=board_date.asc");
      const setupRows = (items || []).filter((row) => row.metadata?.taskType === "next_setup" && row.metadata?.recordType !== "board_ai_change_log");
      const alertRows = (items || []).filter((row) => row.metadata?.recordType === "proactive_alert");
      state.alertAcknowledgements = { ...(state.alertAcknowledgements || {}) };
      state.proactiveAlerts = [];
      alertRows.forEach((row) => {
        const alert = row.metadata?.alert; const alertId = row.metadata?.alertId || alert?.id;
        if (!alertId) return;
        if (row.is_completed || row.metadata?.acknowledged) state.alertAcknowledgements[alertId] = true;
        else if (alert) state.proactiveAlerts.push({ ...alert, id: alertId, key: alertId, acknowledged: false });
      });
      const setupKeys = new Set(setupRows.map((row) => row.item_key));
      setupRows.forEach((row) => {
        state.completions[row.item_key] = !!row.is_completed;
        state.pins[row.item_key] = !!row.metadata?.pinned;
        if (row.metadata?.setupOverride) state.setupOverrides[row.item_key] = row.metadata.setupOverride;
        if (row.metadata?.reminderOverride != null) state.reminders[row.item_key] = String(row.metadata.reminderOverride);
        const setupOverride = row.metadata?.setupOverride || {};
        state.manual = [...state.manual.filter((item) => item.recordId !== row.id && item.key !== row.item_key), { key: row.item_key, id: row.item_key, recordId: row.id, kind: "manual", type: "next_setup", date: row.board_date, scheduledDate: row.metadata?.scheduledDate || setupOverride.scheduledDate || setupOverride.eventDate || row.board_date, scheduledTime: row.metadata?.scheduledTime || setupOverride.scheduledTime || setupOverride.time || String(row.item_time || "").slice(0, 5), time: String(row.item_time || "").slice(0, 5), venue: row.venue_name, spaceId: row.space_id || row.metadata?.spaceKey || `venue:${row.venue_name}`, eventOrderId: row.event_order_id || row.metadata?.eventOrderId || null, title: row.title, people: row.people ?? setupOverride.people ?? "", memo: row.memo || "", completed: !!row.is_completed, metadataSource: row.metadata?.source || "", metadata: row.metadata || {} }];
      });
      if (setupKeys.size) {
        const checklist = await remoteRequest("operation_board_checklist_items?select=*&order=sort_order.asc");
        state.checklist = [...state.checklist.filter((item) => !setupKeys.has(item.parentKey)), ...(checklist || []).filter((row) => setupKeys.has(row.parent_item_key)).map((row) => ({ id: row.id, parentKey: row.parent_item_key, date: row.board_date, name: row.item_name, quantity: row.quantity || "", unit: row.unit || "", memo: row.memo || "", completed: !!row.is_completed }))];
      }
      persistentSetupLoaded = true; saveState(); render();
    } catch (error) { console.info("지속 setup task 조회를 건너뜁니다.", error.message); }
    finally { persistentSetupLoading = false; }
  }
  function syncItem(item, options = {}) {
    const override = state.reminders[item.key]; const resolved = override == null || override === "default" ? defaultReminder : override;
    const setupOverride = state.setupOverrides[item.key] || null;
    const scheduledDate = setupOverride?.scheduledDate || item.scheduledDate || (item.type === "next_setup" ? setupOverride?.eventDate || item.next?.date || item.date : null);
    const scheduledTime = setupOverride?.scheduledTime || item.scheduledTime || (item.type === "next_setup" ? setupOverride?.time || item.next?.time || item.time : null);
    const payload = { board_date: item.date || dateKey(), item_key: item.key, item_kind: item.kind === "manual" ? "manual" : item.type === "next_setup" || item.type === "weekly_setup" ? "next_setup" : "auto", event_order_id: item.eventOrderId || null, space_id: /^[0-9a-f-]{36}$/i.test(item.spaceId || "") ? item.spaceId : null, item_time: /^\d\d:\d\d$/.test(scheduledTime || item.time || "") ? scheduledTime || item.time : null, venue_name: item.venue || "", title: item.title || "", people: Number(item.people) || null, memo: item.memo || "", is_completed: !!item.completed, metadata: { source: item.kind === "manual" ? "manual_board_task" : item.metadataSource || "operation_board", ...(item.metadata || {}), boardDate: item.date || dateKey(), scheduledDate, scheduledTime, venue: item.venue || "", eventOrderId: item.eventOrderId || null, createdAt: item.createdAt || new Date().toISOString(), spaceKey: item.spaceId, plannedDate: item.plannedDate || null, taskType: item.type, pinned: !!state.pins[item.key], setupOverride, reminderOverride: override ?? "default", reminderEnabled: resolved !== "none" && !item.completed, reminderOffsetMinutes: resolved === "none" ? null : Number(resolved) } };
    const path = item.recordId ? `operation_board_items?id=eq.${encodeURIComponent(item.recordId)}` : "operation_board_items?on_conflict=board_date,item_key";
    const requestOptions = item.recordId ? { method: "PATCH", body: JSON.stringify(payload) } : { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(payload) };
    const pending = remoteRequest(path, requestOptions);
    return options.throwOnError ? pending : pending.catch((error) => console.error("운영보드 저장 실패", error));
  }
  function syncChecklist(item, removed = false, options = {}) {
    if (removed) { remoteRequest(`operation_board_checklist_items?id=eq.${item.id}`, { method: "DELETE" }).catch(console.error); return; }
    const pending = remoteRequest("operation_board_checklist_items?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: item.id, board_date: item.date || selectedDate, parent_item_key: item.parentKey, item_name: item.name, quantity: Number(item.quantity) || null, unit: item.unit || null, memo: item.memo || "", is_completed: !!item.completed }) });
    return options.throwOnError ? pending : pending.catch(console.error);
  }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function allBlocks(boardDate = selectedDate, events = currentEvents) {
    const persistent = state.manual.filter((item) => (item.date === boardDate || item.type === "next_setup") && !String(item.key || "").startsWith("board-asset-ai:") && item.metadataSource !== "board_asset_ai").map(applySetupOverride);
    const automatic = buildAutoBlocks(events, boardDate).map(applySetupOverride);
    const setups = coreRules().dedupeSetupCandidates([...persistent.filter((item) => item.type === "next_setup"), ...automatic.filter((item) => item.type === "next_setup")]);
    return [...automatic.filter((item) => item.type !== "next_setup"), ...persistent.filter((item) => item.type !== "next_setup"), ...setups].sort((a, b) => String(a.scheduledTime || a.time).localeCompare(String(b.scheduledTime || b.time)) || a.venue.localeCompare(b.venue, "ko"));
  }
  function applySetupOverride(item) {
    const value = state.setupOverrides[item.key]; if (!value) return item;
    const linkedNext = value.eventOrderId ? { ...(item.next || {}), eventOrderId: value.eventOrderId, eventDate: value.eventDate || item.next?.eventDate || item.next?.date, name: value.eventTitle || item.next?.name, subtitle: value.eventSubtitle || item.next?.subtitle, people: value.people || item.next?.people } : item.next;
    return { ...item, scheduledDate: value.scheduledDate || item.scheduledDate || value.eventDate || item.next?.date, scheduledTime: value.scheduledTime || item.scheduledTime || value.time || item.next?.time || item.time, venue: value.venue || item.venue, time: value.scheduledTime || value.time || item.time, title: value.title || item.title, memo: value.memo ?? item.memo, eventOrderId: value.eventOrderId || item.eventOrderId, next: linkedNext };
  }
  function agendaBlocks(blocks) { return (blocks || []).filter((block) => block.kind === "auto" || block.kind === "manual"); }
  function isOverdue(block, boardDate = selectedDate, now = new Date()) {
    if (boardDate !== dateKey(now) || block.completed || !/^\d\d:\d\d$/.test(block.time || "")) return false;
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return block.time < currentTime;
  }
  function isSetupOverdue(item, referenceDate = selectedDate, now = new Date()) {
    const scheduledDate = setupScheduledDate(item); if (coreRules().getSetupTimingStatus({ scheduledDate, completed: item.completed }, referenceDate) === "overdue") return true;
    if (item.completed || !scheduledDate) return false;
    return scheduledDate === referenceDate && referenceDate === dateKey(now) && /^\d\d:\d\d$/.test(item.next?.time || item.time || "") && (item.next?.time || item.time) < `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
  function sortSetupTasks(tasks, referenceDate = selectedDate) {
    const rank = (item) => { const date = setupScheduledDate(item); return !date ? 3 : date < referenceDate ? 0 : date === referenceDate ? 1 : 2; };
    return [...(tasks || [])].sort((left, right) => rank(left) - rank(right) || (setupScheduledDate(left) || "9999-12-31").localeCompare(setupScheduledDate(right) || "9999-12-31") || String(left.next?.time || left.time || "").localeCompare(String(right.next?.time || right.time || "")));
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
    hydratePersistentSetupTasks();
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
      ${renderTodayExecutionBoard()}
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
  function getPinnedSetupStatus(task, today = seoulDateKey()) {
    return coreRules().getSetupTimingStatus({ scheduledDate: setupScheduledDate(task) || task?.plannedDate || task?.date || "", completed: task?.completed === true || state.completions[task?.key] === true }, today);
  }
  function pinnedSetupMatchKey(item) {
    return coreRules().getSetupTaskKey(item);
  }
  function dedupePinnedSetupTasks(tasks) {
    return coreRules().dedupeSetupCandidates(tasks);
  }
  function setupBoardTasks(blocks, boardDate = selectedDate, actualToday = seoulDateKey()) {
    const visible = (blocks || []).filter((item) => state.pins[item.key] && coreRules().getSetupTaskStatus({ scheduledDate: setupScheduledDate(item) || item?.plannedDate || item?.date || "", completed: item?.completed === true || state.completions[item?.key] === true }, { selectedDate: boardDate, actualToday }).visible);
    return sortSetupTasks(dedupePinnedSetupTasks(visible), boardDate);
  }
  function setupCardInfo(item) {
    const eventOrderId = item.next?.eventOrderId || item.eventOrderId;
    const event = currentEvents.find((entry) => String(entry.id) === String(eventOrderId));
    return {
      eventOrderId,
      title: event ? eventDisplayTitle(event) : item.next?.name || item.title || "행사",
      date: setupScheduledDate(item),
      time: item.scheduledTime || state.setupOverrides[item.key]?.scheduledTime || item.next?.time || item.time || "",
      venue: window.BANQUET_ERP_VENUE_UTILS?.formatVenueShort(item.venue) || item.venue,
      people: item.next?.people || item.people || event?.guestCount || "",
    };
  }
  function setupReadiness(item) { if (item.completed || state.completions[item.key]) return { value: "ready", label: "준비가능" }; const value = item.metadata?.readiness || (getPinnedSetupStatus(item) === "overdue" ? "blocked" : "needs_action"); return { value, label: { ready: "준비가능", needs_action: "작업필요", blocked: "확인필요" }[value] || "작업필요" }; }
  function renderSetupTaskBoard(blocks) {
    const tasks = setupBoardTasks(blocks, selectedDate, seoulDateKey());
    const card = (item) => {
      const info = setupCardInfo(item); const eventDate = info.date || state.setupOverrides[item.key]?.eventDate || "";
      const sourceBadge = item.metadataSource === "manual_setup_task" ? "수동" : "자동";
      const status = getPinnedSetupStatus(item); const readiness = setupReadiness(item); const overdueDays = status === "overdue" && eventDate ? Math.max(1, Math.round((new Date(`${seoulDateKey()}T12:00:00+09:00`) - new Date(`${eventDate}T12:00:00+09:00`)) / 86400000)) : 0;
      const metadata = [eventDate && eventDate.slice(5).replace("-", "/"), info.time, info.people && `${info.people}명`].filter(Boolean).join(" · ");
      return `<article class="setup-task-card" data-key="${escapeHtml(item.key)}" data-task-id="${escapeHtml(item.recordId || "")}"><div class="setup-task-main"><span class="setup-venue-badge">${escapeHtml(info.venue)}</span><div><strong>${escapeHtml(info.title)}</strong><small>${escapeHtml(metadata)}</small></div>${status === "overdue" ? `<span class="setup-overdue-badge">지연${overdueDays ? ` ${overdueDays}일` : ""}</span>` : ""}<span class="setup-readiness-badge ${readiness.value}">${readiness.label}</span><span class="setup-source-badge">${sourceBadge}</span></div><div class="setup-task-actions"><button type="button" data-setup-detail>상세 보기</button>${renderOriginalAction(info.eventOrderId)}<button type="button" data-setup-edit>수정</button><button type="button" data-setup-pin>고정 해제</button><button type="button" data-complete>완료</button></div></article>`;
    };
    return `<section class="setup-task-board"><div class="setup-task-heading"><h3>다음 세팅 / 고정 작업</h3><strong>${tasks.length}건</strong></div><div class="setup-task-list">${tasks.map((item) => card(item)).join("") || '<p>상단에 고정된 작업이 없습니다.</p>'}</div></section>`;
  }
  function renderSetupCandidates(blocks) {
    const active = sortSetupTasks(blocks.filter((item) => !item.completed));
    const completed = sortSetupTasks(blocks.filter((item) => item.completed));
    const completedRow = (item) => `<div class="completed-setup-row" data-key="${escapeHtml(item.key)}"><span><strong>${escapeHtml(window.BANQUET_ERP_VENUE_UTILS?.formatVenueShort(item.venue) || item.venue)}</strong> · ${escapeHtml(item.next?.name || item.title)}</span><button type="button" data-restore-complete>복원</button></div>`;
    return `<section class="next-setup-candidates"><div class="setup-task-heading"><h3>다음 세팅 후보</h3><strong>${active.length}건</strong></div><div class="next-setup-candidate-list">${active.map(renderBlock).join("") || '<p>예정된 다음 세팅이 없습니다.</p>'}</div><details class="setup-task-completed"><summary>완료된 세팅 보기 (${completed.length})</summary>${completed.map(completedRow).join("") || '<p>완료된 세팅이 없습니다.</p>'}</details></section>`;
  }
  function getTodayExecutionBoard(actualToday = seoulDateKey()) {
    const autopilot = window.BANQUET_ERP_OPERATIONS_AUTOPILOT; if (!autopilot?.buildTodayBoard) return { actualToday, tasks: [], exceptions: [], nextTask: null };
    const alerts = buildProactiveAlerts(currentEvents, actualToday).alerts; const priorityPlan = autopilot.buildPriorityPlan({ events: currentEvents, existingTasks: state.manual.filter((item) => item.type === "next_setup"), actualToday, proactiveAlerts: alerts });
    return autopilot.buildTodayBoard({ tasks: state.manual, checklist: state.checklist, priorityItems: priorityPlan.queue, events: currentEvents, actualToday });
  }
  function beverageExceptionDetail(item) { const shortages = Object.values(item.sourceMetadata?.comparison?.items || {}).filter((entry) => entry.shortage > 0); return shortages.map((entry) => `${escapeHtml(entry.label)} · 필요 ${escapeHtml(entry.required)} / 현재 ${escapeHtml(entry.stock)} · ${escapeHtml(entry.shortage)}${escapeHtml(entry.unit || "개")} 부족`).join("<br>") || escapeHtml(item.summary || "재고 부족"); }
  function renderTodayExecutionBoard(board = getTodayExecutionBoard()) {
    const autopilot = window.BANQUET_ERP_OPERATIONS_AUTOPILOT; const roleBoard = autopilot?.filterTodayBoardByRole?.(board, todayRoleFilter) || board; const user = currentUser(); const visibleBoard = autopilot?.filterTodayBoardByAssignee?.(roleBoard, todayAssigneeFilter, user?.id) || roleBoard;
    const roles = [["all", "전체"], ["setup", "세팅"], ["av", "AV"], ["beverage", "음주류"], ["service", "서비스"], ["check", "점검"]];
    const userOptions = (selected = "") => `<option value="">미지정</option>${assignableUsers().map((entry) => `<option value="${escapeHtml(entry.id)}" ${String(entry.id) === String(selected) ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")}`;
    const itemRow = (item) => `<label data-item-id="${escapeHtml(item.id)}"><input type="checkbox" data-check-item ${item.completed ? "checked" : ""}><span>${escapeHtml(item.name)}${item.quantity ? ` ${escapeHtml(item.quantity)}${escapeHtml(item.unit || "")}` : ""}</span><select data-assignee-select aria-label="${escapeHtml(item.name)} 담당자">${userOptions(item.assigneeUserId)}</select></label>`;
    const taskCard = (task) => { const items = task.visibleChecklist || task.checklist; const groups = autopilot?.groupChecklistByRole?.(items) || []; return `<article class="today-execution-card" data-key="${escapeHtml(task.key)}"><header><span>${task.timing === "overdue" ? `지연 ${task.overdueDays}일` : task.scheduledTime || task.eventStartTime || "시간 미정"}</span><strong>${escapeHtml(window.BANQUET_ERP_VENUE_UTILS?.formatVenueShort(task.venue) || task.venue)} · ${escapeHtml(task.organizer)}</strong><b>${escapeHtml(task.progressLabel)}</b></header><div class="today-execution-checklist">${groups.map((group) => `<section class="today-role-group"><strong>${escapeHtml(group.label)}</strong>${group.items.map(itemRow).join("")}</section>`).join("") || "<span>체크리스트 없음</span>"}</div><footer><button type="button" data-setup-detail>상세</button><button type="button" data-complete>완료</button></footer></article>`; };
    const exceptionCard = (item) => `<article class="today-exception-card" data-today-source-key="${escapeHtml(item.sourceKey || item.id)}"><header><span>확인필요</span><strong>${escapeHtml(item.venue || "재고")}</strong></header><p>${item.type === "beverage_shortage" ? beverageExceptionDetail(item) : escapeHtml(item.summary || item.reason || "확인이 필요합니다.")}</p><footer>${item.eventOrderId ? renderOriginalAction(item.eventOrderId) : ""}${item.itemKind === "alert" ? `<button type="button" data-today-alert-ack data-alert-id="${escapeHtml(item.alertId || "")}">확인</button>` : ""}</footer></article>`;
    const summary = Object.entries(board.roleCounts || {}).filter(([, count]) => count).map(([role, count]) => `${autopilot?.roleLabels?.[role] || role} ${count}`).join(" · "); const visibleCount = visibleBoard.tasks.flatMap((task) => task.visibleChecklist || task.checklist).filter((item) => !item.completed).length + visibleBoard.exceptions.length; const unassignedCount = board.tasks.flatMap((task) => task.checklist).filter((item) => !item.completed && !item.assigneeUserId).length;
    return `<section class="today-execution-board"><div class="today-execution-heading"><div><h3>오늘 할 일</h3>${summary ? `<small>${escapeHtml(summary)}</small>` : ""}${unassignedCount ? `<small class="today-unassigned-warning">미배정 작업 ${unassignedCount}건</small>` : ""}</div><strong>${visibleCount}개</strong></div><div class="today-role-filters">${roles.map(([role, label]) => `<button type="button" data-today-role="${role}" aria-pressed="${String(todayRoleFilter === role)}">${label}</button>`).join("")}</div><div class="today-assignee-filters"><button type="button" data-today-assignee="all" aria-pressed="${String(todayAssigneeFilter === "all")}">전체</button><button type="button" data-today-assignee="mine" aria-pressed="${String(todayAssigneeFilter === "mine")}">내 작업</button><button type="button" data-today-assignee="unassigned" aria-pressed="${String(todayAssigneeFilter === "unassigned")}">미배정</button></div><div class="today-execution-list">${visibleBoard.tasks.map(taskCard).join("") || "<p>오늘 남은 실행 작업이 없습니다.</p>"}</div>${visibleBoard.exceptions.length ? `<div class="today-exception-heading"><h4>확인 필요</h4><strong>${visibleBoard.exceptions.length}건</strong></div><div class="today-exception-list">${visibleBoard.exceptions.map(exceptionCard).join("")}</div>` : ""}</section>`;
  }
  function todayNextTaskAnswer(actualToday = seoulDateKey()) { return window.BANQUET_ERP_OPERATIONS_AUTOPILOT?.todayBoardAnswer(getTodayExecutionBoard(actualToday)) || "오늘 남은 실행 작업이 없습니다."; }
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
    const setupInfo = block.type === "next_setup" ? setupCardInfo(block) : null;
    const readiness = block.type === "next_setup" ? setupReadiness(block) : null;
    const setupMetadata = setupInfo ? [setupInfo.date && setupInfo.date.slice(5).replace("-", "/"), setupInfo.time, setupInfo.venue, setupInfo.people && `${setupInfo.people}명`].filter(Boolean).join(" · ") : "";
    const mobileNextSummary = block.next ? `<div class="next-setup-mobile-summary"><strong>${escapeHtml(setupInfo.title)}</strong><small>${escapeHtml(setupMetadata)}</small></div>` : "";
    const reminderValue = state.reminders[block.key] ?? "default";
    const linkedEvent = currentEvents.find((item) => String(item.id) === String(block.eventOrderId));
    const fieldNoteCount = (linkedEvent?.notes || []).filter((note) => window.BANQUET_ERP_EVENT_ATTACHMENTS?.isFieldNote(note)).length;
    const reminderUnavailable = !/^\d\d:\d\d$/.test(block.time || "") ? '<span class="operation-reminder-unavailable">시간 미정 · 알림 예약 불가</span>' : "";
    const setupActions = `<div class="operation-block-actions">${block.type === "next_setup" ? '<button type="button" data-next-detail-toggle aria-expanded="false">상세 보기</button>' : ""}${block.eventOrderId ? `<button type="button" data-event-attachments data-event-order-id="${escapeHtml(block.eventOrderId)}">첨부자료</button><button type="button" data-field-notes data-event-order-id="${escapeHtml(block.eventOrderId)}">특이사항${fieldNoteCount ? ` ${fieldNoteCount}건` : ""}</button>` : ""}${block.type === "next_setup" ? '<button type="button" data-setup-edit>수정</button>' : block.kind === "manual" ? '<button type="button" data-edit>수정</button><button type="button" data-delete>삭제</button>' : ""}<button type="button" data-setup-pin>${state.pins[block.key] ? "고정 해제" : "상단 고정"}</button></div>`;
    return `<article class="operation-block ${block.completed ? "completed" : ""}" style="--space-color:${colorForSpace(block.spaceId)}" data-key="${escapeHtml(block.key)}" data-detail-key="${escapeHtml(block.key)}" tabindex="0"><label class="operation-check"><input type="checkbox" data-complete ${block.completed ? "checked" : ""}><span class="operation-check-mark"></span><span class="operation-mobile-only">완료</span></label><div class="operation-block-body"><div class="operation-block-mobile-header"><time>${escapeHtml(block.time)}</time><strong>${escapeHtml(block.venue)}</strong><span>${escapeHtml(typeLabel)}</span></div><div class="operation-block-meta"><strong>${escapeHtml(block.venue)}</strong><span>${escapeHtml(typeLabel)}</span>${block.type === "next_setup" && isSetupOverdue(block) ? '<span class="setup-overdue-badge">지연</span>' : ""}${readiness ? `<span class="setup-readiness-badge ${readiness.value}">${readiness.label}</span>` : ""}${setupInfo?.people ? `<span>${escapeHtml(setupInfo.people)}명</span>` : block.people ? `<span>${escapeHtml(block.people)}명</span>` : ""}${block.needsScheduleReview ? "<span>세부 일정 확인 필요</span>" : ""}</div><h4>${escapeHtml(setupInfo?.title || block.title)}</h4>${setupInfo ? `<p class="setup-card-meta">${escapeHtml(setupMetadata)}</p>` : block.eventSubtitle && block.title === block.eventName ? `<p>${escapeHtml(block.eventSubtitle)}</p>` : ""}<div class="operation-block-mobile-support">${!setupInfo && block.people ? `<span>${escapeHtml(block.people)}명</span>` : ""}${block.needsScheduleReview ? "<span>세부 일정 확인 필요</span>" : ""}${reminderUnavailable}</div>${!setupInfo && block.memo ? `<p>${escapeHtml(block.memo)}</p>` : ""}${mobileNextSummary}${block.next ? `<div class="next-setup-detail"><span>행사 종료: ${escapeHtml(block.eventName)}</span><span>다음 행사: ${escapeHtml(block.next.date)} · ${escapeHtml(block.next.name)} · ${escapeHtml(block.next.people || "-")}명</span>${block.next.subtitle ? `<span>${escapeHtml(block.next.subtitle)}</span>` : ""}<span>형태: ${escapeHtml(block.next.layoutType || "미지정")}</span><strong>${escapeHtml(block.next.recommendation)}</strong>${renderOriginalAction(block.next.eventOrderId)}</div>` : block.type === "next_setup" ? '<div class="next-setup-detail">같은 장소의 다음 행사가 없습니다.</div>' : ""}${block.type === "next_setup" ? `<div class="setup-checklist">${checklist.map((item) => `<div class="setup-item ${item.completed ? "completed" : ""}" data-item-id="${item.id}"><input type="checkbox" data-check-item ${item.completed ? "checked" : ""}><span>${escapeHtml(item.name)}${item.quantity ? ` ${escapeHtml(item.quantity)}${escapeHtml(item.unit || "")}` : ""}${item.memo ? ` · ${escapeHtml(item.memo)}` : ""}</span><button type="button" data-edit-item>수정</button><button type="button" data-delete-item>삭제</button></div>`).join("")}<button type="button" data-add-item>+ 세팅 항목</button></div>` : ""}</div><label class="operation-reminder">알림 ${reminderSelect(block.key, reminderValue)}</label><div class="operation-mobile-reminder"><button type="button" data-mobile-reminder-toggle aria-expanded="false">🔔 ${escapeHtml(reminderLabel(reminderValue))}</button><div class="operation-mobile-reminder-menu" hidden>${[["default","기본값"],["30","30분 전"],["60","1시간 전"],["none","없음"]].map(([value,label]) => `<button type="button" data-mobile-reminder-value="${value}">${label}</button>`).join("")}</div></div>${setupActions}</article>`;
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
  function assigneeOptions(selected = "") { return `<option value="">미지정</option>${assignableUsers().map((user) => `<option value="${escapeHtml(user.id)}" ${String(user.id) === String(selected) ? "selected" : ""}>${escapeHtml(user.label)}</option>`).join("")}`; }
  function openDetailDialog(block) {
    const dialog = root.querySelector("[data-operation-detail]");
    const event = currentEvents.find((item) => String(item.id) === String(block.eventOrderId));
    const eventName = event?.eventName || block.next?.name || block.eventName || block.title;
    const layoutText = [event?.layoutText, ...valueList(event?.layoutEqp)].map(normalize).filter(Boolean).join(" · ");
    const othersText = [event?.othersText, ...valueList(event?.others)].map(normalize).filter(Boolean).join(" · ");
    const autopilot = window.BANQUET_ERP_OPERATIONS_AUTOPILOT; const roleOptions = Object.entries(autopilot?.roleLabels || {}); const overrides = block.metadata?.checklistRoles || {}; const assignments = block.metadata?.checklistAssignees || {}; const checklist = state.checklist.filter((item) => item.parentKey === block.key); const itemRoles = checklist.map((item) => autopilot?.classifyChecklistRole?.(item, overrides) || "general");
    const bulkControls = [...new Set(itemRoles)].map((role) => `<label><span>${escapeHtml(autopilot?.roleLabels?.[role] || role)} 미배정 전체</span><select data-bulk-assignee-role="${role}">${assigneeOptions()}</select></label>`).join("");
    const roleEditor = block.type === "next_setup" ? `<section class="operation-detail-roles"><h4>체크리스트 담당</h4>${checklist.map((item, index) => { const role = itemRoles[index]; const assignment = assignments[item.id] || {}; const suggestion = !assignment.assigneeUserId ? autopilot?.suggestAssignee?.(role, { tasks: state.manual, checklist: state.checklist, users: assignableUsers(), actualToday: seoulDateKey() }) : null; return `<div class="operation-detail-assignment" data-item-id="${escapeHtml(item.id)}"><span>${escapeHtml(item.name)}</span><select data-checklist-role="${escapeHtml(item.id)}" aria-label="역할">${roleOptions.map(([value, label]) => `<option value="${value}" ${value === role ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select><select data-detail-assignee="${escapeHtml(item.id)}" aria-label="담당자">${assigneeOptions(assignment.assigneeUserId)}</select>${suggestion ? `<button type="button" data-assignee-suggestion="${escapeHtml(item.id)}" data-user-id="${escapeHtml(suggestion.assigneeUserId)}" data-user-name="${escapeHtml(suggestion.assigneeName)}">제안: ${escapeHtml(suggestion.assigneeName)} · ${escapeHtml(suggestion.reason)}</button>` : ""}</div>`; }).join("") || "<p>체크리스트가 없습니다.</p>"}${bulkControls ? `<div class="operation-detail-bulk"><strong>역할별 일괄 배정</strong>${bulkControls}</div>` : ""}</section>` : "";
    dialog.querySelector("[data-operation-detail-content]").innerHTML = `<div class="operation-detail-header"><h3>운영 일정 상세</h3><button type="button" data-detail-close aria-label="닫기">×</button></div><dl class="operation-detail-list"><div><dt>행사명</dt><dd>${escapeHtml(eventName || "-")}</dd></div><div><dt>시간</dt><dd>${escapeHtml(block.next?.time || block.time || "-")}</dd></div><div><dt>장소</dt><dd>${escapeHtml(block.venue || "-")}</dd></div><div><dt>인원</dt><dd>${escapeHtml(block.next?.people || block.people || event?.guestCount || "-")}</dd></div><div><dt>행사유형</dt><dd>${escapeHtml(event?.eventType || TYPES[block.type] || "-")}</dd></div><div><dt>LAY &amp; OUT</dt><dd>${escapeHtml(layoutText || "-")}</dd></div><div><dt>OTHERS</dt><dd>${escapeHtml(othersText || "-")}</dd></div><div><dt>식사/커피 정보</dt><dd>${escapeHtml(detailFoodText(event, block))}</dd></div></dl>${roleEditor}<div class="operation-detail-actions">${event?.storagePath ? '<button type="button" data-detail-original>원본 엑셀 보기</button>' : ""}${block.kind === "manual" ? '<button type="button" data-detail-edit>수정</button><button type="button" data-detail-delete>삭제</button>' : ""}</div>`;
    dialog.querySelector("[data-detail-close]").onclick = () => dialog.close();
    dialog.querySelector("[data-detail-original]")?.addEventListener("click", () => { dialog.close(); openEventOriginal(event.id); });
    dialog.querySelector("[data-detail-edit]")?.addEventListener("click", () => { dialog.close(); openDialog(state.manual.find((item) => item.key === block.key)); });
    dialog.querySelector("[data-detail-delete]")?.addEventListener("click", () => { dialog.close(); deleteManual(block.key); });
    dialog.querySelectorAll("[data-checklist-role]").forEach((select) => select.onchange = () => setChecklistRole(block.key, select.dataset.checklistRole, select.value, true));
    dialog.querySelectorAll("[data-detail-assignee]").forEach((select) => select.onchange = () => setChecklistAssignee(block.key, select.dataset.detailAssignee, select.value, "", true));
    dialog.querySelectorAll("[data-assignee-suggestion]").forEach((button) => button.onclick = () => setChecklistAssignee(block.key, button.dataset.assigneeSuggestion, button.dataset.userId, button.dataset.userName, true));
    dialog.querySelectorAll("[data-bulk-assignee-role]").forEach((select) => select.onchange = () => { if (select.value) setRoleAssignee(block.key, select.dataset.bulkAssigneeRole, select.value, true); });
    dialog.showModal();
  }
  function renderAfterAssignment(key, reopenDetail) { render(); if (reopenDetail) { const block = allBlocks(seoulDateKey(), currentEvents).find((entry) => entry.key === key); if (block) openDetailDialog(block); } }
  function setChecklistRole(key, itemId, role, reopenDetail = false) { const item = state.manual.find((entry) => entry.key === key); if (!item) return; item.metadata = { ...(item.metadata || {}), checklistRoles: { ...(item.metadata?.checklistRoles || {}), [itemId]: role } }; saveState(); syncItem(item); renderAfterAssignment(key, reopenDetail); }
  function setChecklistAssignee(key, itemId, userId, userName = "", reopenDetail = false) { const item = state.manual.find((entry) => entry.key === key); if (!item) return; const user = assignableUsers().find((entry) => String(entry.id) === String(userId)); const assignments = { ...(item.metadata?.checklistAssignees || {}) }; if (userId) assignments[itemId] = { assigneeUserId: userId, assigneeName: userName || user?.label || "" }; else delete assignments[itemId]; item.metadata = { ...(item.metadata || {}), checklistAssignees: assignments }; saveState(); syncItem(item); renderAfterAssignment(key, reopenDetail); }
  function setRoleAssignee(key, role, userId, reopenDetail = false) { const item = state.manual.find((entry) => entry.key === key); if (!item || !userId) return; const user = assignableUsers().find((entry) => String(entry.id) === String(userId)); const roles = item.metadata?.checklistRoles || {}; const assignments = { ...(item.metadata?.checklistAssignees || {}) }; state.checklist.filter((entry) => entry.parentKey === key && !assignments[entry.id] && window.BANQUET_ERP_OPERATIONS_AUTOPILOT?.classifyChecklistRole?.(entry, roles) === role).forEach((entry) => { assignments[entry.id] = { assigneeUserId: userId, assigneeName: user?.label || "" }; }); item.metadata = { ...(item.metadata || {}), checklistAssignees: assignments }; saveState(); syncItem(item); renderAfterAssignment(key, reopenDetail); }
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
    const item = ensurePersistentSetupBlock(allBlocks().find((block) => block.key === key) || allBlocks(seoulDateKey(), currentEvents).find((block) => block.key === key));
    saveState();
    if (item) syncItem(item);
    render();
  }
  function ensurePersistentSetupBlock(block) {
    if (!block || block.type !== "next_setup" || block.kind === "manual") return block;
    const existing = state.manual.find((item) => item.key === block.key);
    if (existing) return existing;
    const item = { ...block, kind: "manual", metadataSource: "daily_briefing", title: block.next?.name || block.title, memo: block.next ? setupDocumentSummary(currentEvents.find((event) => String(event.id) === String(block.next.eventOrderId))) : block.memo || "" };
    state.manual.push(item);
    return item;
  }
  function taskCompletionVerification(item) { const autopilot = window.BANQUET_ERP_OPERATIONS_AUTOPILOT; const assignments = item?.metadata?.checklistAssignees || {}; const checklist = state.checklist.filter((entry) => entry.parentKey === item?.key).map((entry) => ({ ...entry, ...(assignments[entry.id] || {}) })); const exceptions = [...buildProactiveAlerts(currentEvents, seoulDateKey()).alerts, ...(getTodayExecutionBoard().exceptions || [])]; return autopilot?.verifyTaskCompletion?.(item, checklist, exceptions) || { canComplete: true, blockers: [], completedCount: checklist.filter((entry) => entry.completed).length, totalCount: checklist.length, assigneesComplete: checklist.every((entry) => entry.assigneeUserId) }; }
  function openFinalVerificationDialog(item, verification, boardDate) { const dialog = root.querySelector("[data-operation-detail]"); const event = currentEvents.find((entry) => String(entry.id) === String(item.eventOrderId)); dialog.querySelector("[data-operation-detail-content]").innerHTML = `<div class="operation-detail-header"><h3>${verification.canComplete ? "완료 전 확인" : "완료할 수 없습니다"}</h3><button type="button" data-detail-close aria-label="닫기">×</button></div><div class="operation-final-verification"><strong>${escapeHtml(window.BANQUET_ERP_VENUE_UTILS?.formatVenueShort(item.venue) || item.venue)} · ${escapeHtml(eventDisplayTitle(event || item))}</strong><p>체크리스트 ${verification.completedCount}/${verification.totalCount} 완료</p><p>담당자 배정 ${verification.assigneesComplete ? "완료" : "미완료 항목 있음"}</p><p>BLOCKED ${verification.blockedCount ? "확인 필요" : "없음"}</p>${verification.blockers.length ? `<ul>${verification.blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join("")}</ul>` : ""}</div><div class="operation-detail-actions"><button type="button" data-detail-close>닫기</button>${verification.canComplete ? '<button type="button" data-final-complete>최종 완료</button>' : ""}</div>`; dialog.querySelectorAll("[data-detail-close]").forEach((button) => button.onclick = () => { dialog.close(); render(); }); dialog.querySelector("[data-final-complete]")?.addEventListener("click", () => { dialog.close(); completeBoardItem(item.key, true, boardDate, true); }); dialog.showModal(); }
  function completeBoardItem(key, completed, boardDate = selectedDate, verified = false) {
    const persistent = state.manual.find((item) => item.key === key);
    if (completed && persistent?.metadata?.source === "autopilot") { const verification = taskCompletionVerification(persistent); if (!verified || !verification.canComplete) { openFinalVerificationDialog(persistent, verification, boardDate); return; } const user = currentUser(); persistent.metadata = { ...(persistent.metadata || {}), completedBy: user?.id || null, completedByName: user?.label || "", completedAt: new Date().toISOString() }; }
    state.completions[key] = completed;
    let block = allBlocks(boardDate, currentEvents).find((item) => item.key === key); block = ensurePersistentSetupBlock(block); if (block) block.completed = completed;
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
    return coreRules().getActualTodaySeoul(now);
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
  function setupScheduledDate(item) { const override = state.setupOverrides[item?.key] || {}; return override.scheduledDate || item?.scheduledDate || item?.metadata?.scheduledDate || item?.metadata?.setupOverride?.scheduledDate || override.eventDate || item?.metadata?.setupOverride?.eventDate || item?.next?.date || ""; }
  function findLocalSetupDuplicate(eventOrderId, venue, eventDate, blocks = null) {
    if (!blocks) { const range = setupCandidateDateRange(); blocks = []; for (let day = range.start; day <= range.end; day = addDays(day, 1)) blocks.push(...allBlocks(day)); }
    return blocks.find((item) => item.type === "next_setup" && String(item.eventOrderId) === String(eventOrderId) && normalize(item.venue) === normalize(venue) && setupScheduledDate(item) === eventDate) || null;
  }
  async function findSetupDuplicate(eventOrderId, venue, eventDate) {
    const local = findLocalSetupDuplicate(eventOrderId, venue, eventDate); if (local) return { key: local.key, boardDate: local.date || seoulDateKey() };
    const rows = await remoteRequest(`operation_board_items?select=board_date,item_key,item_kind,event_order_id,venue_name,metadata&event_order_id=eq.${encodeURIComponent(eventOrderId)}&is_completed=eq.false`);
    const row = (rows || []).find((item) => item.metadata?.taskType === "next_setup" && normalize(item.venue_name) === normalize(venue) && (item.metadata?.scheduledDate || item.metadata?.setupOverride?.scheduledDate || item.metadata?.setupOverride?.eventDate) === eventDate);
    return row ? { key: row.item_key, boardDate: row.board_date } : null;
  }
  function createSetupTask() {
    const dialog = root.querySelector("[data-setup-editor]"); const key = `manual-setup:${crypto.randomUUID()}`; const boardDate = seoulDateKey(); let children = [];
    const childRows = () => children.map((item) => `<div class="setup-editor-child" data-item-id="${item.id}"><input type="checkbox" disabled aria-label="완료"><input data-new-child-name value="${escapeHtml(item.name)}" placeholder="세팅 항목"><input data-new-child-quantity value="${escapeHtml(item.quantity)}" placeholder="수량"><input data-new-child-unit value="${escapeHtml(item.unit)}" placeholder="단위"><button type="button" data-new-child-delete>삭제</button></div>`).join("");
    dialog.innerHTML = `<form method="dialog" data-setup-create-form><header><div><span class="eyebrow">Manual setup</span><h3>다음 세팅 추가</h3></div><button type="button" data-setup-editor-close aria-label="닫기">×</button></header><label class="setup-venue-picker">공간<input type="search" data-setup-venue-search placeholder="공간 검색 (예: 부, 카2, 컨A)" autocomplete="off"><select name="venue" required>${renderSetupVenueOptions("")}</select></label><label>연결 행사<select name="eventOrderId" required>${renderSetupEventOptions("", "")}</select></label><p class="setup-event-secondary" data-setup-event-secondary></p><div class="setup-editor-grid"><label>예정 날짜<input name="scheduledDate" type="date" required></label><label>예정 시간<input name="scheduledTime" type="time"></label></div><label>메모<textarea name="memo"></textarea></label><section class="setup-editor-items"><div><strong>하위 세팅 항목</strong><button type="button" data-editor-child-add>+ 세팅 항목</button></div><div data-editor-child-list></div></section><label class="setup-pin-option"><input name="pinned" type="checkbox" checked> 상단 고정</label><p class="setup-create-status" data-setup-create-status></p><footer><button type="button" data-setup-editor-close>취소</button><button type="submit" class="primary-button">저장</button></footer></form>`;
    const form = dialog.querySelector("form"); const eventSelect = form.elements.eventOrderId; const childList = form.querySelector("[data-editor-child-list]");
    const refreshEvent = (autoSelectVenue = false) => { const selected = currentEvents.find((event) => String(event.id) === eventSelect.value); const details = selected ? setupEventDetails(selected) : null; form.querySelector("[data-setup-event-secondary]").textContent = details?.subtitle || ""; if (details && !form.elements.scheduledDate.value) { form.elements.scheduledDate.value = details.eventDate; form.elements.scheduledTime.value = details.time; } if (autoSelectVenue && selected) { const codes = setupVenueCodes(selected); form.elements.venue.value = codes.length === 1 ? window.BANQUET_ERP_VENUE_UTILS.venueLabel(codes[0]) : ""; } };
    const renderChildren = () => { childList.innerHTML = childRows(); childList.querySelectorAll("[data-item-id]").forEach((row) => { const item = children.find((entry) => entry.id === row.dataset.itemId); row.querySelector("[data-new-child-name]").oninput = (event) => { item.name = event.target.value; }; row.querySelector("[data-new-child-quantity]").oninput = (event) => { item.quantity = event.target.value; }; row.querySelector("[data-new-child-unit]").oninput = (event) => { item.unit = event.target.value; }; row.querySelector("[data-new-child-delete]").onclick = () => { children = children.filter((entry) => entry.id !== item.id); renderChildren(); }; }); };
    form.elements.venue.onchange = () => { const selectedId = eventSelect.value; eventSelect.innerHTML = renderSetupEventOptions(form.elements.venue.value, selectedId); refreshEvent(); };
    eventSelect.onchange = () => refreshEvent(true);
    form.querySelector("[data-setup-venue-search]").oninput = (event) => { const selected = form.elements.venue.value; form.elements.venue.innerHTML = renderSetupVenueOptions(selected, event.target.value); };
    form.querySelector("[data-editor-child-add]").onclick = () => { children.push({ id: crypto.randomUUID(), parentKey: key, date: boardDate, name: "", quantity: "", unit: "", memo: "", completed: false }); renderChildren(); };
    form.querySelectorAll("[data-setup-editor-close]").forEach((button) => button.onclick = () => dialog.close());
    form.onsubmit = async (event) => {
      event.preventDefault(); const data = Object.fromEntries(new FormData(form)); const linkedEvent = currentEvents.find((entry) => String(entry.id) === String(data.eventOrderId)); if (!linkedEvent) return;
      const details = setupEventDetails(linkedEvent); const venue = data.venue; let duplicate;
      try { duplicate = await findSetupDuplicate(linkedEvent.id, venue, data.scheduledDate); }
      catch (error) { console.error("setup duplicate lookup failed", error); alert("기존 다음 세팅 작업을 확인하지 못했습니다. 다시 시도해주세요."); return; }
      if (duplicate) {
        const status = form.querySelector("[data-setup-create-status]"); status.innerHTML = `이미 다음 세팅 작업이 있습니다. <button type="button" data-open-existing-setup>기존 작업 열기</button>`;
        status.querySelector("[data-open-existing-setup]").onclick = async () => { dialog.close(); activeBoardTab = "setup"; selectDate(duplicate.boardDate); await hydrateRemote(duplicate.boardDate); render(); requestAnimationFrame(() => root.querySelector(`[data-key="${CSS.escape(duplicate.key)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })); };
        return;
      }
      const item = { key, id: key, kind: "manual", type: "next_setup", date: boardDate, scheduledDate: data.scheduledDate, scheduledTime: data.scheduledTime || "", time: data.scheduledTime || "", venue, spaceId: `venue:${venue.toLowerCase().replace(/\s+/g, "")}`, eventOrderId: linkedEvent.id, title: details.title || linkedEvent.eventName || "다음 세팅", memo: normalize(data.memo), completed: false, metadataSource: "manual_setup_task", metadata: { source: "manual_setup_task", recordType: "manual_next_setup" }, createdAt: new Date().toISOString() };
      state.manual.push(item); state.pins[key] = data.pinned === "on"; state.setupOverrides[key] = { venue, eventOrderId: linkedEvent.id, scheduledDate: data.scheduledDate, scheduledTime: item.scheduledTime, eventDate: details.eventDate || "", memo: item.memo, eventTitle: details.title || "", eventSubtitle: details.subtitle || "", people: details.people || "" };
      children = children.filter((child) => normalize(child.name)).map((child) => ({ ...child, name: normalize(child.name) })); state.checklist.push(...children); saveState();
      try { await syncItem(item, { throwOnError: true }); await Promise.all(children.map((child) => syncChecklist(child, false, { throwOnError: true }))); }
      catch (error) {
        console.error("manual setup task save failed", error); state.manual = state.manual.filter((entry) => entry.key !== key); state.checklist = state.checklist.filter((entry) => entry.parentKey !== key); delete state.pins[key]; delete state.setupOverrides[key]; saveState();
        await Promise.all([remoteRequest(`operation_board_items?board_date=eq.${boardDate}&item_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => null), ...children.map((child) => remoteRequest(`operation_board_checklist_items?id=eq.${child.id}`, { method: "DELETE" }).catch(() => null))]); alert("다음 세팅 작업을 저장하지 못했습니다. 다시 시도해주세요."); return;
      }
      dialog.close(); activeBoardTab = "setup"; selectDate(data.scheduledDate); render();
    };
    dialog.showModal();
  }
  function editSetupTask(item) {
    const dialog = root.querySelector("[data-setup-editor]");
    const initialVenue = window.BANQUET_ERP_VENUE_UTILS.venueLabel(item.venue);
    dialog.innerHTML = `<form method="dialog" data-setup-editor-form data-key="${escapeHtml(item.key)}"><header><div><span class="eyebrow">Pinned setup</span><h3>세팅 작업 수정</h3></div><button type="button" data-setup-editor-close aria-label="닫기">×</button></header><label class="setup-venue-picker">공간<input type="search" data-setup-venue-search placeholder="공간 검색 (예: 부, 카2, 컨A)" autocomplete="off"><select name="venue" required>${renderSetupVenueOptions(initialVenue)}</select></label><label>연결 행사<select name="eventOrderId">${renderSetupEventOptions(initialVenue, item.eventOrderId)}</select></label><p class="setup-event-secondary" data-setup-event-secondary></p><div class="setup-editor-grid"><label>예정 날짜<input name="scheduledDate" type="date" value="${escapeHtml(setupScheduledDate(item))}"></label><label>예정 시간<input name="scheduledTime" type="time" value="${escapeHtml(item.scheduledTime || state.setupOverrides[item.key]?.scheduledTime || item.next?.time || item.time || "")}"></label></div><label>메모<textarea name="memo">${escapeHtml(item.memo || "")}</textarea></label><section class="setup-editor-items"><div><strong>하위 세팅 항목</strong><button type="button" data-editor-child-add>+ 세팅 항목</button></div><div data-editor-child-list>${renderSetupEditorChildren(item.key)}</div></section><footer><button type="button" data-setup-editor-close>취소</button><button type="submit" class="primary-button">저장</button></footer></form>`;
    const form = dialog.querySelector("form"); const eventSelect = form.elements.eventOrderId;
    const refreshEvent = (autoSelectVenue = false) => { const selected = currentEvents.find((event) => String(event.id) === eventSelect.value); const details = selected ? setupEventDetails(selected) : null; form.querySelector("[data-setup-event-secondary]").textContent = details?.subtitle || ""; if (autoSelectVenue && selected) { const codes = setupVenueCodes(selected); form.elements.venue.value = codes.length === 1 ? window.BANQUET_ERP_VENUE_UTILS.venueLabel(codes[0]) : ""; } };
    const bindChildren = () => {
      form.querySelectorAll("[data-editor-child-name], [data-editor-child-quantity], [data-editor-child-unit], [data-editor-child-complete]").forEach((input) => input.onchange = () => { const row = input.closest("[data-item-id]"); const child = state.checklist.find((entry) => entry.id === row.dataset.itemId); if (!child) return; child.name = normalize(row.querySelector("[data-editor-child-name]").value) || "새 세팅 항목"; child.quantity = row.querySelector("[data-editor-child-quantity]").value; child.unit = row.querySelector("[data-editor-child-unit]").value; child.completed = row.querySelector("[data-editor-child-complete]").checked; saveState(); syncChecklist(child); });
      form.querySelectorAll("[data-editor-child-delete]").forEach((button) => button.onclick = () => { const id = button.closest("[data-item-id]").dataset.itemId; const child = state.checklist.find((entry) => entry.id === id); state.checklist = state.checklist.filter((entry) => entry.id !== id); if (child) syncChecklist(child, true); saveState(); form.querySelector("[data-editor-child-list]").innerHTML = renderSetupEditorChildren(item.key); bindChildren(); });
    };
    eventSelect.onchange = () => refreshEvent(true);
    form.querySelector("[data-setup-venue-search]").oninput = (event) => { const selected = form.elements.venue.value; form.elements.venue.innerHTML = renderSetupVenueOptions(selected, event.target.value); };
    form.elements.venue.onchange = () => { const selectedId = eventSelect.value; eventSelect.innerHTML = renderSetupEventOptions(form.elements.venue.value, selectedId); refreshEvent(); };
    form.querySelector("[data-editor-child-add]").onclick = () => { const child = { id: crypto.randomUUID(), parentKey: item.key, date: selectedDate, name: "새 세팅 항목", quantity: "", unit: "", memo: "", completed: false }; state.checklist.push(child); saveState(); syncChecklist(child); form.querySelector("[data-editor-child-list]").innerHTML = renderSetupEditorChildren(item.key); bindChildren(); };
    form.querySelectorAll("[data-setup-editor-close]").forEach((button) => button.onclick = () => dialog.close()); bindChildren(); refreshEvent();
    form.onsubmit = (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); const linkedEvent = currentEvents.find((entry) => String(entry.id) === String(data.eventOrderId)); const details = linkedEvent ? setupEventDetails(linkedEvent) : {}; updateSetupTask(item.key, { venue: data.venue, eventOrderId: data.eventOrderId, scheduledDate: data.scheduledDate, scheduledTime: data.scheduledTime, eventDate: details.eventDate || "", memo: normalize(data.memo), eventTitle: details.title || "", eventSubtitle: details.subtitle || "", people: details.people || "" }); dialog.close(); };
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
    root.querySelectorAll("[data-today-alert-ack]").forEach((button) => button.onclick = () => { const alertItem = buildProactiveAlerts(currentEvents, seoulDateKey()).alerts.find((item) => String(item.id) === String(button.dataset.alertId)); if (alertItem) acknowledgeProactiveAlert(alertItem, seoulDateKey()); render(); });
    root.querySelectorAll("[data-today-role]").forEach((button) => button.onclick = () => { todayRoleFilter = button.dataset.todayRole || "all"; render(); });
    root.querySelectorAll("[data-today-assignee]").forEach((button) => button.onclick = () => { todayAssigneeFilter = button.dataset.todayAssignee || "all"; render(); });
    root.querySelectorAll("[data-assignee-select]").forEach((select) => select.onchange = () => setChecklistAssignee(select.closest("[data-key]").dataset.key, select.closest("[data-item-id]").dataset.itemId, select.value));
    root.querySelector("[data-general-board-add]")?.addEventListener("click", () => openDialog());
    root.querySelector("[data-setup-create]")?.addEventListener("click", createSetupTask);
    root.querySelectorAll("[data-setup-detail]").forEach((button) => button.onclick = () => { const key = button.closest("[data-key]").dataset.key; const item = allBlocks(seoulDateKey(), currentEvents).find((block) => block.key === key); if (item) openDetailDialog(item); });
    root.querySelectorAll("[data-venue-task-add]").forEach((button) => button.onclick = () => openDialog(null, { eventOrderId: button.dataset.eventOrderId, venue: button.dataset.venue, spaceId: button.dataset.spaceId }));
    root.querySelector("[data-board-cancel]").onclick = () => closeDialog();
    root.querySelector("[data-board-date]").onchange = (event) => { selectDate(event.target.value); render(); };
    root.querySelectorAll("[data-board-date-step]").forEach((button) => button.onclick = () => { selectDate(addDays(selectedDate, Number(button.dataset.boardDateStep))); render(); });
    root.querySelector("[data-board-today]").onclick = () => { selectDate(seoulDateKey()); render(); };
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
    root.querySelectorAll("[data-complete]").forEach((control) => { const complete = () => completeBoardItem(control.closest("[data-key]").dataset.key, control.matches('input[type="checkbox"]') ? control.checked : true, selectedDate); if (control.matches('input[type="checkbox"]')) control.onchange = complete; else control.onclick = complete; });
    root.querySelectorAll("[data-restore-complete]").forEach((button) => button.onclick = () => completeBoardItem(button.closest("[data-key]").dataset.key, false));
    root.querySelectorAll("[data-edit]").forEach((button) => button.onclick = () => openDialog(state.manual.find((x) => x.key === button.closest("[data-key]").dataset.key)));
    root.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => deleteManual(button.closest("[data-key]").dataset.key));
    root.querySelectorAll("[data-setup-pin]").forEach((button) => button.onclick = () => { const key = button.closest("[data-key]").dataset.key; setSetupPin(key, !state.pins[key]); });
    root.querySelectorAll("[data-briefing-add]").forEach((button) => button.onclick = () => { const key = button.closest("[data-key]").dataset.key; const item = ensurePersistentSetupBlock(allBlocks(seoulDateKey(), currentEvents).find((block) => block.key === key)); if (item) { saveState(); syncItem(item); render(); } });
    root.querySelectorAll("[data-field-notes]").forEach((button) => button.onclick = () => { const event = currentEvents.find((item) => String(item.id) === String(button.dataset.eventOrderId)); window.BANQUET_ERP_EVENT_ATTACHMENTS?.openFieldNotes(button.dataset.eventOrderId, event?.eventName || event?.companyName || "행사"); });
    root.querySelectorAll("[data-event-attachments]").forEach((button) => button.onclick = () => { const event = currentEvents.find((item) => String(item.id) === String(button.dataset.eventOrderId)); window.BANQUET_ERP_EVENT_ATTACHMENTS?.openEventAttachments(button.dataset.eventOrderId, event?.eventName || event?.companyName || "행사"); });
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
  async function addSetupTasks(tasks = []) {
    const created = [];
    for (const task of tasks) {
      const duplicate = state.manual.find((item) => item.type === "next_setup" && !item.completed && String(item.eventOrderId || "") === String(task.eventOrderId || "") && coreRules().spacesOverlap(item.venue, task.venue));
      if (duplicate) { created.push({ task: duplicate, duplicate: true }); continue; }
      const key = task.key || task.id || `autopilot-setup:${crypto.randomUUID()}`; const date = task.scheduledDate || selectedDate;
      const item = { key, id: key, kind: "manual", type: "next_setup", date, scheduledDate: date, scheduledTime: task.scheduledTime || "", time: task.scheduledTime || "", venue: normalize(task.venue), spaceId: task.spaceId || `venue:${normalize(task.venue).toLowerCase().replace(/\s+/g, "")}`, eventOrderId: task.eventOrderId || null, title: normalize(task.title || task.organizer || task.eventName || "다음 세팅"), people: task.people || "", memo: normalize(task.memo || task.summary), completed: false, metadataSource: task.source || "autopilot", metadata: { ...(task.metadata || {}), source: task.source || "autopilot", recordType: "autopilot_next_setup" }, createdAt: new Date().toISOString() };
      const children = (task.checklist || []).filter((child) => normalize(child.name)).map((child) => ({ id: crypto.randomUUID(), parentKey: key, date, name: normalize(child.name), quantity: child.quantity || "", unit: child.unit || "", memo: child.evidence || child.memo || "", completed: false }));
      item.metadata.checklistRoles = Object.fromEntries(children.map((child) => [child.id, window.BANQUET_ERP_OPERATIONS_AUTOPILOT?.classifyChecklistRole?.(child) || "general"]));
      item.metadata.checklistAssignees = {}; item.metadata.checklistRequiresPhoto = Object.fromEntries(children.map((child) => [child.id, false]));
      state.manual.push(item); state.checklist.push(...children); state.pins[key] = false; saveState();
      try { await syncItem(item, { throwOnError: true }); await Promise.all(children.map((child) => syncChecklist(child, false, { throwOnError: true }))); created.push({ task: item, duplicate: false }); }
      catch (error) { state.manual = state.manual.filter((entry) => entry.key !== key); state.checklist = state.checklist.filter((entry) => entry.parentKey !== key); delete state.pins[key]; saveState(); throw error; }
    }
    render(); return created;
  }
  window.addEventListener?.("banquet:beverage-inventory-updated", () => { if (root) render({ events: currentEvents }); else window.dispatchEvent(new CustomEvent("banquet:operation-board-rendered")); });
  window.BANQUET_ERP_OPERATION_BOARD = { render, renderDashboardAgendaWidget, completeBoardItem, classifySchedule, normalizedScheduleRows, colorForSpace, physicalSpaceKeys, physicalSpaceKeysOverlap, spacesOverlap, resolveNextEventForVenue, inferLayoutType, getVenueGroup, spaceGroupFromKeys, spaceGroupForBlock, groupBlocksBySpace, formatEventSpaceSummary, formatEventSpaceDetails, buildAutoBlocks, buildDailyBriefing, buildProactiveAlerts, dailyBriefingConversation, dailyBriefingAction, activeDailyBriefingItem, dailyBriefingAnswer, correctBriefingNextEvent, setupDocumentSummary, proactiveAlertSummary, registerProactiveAlert, acknowledgeProactiveAlert, registerEventOrderChange, eventOrderChanges, registerAttachmentScheduleCandidates, buildWeeklySetupTasks, recommendLayout, isAssetAuditRow, allBlocks, agendaBlocks, setupBoardTasks, sortSetupTasks, isSetupOverdue, setupCandidateDateRange, setupEventDetails, setupEventCandidates, formatSetupCandidateLabel, setupVenueCodes, renderSetupVenueOptions, findLocalSetupDuplicate, isOverdue, reminderTriggerAt, setSetupPin, updateSetupTask, getActualTodaySeoul: seoulDateKey, getSelectedBoardDate: () => selectedDate, getSetupTimingStatus: (item, today) => coreRules().getSetupTimingStatus({ scheduledDate: setupScheduledDate(item), completed: item?.completed }, today), getSetupTaskKey: pinnedSetupMatchKey, dedupeSetupCandidates: dedupePinnedSetupTasks, getSetupTaskStatus: (item, dates) => coreRules().getSetupTaskStatus({ scheduledDate: setupScheduledDate(item), completed: item?.completed }, dates), isDailyBriefingReady: () => persistentSetupLoaded, normalizeVenue: (value) => coreRules().normalizeVenue(value), normalizeVenueSet: (value) => coreRules().normalizeVenueSet(value), venueMatchRank: (left, right) => coreRules().venueMatchRank(left, right), getSelectedDate: () => selectedDate, setSelectedDate(value) { selectDate(value); }, addFieldNote(note) { state.fieldNotes = [...state.fieldNotes.filter((x) => x.key !== note.key), note]; saveState(); render(); }, async addManualTasks(tasks) { for (const task of tasks) { const next = { key: task.key || `manual:${crypto.randomUUID()}`, id: task.key || `manual:${crypto.randomUUID()}`, kind: "manual", type: "manual", date: task.date || selectedDate, time: task.time || "", venue: normalize(task.venue), spaceId: task.spaceId || `venue:${normalize(task.venue).toLowerCase().replace(/\s+/g, "")}`, eventOrderId: task.eventOrderId || null, title: normalize(task.title), memo: normalize(task.memo), completed: false, metadataSource: task.metadata?.source || "manual_board_task", metadata: task.metadata || {}, createdAt: new Date().toISOString() }; next.id = next.key; state.manual.push(next); await syncItem(next); } saveState(); render(); }, _setEventsForTest(value) { currentEvents = value || []; }, _setStateForTest(value) { state = { completions: {}, plans: {}, reminders: {}, manual: [], checklist: [], fieldNotes: [], pins: {}, setupOverrides: {}, alertAcknowledgements: {}, proactiveAlerts: [], ...value }; activeBriefingCandidateKey = ""; activeBriefingOverride = null; } };
  window.BANQUET_ERP_OPERATION_BOARD.getPinnedSetupStatus = getPinnedSetupStatus;
  window.BANQUET_ERP_OPERATION_BOARD.dedupePinnedSetupTasks = dedupePinnedSetupTasks;
  window.BANQUET_ERP_OPERATION_BOARD.setupCardInfo = setupCardInfo;
  window.BANQUET_ERP_OPERATION_BOARD.setupReadiness = setupReadiness;
  window.BANQUET_ERP_OPERATION_BOARD.getTodayExecutionBoard = getTodayExecutionBoard;
  window.BANQUET_ERP_OPERATION_BOARD.todayNextTaskAnswer = todayNextTaskAnswer;
  window.BANQUET_ERP_OPERATION_BOARD.getAssignableUsers = assignableUsers;
  window.BANQUET_ERP_OPERATION_BOARD.getCurrentUser = currentUser;
  window.BANQUET_ERP_OPERATION_BOARD.addSetupTasks = addSetupTasks;
  window.BANQUET_ERP_OPERATION_BOARD.getPersistentSetupTasks = () => state.manual.filter((item) => item.type === "next_setup").map(applySetupOverride);
})();
