const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("outputs/src/beverageInventory.js", "utf8");
const window = { XLSX: { utils: { sheet_to_json: (sheet) => sheet.__rows || [] } } };
vm.runInNewContext(source, { window, console, Date, Intl, URL, fetch: async () => { throw new Error("unexpected fetch"); } });
const inventory = window.BANQUET_ERP_BEVERAGE_INVENTORY;

const inventorySheet = (values = {}) => {
  const inventoryColumn = values.inventoryColumn ?? 6;
  const rows = Array.from({ length: 16 }, () => Array(inventoryColumn + 2).fill(""));
  rows[0][0] = values.title || "■ 26년 9월 연회장 재고 현황";
  rows[2][0] = "구분"; rows[2][3] = "당월재고"; rows[2][inventoryColumn] = values.header ?? "실재고수";
  [[4, "맥주", values.beer], [7, "소주", values.soju], [10, "펩시콜라 24EA", values.cola], [13, "칠성사이다 24EA", values.cider]].forEach(([row, label, value]) => { rows[row][0] = label; rows[row][inventoryColumn] = value ?? ""; });
  return { __rows: rows, "!merges": values.merges || [] };
};
const workbook = {
  SheetNames: ["3월 (예시)", "26.3월 (기존)", "8월 (신규)", "9월 (신규)", "10월 (신규)"],
  Workbook: { WBView: [{ activeTab: 0 }] },
  Sheets: {
    "3월 (예시)": inventorySheet({ title: "■ 26년 3월 연회장 재고 현황", beer: { v: 1 }, soju: { v: 2 }, cola: { v: 3 }, cider: { v: 4 } }),
    "26.3월 (기존)": inventorySheet({ title: "■ 26년 3월 연회장 재고 현황", beer: { v: 11 }, soju: { v: 12 }, cola: { v: 13 }, cider: { v: 14 } }),
    "8월 (신규)": inventorySheet({ title: "■ 26년 8월 연회장 재고 현황", beer: { v: 21 }, soju: { v: 22 }, cola: { v: 23 }, cider: { v: 24 } }),
    "9월 (신규)": inventorySheet({ beer: 254, soju: "223 ", cola: "203", cider: "179" }),
    "10월 (신규)": {},
  },
};
const parsed = inventory.readStockWorkbook(workbook, "26년 연회장 음,주류 재고 현황 '26.09.30.xlsx");
assert.deepEqual({ beer: parsed.beer, soju: parsed.soju, cola: parsed.cola, cider: parsed.cider, sheetName: parsed.sheetName }, { beer: 254, soju: 223, cola: 203, cider: 179, sheetName: "9월 (신규)" });
assert.deepEqual(JSON.parse(JSON.stringify(parsed.sourceCells)), {
  beer: { row: 5, column: 7, rawValue: 254, value: 254 },
  soju: { row: 8, column: 7, rawValue: "223 ", value: 223 },
  cola: { row: 11, column: 7, rawValue: "203", value: 203 },
  cider: { row: 14, column: 7, rawValue: "179", value: 179 },
});
const octoberNow = new Date("2026-10-20T12:00:00+09:00");
const monthIndependent = inventory.readStockWorkbook({
  SheetNames: ["26.3월(기존)", "3월(신규)", "4월(신규)", "5월(신규)", "6월(신규)", "7월(신규)", "8월(신규)", "9월(신규)", "10월(신규)", "10월(예시)"],
  Sheets: Object.assign(Object.fromEntries([3, 4, 5, 6, 7].map((month) => [`${month}월(신규)`, inventorySheet({ title: `■ 26년 ${month}월 연회장 재고 현황`, beer: month, soju: month, cola: month, cider: month })])), {
    "26.3월(기존)": inventorySheet({ title: "■ 26년 3월 연회장 재고 현황", beer: 30, soju: 30, cola: 30, cider: 30 }),
    "8월(신규)": inventorySheet({ title: "■ 26년 8월 연회장 재고 현황", beer: 8, soju: 8, cola: 8, cider: 8 }),
    "9월(신규)": inventorySheet({ title: "■ 26년 9월 연회장 재고 현황", beer: 9, soju: 9, cola: 9, cider: 9 }),
    "10월(신규)": inventorySheet({ title: "■ 26년 10월 연회장 재고 현황", inventoryColumn: 9, beer: "254 ", soju: 223, cola: "203", cider: "179" }),
    "10월(예시)": inventorySheet({ title: "■ 26년 10월 예시", beer: 1, soju: 1, cola: 1, cider: 1 }),
  }),
}, "재고 현황.xlsx", octoberNow);
assert.equal(monthIndependent.sheetName, "10월(신규)", "A-D. 전체 workbook에서 최신 유효 월의 신규 시트를 선택하고 예시는 제외해야 한다");
assert.deepEqual([monthIndependent.beer, monthIndependent.soju, monthIndependent.cola, monthIndependent.cider], [254, 223, 203, 179], "E-F. 실제 품목의 실재고수를 semantic lookup으로 읽어야 한다");
assert.equal(monthIndependent.sourceCells.beer.column, 10, "실재고수 column 위치가 달라도 동적으로 찾아야 한다");
const mergedHeaderSheet = inventorySheet({ inventoryColumn: 9, beer: 254, soju: 223, cola: 203, cider: 179 });
mergedHeaderSheet.__rows[2][8] = "실재고수"; mergedHeaderSheet.__rows[2][9] = ""; mergedHeaderSheet["!merges"] = [{ s: { r: 2, c: 8 }, e: { r: 2, c: 9 } }];
const mergedParsed = inventory.readStockWorkbook({ SheetNames: ["10월(신규)"], Sheets: { "10월(신규)": mergedHeaderSheet } }, "26.10.20 재고 현황.xlsx", octoberNow);
assert.equal(mergedParsed.sourceCells.beer.column, 10, "merged header 범위에서는 실제 품목 값이 있는 column을 선택해야 한다");
const commaParsed = inventory.readStockWorkbook({ SheetNames: ["9월(신규)"], Sheets: { "9월(신규)": inventorySheet({ beer: "1,234", soju: 200, cola: 300, cider: 400 }) } }, "2026-09-stock.xlsx");
assert.equal(commaParsed.beer, 1234);
assert.throws(() => inventory.readStockWorkbook({ SheetNames: ["안내"], Sheets: { 안내: { __rows: [["예시 안내"]] } } }, "2026-09.xlsx"), /재고 형식의 시트를 찾지 못했습니다/);
assert.throws(() => inventory.readStockWorkbook({ SheetNames: ["9월(신규)"], Sheets: { "9월(신규)": inventorySheet({ header: "", beer: 1, soju: 2, cola: 3, cider: 4 }) } }, "2026-09.xlsx"), /실재고수 header를 찾지 못했습니다/);
const missingItemSheet = inventorySheet({ beer: 1, soju: 2, cola: 3, cider: 4 }); missingItemSheet.__rows[13][0] = "기타음료";
assert.throws(() => inventory.readStockWorkbook({ SheetNames: ["9월(신규)"], Sheets: { "9월(신규)": missingItemSheet } }, "2026-09.xlsx"), /필수 품목 row를 찾지 못했습니다/);
const missingValueSheet = inventorySheet({ beer: "", soju: 2, cola: 3, cider: 4 });
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
for (const message of ["엑셀 파일을 읽지 못했습니다.", "재고 형식의 시트를 찾지 못했습니다.", "실재고수 header를 찾지 못했습니다.", "필수 품목 row를 찾지 못했습니다.", "실재고수 값을 읽지 못했습니다."]) assert(source.includes(message), `${message} 오류를 구분해야 한다`);
assert(source.includes('sheet_to_json(sheet, { header: 1, defval: ""'), "production parser는 sheet_to_json 2차원 행렬을 사용해야 한다");

console.log("beverage inventory V1 tests passed");
