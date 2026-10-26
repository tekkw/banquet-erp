const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
require(path.join(root, "outputs/src/venueUtils.js"));
const physics = require(path.join(root, "outputs/src/eventBlockPhysics.js"));

function event(id, startDate, endDate, venue, schedule = []) {
  return { id, startDate, endDate, venue, schedule, eventName: `행사 ${id}`, companyName: `주최 ${id}` };
}

// A. A single hall occupies the two visual cells assigned to one canonical hall.
const oneHallDay = physics.occupancyForEvent(event("A", "2026-11-01", "2026-11-01", "부라노1"));
assert.strictEqual(oneHallDay.cells.length, 2, "single hall/day must create a two-cell piece");
assert.strictEqual(oneHallDay.width, 2);
assert.strictEqual(oneHallDay.height, 1);

// B. Two dates preserve the same two-cell width and form a 2x2 piece.
const oneHallTwoDays = physics.occupancyForEvent(event("B", "2026-11-01", "2026-11-02", "부라노1"));
assert.strictEqual(oneHallTwoDays.cells.length, 4);
assert.strictEqual(oneHallTwoDays.width, 2);
assert.strictEqual(oneHallTwoDays.height, 2);

// C. Multiple adjacent canonical halls make a wide, data-driven row.
const multiVenue = physics.occupancyForEvent(event("C", "2026-11-01", "2026-11-01", "부라노1 + 부라노2"));
assert.strictEqual(multiVenue.cells.length, 4);
assert.strictEqual(multiVenue.width, 4);

// D. A multi-day event extends vertically without a shape preset.
const multiDay = physics.occupancyForEvent(event("D", "2026-11-01", "2026-11-04", "카프리1"));
assert.strictEqual(multiDay.cells.length, 8);
assert.strictEqual(multiDay.height, 4);

// E. Date-specific venue usage creates a step/L occupancy result.
const stepped = physics.occupancyForEvent(event("E", "2026-11-01", "2026-11-02", "부라노1", [
  { date: "2026-11-01", venue: "부라노1 + 부라노2" },
  { date: "2026-11-02", venue: "부라노1" },
]));
const rowWidths = [0, 1].map((y) => stepped.cells.filter((cell) => cell.y === y).length);
assert.deepStrictEqual(rowWidths, [4, 2], "schedule occupancy must create a step shape");

// F/G. Cell collision is exact and start datetime order gets bottom priority.
const placed = physics.placePieces([
  physics.occupancyForEvent(event("later", "2026-11-02", "2026-11-02", "부라노1")),
  physics.occupancyForEvent(event("near", "2026-11-01", "2026-11-01", "부라노1")),
  physics.occupancyForEvent(event("side", "2026-11-03", "2026-11-03", "카프리1")),
]);
assert.strictEqual(physics.hasOverlap(placed), false, "placed pieces must never share a grid cell");
assert.strictEqual(placed[0].id, "near", "closest event must be considered first");
assert.strictEqual(placed[0].targetRow, 0, "closest event must rest on the floor");
assert.strictEqual(placed[1].targetRow, 1, "colliding later event must rest above it");
assert.strictEqual(placed[2].targetRow, 0, "non-colliding lane may also rest on the floor");
const reflowed = physics.buildLayout([
  event("near", "2026-11-01", "2026-11-01", "부라노1"),
  event("later", "2026-11-02", "2026-11-02", "부라노1"),
], { completedIds: ["near"] });
assert.strictEqual(reflowed[0].id, "later");
assert.strictEqual(reflowed[0].targetRow, 0, "piece above a completed event must reflow to the floor");

// Connected occupancy is converted to one rounded outer contour with shared edges removed.
const adjacentCells = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
assert.strictEqual(physics.contourEdges(adjacentCells).length, 6, "adjacent cells must remove their two shared internal edges");
assert.strictEqual(physics.buildContourLoops(adjacentCells).length, 1, "adjacent cells must create one connected contour");
const adjacentContour = physics.buildPieceContour(adjacentCells, { cellSize: 10, radius: 2 });
assert.strictEqual((adjacentContour.match(/M/g) || []).length, 1, "connected cells must render as one silhouette path");
assert(adjacentContour.includes("Q"), "outer contour corners must be rounded");

