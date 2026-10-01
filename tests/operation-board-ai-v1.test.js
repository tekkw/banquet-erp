const assert = require("assert");
const fs = require("fs");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const board = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const html = fs.readFileSync("outputs/board/index.html", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");

// A: exact schedule row only, followed by refresh.
assert(page.includes("event_schedules?id=eq.${encodeURIComponent(proposal.target.scheduleId)}&event_order_id=eq.${encodeURIComponent(proposal.target.eventOrderId)}"));
assert(page.includes("JSON.stringify({ schedule_time: proposal.change.time })"));
assert(page.includes("await (refresh)();"));
assert(page.includes("updatedRows.length !== 1"), "schedule PATCH must update exactly one row");
assert(page.includes('!proposal.target?.eventOrderId || !proposal.target?.scheduleId'), "both event and schedule IDs are required");
assert(page.includes('console.error("board AI schedule patch failed"'), "schedule PATCH errors must be distinguishable");
assert(page.includes('console.error("board AI audit failed"'), "audit errors must be distinguishable");
assert(page.includes('console.error("board AI refresh failed"'), "refresh errors must be distinguishable");
assert(page.includes("변경 기록 저장은 실패했습니다."), "audit failure must not hide a successful data change");
assert(page.includes("화면 동기화에 실패해 새로고침이 필요합니다."), "refresh failure must not hide a successful data change");
assert(page.includes("변경할 일정을 찾지 못했습니다."), "zero-row PATCH needs a target-specific message");

// B: ambiguity is an explicit choice flow and never an arbitrary mutation.
assert(edge.includes("If multiple events or schedule rows could match"));
assert(edge.includes("needsClarification: true"));
assert(page.includes("data-ai-choice"));

// C: guest count changes only event_orders.guest_count.
assert(page.includes("JSON.stringify({ guest_count: count })"));
assert(!page.includes("JSON.stringify({ people: count })"));

// D: notes reuse operation_board_items metadata and render a badge.
assert(page.includes('noteType: "field_note"'));
assert(board.includes("field-note-badge"));

// E: only an explicit approval calls applyProposal; cancel does not write.
assert(page.includes('closest("[data-ai-approve]")'));
assert(page.includes('closest("[data-ai-cancel]")'));
assert(page.indexOf("await applyProposal(proposal)") > page.indexOf('closest("[data-ai-approve]")'));

assert(html.includes('id="boardAiForm"'));
assert(css.includes("bottom: var(--mobile-bottom-nav-height)"));
assert(edge.includes('mode === "board_command"'));
assert(edge.includes('"update_schedule_time", "update_guest_count", "add_field_note"'));
assert(edge.includes("페스타 커피브레이크가 13시로 바뀌었어"), "completed-form field reports must be treated as ERP update requests");

console.log("operation-board AI V1 tests passed");
