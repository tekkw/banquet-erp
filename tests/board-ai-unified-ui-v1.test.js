const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");

assert(html.includes('id="boardAiPlusButton"'));
assert(html.includes('placeholder="현장 AI에게 물어보기..."'));
assert(html.includes('id="boardSpeechButton"'));
assert(!html.includes('id="boardSettingAdvisorButton"'));
assert(html.includes('data-board-ai-quick="오늘 끝나고 뭘 세팅해야 돼?"'));
assert(html.includes('id="boardAiContext"'));

const summary = page.slice(page.indexOf("function settingAdvisorCard"), page.indexOf("async function showSettingAdvisorList"));
for (const field of ["nextDate", "nextStart", "space", "eventName"]) assert(summary.includes(field));
for (const detail of ["gapHours", "currentLayout", "taskSummary", "advice"]) assert(!summary.includes(detail), `initial summary must hide ${detail}`);
assert(page.includes("rememberSettingAdvisor(row)"));
assert(page.includes("rememberActiveEvent(row.nextEvent)"));
assert(page.includes("renderAiContext()"));
assert(page.includes("window.openStoredExcel(row.nextEvent.storagePath)"));
assert(page.includes('selectedAssetImageFile ? attachedAssetMutation ? "asset_intake" : "visual_query"'));
assert(page.includes('speakBoardReply(`${Number(settingAdvisorRows[0].anchorDate.slice(8))}일 종료 후 준비할 다음 행사는 ${settingAdvisorRows.length}건입니다. 화면을 확인해주세요.`)'));

console.log("board unified AI UI V1 tests passed");
