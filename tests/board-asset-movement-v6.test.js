const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");

assert(edge.includes("get_asset_last_movement"));
assert(edge.includes("get_asset_movement_history"));
assert(edge.includes("list_recent_asset_movements"));
assert(edge.includes('metadata->>action=eq.move_asset'));
assert(edge.includes('metadata->>assetId=eq.${encodeURIComponent(asset.id)}'));
assert(edge.includes("limit=${parsed.queryType === \"get_asset_last_movement\" ? 1 : 10}"));

assert(page.includes('action: "move_asset"'));
for (const field of ["assetId", "assetName", "fromFloor", "fromLocation", "toFloor", "toLocation", "quantity", "userText", "createdAt"]) assert(page.includes(`${field}:`));

const moveApply = page.slice(page.indexOf('} else if (proposal.intent === "update_asset_location")'), page.indexOf('} else throw new Error("지원하지 않는 자산 작업입니다.")'));
assert(moveApply.includes("before = await getAsset(proposal.targetAssetId)"));
assert(moveApply.includes('assetApplyError("asset_location_changed"'));
assert(moveApply.includes('assetApplyError("partial_move_unsupported"'));
assert(moveApply.includes('locationFilter("floor", before.floor)'));
assert(moveApply.includes('locationFilter("location", before.location)'));
assert(moveApply.includes('Prefer: "return=representation"'));

assert(page.includes("data-asset-confirm-location"));
assert(page.includes("일부 수량 이동은 아직 지원하지 않습니다."));
assert(page.includes('data-asset-query-action="movement"'));
assert(page.includes("movementResultCard"));
assert(css.includes(".board-asset-movement-card"));

assert(page.includes("function isAssetMoveRequest"));
assert(page.includes("이동\\s*이력|최근\\s*이동|마지막.*옮"));
assert(html.includes("operationBoardPage.js?v=8-asset-movement"));
assert(html.includes("operationBoardPage.css?v=5-asset-movement"));

console.log("board asset movement V6 tests passed");
