const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");
const board = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const html = fs.readFileSync("outputs/board/index.html", "utf8");

const timeStart = page.indexOf("  function scheduleTimeFromText");
const timeEnd = page.indexOf("  async function interpret", timeStart);
const context = {};
vm.createContext(context);
vm.runInContext(`${page.slice(timeStart, timeEnd)}\nthis.parseTime = scheduleTimeFromText;`, context);
assert.equal(context.parseTime("13시에 커피브레이크 추가"), "13:00");
assert.equal(context.parseTime("오후 1시 체크인"), "13:00");
assert.equal(context.parseTime("10시 반 커피 준비"), "10:30");
assert.equal(context.parseTime("오전 12시 리허설"), "00:00");
assert.equal(context.parseTime("커피브레이크 추가"), "");

// A/B/C: add proposal, exact candidate choice, and missing-time clarification.
assert(edge.includes('"add_schedule"'));
assert(edge.includes("events.length > 1"));
assert(edge.includes("어느 행사에 추가할까요?"));
assert(edge.includes("몇 시 일정인가요?"));
assert(page.includes("proposal.change.date = boardContext.selectedDate"));
assert(page.includes("proposal.change.time = scheduleTimeFromText(userText)"));
assert(page.includes('data-ai-approve>${isAddSchedule ? "추가"'));

// Approval is the only insert path and a returned row id is mandatory.
const applyStart = page.indexOf("  async function applyProposal");
const insertAt = page.indexOf('request("event_schedules", { method: "POST"', applyStart);
const approveAt = page.indexOf('closest("[data-ai-approve]")');
assert(insertAt > applyStart);
assert(approveAt > insertAt, "INSERT helper must only be reached from the later explicit approval handler");
assert(page.includes('Prefer: "return=representation"'));
assert(page.includes("!inserted[0]?.id"));
assert(page.includes('/^(?:추가해|추가|응|네|예|확인|좋아|진행해)'));

// D: duplicate check uses the four source-of-truth fields before POST.
const duplicateAt = page.indexOf('const duplicate = (existing || []).find', applyStart);
assert(duplicateAt > applyStart && duplicateAt < insertAt);
assert(page.includes("row.schedule_time === change.time"));
assert(page.includes("comparable(row.content) === comparable(content)"));
assert(page.includes("comparable(row.venue) === comparable(venue)"));
assert(page.includes('boardAiError("schedule_duplicate"'));

// E/F: time changes stay updates, while physical chores are manual work.
assert(edge.includes("remains update_schedule_time, never add_schedule"));
assert(page.includes('if (/(바꿔|변경|수정)/.test(text)) return false'), "schedule updates must bypass read-only event_query routing");
assert(edge.includes("bringing water, moving chairs, preparing tables, or installing banners"));
assert(edge.includes("add_field_note/manual work"));

// G: refresh happens after the insert and board blocks are sorted by time.
assert(page.indexOf("await (refresh)();", insertAt) > insertAt);
assert(board.includes("String(a.time).localeCompare(String(b.time))"));
assert(html.includes("operationBoardPage.js?v=22-unified-ai"));

// Date boundaries are client-computed in Asia/Seoul or use the selected board date.
assert(page.includes('timeZone: "Asia/Seoul"'));
assert(page.includes("return board.getSelectedDate()"));
assert(page.includes("commandVenueMatches"));
assert(page.includes("컨벤션AB"));
assert(page.includes("컨벤션A(?!B)"), "Convention A must not silently match AB");

console.log("board add schedule V2 tests passed");
