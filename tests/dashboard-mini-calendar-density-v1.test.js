const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const window = {};
const context = { window, document: { readyState: "loading", addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} }, Intl, Date, Map, Set, JSON };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8"), context);
const widgets = window.BANQUET_ERP_DASHBOARD_WIDGETS;
const event = (id, dates, color = "blue") => ({ id, companyName: `주최 ${id}`, eventName: `행사 ${id}`, venue: "컨벤션AB", guestCount: 10, calendarDates: dates, color, schedule: [{ date: dates[0], time: "10:00", content: "세미나" }, { date: dates[0], time: "18:00", content: "석식" }] });

let summary = widgets.miniCalendarDayBars([event("one", ["2026-10-28"])], "2026-10-28");
assert.strictEqual(summary.bars[0].position, "single", "A. 하루 행사는 단일 rounded bar다");

const twoDays = event("two", ["2026-10-28", "2026-10-29"]);
assert.strictEqual(widgets.miniCalendarDayBars([twoDays], "2026-10-28").bars[0].position, "start", "B. 2일 행사의 첫 칸이 연결 시작이다");
assert.strictEqual(widgets.miniCalendarDayBars([twoDays], "2026-10-29").bars[0].position, "end", "B. 2일 행사의 마지막 칸이 연결 끝이다");

const fourDays = event("four", ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]);
assert.strictEqual(widgets.miniCalendarDayBars([fourDays], "2026-10-27").bars[0].position, "middle", "C. 연속 행사 중간은 square bar다");

const crossesWeek = event("week", ["2026-10-31", "2026-11-01"]);
assert.strictEqual(widgets.miniCalendarDayBars([crossesWeek], "2026-10-31").bars[0].position, "single", "D. 토요일에는 주 row 끝으로 막대를 닫는다");
assert.strictEqual(widgets.miniCalendarDayBars([crossesWeek], "2026-11-01").bars[0].position, "single", "D. 일요일에는 새 row 막대를 시작한다");

const gap = event("gap", ["2026-10-28", "2026-10-29", "2026-10-31"], "green");
assert.strictEqual(widgets.miniCalendarDayBars([gap], "2026-10-31").bars[0].position, "single", "E. 비연속 저장 날짜는 별도 segment다");
assert.strictEqual(widgets.miniCalendarEventsForDate([gap], "2026-10-30").length, 0, "E. start~end 범위를 임의로 채우지 않는다");

summary = widgets.miniCalendarDayBars([1, 2, 3, 4, 5].map((id) => event(String(id), ["2026-10-28"])), "2026-10-28", 4);
assert.strictEqual(summary.bars.length, 4);
assert.strictEqual(summary.hiddenCount, 1, "F. 한 날짜는 4줄까지만 표시하고 +N으로 축약한다");

const duplicate = [event("dup", ["2026-10-28"]), { ...event("dup", ["2026-10-28"]), eventName: "중복 schedule row" }];
assert.strictEqual(widgets.miniCalendarDayBars(duplicate, "2026-10-28").events.length, 1, "I. eventOrderId/date 기준으로 중복 제거한다");

const css = fs.readFileSync("outputs/src/styles/dashboardWidgets.css", "utf8");
assert(css.includes(".mini-event-bar.start") && css.includes(".mini-event-bar.middle") && css.includes(".mini-event-bar.end"), "연결 시작/중간/끝 스타일이 있다");
assert(css.includes(".mini-day-number { position: relative; z-index: 2"), "K. 날짜 숫자를 막대보다 위에 유지한다");
assert(!css.includes(".mini-venue-badge,"), "날짜 셀의 venue 텍스트 badge를 제거한다");

for (const page of ["outputs/index.html", "outputs/event-order-preview.html"]) {
  const html = fs.readFileSync(page, "utf8");
  assert(html.includes("miniCalendarDayBars(savedEvents || [], dateKey, 4)"), "기존 savedEvents로 bar를 만든다");
  assert(html.includes("eventColors[normalizeEventColorKey(item.event.color)]"), "J. 기존 행사 color token을 재사용한다");
  assert(html.includes("renderDashboardMonthEventDetail(item.event, dateKey)"), "G. 막대 클릭은 대시보드 상세를 연다");
  assert(html.includes('event.stopPropagation(); dashboardMiniSelectedDate = dateKey'), "H. 막대 클릭이 상위 캘린더 이동 동작으로 전파되지 않는다");
  assert(html.includes('open.textContent = "상세 보기"'), "상세 drawer는 별도 버튼에서만 연다");
  assert(!html.includes("miniCalendarDaySummary(savedEvents || [], dateKey"), "venue badge 렌더를 제거한다");
  assert(html.includes('classList.add("today")') && html.includes('classList.add("selected")'), "today와 selected date를 구분한다");
}
const mobileCss = fs.readFileSync("outputs/src/styles/mobile.css", "utf8");
assert(mobileCss.includes('[data-widget-id="mini-calendar"]') && mobileCss.includes("display: none !important"), "모바일 캘린더는 변경하지 않는다");

console.log("dashboard mini calendar color bars V1 tests passed");
