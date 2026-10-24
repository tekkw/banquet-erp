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
assert(source.includes("scheduledDate, scheduledTime") && source.includes("setupOverride"));
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
assert(source.includes('name="scheduledDate"') && source.includes('name="scheduledTime"'), "세팅 예정 날짜와 시간을 별도 필드로 저장해야 한다");
assert(!source.includes("form.elements.eventDate.value = details.eventDate"), "연결 행사일로 기존 예정일을 덮어쓰면 안 된다");
assert(source.includes("item.recordId ? `operation_board_items?id=eq."), "persistent task 수정과 완료는 task id로 갱신해야 한다");
assert(source.includes("data-editor-child-add") && source.includes("data-editor-child-delete") && source.includes("data-editor-child-complete"), "modal에서 하위 항목을 관리할 수 있어야 한다");
assert(source.includes('class="setup-venue-badge"') && source.includes('data-setup-detail'), "상단 카드는 compact 장소 badge와 상세 보기 동작을 제공해야 한다");
assert(source.includes("setup-editor-dialog") && source.includes("showModal()"), "모바일도 공용 행사 선택 editor를 사용해야 한다");
assert(source.includes('data-setup-create') && source.includes('data-setup-create-form'), "다음 세팅 탭에서 공용 setup editor로 수동 작업을 추가해야 한다");
assert(source.includes('name="pinned" type="checkbox" checked'), "생성 시 상단 고정을 선택할 수 있어야 한다");
assert(source.includes('metadataSource: "manual_setup_task"') && source.includes('type: "next_setup"'), "수동 작업도 공용 next_setup task 구조를 사용해야 한다");
assert(source.includes('syncItem(item, { throwOnError: true })') && source.includes('syncChecklist(child, false, { throwOnError: true })'), "부모와 하위 항목을 공용 원격 저장소에 저장해야 한다");
assert(source.includes('이미 다음 세팅 작업이 있습니다.') && source.includes('data-open-existing-setup'), "중복 안내에서 기존 작업을 열 수 있어야 한다");
assert(source.includes('data-setup-venue-search') && source.includes('renderSetupVenueOptions'), "PC/모바일 공용 editor가 검색 가능한 canonical 공간 목록을 사용해야 한다");
assert(!source.includes('const venues = [...new Set([item.venue'), "원본 venue 문자열을 공간 option으로 직접 만들면 안 된다");
assert.deepStrictEqual(Array.from(board.setupVenueCodes({ venue: "3F 페스타, 부라노 I+II+III" })), ["FESTA", "BURANO_ALL"], "복합 venue는 canonical 공간으로 분해해야 한다");
assert.deepStrictEqual(Array.from(board.setupVenueCodes({ venue: "3F 부라노 I" })), ["BURANO_1"], "단일 venue는 자동 선택 가능한 canonical 공간이어야 한다");
const pcOptions = board.renderSetupVenueOptions("카프리2");
context.window.matchMedia = () => ({ matches: false });
const mobileOptions = board.renderSetupVenueOptions("카프리2");
assert.strictEqual(pcOptions, mobileOptions, "PC/모바일은 동일한 공간 후보 builder를 사용해야 한다");
assert(pcOptions.includes('<optgroup label="컨벤션">') && pcOptions.includes('<optgroup label="부라노">') && pcOptions.includes('<optgroup label="카프리">') && pcOptions.includes('<optgroup label="기타">'));

