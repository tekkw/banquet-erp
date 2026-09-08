const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/index.html", "utf8");
const operationBoard = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
assert(html.includes("<strong>AI 비서</strong>"));
assert(html.includes("연회 운영 정보를 확인하고 AI와 대화하세요."));
assert(!html.includes("<article class=\"weekday-event-card\"><strong>월</strong>"));
assert(html.includes('class="operations-status-grid"'));
assert(html.includes('id="dailyBriefingDialog"'));
assert(html.includes('data-briefing-open'));
assert(html.includes('class="ai-chat-panel" aria-label="연회장 AI 비서" hidden'));
assert(html.indexOf("dashboard-operations-row") < html.indexOf("operations-status-grid"), "중앙 일정/캘린더 다음에 운영 현황이 와야 한다");
assert(html.includes('renderStatusCard("오늘 행사"'));
assert(html.includes('renderStatusCard("내일 행사"'));
assert(html.includes('renderStatusCard("세팅 변경"'));
assert(operationBoard.includes('<button type="button" data-board-cancel>취소</button>'));
assert(!operationBoard.includes('<button value="cancel">취소</button>'));
console.log("dashboard-overview-v1 tests passed");
