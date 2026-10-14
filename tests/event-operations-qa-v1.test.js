const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = { value: "", getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
const window = { sessionStorage: storage };
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), { window, Intl, Date });
const agent = window.erpConversationAgent.create({ storage });
agent.save({ event: { eventOrderId: "next-event", venue: "부라노1" }, setting: { nextEventOrderId: "next-event" }, lastDomain: "setting" });

assert.equal(agent.submit("그럼 레이아웃은 어떻게 하래?", { fastRoute: "conversation_agent" }).tool, "getEventDocumentSection");
assert.equal(agent.submit("음료 뭐 준비해?", { fastRoute: "conversation_agent" }).tool, "getEventDocumentSection");
assert.equal(agent.submit("마이크 몇 개?", { fastRoute: "conversation_agent" }).tool, "getEventDocumentSection");
assert.equal(agent.submit("비고에 뭐 적혀있어?", { fastRoute: "conversation_agent" }).tool, "getEventRequests");
assert.equal(agent.submit("원본 보여줘", { fastRoute: "board_command" }).tool, "openEventOriginal");
assert.equal(window.erpConversationAgent.eventDocumentTool("점심시간 몇 시야?"), "getEventSchedule");
assert.equal(agent.submit("부라노 대한체육회 점심시간?", { fastRoute: "event_query" }).selectedResultId || "", "", "explicit venue must override context");

const board = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
assert(board.includes("function eventDocumentView(event)"));
assert(board.includes("calendarDates: event.calendarDates"));
assert(board.includes("endTime: item.end_time || item.schedule_end_time"));
assert(board.includes("scheduleAnswerText(row)"));
assert(board.includes('section === "layout" ? await savedEventLayout(event) : null'));
assert(board.includes("rememberSettingAdvisor(row)"));
assert(board.includes('conversationContext.lastDomain === "setting"'));

console.log("event operations Q&A V1 tests passed");
