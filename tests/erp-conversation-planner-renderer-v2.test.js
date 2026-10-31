const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const window = {};
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), { window, Intl, Date });
const infer = window.erpConversationAgent.inferPlannerResponseIntent;

assert.equal(infer("다음주 커피브레이크 몇 개야?").responseMode, "count");
assert.equal(infer("다음주 커피브레이크 알려줘").responseMode, "list");
assert.deepEqual(JSON.parse(JSON.stringify(infer("다음주 커피브레이크 각 행사장별로 알려줘"))), { responseMode: "grouped_list", groupBy: "venue", includeCount: true, includePeople: true });
assert.equal(infer("다음주 행사중 커피브레이크 몇 개인지 각 행사장 별로 알려줘").responseMode, "grouped_list");
assert.equal(infer("날짜별로 알려줘").groupBy, "date");
assert.equal(infer("몇 명이야?", { responseMode: "grouped_list", groupBy: "venue" }).responseMode, "aggregate");

const board = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
assert(board.includes('value === "next_week"'), "next_week must resolve to a full calendar week");
assert(board.includes('resultType: "schedule_occurrences"'));
assert(board.includes("peopleSource") && board.includes('peopleSource: Number.isFinite(explicitPeople)'), "schedule people must precede event guest count");
assert(board.includes("const seen = new Set()") && board.includes("row.eventOrderId}|${row.date}|${row.time}"), "duplicate occurrences must be removed by event/date/time/category");
assert(board.includes('plan.responseMode === "grouped_list"') && board.includes('plan.groupBy === "date"'));
assert(board.includes("인원이 명시되어 있지 않습니다"));
assert(board.includes("tryRenderPlannerFollowup") && board.includes("structuredResult"), "raw structured results must survive for follow-ups");
assert(board.includes("spacesOverlap") && board.includes("venueQuery"), "follow-up venue filters must use canonical overlap rules");

const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");
assert(edge.includes('dateRange=this_week|next_week'));
assert(edge.includes('responseMode must be count, list, grouped_list, detail, or aggregate'));
assert(edge.includes("const shouldLoadKnowledge = intent.knowledge"), "knowledge must not load for every planner/event query");
const knowledgePatternLine = edge.split("\n").find((line) => line.includes("const knowledge ="));
assert(!knowledgePatternLine.includes("알려줘"), "generic list wording must not trigger ai_knowledge");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
assert(html.includes("erpConversationAgent.js?v=planner-renderer-v2"));
assert(html.includes("operationBoardPage.js?v=planner-renderer-v2"));
console.log("ERP planner structured renderer V2 tests passed");
