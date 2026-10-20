const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("outputs/src/beverageInventory.js", "utf8");
const window = {};
vm.runInNewContext(source, { window, console, Date, Intl, URL, fetch: async () => { throw new Error("unexpected fetch"); } });
const inventory = window.BANQUET_ERP_BEVERAGE_INVENTORY;

const inventorySheet = (values = {}) => ({
  A1: { v: values.title || "■ 26년 9월 연회장 재고 현황" },
  BF1: { v: "실재고수" }, BB2: { v: "당월재고" },
  A5: { v: "맥주" }, A8: { v: "소주" }, B11: { v: "펩시콜라 24EA" }, B14: { v: "칠성사이다 24EA" },
  BE5: values.beer, BE8: values.soju, BE11: values.cola, BE14: values.cider,
});
const workbook = {
  SheetNames: ["3월 (예시)", "26.3월 (기존)", "8월 (신규)", "9월 (신규)", "10월 (신규)"],
  Workbook: { WBView: [{ activeTab: 0 }] },
  Sheets: {
    "3월 (예시)": inventorySheet({ title: "■ 26년 3월 연회장 재고 현황", beer: { v: 1 }, soju: { v: 2 }, cola: { v: 3 }, cider: { v: 4 } }),
    "26.3월 (기존)": inventorySheet({ title: "■ 26년 3월 연회장 재고 현황", beer: { v: 11 }, soju: { v: 12 }, cola: { v: 13 }, cider: { v: 14 } }),
    "8월 (신규)": inventorySheet({ title: "■ 26년 8월 연회장 재고 현황", beer: { v: 21 }, soju: { v: 22 }, cola: { v: 23 }, cider: { v: 24 } }),
    "9월 (신규)": inventorySheet({ beer: { f: "SUM(A1:A2)", v: 254 }, soju: { v: "223 " }, cola: { v: "203" }, cider: { v: "179" } }),
    "10월 (신규)": {},
  },
};
const parsed = inventory.readStockWorkbook(workbook, "26년 연회장 음,주류 재고 현황 '26.09.30.xlsx");
assert.deepEqual({ beer: parsed.beer, soju: parsed.soju, cola: parsed.cola, cider: parsed.cider, sheetName: parsed.sheetName }, { beer: 254, soju: 223, cola: 203, cider: 179, sheetName: "9월 (신규)" });
assert.deepEqual(JSON.parse(JSON.stringify(parsed.sourceCells)), {
  beer: { address: "BE5", value: 254, formula: true },
  soju: { address: "BE8", value: 223, formula: false },
  cola: { address: "BE11", value: 203, formula: false },
  cider: { address: "BE14", value: 179, formula: false },
});
const octoberNow = new Date("2026-10-20T12:00:00+09:00");
const monthIndependent = inventory.readStockWorkbook({
  SheetNames: ["8월 (신규)", "9월 (기존)", "9월 (신규)", "10월 (예시)"],
  Sheets: {
    "8월 (신규)": inventorySheet({ beer: { v: 8 }, soju: { v: 8 }, cola: { v: 8 }, cider: { v: 8 } }),
    "9월 (기존)": inventorySheet({ beer: { v: 90 }, soju: { v: 90 }, cola: { v: 90 }, cider: { v: 90 } }),
    "9월 (신규)": inventorySheet({ beer: { v: 254 }, soju: { v: 223 }, cola: { v: 203 }, cider: { v: 179 } }),
    "10월 (예시)": inventorySheet({ title: "■ 26년 10월 예시", beer: { v: 1 }, soju: { v: 1 }, cola: { v: 1 }, cider: { v: 1 } }),
  },
}, "재고 현황.xlsx", octoberNow);
assert.equal(monthIndependent.sheetName, "9월 (신규)", "A-D. 현재 월과 무관하게 최신 유효 월의 신규 시트를 선택하고 예시는 제외해야 한다");
assert.deepEqual([monthIndependent.beer, monthIndependent.soju, monthIndependent.cola, monthIndependent.cider], [254, 223, 203, 179], "E-F. 실제 품목의 실재고수를 semantic lookup으로 읽어야 한다");
const fallbackSheet = inventorySheet({ beer: {}, soju: {}, cola: {}, cider: {} });
delete fallbackSheet.A5; delete fallbackSheet.A8; delete fallbackSheet.B11; delete fallbackSheet.B14;
fallbackSheet.BE20 = { v: "1,234 " }; fallbackSheet.BE21 = { v: 200 }; fallbackSheet.BE22 = { v: 300 }; fallbackSheet.BE23 = { v: 400 };
fallbackSheet.A20 = { v: "맥주" }; fallbackSheet.A21 = { v: "소주" }; fallbackSheet.B22 = { v: "콜라" }; fallbackSheet.B23 = { v: "칠성사이다" };
const fallbackParsed = inventory.readStockWorkbook({ SheetNames: ["9월 (신규)"], Sheets: { "9월 (신규)": fallbackSheet } }, "2026-09-stock.xlsx");
assert.deepEqual([fallbackParsed.beer, fallbackParsed.soju, fallbackParsed.cola, fallbackParsed.cider], [1234, 200, 300, 400], "고정 셀이 비면 품목 행과 실재고수 열로 읽어야 한다");
assert.throws(() => inventory.readStockWorkbook({ SheetNames: ["안내"], Sheets: { 안내: { A1: { v: "예시 안내" } } } }, "2026-09.xlsx"), /재고 형식의 시트를 찾지 못했습니다/);
const missingValueSheet = inventorySheet({ beer: { f: "SUM(A1:A2)" }, soju: { v: 2 }, cola: { v: 3 }, cider: { v: 4 } });
assert.throws(() => inventory.readStockWorkbook({ SheetNames: ["9월 (신규)"], Sheets: { "9월 (신규)": missingValueSheet } }, "2026-09.xlsx"), /실재고수 값을 읽지 못했습니다/);
assert.deepEqual(JSON.parse(JSON.stringify(inventory.CELL_MAPPING)), {
  beer: { label: "맥주", labelCell: "A5", stockCell: "BE5" },
  soju: { label: "소주", labelCell: "A8", stockCell: "BE8" },
  cola: { label: "콜라", labelCell: "B11", stockCell: "BE11" },
  cider: { label: "사이다", labelCell: "B14", stockCell: "BE14" },
});

