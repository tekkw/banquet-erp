const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const localMemory = new Map();
const context = {
  window: { matchMedia: () => ({ matches: true }) },
  localStorage: { getItem: (key) => localMemory.get(key) || null, setItem: (key, value) => localMemory.set(key, value) },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null },
  crypto: { randomUUID: () => "test-id" },
  console, Date, Set, Map,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/eventDisplayUtils.js", "utf8"), context);
vm.runInContext(source, context);
const board = context.window.BANQUET_ERP_OPERATION_BOARD;

const setup = { key: "next:2026-10-15:burano1", kind: "next_setup", type: "next_setup", date: "2026-10-15", time: "18:00", venue: "부라노1", eventOrderId: "next-event", title: "다음 세팅", completed: false, next: { eventOrderId: "next-event", date: "2026-10-16", time: "09:00", name: "대한체육회" } };
const manual = { key: "manual:pinned", kind: "manual", type: "manual", date: "2026-10-15", time: "19:00", venue: "카프리1", title: "추가 세팅", completed: false };
board._setStateForTest({ pins: { "manual:pinned": true } });
assert.deepStrictEqual(Array.from(board.setupBoardTasks([setup, manual]), (item) => item.key), [manual.key], "모바일에서도 사용자가 고정한 작업만 표시해야 한다");
board._setStateForTest({ pins: { [setup.key]: true, "manual:pinned": true }, completions: { [setup.key]: true } });
setup.completed = true;
assert.deepStrictEqual(Array.from(board.setupBoardTasks([setup, manual]), (item) => item.key), [manual.key], "완료된 고정 작업은 상단에서 제거되어야 한다");

assert(source.includes('data-board-tab="operations"') && source.includes('data-board-tab="setup"'), "운영/다음 세팅 탭을 제공해야 한다");
assert(source.includes("renderTodayAgenda(activeAgenda, completedAgenda)") && source.includes("renderSetupTaskBoard(blocks)"), "각 탭의 기존 기능을 계속 렌더링해야 한다");
assert(source.includes('item_kind: item.kind === "manual" ? "manual" : item.type === "next_setup"'), "setup task는 기존 operation_board_items를 사용해야 한다");
assert(source.includes("operation_board_checklist_items"), "하위 항목은 기존 checklist 저장 구조를 사용해야 한다");
assert(source.includes("pinned: !!state.pins[item.key]"));
assert(source.includes("setupOverride: state.setupOverrides[item.key] || null"));
assert(source.includes("renderOriginalAction(item.eventOrderId)"), "원본 엑셀은 연결된 다음 행사 ID를 사용해야 한다");
assert(source.includes("data-edit-item") && source.includes("data-delete-item") && source.includes("data-check-item"));
assert(source.includes("data-restore-complete"), "완료된 setup task를 복원할 수 있어야 한다");
assert(source.includes("syncItem(block); render();"), "완료 상태는 공용 record에 저장되어야 한다");
assert(source.includes("renderSpaceGroups(spaceGroups)"), "기존 공간별 운영보드를 계속 렌더링해야 한다");
assert(source.includes('const setupActions = `<div class="operation-block-actions">'), "모든 원본 카드에서 상단 고정이 가능해야 한다");
const groups = Array.from(board.groupBlocksBySpace([
  { key: "convention", venue: "컨벤션A", time: "09:00" },
  { key: "burano", venue: "부라노1", time: "10:00" },
  { key: "capri", venue: "카프리1", time: "11:00" },
]), (group) => group.name);
assert(groups.includes("컨벤션A") && groups.includes("부라노1") && groups.includes("카프리1"), "기존 일정은 실제 행사장별 그룹에 남아야 한다");
assert.strictEqual(board.getVenueGroup("3F 컨벤션A"), "컨벤션A");
assert.strictEqual(board.getVenueGroup("3F 부라노 I"), "부라노1");
assert.strictEqual(board.getVenueGroup("3F 부라노 III"), "부라노3");
assert.strictEqual(board.getVenueGroup("2F 카프리 I"), "카프리1");
assert.strictEqual(board.getVenueGroup("카프리"), "카프리전체");
assert.notStrictEqual(board.getVenueGroup("2F 카프리 III"), "기타", "정상 venue를 기타로 분류하면 안 된다");
assert(source.includes('data-setup-editor') && source.includes('name="eventOrderId"'), "수정은 행사 선택 modal을 사용해야 한다");
assert(!source.includes('prompt("연결 행사 ID"'), "행사 ID를 문자열 prompt로 수정하면 안 된다");
assert(source.includes("eventOrderId: data.eventOrderId") && source.includes("setupEventDetails(linkedEvent)"), "선택 행사의 실제 ID와 표시 정보를 연결해야 한다");
assert(source.includes("data-editor-child-add") && source.includes("data-editor-child-delete") && source.includes("data-editor-child-complete"), "modal에서 하위 항목을 관리할 수 있어야 한다");
assert(source.includes('class="setup-venue-badge"') && source.includes('class="setup-task-summary"'), "상단 카드는 장소 badge와 하위 항목 요약을 표시해야 한다");
assert(source.includes("setup-editor-dialog") && source.includes("showModal()"), "모바일도 공용 행사 선택 editor를 사용해야 한다");