const lCells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
const lContour = physics.buildPieceContour(lCells, { cellSize: 10, radius: 2 });
assert.strictEqual(physics.buildContourLoops(lCells).length, 1, "L occupancy must remain one contour");
assert(lContour.includes("Q10 10"), "L contour must retain and round its concave corner");

const stepCells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
assert.strictEqual(physics.buildContourLoops(stepCells).length, 1, "step occupancy must remain one contour");
assert.strictEqual((physics.buildPieceContour(stepCells, { cellSize: 10 }).match(/M/g) || []).length, 1, "step shape must be a single silhouette");

const html = fs.readFileSync(path.join(root, "outputs/board/index.html"), "utf8");
const boardScript = fs.readFileSync(path.join(root, "outputs/src/eventBlockBoard.js"), "utf8");
const pageScript = fs.readFileSync(path.join(root, "outputs/src/operationBoardPage.js"), "utf8");
const css = fs.readFileSync(path.join(root, "outputs/src/styles/eventBlockBoard.css"), "utf8");

assert(html.includes('data-board-view="list"') && html.includes('data-board-view="blocks"'), "list and block experiment tabs are required");
assert(html.includes('id="todayOperationBoard"'), "existing operation list must remain mounted");
assert(html.includes("eventBlockPhysics.js") && html.includes("eventBlockBoard.js"), "block modules must load in the mobile entry");
assert(pageScript.includes("eventBlockBoard?.render({ events })"), "event refresh must render the block view");

// H-L. Animation and interaction capabilities remain visible as explicit implementation contracts.
assert(boardScript.includes("requestAnimationFrame") && boardScript.includes("easeSpring"), "drop must use rAF spring motion");
assert(boardScript.includes("Math.max(450, Math.min(750"), "drop duration must remain within the 450-750ms range");
assert(boardScript.includes("landingSquash") && boardScript.includes("sx: 1.10, sy: .90") && boardScript.includes("animate(230"), "strong jelly landing squash is required");
assert(boardScript.includes("tapPiece") && boardScript.includes("sx: 1.04, sy: .96") && boardScript.includes("animate(190"), "tap must compress like jelly");
assert(boardScript.includes("completePiece") && boardScript.includes("sx: 1.10, sy: 1.10") && boardScript.includes("sx: .85, sy: .85"), "completion must inflate then contract and fade");
assert(boardScript.includes("previousRows") && boardScript.includes("oldRow !== piece.targetRow"), "completion re-layout must animate gravity movement");
assert(boardScript.includes("tapPiece") && boardScript.includes("openDetail(piece)"), "tap must squash before opening details");
assert(boardScript.includes("prefers-reduced-motion: reduce") && boardScript.includes("prefersReducedMotion?.matches"), "reduced motion must bypass animation");
assert(boardScript.includes("openStoredExcel") && boardScript.includes("eventBlockDetail"), "detail must reuse original Excel flow");
assert(boardScript.includes("IntersectionObserver"), "off-screen animation visibility must be observed");
assert(boardScript.includes("physics.buildPieceContour") && !boardScript.includes('svgNode("rect"'), "piece must use one contour instead of cell rectangles");
assert(boardScript.includes("const GAP = 0"), "piece-internal cell gaps must be eliminated");
assert(boardScript.indexOf("group.append(jelly)") < boardScript.indexOf("group.append(label)"), "text must be a separate layer above filtered jelly paths");
assert(boardScript.includes("jellyQuality") && boardScript.includes("eventBlockJellyHigh"), "high and normal jelly quality paths must be available");
assert(css.includes("event-block-jelly-base") && css.includes("event-block-jelly-gloss") && css.includes("event-block-jelly-rim"), "layered jelly presentation is required");

console.log("event block board V1 tests passed");
