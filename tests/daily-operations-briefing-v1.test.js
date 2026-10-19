const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const memory = new Map();
const context = {
  window: {},
  localStorage: { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null },
  crypto: { randomUUID: () => "test-id" },
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
  { id: "next", eventName: "긴 행사명", companyName: "콘텐츠랩", calendarDates: ["2026-10-20"], venue: "페스타", layoutText: "Class Type 40석", othersText: "등록테이블 2T / 마이크 2EA", schedule: [{ date: "2026-10-20", time: "08:00", content: "행사 시작", venue: "페스타" }] },
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
assert.strictEqual(board.dailyBriefingAnswer("오늘 뭐 해야 돼?", events, today), briefing.candidates.map((item) => `${item.venue} · ${item.eventTitle}\n${item.summary}`).join("\n"), "J. AI 질문은 동일 briefing source를 사용해야 한다");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const mobile = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const pc = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
assert(source.includes('kind: "manual", metadataSource: "daily_briefing"'), "자동 후보를 체크/고정할 때 기존 공용 setup task로 승격해야 한다");
assert(mobile.includes("board.dailyBriefingAnswer(text, events)") && pc.includes("dailyBriefingAnswer(question, state.getEvents?.() || [])"), "PC/모바일 AI 질문이 공용 briefing source를 사용해야 한다");

console.log("daily operations briefing V1 tests passed");
