const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");

for (const type of ["get_asset_usage", "rank_asset_usage", "list_low_stock", "list_asset_inbound", "rank_asset_movements", "asset_activity_summary"]) assert(edge.includes(type));

// Analytics are detected and aggregated before the generic AI query parser.
const queryStart = edge.indexOf("async function queryBanquetAssets");
assert(edge.indexOf("detectAssetAnalyticsQuery(cleanQuestion)", queryStart) < edge.indexOf("await parseAssetQuery(cleanQuestion)", queryStart));
assert(edge.includes('metadata->>action=in.(${actions.join(",")})'));
assert(edge.includes("created_at=gte."));
assert(edge.includes("created_at=lt."));
assert(edge.includes("Asia/Seoul"));
for (const period of ["오늘", "어제", "최근 7일", "이번 주", "지난 주", "이번 달", "지난 달", "최근 30일"]) assert(edge.includes(period));

assert(edge.includes("auditDecreaseQuantity"));
assert(edge.includes("quantities.reduce((sum, value) => sum + value, 0)"));
assert(edge.includes("기록된 사용 이력이 없습니다."));
assert(edge.includes("quantity=lte.${threshold}&order=quantity.asc"));
assert(edge.includes("afterQuantity - beforeQuantity"));
assert(edge.includes("current.count += 1"));
assert(edge.includes("이동 기록 건수"));

assert(page.includes("function isAssetAnalyticsRequest"));
assert(page.includes("analysisResultCard"));
assert(page.includes("result.speechText"));
assert(css.includes(".board-asset-analysis-card"));
assert(html.includes("operationBoardPage.js?v=10-asset-analytics"));
assert(html.includes("operationBoardPage.css?v=7-asset-analytics"));

// A direct decrease command remains intake; analytics require a period/rank/stock signal.
const analyticsSource = page.match(/function isAssetAnalyticsRequest\(text\) \{ return (\/.*?\/i)\.test\(text\); \}/)?.[1];
assert(analyticsSource);
const analyticsRegex = eval(analyticsSource);
assert(analyticsRegex.test("이번 달 AA건전지 몇 개 썼어?"));
assert(analyticsRegex.test("재고 5개 이하인 것 보여줘"));
assert(!analyticsRegex.test("AA건전지 3개 썼어"));

console.log("board asset analytics V8 tests passed");
