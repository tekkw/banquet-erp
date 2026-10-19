const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const memory = new Map();
const context = {
  window: { BANQUET_ERP_CONSTANTS: { supabaseConfig: { url: "https://example.test", anonKey: "test" } }, addEventListener: () => {}, dispatchEvent: () => {} },
  localStorage: { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null, querySelector: () => null },
  crypto: { randomUUID: () => "test-id" }, CustomEvent: function CustomEvent() {}, fetch: async () => ({ ok: true, text: async () => "" }),
  console, Date, Intl, Set, Map,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/eventDisplayUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/operationBoard.js", "utf8"), context);
const board = context.window.BANQUET_ERP_OPERATION_BOARD;
const today = "2026-10-19";
const current = { id: "current", eventName: "현재 행사", calendarDates: [today], venue: "카프리1", schedule: [{ date: today, time: "09:00~18:00", content: "본 행사", venue: "카프리1" }] };
const eventA = { id: "a", eventName: "10월20일 행사", companyName: "행사 A", calendarDates: ["2026-10-20"], venue: "카프리1", layoutText: "Class Type 30석" };
const eventB = { id: "b", eventName: "한국보건복지인재원", companyName: "행사 B", calendarDates: ["2026-10-22", "2026-10-23"], venue: "카프리전체", schedule: [{ date: "2026-10-22", time: "09:00", content: "행사 시작", venue: "카프리전체" }] };
const eventC = { id: "c", eventName: "10월23일 행사", companyName: "행사 C", calendarDates: ["2026-10-23"], venue: "카프리1", schedule: [{ date: "2026-10-23", time: "08:00", content: "행사 시작", venue: "카프리1" }] };

assert.equal(board.resolveNextEventForVenue({ venue: "카프리1", afterDateTime: "2026-10-19T18:00", events: [eventA, eventB, eventC] }).event.id, "a", "A. 가장 가까운 10/20 카프리1 행사를 선택해야 한다");
assert.equal(board.resolveNextEventForVenue({ venue: "카프리전체", afterDateTime: "2026-10-19T18:00", events: [eventA, eventB] }).event.id, "a", "B. 카프리전체에서 카프리1을 overlap으로 선택해야 한다");
assert.equal(board.resolveNextEventForVenue({ venue: "카프리1", afterDateTime: "2026-10-21T18:00", events: [eventB] }).event.id, "b", "C. 카프리1에서 카프리전체를 overlap으로 선택해야 한다");

const manualB = { key: "manual-b", kind: "manual", type: "next_setup", date: today, time: "09:00", venue: "카프리1", eventOrderId: "b", title: "행사 B", completed: false };
board._setStateForTest({ completions: {}, manual: [manualB], checklist: [], pins: {}, setupOverrides: { "manual-b": { eventDate: "2026-10-22", eventOrderId: "b", venue: "카프리1" } } });
let briefing = board.buildDailyBriefing([current, eventA, eventB, eventC], today);
assert.equal(briefing.candidates.find((item) => item.source === "automatic").nextEventOrderId, "a", "D. manual task가 자동 nearest 계산을 override하면 안 된다");
assert.equal(briefing.candidates[0].nextEventOrderId, "a", "날짜+시간 순으로 10/20 자동 후보가 먼저여야 한다");

board._setStateForTest({ completions: {}, manual: [], checklist: [], pins: {}, setupOverrides: {} });
let conversation = board.dailyBriefingConversation([current, eventB, eventC], today, true);
assert.equal(conversation.current.nextEventOrderId, "b", "초기 데이터에서는 10/22가 다음 행사다");
conversation = board.dailyBriefingConversation([current, eventA, eventB, eventC], today, true);
assert.equal(conversation.current.nextEventOrderId, "a", "E. drawer 재오픈 시 최신 event data로 10/20을 다시 계산해야 한다");

board.dailyBriefingConversation([current, eventB, eventC], today, true);
const corrected = board.dailyBriefingAnswer("20일 행사가 먼저야. 내일 카프리1 행사 있잖아", [current, eventA, eventB, eventC], today);
assert.match(corrected, /10월20일 행사 A.*다음 세팅 대상을 수정했습니다/s, "F. 사용자 정정 시 queue/context를 10/20 행사로 교체해야 한다");
assert.match(board.dailyBriefingAnswer("레이아웃은?", [current, eventA, eventB, eventC], today), /클래스 30석/, "G. 후속 질문은 수정된 10/20 eventOrderId를 사용해야 한다");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
assert(source.includes("resolveNextEventForVenue({ venue: scopeVenue"), "다음 세팅과 briefing은 공용 resolver를 사용해야 한다");
assert(fs.readFileSync("outputs/src/aiAssistant.js", "utf8").includes('item.nextEventOrderId || item.eventOrderId'), "session 표시 signature에는 최신 nextEventOrderId가 포함되어야 한다");
console.log("next event resolver V1 tests passed");
