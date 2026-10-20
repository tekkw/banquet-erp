const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("outputs/src/beverageInventory.js", "utf8");
const window = { XLSX: { utils: { sheet_to_json: (sheet) => sheet.__rows || [] } } };
vm.runInNewContext(source, { window, console, Date, Intl, URL, fetch: async () => { throw new Error("unexpected fetch"); } });
const inventory = window.BANQUET_ERP_BEVERAGE_INVENTORY;

const inventorySheet = (values = {}) => {
  const inventoryColumn = values.inventoryColumn ?? 6;
  const rows = Array.from({ length: 16 }, () => Array(inventoryColumn + 3).fill(""));
  rows[0][0] = values.title || "■ 26년 9월 연회장 재고 현황";
  rows[1][0] = "구분"; rows[1][inventoryColumn] = values.monthlyHeader ?? "당월재고";
  rows[3][inventoryColumn] = values.quantityHeader ?? "수량";
  [[4, "맥주", values.beer], [7, "소주", values.soju], [10, "펩시콜라 24EA", values.cola], [13, "칠성사이다 24EA", values.cider]].forEach(([row, label, value]) => { rows[row][0] = label; rows[row][inventoryColumn] = value ?? ""; });
  return { __rows: rows, "!merges": values.merges || [{ s: { r: 1, c: inventoryColumn }, e: { r: 2, c: inventoryColumn + 2 } }] };
};
const workbook = {
  SheetNames: ["9월 (신규)", "10월 (신규)"],
  Workbook: { WBView: [{ activeTab: 0 }] },
  Sheets: {
    "9월 (신규)": inventorySheet({ beer: 254, soju: "223 ", cola: "203", cider: "179" }),
    "10월 (신규)": inventorySheet({ title: "■ 26년 10월 연회장 재고 현황", inventoryColumn: 53, beer: 361, soju: 331, cola: 192, cider: 151 }),
  },
};
const octoberNow = new Date("2026-10-20T12:00:00+09:00");
const parsed = inventory.readStockWorkbook(workbook, "26년 연회장 음,주류 재고 현황 '26.09.30.xlsx", octoberNow);
assert.deepEqual({ beer: parsed.beer, soju: parsed.soju, cola: parsed.cola, cider: parsed.cider, sheetName: parsed.sheetName }, { beer: 361, soju: 331, cola: 192, cider: 151, sheetName: "10월 (신규)" }, "현재월 신규 sheet의 당월재고 수량을 사용해야 한다");
assert.equal(parsed.sourceCells.beer.column, 54, "merged 당월재고 아래 수량 column을 동적으로 찾아야 한다");
assert.equal(parsed.referenceMonth, 10);
assert.equal(parsed.isFallback, false);

const novemberNow = new Date("2026-11-10T12:00:00+09:00");
const novemberSheet = inventorySheet({ title: "■ 26년 11월 연회장 재고 현황", beer: 410, soju: 320, cola: 210, cider: 180 });
const decemberSheet = inventorySheet({ title: "■ 26년 12월 연회장 재고 현황", beer: 999, soju: 999, cola: 999, cider: 999 });
const november = inventory.readStockWorkbook({ SheetNames: ["10월(신규)", "11월 (신규) ", "12월(신규)"], Sheets: { "10월(신규)": workbook.Sheets["10월 (신규)"], "11월 (신규) ": novemberSheet, "12월(신규)": decemberSheet } }, "26.09.30.xlsx", novemberNow);
assert.equal(november.sheetName.trim(), "11월 (신규)");
assert.equal(november.beer, 410);

const emptyNovember = inventorySheet({ title: "■ 26년 11월 연회장 재고 현황" });
const fallback = inventory.readStockWorkbook({ SheetNames: ["10월(신규)", "11월(신규)", "12월(신규)"], Sheets: { "10월(신규)": workbook.Sheets["10월 (신규)"], "11월(신규)": emptyNovember, "12월(신규)": decemberSheet } }, "26.09.30.xlsx", novemberNow);
assert.equal(fallback.sheetName, "10월(신규)", "현재월 값이 없으면 미래월을 제외하고 최신 과거 신규 sheet를 사용해야 한다");
assert.equal(fallback.referenceMonth, 10);
assert.equal(fallback.isFallback, true);
const commaParsed = inventory.readStockWorkbook({ SheetNames: ["9월(신규)"], Sheets: { "9월(신규)": inventorySheet({ beer: "1,234", soju: 200, cola: 300, cider: 400 }) } }, "2026-09-stock.xlsx");
assert.equal(commaParsed.beer, 1234);
assert.throws(() => inventory.readStockWorkbook({ SheetNames: ["안내"], Sheets: { 안내: { __rows: [["예시 안내"]] } } }, "2026-09.xlsx"), /재고 형식의 시트를 찾지 못했습니다/);
assert.throws(() => inventory.readStockWorkbook({ SheetNames: ["9월(신규)"], Sheets: { "9월(신규)": inventorySheet({ quantityHeader: "", beer: 1, soju: 2, cola: 3, cider: 4 }) } }, "2026-09.xlsx"), /당월재고 수량 header를 찾지 못했습니다/);
const missingItemSheet = inventorySheet({ beer: 1, soju: 2, cola: 3, cider: 4 }); missingItemSheet.__rows[13][0] = "기타음료";
assert.throws(() => inventory.readStockWorkbook({ SheetNames: ["9월(신규)"], Sheets: { "9월(신규)": missingItemSheet } }, "2026-09.xlsx"), /필수 품목 row를 찾지 못했습니다/);
const missingValueSheet = inventorySheet({ beer: "", soju: 2, cola: 3, cider: 4 });
assert.throws(() => inventory.readStockWorkbook({ SheetNames: ["9월 (신규)"], Sheets: { "9월 (신규)": missingValueSheet } }, "2026-09.xlsx"), /당월재고 수량 값을 읽지 못했습니다/);
assert.deepEqual(JSON.parse(JSON.stringify(inventory.CELL_MAPPING)), {
  beer: { label: "맥주" }, soju: { label: "소주" }, cola: { label: "콜라" }, cider: { label: "사이다" },
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
assert(html.includes("beverageInventory.js?v=current-month-stock-v1") && boardHtml.includes("beverageInventory.js?v=current-month-stock-v1"));
assert(registry.includes('"get_beverage_inventory_status", "inventory", "query"'));
assert(ai.includes('executeAction("get_beverage_inventory_status"') && ai.includes("matchesQuestion(question)"), "AI는 공용 Action Registry의 결정론 계산을 사용해야 한다");
assert(source.includes('board_date: SNAPSHOT_DATE') && source.includes('item_key: SNAPSHOT_KEY'), "최신 snapshot은 기존 공용 persistent table의 고정 key로 덮어써야 한다");
for (const message of ["엑셀 파일을 읽지 못했습니다.", "재고 형식의 시트를 찾지 못했습니다.", "당월재고 수량 header를 찾지 못했습니다.", "필수 품목 row를 찾지 못했습니다.", "당월재고 수량 값을 읽지 못했습니다."]) assert(source.includes(message), `${message} 오류를 구분해야 한다`);
assert(source.includes('sheet_to_json(sheet, { header: 1, defval: ""'), "production parser는 sheet_to_json 2차원 행렬을 사용해야 한다");

console.log("beverage inventory V1 tests passed");
