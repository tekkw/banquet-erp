(function initializeSettingAdvisor(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BANQUET_ERP_SETTING_ADVISOR = api;
})(typeof window !== "undefined" ? window : globalThis, function createSettingAdvisor() {
  const pad = (value) => String(value).padStart(2, "0");
  const shiftDate = (key, days) => { const date = new Date(`${key}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  function anchorDate(text, selectedDate, today) {
    if (/오늘/.test(text)) return today;
    const match = String(text || "").match(/(?:(\d{4})\s*년\s*)?(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/);
    if (!match) return selectedDate;
    return `${match[1] || selectedDate.slice(0, 4)}-${pad(match[2] || selectedDate.slice(5, 7))}-${pad(match[3])}`;
  }
  function time(value) { const match = String(value || "").match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/); return match ? `${pad(match[1])}:${pad(match[2] || 0)}` : ""; }
  function rowDate(row, event) { const value = String(row?.date || ""); if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value; return event?.calendarDates?.length === 1 ? event.calendarDates[0] : event?.startDate || String(event?.eventDateTime || "").slice(0, 10); }
  function excluded(row, event) { return /firenze|피렌체|front|프론트|check\s*in|check\s*out|체크\s*인|체크\s*아웃/i.test(`${row?.venue || event?.venue || ""} ${row?.content || ""}`); }
  function schedulePoints(event) {
    return (event?.schedule || []).filter((row) => !excluded(row, event)).map((row) => {
      const date = rowDate(row, event); const start = time(row.time); const endMatch = String(row.time || "").match(/(?:~|～|-)\s*(\d{1,2})\s*[:시]\s*(\d{0,2})/); const end = endMatch ? `${pad(endMatch[1])}:${pad(endMatch[2] || 0)}` : start;
      return { row, date, start, end, venue: row.venue || event.venue || "", startAt: date && start ? new Date(`${date}T${start}:00+09:00`) : null, endAt: date && end ? new Date(`${date}T${end}:00+09:00`) : null };
    }).filter((point) => point.date && point.start && point.venue);
  }
  function buildCandidates(events, anchor, overlaps) {
    const limit = shiftDate(anchor, 30); const candidates = [];
    (events || []).forEach((currentEvent) => {
      const currentRows = schedulePoints(currentEvent).filter((point) => point.date === anchor);
      const byVenue = new Map(); currentRows.forEach((point) => { const item = byVenue.get(point.venue) || []; item.push(point); byVenue.set(point.venue, item); });
      byVenue.forEach((points, space) => {
        const currentEndPoint = points.slice().sort((a, b) => b.endAt - a.endAt)[0];
        const future = (events || []).filter((event) => event.id !== currentEvent.id).flatMap((event) => schedulePoints(event).map((point) => ({ event, point })))
          .filter(({ event, point }) => point.date >= anchor && point.date <= limit && overlaps(currentEvent, event, currentEndPoint.row, point.row) && point.startAt > currentEndPoint.endAt)
          .sort((a, b) => a.point.startAt - b.point.startAt)[0];
        if (!future) return;
        candidates.push({ space, anchorDate: anchor, currentEvent, nextEvent: future.event, currentEnd: currentEndPoint.end, nextStart: future.point.start, nextEnd: schedulePoints(future.event).filter((point) => point.date === future.point.date && point.venue === future.point.venue).sort((a, b) => b.endAt - a.endAt)[0]?.end || future.point.end, nextDate: future.point.date, gapHours: (future.point.startAt - currentEndPoint.endAt) / 3600000 });
      });
    });
    return candidates;
  }
  function layoutFacts(source = {}) {
    const text = [source.layout_name, source.layout_type, source.layoutText, source.layout_notes, ...(source.notes || []).map((row) => row.content), ...(source.items || []).map((row) => `${row.item_name || ""} ${row.quantity || ""}`)].filter(Boolean).join(" ");
    const type = /스쿨|school|class/i.test(text) ? "school" : /라운드|round|원형/i.test(text) ? "round" : /극장|theater/i.test(text) ? "theater" : /u\s*자|u[-_ ]?shape/i.test(text) ? "u_shape" : source.layout_type || "";
    const tableMatch = text.match(/(?:테이블\s*)?(\d+)\s*(?:t|테이블)|테이블\s*(\d+)/i); const seatMatch = text.match(/(\d+)\s*(?:석|명)/);
    return { layoutType: type, tables: source.table_count ?? (tableMatch ? Number(tableMatch[1] || tableMatch[2]) : null), seats: source.setup_capacity ?? source.seats ?? (seatMatch ? Number(seatMatch[1]) : null), sourceLayoutId: source.id || source.source_layout_id || null, text };
  }
  function compare(current, next) {
    if (!current?.layoutType || !next?.layoutType) return "unknown";
    if (current.layoutType !== next.layoutType) return "major_change";
    if (Number(current.seats) === Number(next.seats) && Number(current.tables) === Number(next.tables)) return "same";
    return "minor_change";
  }
  function recommendation(candidate, change) {
    if (change === "same") return "큰 변경 없음";
    if (change === "major_change") return "종료 후 바로 변경 권장";
    if (candidate.gapHours <= 12) return "종료 직후 세팅 권장";
    if (candidate.gapHours <= 18 || (/^\d\d:/.test(candidate.nextStart) && Number(candidate.nextStart.slice(0, 2)) < 12 && candidate.nextDate === shiftDate(candidate.anchorDate, 1))) return "오늘 종료 후 세팅 권장";
    return change === "minor_change" ? "부분 수정 · 다음날 준비 가능" : "다음날 준비 가능";
  }
  function taskSummary(current, next, change) {
    if (change === "major_change") return "레이아웃 타입 변경 필요";
    if (change === "unknown") return "등록된 데이터로 변경량을 확인하지 못했습니다.";
    const parts = []; if (current.tables != null && next.tables != null && next.tables !== current.tables) parts.push(`테이블 ${next.tables - current.tables > 0 ? "+" : ""}${next.tables - current.tables}T`); if (current.seats != null && next.seats != null && next.seats !== current.seats) parts.push(`의자 ${next.seats - current.seats > 0 ? "+" : ""}${next.seats - current.seats}`); return parts.join(" · ") || "추가 수량 변경 없음";
  }
  function prioritize(rows) { const rank = { major_change: 0, minor_change: 1, unknown: 2, same: 3 }; return rows.slice().sort((a, b) => `${a.nextDate}T${a.nextStart}`.localeCompare(`${b.nextDate}T${b.nextStart}`) || a.gapHours - b.gapHours || rank[a.change] - rank[b.change] || Number(b.nextLayout?.seats || b.nextEvent?.guestCount || 0) - Number(a.nextLayout?.seats || a.nextEvent?.guestCount || 0)); }
  function tableClaim(event, expected = null) { const facts = layoutFacts(event); if (facts.tables == null) return null; return expected == null || Number(expected) === Number(facts.tables) ? facts.tables : null; }
  return { anchorDate, schedulePoints, buildCandidates, layoutFacts, compare, recommendation, taskSummary, prioritize, tableClaim, shiftDate };
});
