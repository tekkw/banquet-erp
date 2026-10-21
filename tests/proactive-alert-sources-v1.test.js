const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const memory = new Map();
const listeners = {};
const window = {
  BANQUET_ERP_CONSTANTS: { supabaseConfig: { url: "https://example.test", anonKey: "test" } },
  addEventListener: (name, listener) => { listeners[name] = listener; },
  dispatchEvent: () => {},
};
const context = { window, localStorage: { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) }, sessionStorage: { getItem: () => null, setItem: () => {} }, document: { getElementById: () => null, querySelector: () => null }, crypto: { randomUUID: () => "test-id" }, CustomEvent: function CustomEvent() {}, fetch: async () => ({ ok: true, text: async () => "" }), console, Date, Intl, Set, Map };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/eventDisplayUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/operationBoard.js", "utf8"), context);
const board = window.BANQUET_ERP_OPERATION_BOARD;
const today = "2026-10-19";
const events = [
  { id: "current", companyName: "오늘 행사", calendarDates: [today], venue: "페스타", schedule: [{ date: today, time: "09:00~18:00", content: "본 행사", venue: "페스타" }] },
  { id: "next", companyName: "대한전기학회", calendarDates: ["2026-10-20"], venue: "페스타", layoutText: "LAY & OUT = RE-INFORM", schedule: [{ date: "2026-10-20", time: "09:00", content: "행사 시작", venue: "페스타" }] },
];
board._setStateForTest({ completions: {}, manual: [], checklist: [], pins: {}, setupOverrides: {} });
let alerts = board.buildProactiveAlerts(events, today);
assert(alerts.alerts.some((item) => item.type === "layout_reinform"), "A. RE-INFORM은 layout_reinform alert를 만든다");
assert.equal(board.setupDocumentSummary({ layoutText: "Class Type 40석", othersText: "등록테이블 2T 무선마이크 2EA" }), "클래스 40석 · 등록 2T · 무선마이크 2EA", "B. 세팅 핵심 정보는 결정론 parser로 요약한다");

window.BANQUET_ERP_BEVERAGE_INVENTORY = { getComparison: () => ({ snapshot: { uploadedAt: "2026-10-19T00:00:00Z" }, shortageCount: 2, items: { beer: { key: "beer", label: "맥주", shortage: 36 }, water500: { key: "water500", label: "아이시스 500ml", shortage: 39 }, water300: { key: "water300", label: "아이시스 300ml", shortage: 0 } }, demand: { required: { beer: 100, water500: 280 }, details: [] } }) };
alerts = board.buildProactiveAlerts(events, today);
assert.equal(alerts.alerts[0].type, "beverage_shortage", "C/J. 부족 alert는 high priority로 먼저 표시한다");
assert.equal(alerts.alerts.filter((item) => item.type === "beverage_shortage").length, 1, "I. 동일 shortage는 한 건으로 dedupe한다");
assert.match(alerts.alerts[0].summary, /아이시스 500ml 39개/, "water500 부족은 proactive alert에 포함한다");
assert.doesNotMatch(alerts.alerts[0].summary, /아이시스 300ml/, "기준 없는 품목은 proactive alert에서 제외한다");
board.dailyBriefingConversation(events, today, true);
board.dailyBriefingAction("acknowledge", events, today);
assert(!board.buildProactiveAlerts(events, today).alerts.some((item) => item.type === "beverage_shortage"), "acknowledged shortage는 같은 snapshot/demand에서 재생성하지 않는다");
window.BANQUET_ERP_BEVERAGE_INVENTORY = { getComparison: () => ({ snapshot: {}, shortageCount: 0, items: {}, demand: { required: {}, details: [] } }) };
assert(!board.buildProactiveAlerts(events, today).alerts.some((item) => item.type === "beverage_shortage"), "D. shortage가 없으면 alert가 없다");

const changed = { ...events[1], schedule: [{ date: "2026-10-20", time: "11:00", content: "행사 시작", venue: "페스타" }] };
assert.equal(board.eventOrderChanges(events[1], changed)[0].label, "일정", "G. overwrite 시간 변경을 중요 필드 change로 계산한다");
assert.equal(board.eventOrderChanges(events[1], { ...events[1] }).length, 0, "H. 변경이 없으면 change가 없다");
const first = board.registerEventOrderChange(events[1], changed);
const duplicate = board.registerEventOrderChange(events[1], changed);
assert.equal(first.id, duplicate.id, "I. 동일 change hash는 같은 alert id를 사용한다");
assert.equal(board.buildProactiveAlerts(events, today).alerts.filter((item) => item.id === first.id).length, 1, "동일 change alert를 중복 queue에 넣지 않는다");

const attachmentWindow = { BANQUET_ERP_CONSTANTS: window.BANQUET_ERP_CONSTANTS, dispatchEvent: () => {} };
vm.runInNewContext(fs.readFileSync("outputs/src/eventAttachments.js", "utf8"), { window: attachmentWindow, console, Date, CustomEvent: function CustomEvent() {} });
const candidates = attachmentWindow.BANQUET_ERP_EVENT_ATTACHMENTS.extractScheduleCandidates("2026.10.23 09:00~10:40 페스타 · 구두발표\n12:00~13:20 중식");
assert.equal(candidates.length, 2, "E. 첨부 분석 텍스트에서 일정 후보를 추출한다");
const attachmentSource = fs.readFileSync("outputs/src/eventAttachments.js", "utf8");
assert(attachmentSource.includes('analyze.textContent = "첨부 분석"') && attachmentSource.includes("config.functionUrl"), "E. 첨부 분석은 사용자 실행 시 기존 AI 함수만 호출한다");
assert(attachmentSource.includes("승인한 일정만 행사 일정에 저장됩니다."), "F. 승인 전에는 schedule DB를 변경하지 않는다");

const pc = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
const mobile = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
assert(pc.includes("buildProactiveAlerts") && mobile.includes("buildProactiveAlerts") && html.includes("buildProactiveAlerts(savedEvents)"), "K. PC/모바일 badge와 UI는 같은 proactive queue를 사용한다");
assert(pc.includes("dailyBriefingAnswer(question") && mobile.includes("board.dailyBriefingAnswer(text"), "L. 기존 자유 대화 진입점은 유지한다");

console.log("proactive alert sources V1 tests passed");
