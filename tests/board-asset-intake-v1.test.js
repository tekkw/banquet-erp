const assert = require("assert");
const fs = require("fs");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const html = fs.readFileSync("outputs/board/index.html", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");

// A: mobile capture uploads to the existing public asset-images bucket.
assert(html.includes('accept="image/*" capture="environment"'));
assert(page.includes("/storage/v1/object/asset-images/"));
assert(page.includes("사진 업로드 실패"));

// B: AI only proposes one of the three V1 intents and validates real asset IDs.
assert(edge.includes('mode === "asset_intake"'));
assert(edge.includes('["create_asset", "increase_asset_quantity", "update_asset_location"]'));
assert(edge.includes("assets.find((row) => String(row.id) === targetId)"));
assert(edge.includes("Never infer a location from an image"));

// C: no DB write happens until explicit approval.
assert(page.includes('closest("[data-asset-approve]")'));
assert(page.indexOf("await applyAssetProposal(proposal)") > page.indexOf('closest("[data-asset-approve]")'));
assert(page.includes('closest("[data-asset-cancel]")'));
assert(page.includes("deleteUnlinkedAssetImage"));

// D: actual banquet_assets columns are reused and audit failure is non-fatal.
assert(page.includes("asset_name: asset.assetName"));
assert(page.includes("image_url: uploadedAssetImage?.publicUrl"));
assert(page.includes('source: "board_asset_ai"'));
assert(page.includes("변경 기록 저장은 실패했습니다."));

// E: increase is calculated again from the latest DB row, and location is explicit.
assert(page.includes("Number(before.quantity || 0) + addQuantity"));
assert(page.includes("if (!asset.floor && !asset.location)"));

// F: 390px layout remains a single-column approval form.
assert(css.includes("@media (max-width: 390px)"));
assert(css.includes(".board-asset-fields { grid-template-columns: 1fr; }"));

console.log("board asset intake V1 tests passed");