assert.deepStrictEqual({ ...board.setupCandidateDateRange("2026-10-15") }, { start: "2026-10-15", end: "2026-10-25" }, "오늘부터 다음 주 일요일까지 계산해야 한다");
board._setEventsForTest([
  { id: "past", companyName: "지난 행사", eventName: "지난 행사명", calendarDates: ["2026-10-14"], venue: "부라노1", guestCount: 10 },
  { id: "today", companyName: "오늘 주최", eventName: "긴 오늘 행사명", calendarDates: ["2026-10-15"], venue: "부라노1", guestCount: 20, schedule: [{ date: "2026-10-15", time: "09:00", venue: "부라노1", content: "행사 시작" }] },
  { id: "week", companyName: "이번주 주최", eventName: "이번주 행사", calendarDates: ["2026-10-18"], venue: "부라노1", guestCount: 30 },
  { id: "sunday", organizer: "다음주 일요일", eventName: "일요일 행사", calendarDates: ["2026-10-25"], venue: "부라노1", guestCount: 40 },
  { id: "fallback", eventName: "행사명 대체", calendarDates: ["2026-10-20"], venue: "카프리2", guestCount: 50 },
  { id: "later", companyName: "범위 밖", eventName: "이후 행사", calendarDates: ["2026-10-26"], venue: "부라노1", guestCount: 60 },
  { id: "future-event", companyName: "미래 주최", eventName: "긴 미래 행사명", calendarDates: ["2026-10-24"], venue: "부라노1", schedule: [{ date: "2026-10-24", time: "13:00", content: "행사 시작" }] },
  { id: "future-no-time", companyName: "시간 없는 행사", eventName: "시간 없는 행사명", calendarDates: ["2026-10-24"], venue: "부라노1" },
]);
const candidates = board.setupEventCandidates("부라노1", "2026-10-15");
assert(!candidates.some((item) => item.event.id === "past") && !candidates.some((item) => item.event.id === "later"), "과거와 다음 주 일요일 이후 행사를 제외해야 한다");
assert(candidates.some((item) => item.event.id === "today") && candidates.some((item) => item.event.id === "week") && candidates.some((item) => item.event.id === "sunday"), "오늘, 이번 주, 다음 주 일요일 행사를 포함해야 한다");
assert.deepStrictEqual(Array.from(candidates, (item) => item.details.eventDate), ["2026-10-15", "2026-10-18", "2026-10-20", "2026-10-24", "2026-10-24", "2026-10-25"], "공간과 무관하게 전체 후보를 날짜 오름차순으로 표시해야 한다");
assert.deepStrictEqual(Array.from(candidates.filter((item) => item.overlap), (item) => item.details.eventDate), ["2026-10-15", "2026-10-18", "2026-10-24", "2026-10-24", "2026-10-25"], "같은 공간 후보는 날짜 오름차순이어야 한다");
assert.strictEqual(board.formatSetupCandidateLabel(candidates.find((item) => item.event.id === "today").details), "10/15 · 오늘 주최 · 부1 · 20명", "organizer와 compact venue만 기본 label에 표시해야 한다");
assert.strictEqual(board.formatSetupCandidateLabel(candidates.find((item) => item.event.id === "fallback").details), "10/20 · 행사명 대체 · 카2 · 50명", "organizer가 없으면 event_name을 사용해야 한다");
const organizerCard = board.setupCardInfo({ type: "next_setup", venue: "부라노1", eventOrderId: "today", next: { eventOrderId: "today", date: "2026-10-15", time: "09:00", name: "긴 오늘 행사명", people: 20 } });
assert.deepStrictEqual({ ...organizerCard }, { eventOrderId: "today", title: "오늘 주최", date: "2026-10-15", time: "09:00", eventDate: "2026-10-15", eventTime: "09:00", venue: "부1", people: 20 }, "B/D. 카드는 세팅과 행사 날짜/시간을 분리해야 한다");
const fallbackCard = board.setupCardInfo({ type: "next_setup", venue: "카프리2", eventOrderId: "fallback", next: { eventOrderId: "fallback", date: "2026-10-20", time: "13:00", name: "행사명 대체", people: 50 } });
assert.strictEqual(fallbackCard.title, "행사명 대체", "C. organizer가 없으면 event_name을 사용해야 한다");
assert(source.includes("LAY &amp; OUT") && source.includes("OTHERS"), "I. 긴 행사명과 LAY & OUT/OTHERS는 상세 modal에서 확인할 수 있어야 한다");
const duplicateBlocks = [{ key: "manual-setup:one", kind: "manual", type: "next_setup", date: "2026-10-15", venue: "부라노1", eventOrderId: "week", next: { date: "2026-10-18" } }];
assert.strictEqual(board.findLocalSetupDuplicate("week", "부라노1", "2026-10-18", duplicateBlocks)?.key, "manual-setup:one", "eventOrderId + venue + 예정 날짜 중복을 찾아야 한다");
assert.strictEqual(board.findLocalSetupDuplicate("week", "부라노2", "2026-10-18", duplicateBlocks), null, "공간이 다르면 별도 세팅 작업을 허용해야 한다");

