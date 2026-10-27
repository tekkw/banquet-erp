const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const window = {};
const context = { window, Intl, Date, console };
vm.runInNewContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("outputs/src/eventOrderAnalytics.js", "utf8"), context);
const analytics = window.BANQUET_ERP_EVENT_ORDER_ANALYTICS;
const now = new Date("2026-10-28T03:00:00Z");

const events = [
  { id: "burano", companyName: "대한전기학회", eventName: "학술행사", venue: "부라노전체", startDate: "2026-10-28", endDate: "2026-10-28", guestCount: 150, layoutText: "스쿨 60석", othersText: "VIP 동선 주의", schedule: [{ date: "2026-10-28", time: "15:00", content: "커피브레이크", venue: "부라노전체" }, { date: "2026-10-28", time: "18:00", content: "석식 뷔페", people: 150 }], items: [{ item_name: "무선마이크", quantity: 2 }], notes: [{ note_type: "special", content: "VIP 동선 주의" }], attachments: [{ id: "file-1", approved: true }] },
  { id: "capri", companyName: "충남대학교", eventName: "산업대학원", venue: "카프리1", startDate: "2026-10-29", endDate: "2026-10-29", guestCount: 40, layoutText: "라운드 5T", schedule: [{ date: "2026-10-29", time: "09:00", content: "행사 시작" }], notes: [{ note_type: "layout_eqp", content: "LAY & OUT RE-INFORM" }] },
  { id: "burano-next", companyName: "호남센터", eventName: "교육", venue: "부라노1", startDate: "2026-10-29", endDate: "2026-10-29", guestCount: 60, layoutText: "라운드 8T", schedule: [{ date: "2026-10-29", time: "08:00", content: "행사 시작" }] },
];

const plan = analytics.buildEventQueryPlan("오늘 부라노 행사 특이사항 있어?", null, { now });
assert.strictEqual(plan.domain, "event");
assert.deepStrictEqual({ ...plan.dateRange }, { start: "2026-10-28", end: "2026-10-28", label: "오늘" });
assert(plan.conditions.includes("special_note"));
assert(plan.venues.length > 0);

let result = analytics.answerQuestion("오늘 부라노 행사 특이사항 있어?", events, null, { now });
assert(result.answer.includes("VIP 동선 주의"));
assert(result.ttsText.includes("부라노"));
assert(result.sourceDomains.includes("event_notes"));

result = analytics.answerQuestion("커피 나가는 데 어디야?", events, null, { now });
assert.strictEqual(result.results.length, 1);
assert(result.answer.includes("대한전기학회"));
assert(analytics.answerQuestion("오늘 커피 몇 번 나가?", events, null, { now }).answer.includes("1건"));

result = analytics.answerQuestion("끝나고 뒤집어야 할 행사 있어?", events, null, { now });
assert(result.results.some((row) => row.eventOrderId === "burano" && row.transition.status === "change"));

result = analytics.answerQuestion("내일 카프리 몇 명이야?", events, null, { now });
assert(result.answer.includes("40명"));

result = analytics.answerQuestion("이번주 재인폼 행사 있어?", events, null, { now });
assert.strictEqual(result.results[0].eventOrderId, "capri");

result = analytics.answerQuestion("오늘 석식뷔페 총 몇 명이야?", events, null, { now });
assert(result.answer.includes("150명"));

result = analytics.answerQuestion("첨부자료 있는 행사?", events, null, { now });
assert.strictEqual(result.results[0].eventOrderId, "burano");

result = analytics.answerQuestion("무선마이크 쓰는 행사 있어?", events, null, { now });
assert(result.answer.includes("무선마이크 2"));

const first = analytics.answerQuestion("오늘 커피브레이크 있는 행사 있어?", events, null, { now });
const filtered = analytics.answerQuestion("그중 부라노만", events, first.context, { now });
assert.strictEqual(filtered.results.length, 1);
const guestFollowUp = analytics.answerQuestion("몇 명이야?", events, filtered.context, { now });
assert(guestFollowUp.answer.includes("150명"));

assert(!result.answer.includes("선택"), "list query는 행사 선택을 강요하지 않는다");
assert(fs.readFileSync("outputs/src/operationBoardPage.js", "utf8").includes("analyticsAnswer.ttsText || analyticsAnswer.text"), "모바일 운영보드는 짧은 ttsText를 사용한다");
const registryWindow = {};
vm.runInNewContext(fs.readFileSync("outputs/src/erpActionRegistry.js", "utf8"), { window: registryWindow });
assert.strictEqual(registryWindow.erpActionRegistry.getAction("event.query").requiresApproval, false);

console.log("event natural query plan V1 tests passed");
