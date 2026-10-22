(function registerOperationsAutopilot(global) {
  "use strict";
  const DAY_MS = 86400000;
  const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ");
  const values = (value) => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  function addDays(dateKey, amount) { const date = new Date(`${dateKey}T00:00:00+09:00`); return new Date(date.getTime() + amount * DAY_MS).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); }
  function eventDate(event) { return [event.startDate, event.eventDate, String(event.eventDateTime || "").slice(0, 10), ...(event.calendarDates || [])].find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")) || ""; }
  function sourceText(event) { return [event.savedLayout?.layout_name, event.savedLayout?.name, event.sourceLayout?.layout_name, event.sourceLayout?.name, event.layoutText, ...values(event.layoutEqp), event.othersText, ...values(event.others), event.internalMemo, ...(event.notes || []).map((row) => row.content), ...(event.items || []).map((row) => row.item_name || row.name || row.content || row.memo)].map(normalize).filter(Boolean).join(" · "); }
  function explicitSetupDate(event) { const row = (event.schedule || []).find((item) => /(세팅|setup|준비)/i.test(normalize(item.content || item.title || item.name || item.memo)) && /^\d{4}-\d{2}-\d{2}$/.test(item.date || "")); return row?.date || eventDate(event); }
  function explicitSetupTime(event) {
    for (const row of event.schedule || []) { const content = normalize(row.content || row.title || row.name || row.memo); if (!/(세팅|setup|준비)/i.test(content)) continue; const match = normalize(row.time || content).match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/); if (match) return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}`; }
    const match = sourceText(event).match(/(?:세팅|setup|준비)\s*(?:시간)?[^\d]{0,8}(\d{1,2})\s*[:시]\s*(\d{0,2})/i);
    return match ? `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}` : "";
  }
  function extractChecklist(event) {
    const text = sourceText(event); const result = [];
    const add = (name, quantity = "", unit = "", evidence = "") => { if (!result.some((item) => item.name === name)) result.push({ name, quantity, unit, evidence }); };
    [[/(?:class\s*type|클래스\s*타입|스쿨식)[^\d]{0,12}(\d+)\s*석?/i, "스쿨식 좌석", "석"], [/(?:등록\s*테이블|등록대|registration\s*table)[^\d]{0,10}(\d+)\s*(?:T|EA|개)?/i, "등록 테이블", "T"], [/(?:라운드|round)[^\d]{0,12}(\d+)\s*(T|석|개)?/i, "라운드 테이블", "T"], [/(?:무선\s*마이크)[^\d]{0,8}(\d+)\s*(?:EA|개)?/i, "무선 마이크", "EA"], [/(?:유선\s*마이크)[^\d]{0,8}(\d+)\s*(?:EA|개)?/i, "유선 마이크", "EA"], [/(?:스크린|screen)[^\d]{0,8}(\d+)\s*(?:EA|개)?/i, "스크린", "EA"], [/(?:빔\s*프로젝터|projector)[^\d]{0,8}(\d+)\s*(?:EA|개)?/i, "빔프로젝터", "EA"]].forEach(([pattern, name, unit]) => { const match = text.match(pattern); if (match) add(name, match[1], match[2] === "석" ? "석" : unit, match[0]); });
    [[/(?:무대|stage)/i, "무대"], [/(?:뷔페|buffet)/i, "뷔페"], [/(?:커피\s*브레이크|coffee\s*break)/i, "커피브레이크"]].forEach(([pattern, name]) => { const match = text.match(pattern); if (match) add(name, "", "", match[0]); });
    return result;
  }
  function eventVersion(event) { return JSON.stringify([event.id, event.updatedAt || event.updated_at || "", eventDate(event), event.venue, sourceText(event)]); }
  function setupKey(event, venue, date) { return global.BANQUET_ERP_CORE_RULES?.getSetupTaskKey({ eventOrderId: event.id, venue, scheduledDate: date }) || `${event.id}:${venue}:${date}`; }
  function assetWarnings(checklist, assets = []) { return checklist.filter((item) => Number(item.quantity) > 0).flatMap((item) => { const asset = assets.find((row) => normalize(row.asset_name || row.name).replace(/\s+/g, "").includes(item.name.replace(/\s+/g, ""))); return asset && Number(asset.quantity) < Number(item.quantity) ? [`${item.name} ${Number(item.quantity) - Number(asset.quantity)}${item.unit || "개"} 부족`] : []; }); }
  function buildProposals({ events = [], existingTasks = [], actualToday, proactiveAlerts = [], hallStates = [], assets = [] } = {}) {
    const today = actualToday || global.BANQUET_ERP_OPERATION_BOARD?.getActualTodaySeoul?.(); const end = addDays(today, 7); const proposals = [];
    events.filter((event) => { const date = eventDate(event); return date >= today && date <= end; }).forEach((event) => {
      const date = explicitSetupDate(event); const venue = normalize(event.venue || event.schedule?.find((row) => row.venue)?.venue); if (!venue) return;
      const duplicate = existingTasks.some((task) => String(task.eventOrderId || "") === String(event.id || "") && global.BANQUET_ERP_CORE_RULES?.spacesOverlap(task.venue, venue)); if (duplicate) return;
      const alreadySet = hallStates.some((state) => String(state.event_order_id || state.eventOrderId || "") === String(event.id || "") && global.BANQUET_ERP_CORE_RULES?.spacesOverlap(state.venue_name || state.venue, venue)); if (alreadySet) return;
      const reinform = proactiveAlerts.find((alert) => alert.type === "layout_reinform" && String(alert.eventOrderId) === String(event.id)); const checklist = extractChecklist(event); const summary = global.BANQUET_ERP_OPERATION_BOARD?.setupDocumentSummary?.(event) || "등록된 세팅 정보 없음";
      proposals.push({ id: `autopilot:${setupKey(event, venue, date)}`, eventOrderId: event.id, organizer: normalize(event.companyName || event.organizer), eventName: normalize(event.eventName), venue, people: event.guestCount || "", scheduledDate: date, scheduledTime: explicitSetupTime(event), eventDate: eventDate(event), checklist, assetWarnings: assetWarnings(checklist, assets), summary, status: reinform ? "needs_confirmation" : checklist.length ? "proposal" : "needs_information", reason: reinform ? reinform.summary : checklist.length ? "이벤트오더의 명시된 세팅 항목" : "명시된 세팅 수량 또는 요청이 없습니다.", source: "autopilot", version: eventVersion(event), actions: reinform ? ["original"] : checklist.length ? ["approve", "exclude", "original"] : ["exclude", "original"] });
    });
    return { actualToday: today, windowEnd: end, proposals, beverageAlert: proactiveAlerts.find((alert) => alert.type === "beverage_shortage") || null };
  }
  function matchesCommand(text) { return /(준비할\s*거\s*정리|자동으로\s*다음\s*세팅|다음\s*세팅.*자동|운영\s*준비.*정리)/i.test(normalize(text)); }
  global.BANQUET_ERP_OPERATIONS_AUTOPILOT = Object.freeze({ addDays, eventDate, explicitSetupDate, explicitSetupTime, extractChecklist, assetWarnings, eventVersion, buildProposals, matchesCommand });
})(window);
