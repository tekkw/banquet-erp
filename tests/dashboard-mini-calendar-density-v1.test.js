const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const window = {};
const context = { window, document: { readyState: "loading", addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} }, Intl, Date, Map, Set, JSON };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8"), context);
const widgets = window.BANQUET_ERP_DASHBOARD_WIDGETS;
const date = "2026-10-28";
const event = (id, venue, extra = {}) => ({ id, companyName: `주최 ${id}`, eventName: `긴 행사명 ${id}`, venue, guestCount: 10, calendarDates: [date], schedule: [{ date, time: "10:00", content: "세미나", venue }, { date, time: "18:00", content: "석식", venue }], ...extra });

let summary = widgets.miniCalendarDaySummary([event("one", "카프리1")], date);
assert.deepStrictEqual(Array.from(summary.venues, (item) => item.label), ["카1"], "A. 하루 행사 1건은 venue badge 1개다");

summary = widgets.miniCalendarDaySummary([event("a", "컨벤션A"), event("b", "카프리1"), event("c", "부라노전체")], date);
assert.deepStrictEqual(Array.from(summary.venues, (item) => item.label), ["컨A", "카1", "부ALL"], "B. 서로 다른 venue 3건은 badge 3개다");

summary = widgets.miniCalendarDaySummary([event("a", "컨벤션A"), event("b", "카프리1"), event("c", "부라노전체"), event("d", "페스타"), event("e", "올리비아")], date);
assert.strictEqual(summary.venues.length, 3);
assert.strictEqual(summary.hiddenVenueCount, 2, "C. 4개 이상은 최대 3개와 +N으로 축약한다");

summary = widgets.miniCalendarDaySummary([event("same", "카프리1")], date);
assert.strictEqual(summary.venues.length, 1, "D. 같은 행사의 schedule row가 여러 개여도 badge는 중복되지 않는다");

summary = widgets.miniCalendarDaySummary([event("complex", "컨벤션AB + 페스타")], date);
assert.deepStrictEqual(Array.from(summary.venues, (item) => item.label), ["컨AB", "페스타"], "E. 복합 venue는 canonical short label을 각각 표시한다");

const multi = event("multi", "부라노1", { calendarDates: ["2026-10-28", "2026-10-30"], startDate: "2026-10-28", endDate: "2026-10-31" });
assert.strictEqual(widgets.miniCalendarEventsForDate([multi], "2026-10-28").length, 1);
assert.strictEqual(widgets.miniCalendarEventsForDate([multi], "2026-10-29").length, 0, "G. start~end 사이 날짜를 임의로 채우지 않는다");
assert.strictEqual(widgets.miniCalendarEventsForDate([multi], "2026-10-30").length, 1);

const duplicate = [{ ...event("dup", "카프리1"), eventName: "old" }, { ...event("dup", "카프리1"), eventName: "new" }];
assert.strictEqual(widgets.miniCalendarEventsForDate(duplicate, date).length, 1, "실제 eventOrderId/date 단위로 중복 제거한다");

for (const page of ["outputs/index.html", "outputs/event-order-preview.html"]) {
  const html = fs.readFileSync(page, "utf8");
  assert(html.includes("data-mini-calendar-detail") && html.includes("companyName || eventItem.company_name || eventItem.organizer"), "F. 날짜 상세는 organizer/time/guestCount를 표시한다");
  assert(html.includes('classList.add("today")') && html.includes('classList.add("selected")'), "H. today와 selected date를 구분한다");
  assert(html.includes("miniCalendarDaySummary(savedEvents || [], dateKey, 3)"), "대시보드가 이미 로드한 savedEvents를 재사용한다");
}
const mobileCss = fs.readFileSync("outputs/src/styles/mobile.css", "utf8");
assert(mobileCss.includes('[data-widget-id="mini-calendar"]') && mobileCss.includes("display: none !important"), "모바일 대시보드 미니 캘린더는 기존처럼 숨긴다");

console.log("dashboard mini calendar density V1 tests passed");
