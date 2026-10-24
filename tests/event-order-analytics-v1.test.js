const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const window = {};
const context = { window, Intl, Date, console };
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), context);
vm.runInNewContext(fs.readFileSync("outputs/src/eventOrderAnalytics.js", "utf8"), context);
const analytics = window.BANQUET_ERP_EVENT_ORDER_ANALYTICS;

assert.strictEqual(analytics.normalizeCategory("행사장 대관료"), "RENTAL");
assert.strictEqual(analytics.normalizeCategory("Venue Rental"), "RENTAL");
assert.strictEqual(analytics.normalizeCategory("Dinner Buffet"), "DINNER_BUFFET");
assert.strictEqual(analytics.normalizeCategory("조식/뷔페"), "BREAKFAST_BUFFET");
assert.strictEqual(analytics.normalizeCategory("Lunch Buffet"), "LUNCH_BUFFET");
assert.strictEqual(analytics.normalizeCategory("Room Charge"), "ROOM");
assert.strictEqual(analytics.normalizeCategory("Coffee Break"), "COFFEE_BREAK");

const sample = {
  id: "chungnam", companyName: "충남대학교 산업대학원", eventName: "충남대학교 산업대학원", startDate: "2026-10-24", endDate: "2026-10-25", venue: "카프리1+2", updatedAt: "2026-10-20T06:00:00Z",
  items: [
    { itemName: "객실", unitPrice: 200000, quantity: 15, amount: 3000000 },
    { itemName: "대관료", unitPrice: 600000, quantity: 1, amount: null },
    { itemName: "디너/뷔페", unitPrice: 55000, quantity: 40, amount: 2200000 },
    { itemName: "조식/뷔페", unitPrice: 27000, quantity: 40, amount: 1080000 },
    { itemName: "예상 매출(Expected Revenue)", amount: 6880000 },
  ],
};
const oldVersion = { ...sample, updatedAt: "2026-10-19T06:00:00Z", items: [{ itemName: "대관료", unitPrice: 500000, quantity: 1, amount: 500000 }] };
const events = [oldVersion, sample];
const now = new Date("2026-10-24T03:00:00Z");

assert.deepStrictEqual({ ...analytics.resolvePeriod("2026년 10월 대관료", now) }, { startDate: "2026-10-01", endDate: "2026-10-31", label: "2026년 10월" });
assert.strictEqual(analytics.queryEventOrderItems({ events, category: "RENTAL" })[0].amount, 600000, "amount가 없을 때만 단가×수량을 사용한다");
assert.strictEqual(analytics.queryEventOrderItems({ events, category: "RENTAL" }).length, 1, "같은 event order id의 최신 버전만 사용한다");
assert.strictEqual(analytics.answerQuestion("충남대학교 대관료 얼마야?", events, null, { now }).text.includes("600,000원"), true);
assert.strictEqual(analytics.answerQuestion("디너뷔페 단가?", events, null, { now }).text.includes("55,000원"), true);
assert.strictEqual(analytics.answerQuestion("디너뷔페 매출?", events, null, { now }).text.includes("2,200,000원"), true);
assert.strictEqual(analytics.answerQuestion("조식 몇 명?", events, null, { now }).text.includes("40"), true);
assert.strictEqual(analytics.answerQuestion("예상매출?", events, null, { now }).text.includes("6,880,000원"), true);
const itemDetail = analytics.answerQuestion("10월 24일 충남대 이벤오더 금액 알려줘", events, null, { now }).text;
assert(itemDetail.includes("객실") && itemDetail.includes("항목 매출 합계 6,880,000원"), "행사일/주최 기준 상세 품목 합계를 Expected Revenue와 중복 없이 보여준다");
const octoberRental = analytics.answerQuestion("2026년 10월 대관료 총액", events, null, { now });
assert.strictEqual(octoberRental.text.includes("600,000원"), true);
assert.strictEqual(analytics.answerQuestion("행사별로 보여줘", events, octoberRental.context, { now }).text.includes("충남대학교 산업대학원"), true, "직전 analytics 기간/category를 follow-up에 재사용한다");

const registryContext = { window: {} };
vm.runInNewContext(fs.readFileSync("outputs/src/erpActionRegistry.js", "utf8"), registryContext);
assert.strictEqual(registryContext.window.erpActionRegistry.getAction("event.items.query").requiresApproval, false);
assert.strictEqual(registryContext.window.erpActionRegistry.getAction("event.items.aggregate").requiresApproval, false);

const source = fs.readFileSync("outputs/src/eventOrder.js", "utf8");
assert(source.includes("cleanValue(row[1])"), "Items 품목명 B열을 읽어야 한다");
assert(source.includes("cleanValue(row[6]) || cleanValue(row[7])"), "Items 금액 G/H열을 모두 읽어야 한다");
assert(source.includes('itemName: "예상 매출(Expected Revenue)"'), "Expected Revenue를 기존 event_items 구조에 보존해야 한다");
const parserWindow = {};
const parserContext = { window: parserWindow, console };
vm.runInNewContext(fs.readFileSync("outputs/src/constants.js", "utf8"), parserContext);
vm.runInNewContext(fs.readFileSync("outputs/src/utils.js", "utf8"), parserContext);
vm.runInNewContext(source, parserContext);
const parser = parserWindow.BANQUET_ERP_EVENT_ORDER.createEventOrderService({ constants: parserWindow.BANQUET_ERP_CONSTANTS, helpers: { ...parserWindow.BANQUET_ERP_UTILS, splitEditorLines: (value) => String(value || "").split("\n").filter(Boolean), normalizeMealTypes: (value) => value } });
const parsed = parser.extractEventOrderInfo([{ name: "Event Order", rows: [
  ["Items", "", "", "단가(Incl)", "", "수량(Q'ty)", "금액(Incl)", "", "비고"],
  ["", "객실", "", "200,000", "", "15", "3,000,000"],
  ["", "대관료", "", "600,000", "", "1", "", ""],
  ["", "디너/뷔페", "", "55,000", "", "40", "2,200,000"],
  ["", "조식/뷔페", "", "27,000", "", "40", "1,080,000"],
  ["예상 매출(Expected Revenue) :", "", "", "", "", "", "6,880,000"],
] }]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed.items)), [
  { itemName: "객실", unitPrice: "200,000", quantity: "15", amount: "3,000,000" },
  { itemName: "대관료", unitPrice: "600,000", quantity: "1", amount: 600000 },
  { itemName: "디너/뷔페", unitPrice: "55,000", quantity: "40", amount: "2,200,000" },
  { itemName: "조식/뷔페", unitPrice: "27,000", quantity: "40", amount: "1,080,000" },
  { itemName: "예상 매출(Expected Revenue)", unitPrice: "", quantity: "", amount: "6,880,000" },
]);
for (const page of ["outputs/index.html", "outputs/board/index.html", "outputs/event-order-preview.html"]) assert(fs.readFileSync(page, "utf8").includes("eventOrderAnalytics.js?v=event-order-analytics-v1"));

console.log("event order analytics V1 tests passed");
