const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const calendarSource = fs.readFileSync("outputs/src/eventCalendar.js", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
const css = fs.readFileSync("outputs/src/styles/calendar.css", "utf8");
const context = { window: {}, Intl, Date, Object, Array };

vm.runInNewContext(calendarSource, context);
const range = context.window.BANQUET_ERP_EVENT_CALENDAR.getSundayWeekRange("2026-10-20");
assert.deepStrictEqual(JSON.parse(JSON.stringify(range)), {
  start: "2026-10-18",
  end: "2026-10-24",
  dates: ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"],
});

assert(html.indexOf('id="calendarGrid"') < html.indexOf('id="mobileWeekCalendar"'));
for (const id of ["mobileWeekTitle", "prevWeek", "nextWeek", "todayWeek", "mobileWeekDays", "mobileWeekHeading", "mobileWeekEvents"]) {
  assert(html.includes(`id="${id}"`));
}
assert(html.includes("onSelectedDateChange: (dateKey) =>"));
assert(html.includes("calendarController.selectDate(formatDateKey(calendarDate), { notify: false })"));

assert(calendarSource.includes('selectDate(dateKey, { scroll: true })'));
assert(calendarSource.includes("moveWeek(-7)"));
assert(calendarSource.includes("moveWeek(7)"));
assert(calendarSource.includes("selectDate(seoulTodayKey())"));
assert(calendarSource.includes("events.forEach((eventItem) =>"));
assert(!calendarSource.slice(calendarSource.indexOf("function renderMobileWeek"), calendarSource.indexOf("function selectDate")).includes("events.slice"));
assert(calendarSource.includes("openEventModal?.(eventItem, selectedDateKey)"));
assert(calendarSource.includes("formatVenueShortList(venues)"));
assert(calendarSource.includes("normalizeEventColorKey(eventItem.color)"));

assert(/\.mobile-week-calendar\s*\{\s*display:\s*none;/.test(css));
assert(css.includes("@media (max-width: 768px)"));
assert(css.includes("border-left: 4px solid var(--event-color)"));

console.log("Mobile weekly calendar V1 tests passed");
