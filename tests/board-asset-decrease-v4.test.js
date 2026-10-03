const assert = require("assert");
const fs = require("fs");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");

assert(edge.includes("decrease_asset_quantity"));
assert(edge.includes("positive decreaseQuantity"));
assert(edge.includes("never allow a negative newQuantity"));
assert(edge.includes("Never convert units"));
assert(edge.includes("selection?.targetAssetId"));
assert(edge.includes("if (!selection && choices.length > 1) needsClarification = true"));

// Usage statements route to intake while inventory questions remain queries.
assert(page.includes("function isAssetDecreaseRequest"));
assert(page.includes("썼|사용"));
assert(page.indexOf("isAssetQueryRequest(text)", page.indexOf('aiForm.addEventListener("submit"')) < page.indexOf("isAssetIntakeRequest(text)", page.indexOf('aiForm.addEventListener("submit"')));

// Approval re-reads current stock, prevents negatives, and uses an optimistic quantity filter.
const decreaseStart = page.indexOf('proposal.intent === "decrease_asset_quantity"');
const decreaseApply = page.slice(page.indexOf('} else if (proposal.intent === "decrease_asset_quantity")'), page.indexOf('} else if (proposal.intent === "update_asset_location")'));
assert(decreaseStart > 0);
assert(decreaseApply.includes("await getAsset(proposal.targetAssetId)"));
assert(decreaseApply.includes("decreaseQuantity > latestQuantity"));
assert(decreaseApply.includes("latestQuantity !== proposedQuantity"));
assert(decreaseApply.includes("&quantity=eq.${latestQuantity}"));
assert(decreaseApply.includes("nextQuantity = latestQuantity - decreaseQuantity"));
assert(!decreaseApply.includes("DELETE"));

// Guard UI requires explicit confirmation and audit records the decrease.
assert(page.includes("data-asset-use-all"));
assert(page.includes("data-asset-confirm-latest"));
assert(page.includes("decreaseQuantity: proposal.decreaseQuantity"));
assert(page.includes('data-asset-query-action="decrease"'));

console.log("board asset decrease V4 tests passed");
