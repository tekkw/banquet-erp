const assert = require("node:assert/strict");
const fs = require("node:fs");

const main = fs.readFileSync("outputs/index.html", "utf8");
const board = fs.readFileSync("outputs/board/index.html", "utf8");
const preview = fs.readFileSync("outputs/event-order-preview.html", "utf8");
const shared = fs.readFileSync("outputs/src/styles/venueTimeline.css", "utf8");
const boardOnly = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");

for (const selector of [
  ".venue-usage-timeline",
  ".venue-timeline-toolbar",
  ".setup-timeline-pending",
  ".venue-timeline-grid",
  ".venue-timeline-card",
  ".venue-timeline-detail",
]) assert(shared.includes(selector), `${selector} must be provided by the shared timeline stylesheet`);

assert(main.includes('styles/venueTimeline.css?v=venue-timeline-ui-v1'), "main ERP must load shared timeline CSS with a cache key");
assert(board.includes('styles/venueTimeline.css?v=venue-timeline-ui-v1'), "standalone board must load shared timeline CSS with a cache key");
assert(preview.includes('styles/venueTimeline.css?v=venue-timeline-ui-v1'), "event-order preview entrypoint must load shared timeline CSS with a cache key");
assert(!main.includes("operationBoardPage.css"), "main ERP must not load the standalone board stylesheet");
assert(!boardOnly.includes(".venue-timeline-grid"), "timeline rules must not remain duplicated in board-only CSS");
assert(shared.includes("overflow: auto") && shared.includes("position: sticky"), "timeline must keep scrolling and sticky axes");
assert(shared.includes('@media (max-width: 768px)') && shared.includes("minmax(132px, 1fr)"), "mobile timeline must retain horizontal navigation sizing");

console.log("venue timeline shared CSS V1 tests passed");
