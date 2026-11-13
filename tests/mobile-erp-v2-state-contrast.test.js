const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("outputs/index.html", "utf8");
const css = fs.readFileSync("outputs/src/styles/mobile.css", "utf8");

// Widget state uses stable ids and the enabled/order/collapsed contract.
for (const id of ["today_events", "remaining_schedule", "ai_quick_questions", "asset_search", "current_setup"]) {
  assert(html.includes(`id: "${id}"`));
  assert(html.includes(`data-mobile-widget="${id}"`));
}
assert(html.includes('enabled: typeof saved.enabled === "boolean" ? saved.enabled'));
assert(html.includes('typeof saved.visible === "boolean" ? saved.visible'), "V1 visible state must migrate");
assert(html.includes('.sort((a, b) => a.order - b.order)'));
assert(html.includes('widget.hidden = item.enabled !== true'));
assert(html.includes('widget.style.display = item.enabled === true ? "" : "none"'));
assert(html.includes('widgetEnabled("remaining_schedule")'));
assert(html.includes('localStorage.setItem(MOBILE_HOME_WIDGETS_KEY'));
assert(html.includes('mobile home widget preferences save failed'));
assert(html.includes('window.alert("홈 위젯 설정을 저장하지 못했습니다.")'));

// Mobile colors are semantic and bottom navigation has explicit readable states.
for (const token of ["--mobile-bg", "--mobile-surface", "--mobile-text-primary", "--mobile-text-secondary", "--mobile-gold", "--mobile-nav-inactive"]) {
  assert(css.includes(token));
}
assert(css.includes("--mobile-nav-inactive: #61717F"));
assert(css.includes(".mobile-bottom-nav button.active .lucide-icon"));
assert(css.includes(".global-ai-launcher { display: none !important; }"));
assert(css.includes('.erp-shell[data-active-page="home"] .dashboard-widget-layout'));
assert(css.includes('.erp-shell[data-active-page="home"] #hallCurrentStatesWidget'));
assert(css.includes("grid-template-columns: 86px minmax(0, 1fr)"));
assert(css.includes("white-space: normal"));
assert(css.includes("overflow-wrap: anywhere"));
for (const width of [360, 430]) assert(css.includes(String(width)));

console.log("mobile ERP V2 widget state and contrast tests passed");
