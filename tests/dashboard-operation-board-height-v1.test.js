const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8");
const css = fs.readFileSync("outputs/src/styles/dashboardWidgets.css", "utf8");
const context = { window: {}, document: { readyState: "loading", addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} }, Intl, Date, Map, JSON };
vm.createContext(context);
vm.runInContext(source, context);
const widgets = context.window.BANQUET_ERP_DASHBOARD_WIDGETS;

const base = widgets.defaults();
const expanded = widgets.resizeLayout(base, "today-board", { rowSpan: 16 });
assert.strictEqual(expanded.find((item) => item.id === "today-board").rowSpan, 16, "운영보드는 H 16 이상으로 확대되어야 한다");
assert.strictEqual(widgets.resizeLayout(base, "today-board", { rowSpan: 99 }).find((item) => item.id === "today-board").rowSpan, 24, "운영보드 최대 H는 24다");
assert.strictEqual(widgets.resizeLayout(base, "weekly-setup", { rowSpan: 99 }).find((item) => item.id === "weekly-setup").rowSpan, 12, "다른 위젯 최대 H는 기존 12를 유지한다");

const reloaded = widgets.normalize([{ id: "today-board", visible: true, colSpan: 8, rowSpan: 20 }]);
assert.strictEqual(reloaded.find((item) => item.id === "today-board").rowSpan, 20, "저장한 확장 높이를 normalize/load에서 보존한다");
assert(source.includes('maxRowSpan: 24') && source.includes('maxRowSpanFor(definition)'), "버튼과 resize handle이 위젯별 최대 H를 공유해야 한다");
assert(css.includes('@media (min-width: 769px)'), "높이 확장 규칙은 PC에만 적용해야 한다");
assert(css.includes('.dashboard-widget-layout { height: auto; max-height: none; overflow: visible; align-content: start; }'), "implicit grid row가 페이지 높이를 늘려야 한다");
assert(css.includes('[data-widget-id="today-board"] > .operation-board { height: 100%; max-height: none; overflow: auto; }'), "운영보드 내용은 확장된 높이를 사용해야 한다");

for (const page of ["outputs/index.html", "outputs/event-order-preview.html"]) {
  const html = fs.readFileSync(page, "utf8");
  assert(html.includes("dashboardWidgets.js?v=dashboard-calendar-bars-v3") && html.includes("app.css?v=dashboard-calendar-bars-v3"), "production entrypoint가 최신 JS/CSS를 로드해야 한다");
}

console.log("dashboard operation board height V1 tests passed");