assert.deepStrictEqual({ ...board.setupCandidateDateRange("2026-10-15") }, { start: "2026-10-15", end: "2026-10-25" }, "오늘부터 다음 주 일요일까지 계산해야 한다");
board._setEventsForTest([
  { id: "past", companyName: "지난 행사", eventName: "지난 행사명", calendarDates: ["2026-10-14"], venue: "부라노1", guestCount: 10 },
  { id: "today", companyName: "오늘 주최", eventName: "긴 오늘 행사명", calendarDates: ["2026-10-15"], venue: "부라노1", guestCount: 20, schedule: [{ date: "2026-10-15", time: "09:00", venue: "부라노1" }] },
  { id: "week", companyName: "이번주 주최", eventName: "이번주 행사", calendarDates: ["2026-10-18"], venue: "부라노1", guestCount: 30 },
  { id: "sunday", organizer: "다음주 일요일", eventName: "일요일 행사", calendarDates: ["2026-10-25"], venue: "부라노1", guestCount: 40 },
  { id: "fallback", eventName: "행사명 대체", calendarDates: ["2026-10-20"], venue: "카프리2", guestCount: 50 },
  { id: "later", companyName: "범위 밖", eventName: "이후 행사", calendarDates: ["2026-10-26"], venue: "부라노1", guestCount: 60 },
]);
const candidates = board.setupEventCandidates("부라노1", "2026-10-15");
assert(!candidates.some((item) => item.event.id === "past") && !candidates.some((item) => item.event.id === "later"), "과거와 다음 주 일요일 이후 행사를 제외해야 한다");
assert(candidates.some((item) => item.event.id === "today") && candidates.some((item) => item.event.id === "week") && candidates.some((item) => item.event.id === "sunday"), "오늘, 이번 주, 다음 주 일요일 행사를 포함해야 한다");
assert.deepStrictEqual(Array.from(candidates.filter((item) => item.overlap), (item) => item.details.eventDate), ["2026-10-15", "2026-10-18", "2026-10-25"], "같은 공간 후보는 날짜 오름차순이어야 한다");
assert.strictEqual(board.formatSetupCandidateLabel(candidates.find((item) => item.event.id === "today").details), "10/15 · 오늘 주최 · 부1 · 20명", "organizer와 compact venue만 기본 label에 표시해야 한다");
assert.strictEqual(board.formatSetupCandidateLabel(candidates.find((item) => item.event.id === "fallback").details), "10/20 · 행사명 대체 · 카2 · 50명", "organizer가 없으면 event_name을 사용해야 한다");

console.log("operation-board setup task V1 tests passed");
