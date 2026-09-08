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
assert(html.includes('dashboardWidgets.js?v=dashboard-widgets-v6'));
assert(dashboardWidgets.includes('banquet-erp-dashboard-layout-v1'));
assert(dashboardWidgets.includes('data-widget-up'));
assert(dashboardWidgets.includes('data-widget-down'));
assert(dashboardWidgets.includes('data-widget-hide'));
assert(dashboardWidgets.includes("reorderLayout"));
assert(widgetStyles.includes('@media (max-width:768px)'));
assert(widgetStyles.includes('grid-template-columns:minmax(0,1fr)'));
assert(widgetStyles.includes('@media (max-width:360px)'));
assert(widgetStyles.includes('grid-auto-rows:42px'));
assert(widgetStyles.includes('[data-widget-size="small"] { grid-column:span 4; grid-row:span 4; }'));
assert(widgetStyles.includes('[data-widget-size="medium"] { grid-column:span 6; grid-row:span 6; }'));
assert(widgetStyles.includes('[data-widget-size="large"] { grid-column:1/-1; grid-row:span 9; }'));
assert(widgetStyles.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
assert(widgetStyles.includes('.dashboard-widget-shell.is-dragging'));
assert(dashboardWidgets.includes('button.dataset.quickAction = "layouts"'));
const widgetContext = { window: {}, document: { readyState: "loading", addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} }, Intl, Date, Map, JSON };
vm.createContext(widgetContext);
vm.runInContext(dashboardWidgets, widgetContext);
const reordered = widgetContext.window.BANQUET_ERP_DASHBOARD_WIDGETS.reorderLayout([{ id: "a" }, { id: "b" }, { id: "c" }], "a", "c");
assert.strictEqual(reordered.map((item) => item.id).join(","), "b,c,a");
const normalized = widgetContext.window.BANQUET_ERP_DASHBOARD_WIDGETS.normalize([
  { id: "weekly-setup", visible: false, size: "large" },
  null,
  { id: "unknown", visible: false, size: "small" },
  { id: "quick", visible: true, size: "invalid" },
  { id: "weekly-setup", visible: true, size: "small" },
]);
assert.strictEqual(normalized.length, 6, "저장 레이아웃은 알려진 위젯마다 한 항목만 유지해야 한다");
assert.strictEqual(normalized.map((item) => item.id).join(","), "weekly-setup,quick,today-operations,mini-calendar,operations-status,today-board");
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalized[0])), { id: "weekly-setup", visible: true, size: "small" });
assert.strictEqual(normalized[1].size, "small", "잘못된 크기는 위젯 기본값으로 복원해야 한다");
assert(dashboardWidgets.includes('clearPointerDrag(); clearDragFeedback();'), "네이티브 드래그 시작 시 포인터 폴백을 해제해야 한다");
console.log("dashboard-overview-v1 tests passed");
