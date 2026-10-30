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

const event = (id, date, venue = "카프리1", organizer = id, time = "09:00") => ({
  id, calendarDates: [date], venue, companyName: organizer, guestCount: 27,
  schedule: [{ date, time, venue, content: "행사 시작" }],
});
const events = [
  event("past", "2026-10-29"),
  event("today", "2026-10-30"),
  event("november", "2026-11-20", "카프리1", "한국정신분석학회"),
  event("december", "2026-12-30", "부라노1", "연말행사"),
];
board._setEventsForTest(events);
board._setStateForTest({ manual: [], completions: {}, pins: {}, setupOverrides: {} });

let lists = board.classifySetupBoardItems(events, [], "2026-10-30");
assert.deepStrictEqual(Array.from(lists.candidates, (item) => item.eventOrderId), ["today", "november", "december"], "actualToday 이후 전체 미래 행사를 기간 제한 없이 표시해야 한다");
assert(!lists.candidates.some((item) => item.eventOrderId === "past"));
assert.equal(lists.candidates.find((item) => item.eventOrderId === "november").scheduledDate, undefined, "scheduledDate 없는 raw 후보도 유지해야 한다");
assert.equal(board.setupCardInfo(lists.candidates.find((item) => item.eventOrderId === "november")).date, "", "raw 후보의 행사일을 scheduledDate로 fallback하면 안 된다");
board.setSelectedDate("2026-11-05");
assert.deepStrictEqual(Array.from(board.classifySetupBoardItems(events, [], "2026-10-30").candidates, (item) => item.eventOrderId), ["today", "november", "december"], "selectedDate는 미래 후보 범위를 바꾸면 안 된다");

const pinnedTask = { key: "setup-november", kind: "manual", type: "next_setup", eventOrderId: "november", venue: "카프리1", scheduledDate: "2026-11-19", completed: false };
board._setStateForTest({ manual: [pinnedTask], completions: {}, pins: { "setup-november": true }, setupOverrides: {} });
lists = board.classifySetupBoardItems(events, [pinnedTask], "2026-10-30");
assert.deepStrictEqual(Array.from(lists.pinned, (item) => item.eventOrderId), ["november"]);
assert(!lists.candidates.some((item) => item.eventOrderId === "november"), "pinned persistent task는 후보에 중복 표시하면 안 된다");

const unpinnedDuplicate = { ...pinnedTask, key: "setup-november-unpinned" };
board._setStateForTest({ manual: [unpinnedDuplicate, pinnedTask], completions: {}, pins: { "setup-november": true }, setupOverrides: {} });
lists = board.classifySetupBoardItems(events, [unpinnedDuplicate, pinnedTask], "2026-10-30");
assert.deepStrictEqual(Array.from(lists.pinned, (item) => item.key), ["setup-november"], "동일 eventOrderId에서는 pinned persistent task가 우선해야 한다");

board._setStateForTest({ manual: [pinnedTask], completions: {}, pins: { "setup-november": false }, setupOverrides: {} });
lists = board.classifySetupBoardItems(events, [pinnedTask], "2026-10-30");
assert.equal(lists.pinned.length, 0);
assert.equal(lists.candidates.filter((item) => item.eventOrderId === "november").length, 1, "고정 해제한 미래 task는 후보로 복귀해야 한다");
assert.equal(lists.candidates.find((item) => item.eventOrderId === "november").key, "setup-november", "persistent task가 raw event보다 우선해야 한다");

const completedTask = { key: "setup-december", kind: "manual", type: "next_setup", eventOrderId: "december", venue: "부라노1", completed: true };
board._setStateForTest({ manual: [completedTask], completions: { "setup-december": true }, pins: {}, setupOverrides: {} });
lists = board.classifySetupBoardItems([...events, events[2]], [completedTask], "2026-10-30");
assert(!lists.candidates.some((item) => item.eventOrderId === "december"), "완료된 setup event는 raw 후보로 재생성하면 안 된다");
assert.equal(lists.candidates.filter((item) => item.eventOrderId === "november").length, 1, "동일 eventOrderId는 한 번만 표시해야 한다");

board._setStateForTest({ manual: [pinnedTask], completions: {}, pins: { "setup-november": true }, setupOverrides: {} });
board._setEventsForTest(events);
const raw = board.rawSetupCandidate(events[3], "2026-12-30");
assert(board.renderSetupContextDetails(raw).includes("이미 예정된 세팅"), "미고정 후보도 기존 세팅 맥락 helper를 사용해야 한다");
assert(source.includes('data-setup-section-toggle="pinned"') && source.includes('data-setup-section-toggle="candidates"'), "두 그룹은 독립 collapse control을 가져야 한다");
assert(source.includes("setupCandidateVisibleCount += 20"), "후보는 기간 절단 대신 load-more 렌더를 사용해야 한다");
assert(!/function setupEventCandidates[\s\S]{0,220}setupCandidateDateRange/.test(source), "후보 event picker에 주간 horizon을 적용하면 안 된다");

console.log("operation board setup groups V1 tests passed");
