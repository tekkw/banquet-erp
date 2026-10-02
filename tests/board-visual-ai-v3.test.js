const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");

// A/B: rear camera preview is local and opening it never invokes AI.
assert(html.includes('id="boardVisualVideo" autoplay playsinline muted'));
assert(page.includes('getUserMedia({ video: { facingMode: "environment" }, audio: false })'));
const openCameraBody = page.slice(page.indexOf("async function openVisualCamera"), page.indexOf("function closeVisualCamera"));
assert(!openCameraBody.includes("event-order-ai-chat"));
assert(!page.includes("setInterval("), "visual AI must not capture periodically");

// C/E: only the explicit capture button sends one compressed, resized frame.
assert(page.includes('Math.min(1, 1280 / Math.max(width, height))'));
assert(page.includes('toDataURL("image/jpeg", 0.78)'));
assert(page.includes("visualCaptureButton.addEventListener"));
assert(page.includes("requestVisualQuery(text, true)"));

// D: follow-ups send cached summary and at most three recent turns, not the image.
assert(page.includes("visualSession.visualSummary"));
assert(page.includes("recentConversation.slice(-3)"));
assert(page.includes("capturedImage: includeImage ? visualSession.imageDataUrl : null"));
assert(page.includes("requestsDetailedReview(text)"));

// F/G: asset checks reuse actual asset query logic and camera close stops tracks.
assert(edge.includes('mode === "visual_query"'));
assert(edge.includes("await queryBanquetAssets"));
assert(edge.includes("사진만으로 등록 여부를 단정할 수 없습니다."));
assert(page.includes("visualStream.getTracks().forEach((track) => track.stop())"));
assert(page.includes("data-visual-register-asset"));
assert(css.includes(".board-visual-camera video"));

console.log("board visual AI V3 tests passed");
