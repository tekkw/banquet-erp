const assert = require("assert");
const fs = require("fs");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");

assert(edge.includes('mode === "asset_query"'));
for (const queryType of ["find_asset_location", "get_asset_quantity", "list_assets_by_location", "find_asset_photo", "search_asset"]) assert(edge.includes(queryType));

// Candidate search is bounded and final answers are built from real rows.
assert(edge.includes("async function searchAssetRows"));
assert(edge.includes("limit=50"));
assert(edge.includes("semanticAssetFallback"));
assert(edge.includes("limit=100"));
assert(edge.includes("assetPlace(row)"));
assert(edge.includes("row.quantity == null"));
assert(edge.includes("등록된 자산에서 찾지 못했습니다."));

// Board routing keeps intake statements separate from lookup questions.
assert(page.includes("function isAssetQueryRequest"));
assert(page.includes("function isAssetIntakeRequest"));
const submitStart = page.indexOf('aiForm.addEventListener("submit"');
assert(page.indexOf("isAssetQueryRequest(text)", submitStart) < page.indexOf("isAssetIntakeRequest(text)", submitStart));
assert(page.includes("async function handleAssetQuery(text, selection = null, offset = 0)"));
const queryRegexSource = page.match(/function isAssetQueryRequest\(text\) \{ return (?:isAssetAnalyticsRequest\(text\) \|\| )?(\/.*?\/i)\.test\(text\); \}/)?.[1];
assert(page.includes("function isAssetDecreaseRequest"));
assert(queryRegexSource, "query routing regex must remain testable");
const queryRegex = eval(queryRegexSource);
assert(!queryRegex.test("종이컵 4박스 넣었어"));
assert(queryRegex.test("종이컵 몇 박스 있어?"));

// Ambiguity, image rendering, and update handoff remain explicit UI actions.
assert(page.includes("data-asset-query-choice"));
assert(page.includes("board-asset-query-thumbnail"));
assert(page.includes("등록된 사진이 없습니다."));
assert(page.includes('data-asset-query-action="increase"'));
assert(page.includes('data-asset-query-action="decrease"'));
assert(page.includes('data-asset-query-action="location"'));
assert(page.includes("data-asset-query-more"));
assert(page.includes("safeAssetImageUrl"));
assert(css.includes(".board-asset-query-card"));

console.log("board asset query V2 tests passed");
