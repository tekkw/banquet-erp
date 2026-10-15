const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const localMemory = new Map();
let mobile = true;
const context = {
  window: { matchMedia: () => ({ matches: mobile }) },
  localStorage: { getItem: (key) => localMemory.get(key) || null, setItem: (key, value) => localMemory.set(key, value) },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null },
  crypto: { randomUUID: () => "test-id" },
  console, Date, Set, Map,
};
vm.createContext(context);
vm.runInContext(source, context);
const board = context.window.BANQUET_ERP_OPERATION_BOARD;

const setup = { key: "next:2026-10-15:burano1", kind: "next_setup", type: "next_setup", date: "2026-10-15", time: "18:00", venue: "부라노1", eventOrderId: "next-event", title: "다음 세팅", completed: false, next: { eventOrderId: "next-event", date: "2026-10-16", time: "09:00", name: "대한체육회" } };
const manual = { key: "manual:pinned", kind: "manual", type: "manual", date: "2026-10-15", time: "19:00", venue: "카프리1", title: "추가 세팅", completed: false };
board._setStateForTest({ pins: { "manual:pinned": true } });
assert.deepStrictEqual(Array.from(board.setupBoardTasks([setup, manual]), (item) => item.key), [setup.key, manual.key], "모바일은 자동 next setup과 고정 작업을 표시해야 한다");
mobile = false;
assert.deepStrictEqual(Array.from(board.setupBoardTasks([setup, manual]), (item) => item.key), [manual.key], "PC 상단은 고정 작업만 표시해야 한다");

assert(source.indexOf("renderSetupTaskBoard(blocks)") < source.indexOf("renderTodayAgenda(activeAgenda"), "세팅 보드는 오늘 일정 위에 있어야 한다");
assert(source.includes('item_kind: item.kind === "manual" ? "manual" : item.type === "next_setup"'), "setup task는 기존 operation_board_items를 사용해야 한다");
assert(source.includes("operation_board_checklist_items"), "하위 항목은 기존 checklist 저장 구조를 사용해야 한다");
assert(source.includes("pinned: !!state.pins[item.key]"));
assert(source.includes("setupOverride: state.setupOverrides[item.key] || null"));
assert(source.includes("renderOriginalAction(item.eventOrderId)"), "원본 엑셀은 연결된 다음 행사 ID를 사용해야 한다");
assert(source.includes("data-edit-item") && source.includes("data-delete-item") && source.includes("data-check-item"));
assert(source.includes("data-restore-complete"), "완료된 setup task를 복원할 수 있어야 한다");
assert(source.includes("syncItem(block); render();"), "완료 상태는 공용 record에 저장되어야 한다");

console.log("operation-board setup task V1 tests passed");
