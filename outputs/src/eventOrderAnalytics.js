(function registerEventOrderAnalytics(global) {
  "use strict";

  const CATEGORY_LABELS = Object.freeze({ RENTAL: "대관료", DINNER_BUFFET: "석식", BREAKFAST_BUFFET: "조식", LUNCH_BUFFET: "중식", ROOM: "객실", COFFEE_BREAK: "커피브레이크", EXPECTED_REVENUE: "예상매출" });
  const BUFFET = new Set(["BREAKFAST_BUFFET", "LUNCH_BUFFET", "DINNER_BUFFET"]);
  function text(value) { return String(value ?? "").trim(); }
  function compact(value) { return text(value).toLowerCase().replace(/[\s/_-]+/g, ""); }
  function number(value) { const cleaned = String(value ?? "").replace(/[^\d.-]/g, ""); if (!cleaned) return null; const parsed = Number(cleaned); return Number.isFinite(parsed) ? parsed : null; }
  function normalizeCategory(value) {
    const key = compact(value);
    if (/예상매출|expectedrevenue/.test(key)) return "EXPECTED_REVENUE";
    if (/대관료|행사장대관료|^대관$|venuerental/.test(key)) return "RENTAL";
    if (/디너.*뷔페|석식.*뷔페|dinnerbuffet/.test(key)) return "DINNER_BUFFET";
    if (/조식.*뷔페|breakfastbuffet/.test(key)) return "BREAKFAST_BUFFET";
    if (/중식.*뷔페|런치.*뷔페|lunchbuffet/.test(key)) return "LUNCH_BUFFET";
    if (/커피브레이크|coffeebreak/.test(key)) return "COFFEE_BREAK";
    if (/^객실$|^room$|roomcharge/.test(key)) return "ROOM";
    return "OTHER";
  }
  function eventId(event) { return String(event.id || event.event_order_id || ""); }
  function eventStart(event) { return event.startDate || event.start_date || event.calendarDates?.slice().sort()[0] || text(event.eventDateTime || event.event_datetime).slice(0, 10); }
  function eventEnd(event) { return event.endDate || event.end_date || event.calendarDates?.slice().sort().pop() || eventStart(event); }
  function latestEvents(events) {
    const byId = new Map();
    (events || []).forEach((event) => { const id = eventId(event); if (!id) return; const previous = byId.get(id); const version = event.updatedAt || event.updated_at || event.createdAt || event.created_at || ""; const priorVersion = previous?.updatedAt || previous?.updated_at || previous?.createdAt || previous?.created_at || ""; if (!previous || version >= priorVersion) byId.set(id, event); });
    return [...byId.values()];
  }
  function normalizedRow(event, item, index) {
    const unitPrice = number(item.unitPrice ?? item.unit_price);
    const quantity = number(item.quantity);
    const storedAmount = number(item.amount);
    return { id: item.id || `${eventId(event)}:${index}`, eventOrderId: eventId(event), organizer: text(event.companyName || event.company_name || event.organizer), eventName: text(event.eventName || event.event_name), venue: text(event.venue), eventDate: eventStart(event), eventEndDate: eventEnd(event), itemName: text(item.itemName || item.item_name || item.name), category: normalizeCategory(item.itemName || item.item_name || item.name), unitPrice, quantity, amount: storedAmount ?? (unitPrice != null && quantity != null ? unitPrice * quantity : null), amountSource: storedAmount != null ? "amount" : unitPrice != null && quantity != null ? "calculated" : "missing", note: text(item.note || item.memo) };
  }
  function categoryMatches(rowCategory, category) { return !category || category === rowCategory || (category === "BUFFET" && BUFFET.has(rowCategory)) || (category === "F&B" && (BUFFET.has(rowCategory) || rowCategory === "COFFEE_BREAK")); }
  function queryEventOrderItems({ events = [], startDate = "", endDate = "", category = "", organizer = "", venue = "", minAmount = null, maxAmount = null } = {}) {
    return latestEvents(events).filter((event) => (!startDate || eventEnd(event) >= startDate) && (!endDate || eventStart(event) <= endDate) && (!organizer || compact(`${event.companyName || event.company_name || ""} ${event.eventName || event.event_name || ""}`).includes(compact(organizer))) && (!venue || compact(event.venue).includes(compact(venue)))).flatMap((event) => (event.items || event.event_items || []).map((item, index) => normalizedRow(event, item, index))).filter((row) => categoryMatches(row.category, category) && (minAmount == null || row.amount >= minAmount) && (maxAmount == null || row.amount <= maxAmount));
  }
  function metricValue(rows, metric) {
    const amounts = rows.map((row) => row.amount).filter((value) => value != null); const quantities = rows.map((row) => row.quantity).filter((value) => value != null); const prices = rows.map((row) => row.unitPrice).filter((value) => value != null);
    if (metric === "totalQuantity") return quantities.reduce((sum, value) => sum + value, 0);
    if (metric === "averageUnitPrice") return prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null;
    if (metric === "count") return rows.length;
    if (metric === "eventCount") return new Set(rows.map((row) => row.eventOrderId)).size;
    if (metric === "maxAmount") return amounts.length ? Math.max(...amounts) : null;
    if (metric === "minAmount") return amounts.length ? Math.min(...amounts) : null;
    return amounts.reduce((sum, value) => sum + value, 0);
  }
  function aggregateEventOrderItems({ rows, groupBy = "", metric = "totalAmount", ...query } = {}) {
    const source = rows || queryEventOrderItems(query); if (!groupBy) return { metric, value: metricValue(source, metric), rows: source };
    const groups = new Map(); source.forEach((row) => { const key = groupBy === "event" ? row.eventOrderId : groupBy === "category" ? row.category : row[groupBy] || ""; (groups.get(key) || groups.set(key, []).get(key)).push(row); });
    return { metric, value: metricValue(source, metric), rows: source, groups: [...groups.entries()].map(([key, groupRows]) => ({ key, label: groupBy === "category" ? CATEGORY_LABELS[key] || key : groupRows[0]?.organizer || groupRows[0]?.eventName || key, value: metricValue(groupRows, metric), rows: groupRows })).sort((left, right) => Number(right.value || 0) - Number(left.value || 0)) };
  }
  function monthEnd(year, month) { return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); }
  function resolvePeriod(question, now = new Date()) {
    const today = global.BANQUET_ERP_CORE_RULES?.getActualTodaySeoul?.(now) || global.erpConversationAgent?.seoulTodayKey?.(now) || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); const currentYear = Number(today.slice(0, 4)); const currentMonth = Number(today.slice(5, 7)); const value = text(question);
    if (/오늘/.test(value)) return { startDate: today, endDate: today, label: "오늘" };
    if (/모레/.test(value)) { const date = global.erpConversationAgent?.shiftDateKey?.(today, 2) || today; return { startDate: date, endDate: date, label: "모레" }; }
    if (/내일/.test(value)) { const date = global.erpConversationAgent?.shiftDateKey?.(today, 1) || today; return { startDate: date, endDate: date, label: "내일" }; }
    if (/다음\s*주/.test(value)) { const day = new Date(`${today}T00:00:00Z`).getUTCDay(); const currentStart = global.erpConversationAgent?.shiftDateKey?.(today, day === 0 ? -6 : 1 - day) || today; const startDate = global.erpConversationAgent?.shiftDateKey?.(currentStart, 7) || currentStart; const endDate = global.erpConversationAgent?.shiftDateKey?.(startDate, 6) || startDate; return { startDate, endDate, label: "다음 주" }; }
    if (/이번\s*주말/.test(value)) { const day = new Date(`${today}T00:00:00Z`).getUTCDay(); const monday = global.erpConversationAgent?.shiftDateKey?.(today, day === 0 ? -6 : 1 - day) || today; const startDate = global.erpConversationAgent?.shiftDateKey?.(monday, 5) || monday; const endDate = global.erpConversationAgent?.shiftDateKey?.(startDate, 1) || startDate; return { startDate, endDate, label: "이번 주말" }; }
    if (/이번\s*주/.test(value)) { const day = new Date(`${today}T00:00:00Z`).getUTCDay(); const startDate = global.erpConversationAgent?.shiftDateKey?.(today, day === 0 ? -6 : 1 - day) || today; const endDate = global.erpConversationAgent?.shiftDateKey?.(startDate, 6) || startDate; return { startDate, endDate, label: `${startDate}~${endDate}` }; }
    const explicitDay = value.match(/(?:(20)?(\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/); if (explicitDay) { const year = explicitDay[2] ? Number(`${explicitDay[1] || "20"}${explicitDay[2]}`) : currentYear; const date = `${year}-${String(Number(explicitDay[3])).padStart(2, "0")}-${String(Number(explicitDay[4])).padStart(2, "0")}`; return { startDate: date, endDate: date, label: date }; }
    const explicit = value.match(/(?:(20)?(\d{2})\s*년\s*)?(\d{1,2})\s*월/); const year = explicit?.[2] ? Number(`${explicit[1] || "20"}${explicit[2]}`) : currentYear; const month = explicit ? Number(explicit[3]) : currentMonth;
    if (explicit || /이번\s*달/.test(value)) return { startDate: `${year}-${String(month).padStart(2, "0")}-01`, endDate: monthEnd(year, month), label: `${year}년 ${month}월` };
    return null;
  }
  function eventDates(event) { return [...new Set([...(event.calendarDates || event.event_calendar_dates || []).map((row) => typeof row === "string" ? row : row.calendar_date || row.date), eventStart(event), eventEnd(event)].filter(Boolean))].sort(); }
  function eventInPeriod(event, period) { return !period || eventDates(event).some((date) => date >= period.startDate && date <= period.endDate) || (eventStart(event) <= period.endDate && eventEnd(event) >= period.startDate); }
  function eventVenue(event) { return text(event.venue || event.canonicalVenue || event.canonical_venue || (event.schedule || event.event_schedules || []).map((row) => row.venue || row.location).find(Boolean)); }
  function venueFilters(question) {
    const utils = global.BANQUET_ERP_VENUE_UTILS; const codes = utils?.normalizeVenueList?.(question) || [];
    if (codes.length) return codes;
    const matches = text(question).match(/(?:부라노(?:\s*(?:전체|ALL|[123]))?|카프리(?:\s*(?:전체|ALL|[123]))?|컨벤션(?:\s*(?:AB|A|B|C|전체))?|페스타|올리비아|피렌체|FOYER|포이어)/gi) || [];
    return [...new Set(matches.map((value) => value.replace(/\s+/g, "")))];
  }
  function venueMatches(event, venues) {
    if (!venues?.length) return true;
    const core = global.BANQUET_ERP_CORE_RULES; const values = [eventVenue(event), ...(event.schedule || event.event_schedules || []).map((row) => row.venue || row.location).filter(Boolean)];
    return venues.some((venue) => values.some((value) => core?.venueMatchRank ? core.venueMatchRank(value, venue) > 0 : compact(value).includes(compact(venue)) || compact(venue).includes(compact(value))));
  }
  const CONDITION_PATTERNS = Object.freeze({
    coffee_break: /커피\s*브레이크|커피\s*(?:나가|준비|행사)|커피(?=.*몇\s*번)|coffee\s*break/i,
    special_note: /특이\s*사항|주의\s*(?:사항|할\s*거)|신경\s*쓸|조심/i,
    setup_transition: /뒤집|세팅\s*(?:바꿔|변경|다른)|끝나고.*(?:변경|바꿔)|다음\s*행사.*세팅/i,
    reinform: /재\s*인폼|re-?inform|확인\s*필요/i,
    attachment: /첨부\s*(?:자료|파일)?|pdf\s*(?:붙|첨부)|별도\s*파일/i,
    equipment: /빔\s*프로젝터|프로젝터|무선\s*마이크|유선\s*마이크|등록\s*테이블|장비|equipment/i,
    dinner: /석식|저녁|디너|dinner/i,
    lunch: /중식|점심|런치|lunch/i,
    breakfast: /조식|아침|breakfast/i,
    buffet: /뷔페|buffet/i,
  });
  function detectedConditions(question) { return Object.entries(CONDITION_PATTERNS).filter(([, pattern]) => pattern.test(question)).map(([condition]) => condition); }
  function requestedFields(question, conditions) {
    const fields = ["organizer", "venue", "date"];
    if (/몇\s*명|인원/.test(question)) fields.push("guestCount");
    if (conditions.includes("special_note")) fields.push("specialNotes");
    if (conditions.includes("attachment")) fields.push("attachments");
    if (conditions.includes("equipment")) fields.push("items");
    if (conditions.some((value) => ["coffee_break", "dinner", "lunch", "breakfast", "buffet"].includes(value))) fields.push("schedule");
    return [...new Set(fields)];
  }
  function aggregationFromQuestion(question) { if (/제일\s*(?:큰|많)|가장\s*(?:큰|많)|최대/.test(question)) return "max"; if (/총\s*(?:몇\s*명|인원|수량)|합계|총액|매출|얼마/.test(question)) return "sum"; if (/몇\s*(?:개|건|번)|몇\s*행사/.test(question)) return "count"; return "list"; }
  function buildEventQueryPlan(question, previous = null, options = {}) {
    const value = text(question); const explicitPeriod = resolvePeriod(value, options.now); const explicitVenues = venueFilters(value); const explicitConditions = detectedConditions(value); const followUp = /그중|그\s*중|그거|몇\s*명이야|그중.*만/.test(value);
    const period = explicitPeriod || (followUp ? previous?.plan?.dateRange || previous?.period || null : null); const venues = explicitVenues.length ? explicitVenues : followUp ? previous?.plan?.venues || [] : [];
    const conditions = explicitConditions.length ? explicitConditions : followUp ? previous?.plan?.conditions || [] : [];
    const plan = { domain: "event", dateRange: period ? { start: period.startDate || period.start, end: period.endDate || period.end, label: period.label || "" } : null, venues, conditions, fields: requestedFields(value, conditions), aggregation: aggregationFromQuestion(value), sort: [{ field: "date", direction: "asc" }, { field: "time", direction: "asc" }], limit: null };
    return plan;
  }
  function sourceTextFor(event) {
    const schedules = event.schedule || event.event_schedules || []; const items = event.items || event.event_items || []; const notes = event.notes || event.event_notes || [];
    return [event.othersText, event.others_text, event.others, event.layoutText, event.layout_text, event.layoutEqp, event.layout_eqp, event.internalMemo, event.internal_memo, ...schedules.flatMap((row) => [row.content, row.schedule_type, row.type, row.venue, row.location]), ...items.flatMap((row) => [row.itemName, row.item_name, row.name, row.description, row.note, row.memo]), ...notes.flatMap((row) => [row.content, row.note, row.note_type])].map(text).filter(Boolean).join(" · ");
  }
  function eventSchedules(event) { return event.schedule || event.event_schedules || []; }
  function eventItems(event) { return event.items || event.event_items || []; }
  function eventNotes(event) { return event.notes || event.event_notes || []; }
  function conditionMatches(event, condition) {
    const source = sourceTextFor(event);
    if (condition === "coffee_break") return /커피\s*브레이크|coffee\s*break/i.test(source);
    if (condition === "special_note") return specialNotes(event).length > 0;
    if (condition === "reinform") return /재\s*인폼|re-?inform/i.test(source);
    if (condition === "attachment") return attachments(event).length > 0;
    if (condition === "equipment") return /빔\s*프로젝터|프로젝터|무선\s*마이크|유선\s*마이크|등록\s*테이블|장비|equipment/i.test(source);
    if (condition === "dinner") return /석식|저녁|디너|dinner/i.test(source);
    if (condition === "lunch") return /중식|점심|런치|lunch/i.test(source);
    if (condition === "breakfast") return /조식|아침|breakfast/i.test(source);
    if (condition === "buffet") return /뷔페|buffet/i.test(source);
    return true;
  }
  function specialNotes(event) {
    const explicit = eventNotes(event).filter((row) => /special|특이|주의|others?|layout_eqp|lay/i.test(row.note_type || "") || /특이|주의|요청|re-?inform|재\s*인폼/i.test(row.content || row.note || "")).map((row) => text(row.content || row.note));
    const layout = /특이|주의|요청|re-?inform|재\s*인폼/i.test(event.layoutText || event.layout_text || event.layoutEqp || event.layout_eqp || "") ? event.layoutText || event.layout_text || event.layoutEqp || event.layout_eqp : "";
    const approved = attachments(event).map((row) => row.approvedNote || row.approved_note || "");
    return [...new Set([...explicit, event.othersText || event.others_text || "", event.specialNotes || event.special_notes || "", layout, ...approved].map(text).filter(Boolean))];
  }
  function attachments(event) { return (event.attachments || event.approvedAttachments || event.approved_attachments || []).filter((row) => row && row.approved !== false && row.status !== "rejected"); }
  function scheduleFacts(event, conditions) {
    const patterns = conditions.map((condition) => CONDITION_PATTERNS[condition]).filter(Boolean); return eventSchedules(event).filter((row) => patterns.some((pattern) => pattern.test(`${row.content || ""} ${row.schedule_type || row.type || ""}`))).map((row) => ({ date: row.date || row.schedule_date || eventStart(event), time: row.time || row.schedule_time || "", content: text(row.content), venue: text(row.venue || row.location), people: number(row.people ?? row.guest_count) }));
  }
  function itemFacts(event, question) { const keywords = text(question).match(/빔\s*프로젝터|프로젝터|무선\s*마이크|유선\s*마이크|등록\s*테이블/gi) || []; return eventItems(event).filter((row) => !keywords.length || keywords.some((keyword) => compact(`${row.itemName || row.item_name || row.name || ""} ${row.description || ""}`).includes(compact(keyword)))).map((row) => ({ name: text(row.itemName || row.item_name || row.name), quantity: number(row.quantity), amount: number(row.amount) })); }
  function layoutFact(event) { return text(event.layoutText || event.layout_text || event.layoutEqp || event.layout_eqp || event.savedLayout?.layout_type || event.savedLayout?.layoutType); }
  function transitionRows(source, allEvents) {
    const core = global.BANQUET_ERP_CORE_RULES; const currentLayout = layoutFact(source); const endDate = eventEnd(source); const last = eventSchedules(source).slice().sort((a, b) => `${a.date || a.schedule_date || endDate}T${a.time || a.schedule_time || "23:59"}`.localeCompare(`${b.date || b.schedule_date || endDate}T${b.time || b.schedule_time || "23:59"}`)).pop(); const afterDateTime = `${last?.date || last?.schedule_date || endDate}T${last?.time || last?.schedule_time || "23:59"}`;
    const candidates = latestEvents(allEvents).filter((event) => eventId(event) !== eventId(source)).map((event) => { const date = eventStart(event); const time = eventSchedules(event).map((row) => row.time || row.schedule_time).filter(Boolean).sort()[0] || "00:00"; return { event, venue: eventVenue(event), date, time, dateTime: `${date}T${time}`, eventOrderId: eventId(event) }; });
    const next = core?.resolveNextEventForVenue?.({ venue: eventVenue(source), afterDateTime, candidates }); if (!next) return null; const nextEvent = next.event || next; const nextLayout = layoutFact(nextEvent); return { nextEvent, currentLayout, nextLayout, status: currentLayout && nextLayout ? (compact(currentLayout) === compact(nextLayout) ? "same" : "change") : "unknown" };
  }
  function executeEventQueryPlan(plan, events, question = "") {
    const base = latestEvents(events).filter((event) => eventInPeriod(event, plan.dateRange ? { startDate: plan.dateRange.start, endDate: plan.dateRange.end } : null) && venueMatches(event, plan.venues));
    return base.map((event) => { const transition = plan.conditions.includes("setup_transition") ? transitionRows(event, events) : null; return { id: eventId(event), eventOrderId: eventId(event), organizer: text(event.companyName || event.company_name || event.organizer), eventName: text(event.eventName || event.event_name), venue: eventVenue(event), date: eventStart(event), guestCount: number(event.guestCount ?? event.guest_count), schedules: scheduleFacts(event, plan.conditions), specialNotes: specialNotes(event), attachments: attachments(event), items: itemFacts(event, question), transition, source: event }; }).filter((row) => plan.conditions.every((condition) => condition === "setup_transition" ? row.transition?.status === "change" || row.transition?.status === "unknown" : conditionMatches(row.source, condition))).sort((left, right) => `${left.date}|${left.schedules[0]?.time || ""}|${left.venue}`.localeCompare(`${right.date}|${right.schedules[0]?.time || ""}|${right.venue}`, "ko"));
  }
  function naturalQueryMatches(question, previous) {
    if (questionCategory(question) && /(매출|단가|대관|예상\s*매출|금액)/.test(question)) return false;
    if (questionCategory(question) && /몇\s*명|수량/.test(question) && !resolvePeriod(question) && !venueFilters(question).length) return false;
    return Boolean(detectedConditions(question).length || venueFilters(question).length && /특이|주의|몇\s*명|식사|뷔페|커피|첨부|마이크|프로젝터|세팅|뒤집|재\s*인폼/i.test(question) || previous?.plan && /그중|몇\s*명이야/.test(question));
  }
  function koreanNumber(value) { return Number(value || 0).toLocaleString("ko-KR"); }
  function naturalAnswer(question, events, previous, options) {
    if (!naturalQueryMatches(question, previous)) return null; const plan = buildEventQueryPlan(question, previous, options); const results = executeEventQueryPlan(plan, events, question); const periodLabel = plan.dateRange?.label ? `${plan.dateRange.label} ` : ""; const sourceDomains = ["event_orders", "event_calendar_dates", "event_schedules", "event_items", "event_notes"];
    let answer = ""; let ttsText = "";
    if (!results.length) { answer = plan.conditions.includes("special_note") ? "현재 저장된 특이사항은 없습니다." : "현재 저장된 정보에서 조건에 맞는 행사를 찾지 못했습니다."; ttsText = answer; }
    else if (plan.conditions.includes("setup_transition") && results.every((row) => row.transition?.status === "unknown")) { answer = "세팅 변경 여부를 확인할 정보가 부족합니다."; ttsText = answer; }
    else if (plan.aggregation === "sum" && /몇\s*명|인원/.test(question)) { const total = results.reduce((sum, row) => sum + Number(row.schedules.find((item) => item.people != null)?.people ?? row.guestCount ?? 0), 0); answer = `${periodLabel}${results.length}개 행사 인원은 총 ${koreanNumber(total)}명입니다.`; ttsText = `${periodLabel}해당 행사 인원은 총 ${koreanNumber(total)}명이에요.`; }
    else if (/몇\s*명|인원/.test(question)) { const details = results.map((row) => `${row.venue || "장소 미등록"} · ${row.organizer || row.eventName || "주최 미등록"} · ${row.guestCount != null ? `${koreanNumber(row.guestCount)}명` : "인원 미등록"}`).join("\n"); answer = `${periodLabel}${details}`; ttsText = results.map((row) => `${row.venue}, ${row.organizer || row.eventName}, ${row.guestCount != null ? `${koreanNumber(row.guestCount)}명` : "인원 미등록"}`).join(". "); }
    else if (plan.aggregation === "sum" && plan.conditions.includes("equipment")) { const quantity = results.flatMap((row) => row.items).map((item) => item.quantity).filter((value) => value != null).reduce((sum, value) => sum + value, 0); answer = `명시된 장비 수량은 총 ${koreanNumber(quantity)}개입니다.`; ttsText = answer; }
    else if (plan.aggregation === "count") { const count = plan.conditions.includes("coffee_break") ? results.reduce((sum, row) => sum + row.schedules.length, 0) : results.length; answer = `${periodLabel}조건에 맞는 ${plan.conditions.includes("coffee_break") ? "일정" : "행사"}은 ${count}건입니다.`; ttsText = answer; }
    else if (plan.aggregation === "max" && plan.conditions.includes("equipment")) { const ranked = results.map((row) => ({ row, quantity: row.items.map((item) => item.quantity).filter((value) => value != null).reduce((sum, value) => sum + value, 0) })).sort((left, right) => right.quantity - left.quantity); const top = ranked[0]; answer = `${top.row.venue} ${top.row.organizer || top.row.eventName} 행사가 명시 수량 ${koreanNumber(top.quantity)}개로 가장 많습니다.`; ttsText = answer; }
    else { const details = results.map((row) => { const schedule = row.schedules[0]; const core = `${row.date} · ${row.venue || "장소 미등록"} · ${row.organizer || row.eventName || "주최 미등록"}`; if (plan.conditions.includes("special_note")) return `${core}\n${row.specialNotes.join(" · ")}`; if (plan.conditions.includes("setup_transition")) return row.transition?.status === "unknown" ? `${core}\n세팅 정보 부족` : `${core}\n${row.transition.currentLayout} → ${row.transition.nextLayout}`; if (plan.conditions.includes("attachment")) return `${core}\n첨부 ${row.attachments.length}건`; if (plan.conditions.includes("equipment")) return `${core}\n${row.items.map((item) => `${item.name}${item.quantity != null ? ` ${item.quantity}` : ""}`).join(" · ")}`; if (schedule) return `${core}${schedule.time ? ` · ${schedule.time}` : ""}\n${schedule.content}`; return `${core}${row.guestCount != null ? ` · ${row.guestCount}명` : ""}`; }).join("\n\n"); answer = `${periodLabel}조건에 맞는 행사는 ${results.length}건입니다.\n${details}`; ttsText = `${periodLabel}조건에 맞는 행사는 ${results.length}건이에요. ${results.slice(0, 4).map((row) => `${row.venue}, ${row.organizer || row.eventName}`).join(". ")}.`; }
    const context = { plan, resultIds: results.map((row) => row.id), results: results.map(({ source, ...row }) => row) }; return { text: answer, answer, ttsText, results: context.results, sourceDomains, contextUpdate: context, context };
  }
  function questionCategory(question) { const value = text(question); if (/예상\s*매출/.test(value)) return "EXPECTED_REVENUE"; if (/대관/.test(value)) return "RENTAL"; if (/조식/.test(value)) return "BREAKFAST_BUFFET"; if (/중식|런치/.test(value)) return "LUNCH_BUFFET"; if (/석식|디너/.test(value)) return "DINNER_BUFFET"; if (/뷔페|식사/.test(value)) return "BUFFET"; if (/객실|room/i.test(value)) return "ROOM"; if (/커피\s*브레이크/.test(value)) return "COFFEE_BREAK"; return ""; }
  function matchesQuestion(question, context = null) { return Boolean(questionCategory(question) || /이벤\s*오더.*금액|항목\s*매출\s*합계/.test(text(question)) || (context && /행사별|제일\s*(?:큰|많)|많은\s*순|단가|총액|합계|몇\s*(?:번|개)/.test(text(question)))); }
  function money(value) { return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`; }
  function organizerFromQuestion(question, events) { const compactQuestion = compact(question); const subject = compactQuestion.replace(/예상매출|대관료?|행사장대관료|디너뷔페|석식뷔페|조식뷔페|중식뷔페|런치뷔페|뷔페|객실|커피브레이크|얼마|단가|매출|총액|합계|알려줘|이벤오더|금액|몇명/g, ""); return latestEvents(events).map((event) => text(event.companyName || event.company_name || event.organizer)).filter(Boolean).sort((a, b) => b.length - a.length).find((name) => compactQuestion.includes(compact(name)) || (subject.length >= 2 && compact(name).includes(subject))) || ""; }
  function answerQuestion(question, events, previous = null, options = {}) {
    const natural = naturalAnswer(question, events, previous, options); if (natural) return natural;
    if (!matchesQuestion(question, previous)) return null;
    const period = resolvePeriod(question, options.now) || previous?.period || null; const category = questionCategory(question) || previous?.category || ""; const organizer = organizerFromQuestion(question, events) || (/그중|행사별|제일|같이|나눠/.test(question) ? previous?.organizer || "" : ""); let rows = queryEventOrderItems({ events, startDate: period?.startDate || "", endDate: period?.endDate || "", category, organizer }); if (!category) rows = rows.filter((row) => row.category !== "EXPECTED_REVENUE"); const context = { period, category, organizer, rows };
    if (!rows.length) return { text: `${period?.label ? `${period.label} ` : ""}현재 저장된 event_items에서는 ${CATEGORY_LABELS[category] || "해당 항목"}을 확인하지 못했습니다.\n출처: event_orders / event_items`, context };
    const label = CATEGORY_LABELS[category] || (category === "BUFFET" ? "뷔페" : "항목");
    if (/단가/.test(question)) { const prices = [...new Set(rows.map((row) => row.unitPrice).filter((value) => value != null))]; return { text: `${organizer ? `${organizer} ` : ""}${label} 단가는 ${prices.map(money).join(", ")}입니다.\n출처: event_orders / event_items`, context }; }
    if (/몇\s*명|수량/.test(question)) return { text: `${organizer ? `${organizer} ` : ""}${label} 수량은 ${metricValue(rows, "totalQuantity").toLocaleString("ko-KR")}입니다.\n출처: event_orders / event_items`, context };
    if (/몇\s*개\s*행사|행사\s*몇\s*개|몇\s*건/.test(question)) return { text: `${period?.label ? `${period.label} ` : ""}${label} 행사는 ${metricValue(rows, "eventCount")}건입니다.\n출처: event_orders / event_items`, context };
    if (/몇\s*번/.test(question)) return { text: `${period?.label ? `${period.label} ` : ""}${label} 항목은 ${rows.length}번입니다.\n출처: event_orders / event_items`, context };
    if (/이벤\s*오더.*금액/.test(question)) { const details = rows.map((row) => `${row.itemName || "품목명 미저장"}\n${row.unitPrice != null && row.quantity != null ? `${money(row.unitPrice)} × ${row.quantity.toLocaleString("ko-KR")}\n= ` : ""}${row.amount != null ? money(row.amount) : "금액 미저장"}`).join("\n\n"); return { text: `${organizer || period?.label || "선택한 행사"}\n\n${details}\n\n항목 매출 합계 ${money(metricValue(rows, "totalAmount"))}\n출처: event_orders / event_items`, context }; }
    const grouped = aggregateEventOrderItems({ rows, groupBy: /나눠|행사별|제일|높은|많은\s*순/.test(question) ? (/조식.*중식.*석식|나눠/.test(question) ? "category" : "event") : "", metric: "totalAmount" });
    if (grouped.groups) { const limit = Number(question.match(/(\d+)\s*개/)?.[1] || grouped.groups.length); const details = grouped.groups.slice(0, limit).map((group) => `- ${group.label} ${money(group.value)}`).join("\n"); return { text: `${period?.label ? `${period.label} ` : ""}${label} ${/제일|높은|많은\s*순/.test(question) ? "금액 순" : "내역"}입니다.\n${details}\n합계 ${money(grouped.value)}\n출처: event_orders / event_items`, context }; }
    return { text: `${period?.label ? `${period.label} ` : ""}${organizer ? `${organizer} ` : ""}${label} ${category === "EXPECTED_REVENUE" ? "합계" : /매출/.test(question) ? "매출" : "합계"}는 ${money(grouped.value)}입니다.\n총 ${metricValue(rows, "eventCount")}개 행사에서 확인됐습니다.\n출처: event_orders / event_items`, context };
  }

  global.BANQUET_ERP_EVENT_ORDER_ANALYTICS = Object.freeze({ CATEGORY_LABELS, normalizeCategory, resolvePeriod, buildEventQueryPlan, executeEventQueryPlan, queryEventOrderItems, aggregateEventOrderItems, matchesQuestion, answerQuestion });
})(window);
