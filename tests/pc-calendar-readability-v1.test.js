const assert = require("assert");
const fs = require("fs");

const calendar = fs.readFileSync("outputs/src/eventCalendar.js", "utf8");
const css = fs.readFileSync("outputs/src/styles/calendar.css", "utf8");

for (const label of ["컨A", "컨B", "컨AB", "부1", "부2", "부3", "카1", "카2", "카3", "페스타", "올리", "부ALL"]) assert(calendar.includes(`"${label}"`));
assert(calendar.includes("const DESKTOP_EVENT_LIMIT = 5"));
assert(calendar.includes("venues.join(\"+\")"));
assert(calendar.includes("외 ${venues.length - 1}"));
assert(calendar.includes("+${desktopHiddenCount}건"));
assert(calendar.includes("openDesktopDayDrawer"));
assert(calendar.includes("openEventModal?.(eventItem, dateKey)"));
assert(calendar.includes("button.title = eventName"));
assert(css.includes("@media (min-width: 769px)"));
assert(css.includes(".calendar-day-drawer.visible"));
assert(css.includes(".calendar-event-bar.desktop-calendar-hidden"));

console.log("PC calendar readability V1 tests passed");
