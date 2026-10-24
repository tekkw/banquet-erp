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
    const today = global.erpConversationAgent?.seoulTodayKey?.(now) || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); const currentYear = Number(today.slice(0, 4)); const currentMonth = Number(today.slice(5, 7)); const value = text(question);
    if (/오늘/.test(value)) return { startDate: today, endDate: today, label: today };
    if (/이번\s*주/.test(value)) { const day = new Date(`${today}T00:00:00Z`).getUTCDay(); const startDate = global.erpConversationAgent?.shiftDateKey?.(today, day === 0 ? -6 : 1 - day) || today; const endDate = global.erpConversationAgent?.shiftDateKey?.(startDate, 6) || startDate; return { startDate, endDate, label: `${startDate}~${endDate}` }; }
    const explicitDay = value.match(/(?:(20)?(\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/); if (explicitDay) { const year = explicitDay[2] ? Number(`${explicitDay[1] || "20"}${explicitDay[2]}`) : currentYear; const date = `${year}-${String(Number(explicitDay[3])).padStart(2, "0")}-${String(Number(explicitDay[4])).padStart(2, "0")}`; return { startDate: date, endDate: date, label: date }; }
    const explicit = value.match(/(?:(20)?(\d{2})\s*년\s*)?(\d{1,2})\s*월/); const year = explicit?.[2] ? Number(`${explicit[1] || "20"}${explicit[2]}`) : currentYear; const month = explicit ? Number(explicit[3]) : currentMonth;
    if (explicit || /이번\s*달/.test(value)) return { startDate: `${year}-${String(month).padStart(2, "0")}-01`, endDate: monthEnd(year, month), label: `${year}년 ${month}월` };
    return null;
  }
  function questionCategory(question) { const value = text(question); if (/예상\s*매출/.test(value)) return "EXPECTED_REVENUE"; if (/대관/.test(value)) return "RENTAL"; if (/조식/.test(value)) return "BREAKFAST_BUFFET"; if (/중식|런치/.test(value)) return "LUNCH_BUFFET"; if (/석식|디너/.test(value)) return "DINNER_BUFFET"; if (/뷔페|식사/.test(value)) return "BUFFET"; if (/객실|room/i.test(value)) return "ROOM"; if (/커피\s*브레이크/.test(value)) return "COFFEE_BREAK"; return ""; }
  function matchesQuestion(question, context = null) { return Boolean(questionCategory(question) || /이벤\s*오더.*금액|항목\s*매출\s*합계/.test(text(question)) || (context && /행사별|제일\s*(?:큰|많)|많은\s*순|단가|총액|합계|몇\s*(?:번|개)/.test(text(question)))); }
  function money(value) { return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`; }
  function organizerFromQuestion(question, events) { const compactQuestion = compact(question); const subject = compactQuestion.replace(/예상매출|대관료?|행사장대관료|디너뷔페|석식뷔페|조식뷔페|중식뷔페|런치뷔페|뷔페|객실|커피브레이크|얼마|단가|매출|총액|합계|알려줘|이벤오더|금액|몇명/g, ""); return latestEvents(events).map((event) => text(event.companyName || event.company_name || event.organizer)).filter(Boolean).sort((a, b) => b.length - a.length).find((name) => compactQuestion.includes(compact(name)) || (subject.length >= 2 && compact(name).includes(subject))) || ""; }
  function answerQuestion(question, events, previous = null, options = {}) {
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

  global.BANQUET_ERP_EVENT_ORDER_ANALYTICS = Object.freeze({ CATEGORY_LABELS, normalizeCategory, resolvePeriod, queryEventOrderItems, aggregateEventOrderItems, matchesQuestion, answerQuestion });
})(window);