const events = [
  { id: "lunch", companyName: "중식 행사", venue: "부라노1", guestCount: 80, schedule: [
    { date: "2026-10-16", content: "중식 뷔페", venue: "부라노1", people: 80 },
    { date: "2026-10-16", content: "중식 뷔페 준비", venue: "부라노1", people: 80 },
  ] },
  { id: "dinner", companyName: "석식 행사", venue: "컨벤션A", guestCount: 120, mealTypes: ["뷔페"], schedule: [{ date: "2026-10-17", content: "석식", venue: "컨벤션A" }] },
  { id: "firenze", companyName: "제외 행사", venue: "피렌체", guestCount: 300, schedule: [{ date: "2026-10-18", content: "중식 뷔페" }] },
  { id: "checkin", companyName: "입실", venue: "카프리1", guestCount: 50, schedule: [{ date: "2026-10-19", content: "CHECK IN 중식 뷔페" }] },
  { id: "course", companyName: "코스 행사", venue: "카프리2", guestCount: 40, schedule: [{ date: "2026-10-20", content: "석식 코스" }] },
  { id: "later", companyName: "범위 밖", venue: "부라노2", guestCount: 500, schedule: [{ date: "2026-10-26", content: "중식 뷔페" }] },
];
const demand = inventory.calculateDemand(events, "2026-10-16");
assert.deepEqual(JSON.parse(JSON.stringify(demand.range)), { start: "2026-10-16", end: "2026-10-25" });
assert.equal(demand.details.length, 2, "같은 행사/식사 중복과 비대상 일정은 제외해야 한다");
assert.equal(demand.totalGuests, 200);
assert.deepEqual(JSON.parse(JSON.stringify(demand.required)), { beer: 200, soju: 100, cola: 60, cider: 60 });

inventory._setSnapshotForTest({ beer: 150, soju: 130, cola: 40, cider: 80, uploadedAt: "2026-10-16T00:00:00.000Z", originalFilename: "stock.xlsx" });
const comparison = inventory.getComparison(events, "2026-10-16");
assert.equal(comparison.items.beer.shortage, 50);
assert.equal(comparison.items.soju.shortage, 0);
assert.equal(comparison.items.cola.shortage, 20);
assert.equal(comparison.shortageCount, 2);
assert.equal(inventory.answerQuestion("음주류 발주해야 돼?", events, "2026-10-16").text, "10/16~10/25 기준으로 맥주 50개와 콜라 20개가 부족합니다.");
assert.match(inventory.answerQuestion("맥주 얼마나 부족해?", events, "2026-10-16").text, /현재 150개, 필요 200개로 50개 부족/);
const changedDemand = inventory.getComparison([...events, { id: "new", venue: "부라노3", guestCount: 20, schedule: [{ date: "2026-10-21", content: "석식 뷔페" }] }], "2026-10-16");
assert.equal(changedDemand.demand.required.beer, 220, "행사 변경 시 최신 목록으로 다시 계산해야 한다");
inventory._setSnapshotForTest({ beer: 500, soju: 500, cola: 500, cider: 500 });
assert.equal(inventory.getComparison(events, "2026-10-16").shortageCount, 0, "새 snapshot은 이전 현재고를 덮어써야 한다");

const html = fs.readFileSync("outputs/index.html", "utf8");
const boardHtml = fs.readFileSync("outputs/board/index.html", "utf8");
const ai = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
const registry = fs.readFileSync("outputs/src/erpActionRegistry.js", "utf8");
assert(html.includes('id="beverageInventoryWidget"') && html.includes('data-beverage-upload') && html.includes('data-beverage-original'));
assert(html.includes("beverageInventory.js?v=inventory-sheet-selection-v1") && boardHtml.includes("beverageInventory.js?v=inventory-sheet-selection-v1"));
assert(registry.includes('"get_beverage_inventory_status", "inventory", "query"'));
assert(ai.includes('executeAction("get_beverage_inventory_status"') && ai.includes("matchesQuestion(question)"), "AI는 공용 Action Registry의 결정론 계산을 사용해야 한다");
assert(source.includes('board_date: SNAPSHOT_DATE') && source.includes('item_key: SNAPSHOT_KEY'), "최신 snapshot은 기존 공용 persistent table의 고정 key로 덮어써야 한다");

console.log("beverage inventory V1 tests passed");
