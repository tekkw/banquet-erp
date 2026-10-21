const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const memory = new Map();
const context = {
  window: { BANQUET_ERP_CONSTANTS: { supabaseConfig: { url: "https://example.test", anonKey: "test" } } },
  localStorage: { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null },
  crypto: { randomUUID: () => "test-id" }, fetch: async () => ({ ok: true, text: async () => "" }),
  console, Date, Intl, Set, Map,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/eventDisplayUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/operationBoard.js", "utf8"), context);
const board = context.window.BANQUET_ERP_OPERATION_BOARD;
const today = "2026-10-19";
const events = [
  { id: "current", eventName: "오늘 행사", companyName: "오늘 주최", calendarDates: [today], venue: "페스타", schedule: [{ date: today, time: "09:00~18:00", content: "본 행사", venue: "페스타" }] },
  { id: "next", eventName: "긴 행사명", companyName: "콘텐츠랩", calendarDates: ["2026-10-20"], venue: "페스타", storagePath: "orders/next.xlsx", layoutText: "Class Type 40석", othersText: "등록테이블 2T / 마이크 2EA", schedule: [{ date: "2026-10-20", time: "08:00", content: "행사 시작", venue: "페스타" }] },
  { id: "front", eventName: "체크인", calendarDates: [today], venue: "Front", schedule: [{ date: today, time: "15:00", content: "CHECK IN", venue: "Front" }] },
];

board._setStateForTest({ completions: {}, manual: [], checklist: [], pins: {}, setupOverrides: {} });
let briefing = board.buildDailyBriefing(events, today);
assert.deepStrictEqual(Array.from(briefing.todayEvents, (event) => event.id), ["current"], "A. 기존 운영 필터가 적용된 오늘 행사만 포함해야 한다");
assert.strictEqual(briefing.candidates.length, 1, "B. 오늘 종료 공간의 가장 가까운 future event를 계산해야 한다");
assert.strictEqual(briefing.candidates[0].eventTitle, "콘텐츠랩", "대표명은 organizer/company를 우선해야 한다");
assert.strictEqual(board.setupDocumentSummary({ layoutText: "LAY & OUT = RE-INFORM" }), "레이아웃 재인폼 예정", "C. RE-INFORM을 현장 표현으로 요약해야 한다");
assert(board.setupDocumentSummary(events[1]).includes("클래스 40석"), "D. Class Type 좌석을 요약해야 한다");
assert(board.setupDocumentSummary(events[1]).includes("등록 2T"), "E. OTHERS 등록 테이블을 요약에 포함해야 한다");
assert(board.setupDocumentSummary(events[1]).includes("마이크 2EA"), "핵심 장비 수량을 요약해야 한다");

board._setStateForTest({ completions: { [briefing.candidates[0].key]: true }, manual: [], checklist: [], pins: {}, setupOverrides: {} });
assert.strictEqual(board.buildDailyBriefing(events, today).candidates.length, 0, "F/G. 공용 completion 상태의 완료 후보는 PC/모바일 briefing에서 제외해야 한다");

const overdue = { key: "manual-overdue", kind: "manual", type: "next_setup", date: "2026-10-18", time: "08:00", venue: "페스타", eventOrderId: "next", title: "콘텐츠랩", completed: false };
board._setStateForTest({ completions: {}, manual: [overdue], checklist: [], pins: {}, setupOverrides: { [overdue.key]: { eventDate: "2026-10-18", time: "08:00" } } });
briefing = board.buildDailyBriefing(events, today);
assert(briefing.candidates.some((item) => item.key === overdue.key), "H. 미완료 overdue 작업을 계속 표시해야 한다");
assert.strictEqual(briefing.candidates.filter((item) => item.eventOrderId === "next").length, 1, "I. 수동 task와 자동 후보를 중복 표시하면 안 된다");
assert.match(board.dailyBriefingAnswer("오늘 뭐 해야 돼?", events, today), /페스타 다음 행사는 콘텐츠랩.*클래스 40석.*세팅 완료/s, "J. AI 질문은 동일 briefing source의 첫 항목만 대화형으로 물어야 한다");
assert.match(board.dailyBriefingAnswer("오늘 브리핑", events, today), /등록된 다음세팅 작업은 1건.*추가로 확인이 필요한 항목은 1건.*페스타 다음 행사는 콘텐츠랩/s, "명시적 브리핑 요청에서만 요약과 첫 항목을 시작해야 한다");

const registeredFuture = { key: "manual-future", kind: "manual", type: "next_setup", date: today, time: "10:00", venue: "카프리1", eventOrderId: "future", title: "등록 행사", completed: false };
board._setStateForTest({ completions: {}, manual: [registeredFuture], checklist: [], pins: {}, setupOverrides: { [registeredFuture.key]: { eventDate: "2026-10-21", time: "10:00" } } });
briefing = board.buildDailyBriefing([], today);
assert.strictEqual(briefing.registeredCount, 1, "F. 등록된 정상 future/today setup task 수는 briefing 요약에 유지해야 한다");
assert.strictEqual(briefing.candidates.length, 0, "F. 등록된 정상 future/today setup task는 완료 확인 질문에서 제외해야 한다");
assert.match(board.dailyBriefingAnswer("오늘 브리핑", [], today), /등록된 다음세팅 작업은 1건.*추가로 확인이 필요한 항목은 0건/s, "등록 작업은 개별 완료 질문 없이 건수만 요약해야 한다");

const nextTwo = { id: "next-two", eventName: "두 번째 행사", companyName: "두 번째 주최", calendarDates: ["2026-10-21"], venue: "카프리1", layoutText: "Round Type 60석", schedule: [{ date: "2026-10-21", time: "09:00", content: "행사 시작", venue: "카프리1" }] };
const second = { key: "manual-second", kind: "manual", type: "next_setup", date: "2026-10-18", time: "10:00", venue: "카프리1", eventOrderId: "next-two", title: "두 번째 주최", completed: false };
board._setStateForTest({ completions: {}, manual: [overdue, second], checklist: [], pins: {}, setupOverrides: { [overdue.key]: { eventDate: "2026-10-18", time: "08:00" }, [second.key]: { eventDate: "2026-10-18", time: "10:00" } } });
context.window.openStoredExcel = (path, options) => { context.openedOriginal = { path, options }; };
const conversation = board.dailyBriefingConversation([...events, nextTwo], today, true);
assert.strictEqual(conversation.count, 2, "overdue 미완료 2건은 AI badge/queue count 2가 되어야 한다");
assert.deepStrictEqual(JSON.parse(JSON.stringify(Object.fromEntries(["venue", "nextEventOrderId", "organizer", "eventName", "scheduledDate", "scheduledTime", "setupSummary", "completed", "source"].map((key) => [key, conversation.current[key]])))), { venue: "페스타", nextEventOrderId: "next", organizer: "콘텐츠랩", eventName: "긴 행사명", scheduledDate: "2026-10-18", scheduledTime: "08:00", setupSummary: "클래스 40석 · 등록 2T · 마이크 2EA", completed: false, source: "manual" });
board.dailyBriefingAction("original", [...events, nextTwo], today);
assert.strictEqual(context.openedOriginal.options.eventOrderId, "next", "원본 보기는 현재 briefing item의 eventOrderId를 사용해야 한다");
assert.match(board.dailyBriefingAnswer("레이아웃은?", [...events, nextTwo], today), /클래스 40석/, "현재 briefing item이 대화 context로 유지되어야 한다");
const deferred = board.dailyBriefingAction("later", [...events, nextTwo], today);
assert.strictEqual(deferred.current.key, second.key, "아직은 완료 처리 없이 다음 항목으로 진행해야 한다");
assert.strictEqual(board.buildProactiveAlerts([...events, nextTwo], today).count, 2, "아직 처리한 항목은 미완료 badge count에 남아야 한다");
board.dailyBriefingConversation([...events, nextTwo], today, true);
const progressed = board.dailyBriefingAction("complete", [...events, nextTwo], today);
assert.strictEqual(progressed.current.key, second.key, "완료 후 다음 미완료 항목으로 진행해야 한다");
assert.strictEqual(board.buildDailyBriefing([...events, nextTwo], today).count, 1, "완료 항목은 queue/badge에서 제외해야 한다");
board._setStateForTest({ completions: {}, manual: [overdue, second], checklist: [], pins: {}, setupOverrides: {} });
const countBeforeNewAlert = board.buildProactiveAlerts([...events, nextTwo], today).count;
board._setStateForTest({ completions: {}, manual: [overdue, second], checklist: [], pins: {}, setupOverrides: {}, proactiveAlerts: [{ id: "new-alert", key: "new-alert", type: "event_order_changed", priority: "normal", title: "새 행사 변경", summary: "새 확인 항목", acknowledged: false, completed: false }] });
assert.strictEqual(board.buildProactiveAlerts([...events, nextTwo], today).count, countBeforeNewAlert + 1, "새 alert id가 생기면 기존 대화 자동 삽입 없이 badge count가 증가해야 한다");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const mobile = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const pc = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
assert(source.includes('kind: "manual", metadataSource: "daily_briefing"'), "자동 후보를 체크/고정할 때 기존 공용 setup task로 승격해야 한다");
assert(mobile.includes("board.dailyBriefingAnswer(text, events)") && pc.includes("dailyBriefingAnswer(question, state.getEvents?.() || [])"), "PC/모바일 AI 질문이 공용 briefing source를 사용해야 한다");
assert(!source.includes('class="daily-operations-briefing"'), "A. 운영보드 상단 큰 briefing card를 제거해야 한다");
assert(pc.includes("showDailyBriefing") && pc.includes("data-briefing-action"), "C/D. PC drawer는 briefing 첫 메시지와 progression action을 사용해야 한다");
assert(mobile.includes("showMobileDailyBriefing") && mobile.includes("data-briefing-action"), "H. 모바일도 동일 queue와 completion action을 사용해야 한다");
const mobileHtml = fs.readFileSync("outputs/board/index.html", "utf8");
const desktopHtml = fs.readFileSync("outputs/index.html", "utf8");
assert(mobileHtml.includes("data-mobile-briefing-open") && mobileHtml.includes("data-mobile-ai-briefing-badge"), "모바일은 오늘 브리핑 버튼에 미확인 badge를 표시해야 한다");
assert(!mobile.includes('banquet:operation-board-rendered", () => showMobileDailyBriefing()'), "모바일 보드 렌더 시 briefing 메시지를 자동 삽입하면 안 된다");
assert(mobile.includes('banquet:operation-board-rendered", updateMobileDailyBriefingBadge') && mobile.includes('showMobileDailyBriefing(true)'), "자동 진입은 badge만 갱신하고 사용자 클릭에서만 briefing을 시작해야 한다");
assert(pc.includes("banquet-erp-daily-briefing-seen:") && pc.includes("sessionStorage.getItem(seenKey) === signature"), "PC drawer는 당일 동일 queue 재노출을 sessionStorage로 막아야 한다");
assert(desktopHtml.includes('globalAiLauncher.addEventListener("click", () => openGlobalAiDrawer())') && desktopHtml.includes("showBriefing && !aiAssistant.showDailyBriefing()"), "PC는 launcher로 drawer를 연 경우에만 briefing을 시작해야 한다");

console.log("daily operations briefing V1 tests passed");
