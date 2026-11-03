const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");

function createBoard(fetchImpl) {
  const memory = new Map();
  const requests = [];
  const context = {
    window: {
      matchMedia: () => ({ matches: true }),
      addEventListener: () => {},
      BANQUET_ERP_CONSTANTS: { supabaseConfig: { url: "https://example.supabase.co", anonKey: "test-key" } },
    },
    localStorage: { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: { getElementById: () => null, body: null },
    fetch: async (url, options) => { requests.push({ url, options }); return fetchImpl(url, options); },
    crypto: { randomUUID: () => "test-id" },
    console, Date, Intl, Set, Map,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("outputs/src/eventDisplayUtils.js", "utf8"), context);
  vm.runInContext(source, context);
  return { board: context.window.BANQUET_ERP_OPERATION_BOARD, memory, requests };
}

function task(overrides = {}) {
  return { key: "setup:event-1:burano-1", id: "setup:event-1:burano-1", recordId: "row-1", kind: "manual", type: "next_setup", date: "2026-11-03", scheduledDate: "2026-11-03", time: "09:00", venue: "부라노1", eventOrderId: "event-1", title: "다음 세팅", completed: false, metadata: { source: "manual_board_task" }, ...overrides };
}

(async () => {
  const success = createBoard(async () => ({ ok: true, text: async () => '[{"id":"row-1","is_completed":true}]' }));
  success.board._setStateForTest({ manual: [task()], pins: { "setup:event-1:burano-1": true } });
  assert.strictEqual(await success.board.completeBoardItem("setup:event-1:burano-1", true, "2026-11-03"), true);
  const completedPayload = JSON.parse(success.requests[0].options.body);
  assert.strictEqual(completedPayload.is_completed, true, "완료는 operation_board_items.is_completed에 저장해야 한다");
  assert.deepStrictEqual(Object.keys(completedPayload).sort(), ["is_completed", "metadata"], "기존 row 완료 PATCH는 FK 필드를 다시 쓰지 않아야 한다");
  assert.strictEqual(completedPayload.metadata.source, "manual_board_task", "기존 metadata를 보존해야 한다");

  const created = createBoard(async () => ({ ok: true, text: async () => '[{"id":"row-created","is_completed":true}]' }));
  created.board._setStateForTest({ manual: [task({ recordId: undefined })] });
  assert.strictEqual(await created.board.completeBoardItem("setup:event-1:burano-1", true, "2026-11-03"), true);
  const createPayload = JSON.parse(created.requests[0].options.body);
  assert.strictEqual(createPayload.item_key, "setup:event-1:burano-1", "row가 없는 raw 후보는 화면 task key를 DB item_key로 upsert해야 한다");

  const automatic = { key: "raw-candidate", kind: "next_setup", type: "next_setup", eventOrderId: "event-1", venue: "3F 부라노 I", completed: false };
  const persisted = task({ completed: true });
  assert.deepStrictEqual(Array.from(success.board.dedupeSetupCandidates([automatic, persisted]), (item) => item.key), [persisted.key], "완료된 persistent task가 동일 raw event candidate 재생성을 막아야 한다");

  const restore = createBoard(async () => ({ ok: true, text: async () => '[{"id":"row-1","is_completed":false}]' }));
  restore.board._setStateForTest({ manual: [task({ completed: true, metadata: { source: "autopilot", completedAt: "2026-11-03T00:00:00.000Z", completedBy: "user-1" } })], completions: { "setup:event-1:burano-1": true } });
  assert.strictEqual(await restore.board.completeBoardItem("setup:event-1:burano-1", false, "2026-11-03"), true);
  const restorePayload = JSON.parse(restore.requests[0].options.body);
  assert.strictEqual(restorePayload.is_completed, false, "복원은 같은 DB record의 완료 상태를 해제해야 한다");
  assert.strictEqual(restorePayload.metadata.completedAt, undefined, "복원 시 완료 metadata를 해제해야 한다");

  const failed = createBoard(async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ code: "23503", message: "foreign key violation", details: "Key is not present", hint: null }) }));
  failed.board._setStateForTest({ manual: [task()], pins: { "setup:event-1:burano-1": true } });
  assert.strictEqual(await failed.board.completeBoardItem("setup:event-1:burano-1", true, "2026-11-03"), false);
  const rolledBack = JSON.parse(failed.memory.get("banquet-erp-operation-board-v1"));
  assert.strictEqual(rolledBack.manual[0].completed, false, "DB 실패 시 optimistic UI 상태를 rollback해야 한다");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(rolledBack.completions, "setup:event-1:burano-1"), false, "실패한 완료 값이 local cache에 남으면 안 된다");

  assert(source.includes('persistentSetupLoaded || remoteStatus === "fallback"'), "DB 완료 task를 읽기 전에 raw setup 후보를 활성화하면 안 된다");
  assert(source.includes('syncItem(block, { throwOnError: true })'), "완료 저장 오류를 handler까지 전파해야 한다");
  console.log("setup completion persistence V1 tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
