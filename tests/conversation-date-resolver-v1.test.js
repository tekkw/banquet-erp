const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const window = { sessionStorage: { getItem: () => null, setItem: () => {} } };
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), { window, Intl, Date });
const resolver = window.erpConversationAgent;
const options = { today: "2026-10-14", selectedBoardDate: "2026-10-15" };

assert.equal(resolver.resolveDateReference("오늘 부라노 행사", options).date, "2026-10-14");
assert.equal(resolver.resolveDateReference("내일 부라노 행사", options).date, "2026-10-15");
assert.equal(resolver.resolveDateReference("어제 행사", options).date, "2026-10-13");
assert.equal(resolver.resolveDateReference("이 날짜 부라노 행사", options).date, "2026-10-15");
assert.equal(resolver.resolveDateReference("운영보드 날짜 행사", options).date, "2026-10-15");
assert.equal(resolver.resolveDateReference("오늘 행사", { ...options, eventContextDate: "2026-10-15" }).date, "2026-10-14");
assert(resolver.questionWithResolvedDate("오늘 행사", options).includes("2026-10-14"));

const boardPage = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const pcAssistant = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
assert(boardPage.includes("erpConversationAgent.resolveDateReference"));
assert(pcAssistant.includes("erpConversationAgent.questionWithResolvedDate"));
assert(pcAssistant.includes('dateReference.source === "none" ? eventConversationAgent?.load()?.event || null : null'));

console.log("conversation date resolver V1 tests passed");
