const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("outputs/index.html", "utf8");
const operationBoard = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const dashboardWidgets = fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8");
const widgetStyles = fs.readFileSync("outputs/src/styles/dashboardWidgets.css", "utf8");
assert(html.includes("<strong>AI 비서</strong>"));
assert(html.includes("연회 운영 정보를 확인하고 AI와 대화하세요."));
assert(!html.includes("<article class=\"weekday-event-card\"><strong>월</strong>"));
assert(html.includes('class="operations-status-grid"'));
assert(html.includes('id="dailyBriefingDialog"'));
assert(html.includes('data-briefing-open'));
assert(html.includes('class="ai-chat-panel" aria-label="연회장 AI 비서" hidden'));
assert(html.indexOf("dashboard-operations-row") < html.indexOf("operations-status-grid"), "중앙 일정/캘린더 다음에 운영 현황이 와야 한다");
assert(html.includes('renderStatusCard("오늘 행사"'));
assert(html.includes('renderStatusCard("내일 행사"'));
assert(html.includes('renderStatusCard("세팅 변경"'));
assert(operationBoard.includes('<button type="button" data-board-cancel>취소</button>'));
assert(!operationBoard.includes('<button value="cancel">취소</button>'));
assert(html.includes('id="weeklySetupWidget"'));
assert(html.includes('dashboardWidgets.js?v=dashboard-dark-v1'));
assert(html.includes('operationBoard.js?v=dashboard-dark-v1'));
assert(dashboardWidgets.includes('banquet-erp-dashboard-layout-v1'));
assert(dashboardWidgets.includes('data-widget-hide'));
assert(dashboardWidgets.includes('widget-resize-handle'));
assert(dashboardWidgets.includes('data-widget-col-delta'));
assert(dashboardWidgets.includes('data-widget-row-delta'));
assert(dashboardWidgets.includes("reorderLayout"));
assert(dashboardWidgets.includes("resizeLayout"));
assert(widgetStyles.includes('@media (max-width: 768px)'));
assert(widgetStyles.includes('grid-template-columns: minmax(0, 1fr)'));
assert(widgetStyles.includes('@media (max-width: 380px)'));
assert(widgetStyles.includes('grid-auto-rows: 48px'));
assert(widgetStyles.includes('grid-column: span var(--col-span, 6)'));
assert(widgetStyles.includes('grid-row: span var(--row-span, 6)'));
assert(widgetStyles.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'));
assert(widgetStyles.includes('.dashboard-widget-shell.is-dragging'));
assert(widgetStyles.includes('--dash-bg: #06111f'));
assert(widgetStyles.includes('../../assets/dashboard/dashboard-hero.png'));
assert(widgetStyles.includes('../../assets/dashboard/sidebar-hotel.png'));
assert(fs.existsSync('outputs/assets/dashboard/dashboard-hero.png'));
assert(fs.existsSync('outputs/assets/dashboard/sidebar-hotel.png'));
assert(widgetStyles.includes('background-size: cover'));
assert(widgetStyles.includes('background-position: center'));
assert(!widgetStyles.includes('content: "VENEZIA"'));
assert(dashboardWidgets.includes('button.dataset.quickAction = "layouts"'));
assert(dashboardWidgets.includes('function decorateChrome()'));
assert(operationBoard.includes('class="weekly-setup-list"'));
assert(!operationBoard.includes('<h4>오늘 해야 함</h4>'));
assert(!operationBoard.includes('<h4>이번 주 예정</h4>'));
const widgetContext = { window: {}, document: { readyState: "loading", addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} }, Intl, Date, Map, JSON };
vm.createContext(widgetContext);
vm.runInContext(dashboardWidgets, widgetContext);
const reordered = widgetContext.window.BANQUET_ERP_DASHBOARD_WIDGETS.reorderLayout([{ id: "a" }, { id: "b" }, { id: "c" }], "a", "c");
assert.strictEqual(reordered.map((item) => item.id).join(","), "b,c,a");
const normalized = widgetContext.window.BANQUET_ERP_DASHBOARD_WIDGETS.normalize([
  { id: "weekly-setup", visible: false, colSpan: 9, rowSpan: 8 },
  null,
  { id: "unknown", visible: false, size: "small" },
  { id: "quick", visible: true, colSpan: 1, rowSpan: 1 },
  { id: "weekly-setup", visible: true, size: "small" },
]);
assert.strictEqual(normalized.length, 6, "저장 레이아웃은 알려진 위젯마다 한 항목만 유지해야 한다");
assert.strictEqual(normalized.map((item) => item.id).join(","), "weekly-setup,quick,today-board,operations-status,mini-calendar,today-operations");
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalized[0])), { id: "weekly-setup", visible: true, colSpan: 4, rowSpan: 5 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalized[1])), { id: "quick", visible: true, colSpan: 3, rowSpan: 3 });
const resized = widgetContext.window.BANQUET_ERP_DASHBOARD_WIDGETS.resizeLayout(normalized, "today-board", { colSpan: 2, rowSpan: 30 });
assert.strictEqual(resized.find((item) => item.id === "today-board").colSpan, 6, "위젯별 최소 가로 span을 지켜야 한다");
assert.strictEqual(resized.find((item) => item.id === "today-board").rowSpan, 12, "최대 세로 span을 지켜야 한다");
assert(dashboardWidgets.includes('function handleDragStart(event)'));
assert(dashboardWidgets.includes('clearPointerDrag();'));
assert(dashboardWidgets.includes('clearDragFeedback();'));
console.log("dashboard-overview-v1 tests passed");
