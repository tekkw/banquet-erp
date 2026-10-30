const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
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

const event = (id, venue, companyName, date, start, endDate = date, end = "") => ({
  id, venue, companyName, calendarDates: [...new Set([date, endDate])],
  schedule: [
    { date, time: start, venue, content: "행사 시작" },
    ...(end ? [{ date: endDate, time: end, venue, content: "행사 종료" }] : []),
  ],
});
const candidate = event("current", "카프리1", "한국정신분석학회", "2026-11-08", "09:00");
const previousCapri1 = event("previous-1", "카프리1", "고흥교육지원청", "2026-10-30", "09:00", "2026-10-30", "21:00");
const previousCapriAll = event("previous-all", "카프리전체", "순천제일대학교", "2026-11-02", "09:00", "2026-11-02", "18:00");

let previous = board.resolvePreviousEventForVenue({ candidateEvent: candidate, venue: "카프리1", events: [previousCapri1, candidate] });
assert.equal(previous.event.id, "previous-1");
assert.equal(previous.window.endTime, "21:00");
previous = board.resolvePreviousEventForVenue({ candidateEvent: candidate, venue: "카프리1", events: [previousCapri1, previousCapriAll, candidate] });
assert.equal(previous.event.id, "previous-all", "카프리ALL도 spacesOverlap으로 카프리1 직전 행사 후보여야 한다");

const futureSetupEvent = event("setup-future-event", "카프리1", "미래 세팅 주최", "2026-11-04", "10:00");
const setupFuture = { key: "setup-future", kind: "manual", type: "next_setup", venue: "카프리1", eventOrderId: futureSetupEvent.id, scheduledDate: "2026-11-03", scheduledTime: "07:00", completed: false };
const setupOther = { ...setupFuture, key: "setup-other", venue: "부라노1" };
board._setStateForTest({ completions: {} });
let setups = board.resolveExistingSetupTasks({ candidateEvent: candidate, venue: "카프리1", setupTasks: [setupFuture, setupOther], events: [candidate, futureSetupEvent], actualToday: "2026-11-01" });
assert.equal(setups.length, 1);
assert.equal(setups[0].statusLabel, "세팅 예정");
assert.equal(setups[0].task.key, "setup-future");

const overdue = { ...setupFuture, key: "setup-overdue", scheduledDate: "2026-10-30" };
setups = board.resolveExistingSetupTasks({ candidateEvent: candidate, venue: "카프리1", setupTasks: [overdue], events: [candidate, futureSetupEvent], actualToday: "2026-11-01" });
assert.equal(setups[0].statusLabel, "지연 2일");
const today = { ...setupFuture, key: "setup-today", scheduledDate: "2026-11-01" };
setups = board.resolveExistingSetupTasks({ candidateEvent: candidate, venue: "카프리1", setupTasks: [today], events: [candidate, futureSetupEvent], actualToday: "2026-11-01" });
assert.equal(setups[0].statusLabel, "오늘 세팅");

const candidateBlock = { key: "candidate", type: "next_setup", venue: "카프리1", eventOrderId: candidate.id, next: { eventOrderId: candidate.id } };
board._setEventsForTest([previousCapriAll, candidate, futureSetupEvent]);
board._setStateForTest({ manual: [], completions: {} });
const emptyContext = board.resolveSetupContext(candidateBlock, { events: [previousCapriAll, candidate], setupTasks: [], actualToday: "2026-11-01" });
assert.equal(emptyContext.primarySetup, null);
assert.deepStrictEqual({ ...emptyContext.recommendedRange }, { start: "2026-11-03", end: "2026-11-07" });
assert(board.renderSetupContextDetails(candidateBlock).includes("같은 공간에 예정된 세팅 없음"));

let warnings = board.getSetupScheduleWarnings({ candidateEvent: candidate, venue: "카프리1", scheduledDate: "2026-11-03", setupTasks: [setupFuture], events: [previousCapriAll, candidate, futureSetupEvent] });
assert(warnings.some((warning) => warning.includes("같은 날") && warning.includes("세팅 예정 작업")), "동일 venue/date setup 충돌을 경고해야 한다");
warnings = board.getSetupScheduleWarnings({ candidateEvent: candidate, venue: "카프리1", scheduledDate: "2026-11-01", setupTasks: [], events: [previousCapriAll, candidate] });
assert(warnings.some((warning) => warning.includes("직전 행사가 11/02 종료") && warning.includes("11/01 세팅")), "직전 행사 종료 전 세팅일을 경고해야 한다");

context.window.matchMedia = () => ({ matches: true });
const mobile = board.resolveSetupContext(candidateBlock, { events: [previousCapriAll, candidate], setupTasks: [], actualToday: "2026-11-01" });
context.window.matchMedia = () => ({ matches: false });
const pc = board.resolveSetupContext(candidateBlock, { events: [previousCapriAll, candidate], setupTasks: [], actualToday: "2026-11-01" });
assert.equal(pc.previous.event.id, mobile.previous.event.id, "PC/mobile은 같은 resolver를 사용해야 한다");

assert(source.includes("data-setup-context-toggle") && source.includes("renderSetupContextDetails(block"));
assert(source.includes("refreshSetupEditorInsights") && source.includes("data-setup-schedule-warning"));
assert(source.includes("expandedSetupContextKeys.add(key); setSetupPin"), "상단 고정 시 맥락을 자동으로 열어야 한다");

console.log("operation board setup context V1 tests passed");