const persistent = { key: "manual-setup:persistent", kind: "manual", type: "next_setup", date: "2026-10-19", time: "08:00", venue: "페스타", eventOrderId: "week", title: "콘텐츠랩", completed: false };
board._setStateForTest({ manual: [persistent], pins: { [persistent.key]: true }, setupOverrides: { [persistent.key]: { eventDate: "2026-10-20", time: "08:00" } } });
assert(Array.from(board.allBlocks("2026-10-19", [])).some((item) => item.key === persistent.key), "A. 등록일에도 미완료 setup task를 표시해야 한다");
assert(Array.from(board.allBlocks("2026-10-20", [])).some((item) => item.key === persistent.key), "B. 예정일에도 미완료 setup task를 표시해야 한다");
const nextDayBlocks = Array.from(board.allBlocks("2026-10-21", []));
assert(nextDayBlocks.some((item) => item.key === persistent.key), "C. 예정일 다음 날에도 미완료 setup task를 유지해야 한다");
assert(board.isSetupOverdue(nextDayBlocks.find((item) => item.key === persistent.key), "2026-10-21"), "C. 예정일이 지난 미완료 task는 지연이어야 한다");
persistent.completed = true;
assert(!Array.from(board.allBlocks("2026-10-21", [])).filter((item) => !item.completed).some((item) => item.key === persistent.key), "D. 완료한 task는 active 목록에서 제거되어야 한다");
persistent.completed = false;
assert.deepStrictEqual(Array.from(board.setupBoardTasks(board.allBlocks("2026-10-21", [])), (item) => item.key), [persistent.key], "E. pinned 미완료 task는 날짜가 지나도 상단에 유지해야 한다");
const ordering = [
  { ...persistent, key: "future", next: { date: "2026-10-22", time: "09:00" } },
  { ...persistent, key: "overdue", next: { date: "2026-10-20", time: "09:00" } },
  { ...persistent, key: "today", next: { date: "2026-10-21", time: "09:00" } },
];
assert.deepStrictEqual(Array.from(board.sortSetupTasks(ordering, "2026-10-21"), (item) => item.key), ["overdue", "today", "future"], "지연, 오늘, 미래 순으로 정렬해야 한다");
const overdueOrdering = [
  { ...persistent, key: "later-time", scheduledDate: "2026-10-20", scheduledTime: "10:00" },
  { ...persistent, key: "older", scheduledDate: "2026-10-19", scheduledTime: "18:00" },
  { ...persistent, key: "earlier-time", scheduledDate: "2026-10-20", scheduledTime: "08:00" },
];
assert.deepStrictEqual(Array.from(board.sortSetupTasks(overdueOrdering, "2026-10-25"), (item) => item.key), ["older", "earlier-time", "later-time"], "지연 작업은 scheduledDate와 scheduledTime 오름차순이어야 한다");
const futurePinned = { key: "future-pinned", id: "future-pinned", kind: "manual", type: "next_setup", date: "2026-10-21", venue: "부라노1", eventOrderId: "future-event", next: { eventOrderId: "future-event", date: "2026-10-22", name: "긴 미래 행사명" } };
board._setStateForTest({ pins: { [futurePinned.key]: true }, completions: {} });
assert.strictEqual(board.getPinnedSetupStatus(futurePinned, "2026-10-21"), "future");
assert.deepStrictEqual(Array.from(board.setupBoardTasks([futurePinned], "2026-10-21"), (item) => item.key), [futurePinned.key], "미래 persistent pinned task도 상단 고정 대상에 포함한다");
assert.deepStrictEqual(Array.from(board.setupBoardTasks([futurePinned], "2026-10-22"), (item) => item.key), [futurePinned.key], "B. 예정일 당일 표시한다");
const separatedDates = { ...futurePinned, key: "separated-dates", scheduledDate: "2026-10-23", scheduledTime: "07:00", next: { eventOrderId: "future-event", eventDate: "2026-10-24", name: "긴 미래 행사명" } };
board._setStateForTest({ pins: { [separatedDates.key]: true }, completions: {} });
assert.deepStrictEqual({ ...board.setupCardInfo(separatedDates) }, { eventOrderId: "future-event", title: "미래 주최", date: "2026-10-23", time: "07:00", eventDate: "2026-10-24", eventTime: "13:00", venue: "부1", people: "" }, "행사일/시간과 scheduledDate/time을 각각 표시해야 한다");
const eventWithoutTime = board.setupCardInfo({ ...separatedDates, eventOrderId: "future-no-time", next: { eventOrderId: "future-no-time", eventDate: "2026-10-24" } });
assert.strictEqual(eventWithoutTime.eventDate, "2026-10-24", "행사 날짜는 연결 event에서 표시해야 한다");
assert.strictEqual(eventWithoutTime.eventTime, "", "명확한 행사 시작시간이 없으면 시간을 생성하지 않아야 한다");
assert.deepStrictEqual(Array.from(board.setupBoardTasks([separatedDates], "2026-10-22", "2026-10-22"), (item) => item.key), [separatedDates.key], "선택일 이후의 persistent pinned task는 세팅 예정 그룹 대상이다");
assert.deepStrictEqual(Array.from(board.setupBoardTasks([separatedDates], "2026-10-23", "2026-10-22"), (item) => item.key), [separatedDates.key], "선택일 10/23에는 미래 탐색 중에도 task를 표시해야 한다");
assert.deepStrictEqual(Array.from(board.setupBoardTasks([separatedDates], "2026-10-24", "2026-10-24"), (item) => item.key), [separatedDates.key], "실제 오늘 10/24에는 미완료 10/23 task를 지연 표시해야 한다");
assert.deepStrictEqual(Array.from(board.setupBoardTasks([separatedDates], "2026-10-25", "2026-10-24"), (item) => item.key), [separatedDates.key], "선택일이 더 늦어져도 미완료 persistent task를 유지해야 한다");
assert.strictEqual(board.getPinnedSetupStatus(futurePinned, "2026-10-23"), "overdue", "C. 지난 미완료 작업은 지연이다");
board._setStateForTest({ pins: { [futurePinned.key]: true }, completions: { [futurePinned.key]: true } });
assert.strictEqual(board.getPinnedSetupStatus(futurePinned, "2026-10-23"), "completed");
assert.strictEqual(board.setupBoardTasks([futurePinned], "2026-10-23").length, 0, "D. 완료 작업은 상단에서 제거한다");
const automaticDuplicate = { ...futurePinned, key: "auto-duplicate", id: undefined, kind: "next_setup" };
board._setStateForTest({ pins: { [futurePinned.key]: true, [automaticDuplicate.key]: true }, completions: {} });
assert.deepStrictEqual(Array.from(board.setupBoardTasks([automaticDuplicate, futurePinned], "2026-10-22"), (item) => item.key), [futurePinned.key], "E. persistent task가 동일 자동 후보보다 우선한다");
const separate = { ...futurePinned, key: "separate", id: "separate" };
board._setStateForTest({ pins: { [futurePinned.key]: true, [separate.key]: true }, completions: { [futurePinned.key]: true } });
assert.deepStrictEqual(Array.from(board.setupBoardTasks([futurePinned, separate], "2026-10-22"), (item) => item.key), [separate.key], "F. 별도 persistent task는 하나를 완료해도 유지한다");
const groupedTasks = [
  { ...futurePinned, key: "past-old", scheduledDate: "2026-10-20", scheduledTime: "09:00", venue: "카프리1" },
  { ...futurePinned, key: "past-near", scheduledDate: "2026-10-22", scheduledTime: "08:00", venue: "부라노1" },
  { ...futurePinned, key: "today", scheduledDate: "2026-10-23", scheduledTime: "18:00", venue: "페스타" },
  { ...futurePinned, key: "future-a", scheduledDate: "2026-10-24", scheduledTime: "07:00", venue: "카프리2" },
  { ...futurePinned, key: "future-b", scheduledDate: "2026-10-24", scheduledTime: "07:00", venue: "부라노1" },
  { ...futurePinned, key: "done", scheduledDate: "2026-10-19", completed: true },
];
board._setStateForTest({ pins: Object.fromEntries(groupedTasks.map((item) => [item.key, true])), completions: {} });
const groupedOn23 = board.groupPinnedSetupTasks(groupedTasks, "2026-10-23", "2026-10-23");
assert.deepStrictEqual(Array.from(groupedOn23.overdue, (item) => item.key), ["past-old", "past-near"], "A/G. 지연은 오래된 scheduledDate/time 순이다");
assert.deepStrictEqual(Array.from(groupedOn23.upcoming, (item) => item.key), ["today", "future-b", "future-a"], "B/C/H. 예정은 가까운 날짜/time/venue 순이다");
const groupedOn24 = board.groupPinnedSetupTasks(groupedTasks, "2026-10-24", "2026-10-24");
assert(groupedOn24.overdue.some((item) => item.key === "today") && !groupedOn24.upcoming.some((item) => item.key === "today"), "E. 같은 task가 날짜 경과 후 예정에서 지연으로 이동한다");
assert(!groupedOn23.overdue.some((item) => item.key === "done") && !groupedOn23.upcoming.some((item) => item.key === "done"), "D. 완료 task는 양쪽에서 제외한다");
const accordionTasks = [
  ...Array.from({ length: 9 }, (_, index) => ({ ...futurePinned, key: `accordion-overdue-${index}`, scheduledDate: `2026-10-${String(index + 1).padStart(2, "0")}`, scheduledTime: "09:00", metadata: index < 2 ? { readiness: "blocked" } : {} })),
  { ...futurePinned, key: "accordion-upcoming", scheduledDate: "2026-10-24", scheduledTime: "07:00" },
];
board.setSelectedDate("2026-10-23");
board._setStateForTest({ pins: Object.fromEntries(accordionTasks.map((item) => [item.key, true])), completions: {} });
board._setPinnedSetupUiForTest();
const collapsedSetup = board.renderSetupTaskBoard(accordionTasks);
assert(collapsedSetup.includes("지연 <strong>9</strong>") && collapsedSetup.includes("세팅 예정 <strong>1</strong>") && collapsedSetup.includes("확인 필요 <strong>2</strong>"), "A/G. PC/모바일 공용 summary가 상태별 count를 표시해야 한다");
assert(!collapsedSetup.includes('class="setup-task-card"'), "A. 기본 상태에서는 task card를 렌더링하지 않아야 한다");
board._setPinnedSetupUiForTest("overdue");
const overduePanel = board.renderSetupTaskBoard(accordionTasks);
assert(overduePanel.includes('data-setup-panel="overdue"') && !overduePanel.includes('data-setup-panel="upcoming"'), "B. 지연을 열면 지연 panel만 표시해야 한다");
assert.strictEqual((overduePanel.match(/class="setup-task-card"/g) || []).length, 4, "D. panel은 처음 최대 4건만 렌더링해야 한다");
assert(overduePanel.includes("+5건 더 보기"), "D. 남은 task 수를 더 보기 버튼에 표시해야 한다");
board._setPinnedSetupUiForTest("upcoming");
const upcomingPanel = board.renderSetupTaskBoard(accordionTasks);
assert(upcomingPanel.includes('data-setup-panel="upcoming"') && !upcomingPanel.includes('data-setup-panel="overdue"'), "C. 예정을 열면 지연 panel이 닫혀야 한다");
board._setPinnedSetupUiForTest("all");
const allPanels = board.renderSetupTaskBoard(accordionTasks);
assert(allPanels.includes('data-setup-panel="overdue"') && allPanels.includes('data-setup-panel="upcoming"') && allPanels.includes('data-setup-panel="attention"'), "전체 보기는 세 그룹을 함께 표시해야 한다");
const withoutOneTask = accordionTasks.slice(1);
board._setStateForTest({ pins: Object.fromEntries(withoutOneTask.map((item) => [item.key, true])), completions: {} });
assert.strictEqual(board.pinnedSetupSummary(withoutOneTask, "2026-10-23", "2026-10-23").overdue.length, 8, "E/F. 완료 또는 고정 해제 후 summary count가 즉시 감소해야 한다");
context.window.matchMedia = () => ({ matches: true }); const mobilePersistent = Array.from(board.allBlocks("2026-10-21", []), (item) => item.key);
context.window.matchMedia = () => ({ matches: false }); const pcPersistent = Array.from(board.allBlocks("2026-10-21", []), (item) => item.key);
assert.deepStrictEqual(pcPersistent, mobilePersistent, "F. PC/모바일이 같은 지속 표시 결과를 사용해야 한다");
assert(source.includes('item_kind=eq.manual&order=board_date.asc') && source.includes('item.date === boardDate || item.type === "next_setup"'), "원격과 로컬 날짜 필터 모두 setup task를 예외 처리해야 한다");

console.log("operation-board setup task V1 tests passed");
