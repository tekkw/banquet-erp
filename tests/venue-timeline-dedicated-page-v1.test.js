const assert = require("node:assert/strict");
const fs = require("node:fs");

const board = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const css = fs.readFileSync("outputs/src/styles/venueTimeline.css", "utf8");

for (const page of ["outputs/index.html", "outputs/event-order-preview.html"]) {
  const html = fs.readFileSync(page, "utf8");
  assert(html.includes('data-dashboard-target="timeline">행사장 타임라인'), `${page}: sidebar timeline menu missing`);
  assert(html.includes('data-erp-page="timeline"'), `${page}: dedicated timeline page missing`);
  assert(html.includes('id="venueTimelinePageRoot"'), `${page}: timeline render root missing`);
  assert(html.includes('"calendar", "timeline", "assets"'), `${page}: timeline route must follow calendar`);
  assert(!html.includes('data-mobile-target="timeline"'), `${page}: mobile navigation must remain unchanged`);
}

assert(board.includes('const standaloneBoard = document.body.classList.contains("operation-board-page")'), "standalone /board/ compatibility guard missing");
assert.match(board, /standaloneBoard && venueTimelineEnabled\(\)[\s\S]*?data-board-tab="timeline"/, "timeline tab must be limited to standalone board");
assert(board.includes('timelinePageRoot.innerHTML = venueTimelineEnabled()'), "dedicated page must reuse the timeline renderer");
assert(board.includes('renderVenueUsageTimeline(currentEvents, selectedDate)'), "existing timeline renderer must be reused");
assert(board.includes('const timelineContainer = activeTimelineRoot()'), "timeline handlers must bind to one active timeline root");
assert(!board.includes("venue-timeline-fullscreen\" href"), "dedicated page must not render a fullscreen link");
assert(css.includes(".venue-timeline-page .venue-timeline-grid") && css.includes("max-height: none"), "dedicated page size constraints must be removed");
assert(css.includes(".setup-timeline-pending > summary"), "pending setup list must be collapsible");
assert(board.includes('timelineDayCount = 7') && board.includes('timelineDayCount === 7 ? 14 : 7'), "timeline must switch between one and two weeks");
assert(board.includes('const TIMELINE_VENUES = ["CONVENTION_A", "CONVENTION_B", "FESTA", "BURANO_1", "BURANO_2", "BURANO_3", "OLIVIA", "CAPRI_1", "CAPRI_2", "CAPRI_3"]'), "timeline must render only ten physical venue rows");
assert(css.includes('[data-timeline-days="7"]') && css.includes('repeat(7, minmax(0, 1fr))'), "one-week view must fit seven equal columns");

console.log("venue timeline dedicated page V1 tests passed");
