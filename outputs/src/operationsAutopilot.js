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
  const PRIORITY_RANK = { high: 0, medium: 1, normal: 2 };
  function dayDistance(date, today) { if (!date || !today) return null; return Math.round((new Date(`${date}T12:00:00+09:00`) - new Date(`${today}T12:00:00+09:00`)) / DAY_MS); }
  function venueSortKey(value) { return Array.from(global.BANQUET_ERP_CORE_RULES?.normalizeVenueSet(value) || [normalize(value)]).join("+"); }
  function priorityForProposal(proposal, alerts, today) {
    const days = dayDistance(proposal.scheduledDate, today); const eventAlerts = alerts.filter((alert) => String(alert.eventOrderId || "") === String(proposal.eventOrderId || ""));
    if (proposal.assetWarnings.length) return "high";
    if (proposal.status === "needs_confirmation") return days != null && days <= 1 ? "high" : "medium";
    if (proposal.status === "needs_information") return days != null && days <= 1 ? "high" : "medium";
    if (eventAlerts.some((alert) => alert.type === "event_order_changed")) return days != null && days <= 1 ? "high" : "medium";
    if (eventAlerts.some((alert) => alert.priority === "high")) return "high";
    if (eventAlerts.some((alert) => alert.priority === "medium")) return "medium";
    return "normal";
  }
  function readinessForProposal(proposal) { return proposal.assetWarnings.length || ["needs_confirmation", "needs_information"].includes(proposal.status) ? "blocked" : "needs_action"; }
  function priorityLabel(priority) { return { high: "긴급", medium: "확인", normal: "예정" }[priority] || "예정"; }
  function readinessLabel(readiness) { return { ready: "준비가능", needs_action: "작업필요", blocked: "확인필요" }[readiness] || "작업필요"; }
  function queueSort(left, right) { return (PRIORITY_RANK[left.priority] ?? 9) - (PRIORITY_RANK[right.priority] ?? 9) || String(left.scheduledDate || "9999-12-31").localeCompare(String(right.scheduledDate || "9999-12-31")) || String(left.scheduledTime || "99:99").localeCompare(String(right.scheduledTime || "99:99")) || venueSortKey(left.venue).localeCompare(venueSortKey(right.venue), "ko"); }
  function buildProposals({ events = [], existingTasks = [], actualToday, proactiveAlerts = [], hallStates = [], assets = [] } = {}) {
    const today = actualToday || global.BANQUET_ERP_OPERATION_BOARD?.getActualTodaySeoul?.(); const end = addDays(today, 7); const proposals = [];
    events.filter((event) => { const date = eventDate(event); return date >= today && date <= end; }).forEach((event) => {
      const date = explicitSetupDate(event); const venue = normalize(event.venue || event.schedule?.find((row) => row.venue)?.venue); if (!venue) return;
      const duplicate = existingTasks.some((task) => String(task.eventOrderId || "") === String(event.id || "") && global.BANQUET_ERP_CORE_RULES?.spacesOverlap(task.venue, venue)); if (duplicate) return;
      const alreadySet = hallStates.some((state) => String(state.event_order_id || state.eventOrderId || "") === String(event.id || "") && global.BANQUET_ERP_CORE_RULES?.spacesOverlap(state.venue_name || state.venue, venue)); if (alreadySet) return;
      const reinform = proactiveAlerts.find((alert) => alert.type === "layout_reinform" && String(alert.eventOrderId) === String(event.id)); const checklist = extractChecklist(event); const summary = global.BANQUET_ERP_OPERATION_BOARD?.setupDocumentSummary?.(event) || "등록된 세팅 정보 없음";
      const proposal = { id: `autopilot:${setupKey(event, venue, date)}`, sourceKey: `setup:${event.id}:${venueSortKey(venue)}`, itemKind: "proposal", eventOrderId: event.id, organizer: normalize(event.companyName || event.organizer), eventName: normalize(event.eventName), venue, people: event.guestCount || "", scheduledDate: date, scheduledTime: explicitSetupTime(event), eventDate: eventDate(event), checklist, assetWarnings: assetWarnings(checklist, assets), summary, status: reinform ? "needs_confirmation" : checklist.length ? "proposal" : "needs_information", reason: reinform ? reinform.summary : checklist.length ? "이벤트오더의 명시된 세팅 항목" : "명시된 세팅 수량 또는 요청이 없습니다.", source: "autopilot", version: eventVersion(event), actions: reinform ? ["original"] : checklist.length ? ["approve", "exclude", "original"] : ["exclude", "original"] };
      proposal.priority = priorityForProposal(proposal, proactiveAlerts, today); proposal.readiness = readinessForProposal(proposal); proposal.priorityLabel = priorityLabel(proposal.priority); proposal.readinessLabel = readinessLabel(proposal.readiness); proposals.push(proposal);
    });
    return { actualToday: today, windowEnd: end, proposals: proposals.sort(queueSort), beverageAlert: proactiveAlerts.find((alert) => alert.type === "beverage_shortage") || null };
  }
  function buildPriorityPlan(options = {}) {
    const base = buildProposals(options); const events = options.events || []; const eventById = new Map(events.map((event) => [String(event.id), event])); const queue = [...base.proposals]; const covered = new Set();
    base.proposals.forEach((item) => { if (item.status === "needs_confirmation") covered.add(`layout_reinform:${item.eventOrderId}`); (options.proactiveAlerts || []).filter((alert) => String(alert.eventOrderId || "") === String(item.eventOrderId || "") && ["event_order_changed", "attachment_schedule_candidates"].includes(alert.type)).forEach((alert) => { covered.add(`${alert.type}:${alert.eventOrderId}`); item.reason = alert.summary || item.reason; }); });
    (options.proactiveAlerts || []).forEach((alert) => {
      const causeKey = `${alert.type}:${alert.eventOrderId || alert.sourceMetadata?.signature || alert.id}`; if (covered.has(causeKey) || alert.type === "next_setup") return;
      const event = eventById.get(String(alert.eventOrderId || "")); const scheduledDate = event ? explicitSetupDate(event) : ""; const days = dayDistance(scheduledDate, base.actualToday); let priority = alert.priority || "normal";
      if (alert.type === "overdue_setup" || alert.type === "beverage_shortage") priority = "high";
      if (alert.type === "layout_reinform") priority = days != null && days <= 1 ? "high" : "medium";
      if (alert.type === "event_order_changed") priority = days != null && days <= 1 ? "high" : "medium";
      const item = { id: `autopilot-alert:${alert.id}`, alertId: alert.id, type: alert.type, sourceKey: causeKey, sourceMetadata: alert.sourceMetadata || {}, itemKind: "alert", eventOrderId: alert.eventOrderId || null, organizer: normalize(event?.companyName || event?.organizer), eventName: normalize(event?.eventName), venue: alert.venue || event?.venue || "음주류", scheduledDate, scheduledTime: "", eventDate: event ? eventDate(event) : "", checklist: [], assetWarnings: [], summary: alert.summary || alert.title, reason: alert.summary || alert.title, status: "exception", priority, readiness: "blocked", priorityLabel: priorityLabel(priority), readinessLabel: readinessLabel("blocked"), actions: alert.actions || ["acknowledge"] };
      queue.push(item); covered.add(causeKey);
    });
    const deduped = [...new Map(queue.map((item) => [item.sourceKey, item])).values()].sort(queueSort); const counts = { ready: 0, needs_action: 0, blocked: 0 }; const countedEvents = new Set();
    deduped.filter((item) => item.eventOrderId).forEach((item) => { if (countedEvents.has(String(item.eventOrderId))) return; countedEvents.add(String(item.eventOrderId)); counts[item.readiness] += 1; });
    const windowEvents = events.filter((event) => { const date = eventDate(event); return date >= base.actualToday && date <= base.windowEnd; });
    windowEvents.forEach((event) => { if (countedEvents.has(String(event.id))) return; const ready = (options.existingTasks || []).some((task) => String(task.eventOrderId || "") === String(event.id || "")) || (options.hallStates || []).some((state) => String(state.event_order_id || state.eventOrderId || "") === String(event.id || "")); if (ready) { countedEvents.add(String(event.id)); counts.ready += 1; } });
    return { ...base, proposals: base.proposals, queue: deduped, counts, eventTotal: new Set(windowEvents.map((event) => String(event.id))).size, total: deduped.length, exceptionCount: deduped.filter((item) => item.priority === "high" || item.readiness === "blocked").length };
  }
  function registrableProposals(plan) { return (plan?.queue || plan?.proposals || []).filter((item) => item.itemKind === "proposal" && item.readiness !== "blocked" && item.checklist?.length); }
  function highestPriority(plan) { return (plan?.queue || plan?.proposals || [])[0] || null; }
  function matchesUrgentQuestion(text) { return /(제일\s*급한|가장\s*급한|뭐부터|오늘\s*꼭\s*확인|내일\s*준비\s*안\s*된)/i.test(normalize(text)); }
  function urgentAnswer(plan) { const item = highestPriority(plan); if (!item) return "지금 확인할 운영 예외가 없습니다."; return `가장 먼저 확인할 것은 ${item.venue || item.organizer || item.eventName}입니다.\n${item.reason || item.summary}`; }
  function eventStartTime(event = {}) { const row = (event.schedule || []).find((item) => /(시작|개회|입장|start)/i.test(normalize(item.content || item.title || item.name))); const value = row?.time || String(event.eventDateTime || "").slice(11, 16); const match = normalize(value).match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/); return match ? `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}` : ""; }
  function buildTodayBoard({ tasks = [], checklist = [], priorityItems = [], events = [], actualToday } = {}) {
    const today = actualToday || global.BANQUET_ERP_OPERATION_BOARD?.getActualTodaySeoul?.(); const eventById = new Map(events.map((event) => [String(event.id), event])); const taskRows = []; const exceptions = [];
    const persistent = global.BANQUET_ERP_CORE_RULES?.dedupeSetupCandidates(tasks.filter((task) => task.type === "next_setup" && (task.metadata?.source === "autopilot" || task.metadataSource === "autopilot"))) || tasks;
    persistent.forEach((task) => {
      const scheduledDate = task.scheduledDate || task.metadata?.scheduledDate || ""; const timing = global.BANQUET_ERP_CORE_RULES?.getSetupTimingStatus({ scheduledDate, completed: task.completed }, today) || "future"; if (task.completed || !["today", "overdue"].includes(timing)) return;
      const readiness = task.metadata?.readiness || "needs_action"; const event = eventById.get(String(task.eventOrderId || "")); const items = checklist.filter((item) => String(item.parentKey) === String(task.key || task.id)); const completedCount = items.filter((item) => item.completed).length;
      const row = { ...task, sourceKey: `task:${task.recordId || task.id || task.key}`, taskId: task.recordId || task.id || task.key, itemKind: "task", scheduledDate, scheduledTime: task.scheduledTime || task.metadata?.scheduledTime || task.time || "", eventStartTime: eventStartTime(event), organizer: normalize(event?.companyName || event?.organizer || task.title), venue: task.venue || task.metadata?.venue || event?.venue || "", priority: task.metadata?.priority || "normal", readiness, timing, overdueDays: timing === "overdue" ? Math.max(1, -dayDistance(scheduledDate, today)) : 0, checklist: items, completedCount, totalCount: items.length, progressLabel: items.length && completedCount === items.length ? "완료" : `${completedCount}/${items.length}`, canComplete: readiness !== "blocked" && (!items.length || completedCount === items.length) };
      if (readiness === "blocked") exceptions.push({ ...row, itemKind: "blocked_task", summary: task.memo || "확인이 필요한 세팅 작업입니다." }); else taskRows.push(row);
    });
    (priorityItems || []).filter((item) => item.itemKind === "alert" && (item.priority === "high" || item.readiness === "blocked")).forEach((item) => { const relevant = item.type === "beverage_shortage" || !item.scheduledDate || item.scheduledDate <= addDays(today, 1); if (relevant) exceptions.push(item); });
    const executionSort = (left, right) => Number(right.timing === "overdue") - Number(left.timing === "overdue") || (PRIORITY_RANK[left.priority] ?? 9) - (PRIORITY_RANK[right.priority] ?? 9) || String(left.scheduledTime || left.eventStartTime || "99:99").localeCompare(String(right.scheduledTime || right.eventStartTime || "99:99")) || venueSortKey(left.venue).localeCompare(venueSortKey(right.venue), "ko");
    const dedupedExceptions = [...new Map(exceptions.map((item) => [item.sourceKey || item.id, item])).values()].sort(executionSort);
    return { actualToday: today, tasks: taskRows.sort(executionSort), exceptions: dedupedExceptions, nextTask: taskRows.sort(executionSort)[0] || null };
  }
  function matchesTodayQuestion(text) { return /(오늘\s*(뭐부터|할\s*일)|지금\s*다음\s*작업|끝난\s*거\s*빼고|다음\s*작업\s*뭐)/i.test(normalize(text)); }
  function todayBoardAnswer(board) { const task = board?.nextTask; if (!task) return board?.exceptions?.[0] ? `먼저 확인할 것은 ${board.exceptions[0].venue || "운영 예외"}입니다.\n${board.exceptions[0].summary || board.exceptions[0].reason}` : "오늘 남은 실행 작업이 없습니다."; const remaining = task.checklist.filter((item) => !item.completed).map((item) => `${item.name}${item.quantity ? ` ${item.quantity}${item.unit || ""}` : ""}`).join(", "); return `다음 작업은 ${task.venue} ${task.organizer} 세팅입니다.${remaining ? `\n${remaining}가 남아 있습니다.` : ""}`; }
  function matchesCommand(text) { return /(준비할\s*거\s*정리|자동으로\s*다음\s*세팅|다음\s*세팅.*자동|운영\s*준비.*정리)/i.test(normalize(text)); }
  global.BANQUET_ERP_OPERATIONS_AUTOPILOT = Object.freeze({ addDays, eventDate, explicitSetupDate, explicitSetupTime, extractChecklist, assetWarnings, eventVersion, buildProposals, buildPriorityPlan, registrableProposals, highestPriority, matchesUrgentQuestion, urgentAnswer, buildTodayBoard, matchesTodayQuestion, todayBoardAnswer, priorityLabel, readinessLabel, matchesCommand });
})(window);
