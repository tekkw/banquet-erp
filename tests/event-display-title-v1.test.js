const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/eventDisplayUtils.js", "utf8"), context);
const display = context.window.BANQUET_ERP_EVENT_DISPLAY;

const event = { companyName: "전남테크노파크", eventName: "2026년 지역산업육성사업 R&D 기술교류 및 성과확산대회" };
assert.strictEqual(display.getEventDisplayTitle(event), "전남테크노파크");
assert.strictEqual(display.getEventSecondaryTitle(event), event.eventName);
assert.strictEqual(display.getEventDisplayTitle({ companyName: "미입력", eventName: "대한체육회 워크숍" }), "대한체육회 워크숍");
assert.strictEqual(display.getEventDisplayTitle({ organizer: "전남농업기술원", event_name: "검정실 워크숍" }), "전남농업기술원");
assert.strictEqual(display.getEventSecondaryTitle({ companyName: "대한 체육회", eventName: "대한체육회" }), "");

const calendar = fs.readFileSync("outputs/src/eventCalendar.js", "utf8");
const board = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const boardPage = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const main = fs.readFileSync("outputs/index.html", "utf8");
assert(calendar.includes("${shortVenueLabel(segment.eventItem)} ${eventTitle}"));
assert(calendar.includes("[eventTitle, secondaryTitle]"));
assert(board.includes("name: eventDisplayTitle(next.event)"));
assert(board.includes("eventSubtitle: eventSecondaryTitle(event)"));
assert(boardPage.includes("companyName: row.company_name || row.organizer"));
assert(main.includes("BANQUET_ERP_EVENT_DISPLAY?.getEventDisplayTitle(eventItem)"));
assert(boardPage.includes("String(event.eventName || \"\").length"), "AI 검색은 event_name 매칭을 유지해야 한다");

console.log("event display title V1 tests passed");
