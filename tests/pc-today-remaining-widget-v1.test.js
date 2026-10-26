const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
const widgets = fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8");
const context = {
  window: { matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null },
  crypto: { randomUUID: () => "test-id" },
  console, Date, Intl, Set, Map,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/eventDisplayUtils.js", "utf8"), context);
vm.runInContext(source, context);
const board = context.window.BANQUET_ERP_OPERATION_BOARD;
const today = "2026-10-16";
board._setStateForTest({ completions: { "manual:done": true }, manual: [
  { key: "manual:active", kind: "manual", type: "manual", date: today, time: "13:00", venue: "3F 부라노 I", title: "커피 준비", completed: false },
  { key: "manual:done", kind: "manual", type: "manual", date: today, time: "09:00", venue: "카프리1", title: "완료", completed: true },
] });
const active = board.agendaBlocks(board.allBlocks(today, [])).filter((item) => !item.completed);
assert.deepStrictEqual(Array.from(active, (item) => item.key), ["manual:active"], "모바일과 같은 미완료 agenda source를 사용해야 한다");
assert.strictEqual(context.window.BANQUET_ERP_VENUE_UTILS.formatVenueShort(active[0].venue), "부1");
assert(html.includes('id="todayRemainingScheduleWidget"') && !html.includes('id="todayRemainingScheduleWidget" class="operation-board"'), "위젯은 운영보드 DOM 밖에 있어야 한다");
assert(widgets.includes('id: "today-remaining"') && widgets.includes('selector: "#todayRemainingScheduleWidget"'), "대시보드 위젯으로 등록해야 한다");
assert(source.includes('showStandaloneMobileAgenda = window.location?.pathname?.includes("/board/")'), "PC 본문에서는 중복 오늘 일정을 제거하고 모바일 /board/만 유지해야 한다");
assert(source.includes('showStandaloneMobileAgenda ? renderTodayAgenda(activeAgenda, completedAgenda) : ""'));
assert(source.includes("const today = seoulDateKey()") && source.includes("active.slice(0, 8)"), "서울 실제 오늘 기준으로 최대 8건을 표시해야 한다");
assert(source.includes("completeBoardItem") && source.includes("syncItem(block)"), "위젯과 운영보드가 같은 완료 저장 경로를 사용해야 한다");
assert(source.includes("blockDisplayVenue(block)"), "G. 오늘 남은 일정은 운영보드와 같은 display venue helper를 사용해야 한다");

console.log("PC today remaining widget V1 tests passed");
