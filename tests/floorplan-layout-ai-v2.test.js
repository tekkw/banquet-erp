const assert = require("node:assert/strict");
const fs = require("node:fs");

global.window = {};
require("../outputs/src/floorplanEditor.js");
const api = window.BANQUET_ERP_FLOORPLAN_EDITOR;

assert.equal(api.layoutAiContextMatches("컨벤션B", ["컨벤션B", "컨벤션홀", "컨벤션B 기본도면"]), true);
assert.equal(api.layoutAiContextMatches("부라노1", ["컨벤션B", "컨벤션B 기본도면"]), false);

const roundParsed = api.parseLayoutAiCommand("부라노1 라운드 6T 2x3 8석씩");
assert.equal(roundParsed.needsConfirmation, undefined);
assert.deepEqual(
  { type: roundParsed.plan.layoutType, columns: roundParsed.plan.columns, rows: roundParsed.plan.rows, tables: roundParsed.plan.roundTables, seats: roundParsed.plan.totalSeats },
  { type: "round", columns: 2, rows: 3, tables: 6, seats: 48 },
);
assert.equal(api.parseLayoutAiCommand("라운드 5T 2x3 8석씩").needsConfirmation, true);

assert.deepEqual(api.getRoundSeatAngles(5, "top"), [90, 135, 180, 225, 270]);
assert.deepEqual(api.getRoundSeatAngles(6, "top"), [45, 90, 135, 225, 270, 315]);
assert.deepEqual(api.getRoundSeatAngles(7, "top"), [45, 90, 135, 180, 225, 270, 315]);
assert.deepEqual(api.getRoundSeatAngles(8, "top"), [30, 60, 120, 150, 210, 240, 300, 330]);
assert.deepEqual(api.getRoundSeatAngles(9, "top"), [30, 60, 120, 150, 180, 210, 240, 300, 330]);
assert.deepEqual(api.getRoundSeatAngles(10, "top"), [0, 30, 60, 120, 150, 180, 210, 240, 300, 330]);
assert.deepEqual(api.getRoundSeatAngles(8, "right"), [120, 150, 210, 240, 300, 330, 30, 60]);
assert.deepEqual(api.getRoundSeatAngles(8, "bottom"), [210, 240, 300, 330, 30, 60, 120, 150]);
assert.deepEqual(api.getRoundSeatAngles(8, "left"), [300, 330, 30, 60, 120, 150, 210, 240]);

const masters = {
  table: { id: "seminar-1800", widthMm: 1800, heightMm: 450, displayShape: "rect" },
  roundTable: { id: "round-1800", widthMm: 1800, heightMm: 1800, displayShape: "circle" },
  chair: { id: "chair", widthMm: 450, heightMm: 450, displayShape: "rect" },
};
const room = { widthMm: 12000, heightMm: 15000, paddingMm: 800, frontDirection: "top", baseZIndex: 0 };
const roundObjects = api.generateRoundLayout(roundParsed.plan, room, masters, "round-v2");
assert.equal(roundObjects.filter((object) => object.objectType === "round_table").length, 6);
assert.equal(roundObjects.filter((object) => object.objectType === "chair").length, 48);
const firstRoundTable = roundObjects.find((object) => object.objectType === "round_table");
const roundTables = roundObjects.filter((object) => object.objectType === "round_table");
assert.equal((Math.min(...roundTables.map((table) => table.x)) + Math.max(...roundTables.map((table) => table.x))) / 2, room.widthMm / 2);
assert.equal((Math.min(...roundTables.map((table) => table.y)) + Math.max(...roundTables.map((table) => table.y))) / 2, room.heightMm / 2);
const firstRoundChairs = roundObjects.filter((object) => object.objectType === "chair" && object.metadata.row === 1 && object.metadata.column === 1);
assert.deepEqual(firstRoundChairs.map((chair) => chair.metadata.seatAngle), [30, 60, 120, 150, 210, 240, 300, 330]);
assert(firstRoundChairs.every((chair) => Number.isFinite(chair.x) && Number.isFinite(chair.y) && chair.rotation === (chair.metadata.seatAngle + 180) % 360));
assert(firstRoundChairs.every((chair) => Math.hypot(chair.x - firstRoundTable.x, chair.y - firstRoundTable.y) > 900));
assert.equal(api.validateGeneratedLayout(roundObjects, room, [], roundParsed.plan).valid, true);

const savedSchoolObjects = [];
for (let row = 1; row <= 3; row += 1) for (let column = 1; column <= 3; column += 1) {
  const centerX = 2000 + (column - 1) * 2250; const centerY = 1800 + (row - 1) * 1350;
  savedSchoolObjects.push({ object_type: "seminar_table", x: (centerX - 900) / 8600, y: (centerY - 225) / 15500, width: 1800 / 8600, height: 450 / 15500, metadata: { row, column, widthMm: 1800, heightMm: 450 } });
  for (let seat = 1; seat <= 2; seat += 1) savedSchoolObjects.push({ object_type: "chair", metadata: { row, column, seat } });
}
savedSchoolObjects.push({ object_type: "seminar_table", x: 0.1, y: 0.7, width: 1600 / 8600, height: 450 / 15500, metadata: { widthMm: 1600, heightMm: 450 } });
const profile = api.calculateSchoolSpacingProfile(savedSchoolObjects, { widthMm: 8600, heightMm: 15500, frontDirection: "top" }, { tableWidthMm: 1800, tableDepthMm: 450 });
assert.deepEqual(
  { columnPitch: profile.columnPitch, horizontalGap: profile.horizontalGapMm, rowPitch: profile.rowPitch, verticalGap: profile.verticalGapMm, seats: profile.seatsPerTable },
  { columnPitch: 2250, horizontalGap: 450, rowPitch: 1350, verticalGap: 900, seats: 2 },
);
const schoolPlan = api.parseLayoutAiCommand("스쿨식 3x3 2석씩").plan;
const profiledPlan = api.applySchoolSpacingProfile(schoolPlan, profile);
assert.equal(profiledPlan.horizontalGapMm, 450);
assert.equal(profiledPlan.verticalGapMm, 900);
const profiledObjects = api.generateSchoolLayout(profiledPlan, room, masters, "profiled-school").filter((object) => object.objectType === "seminar_table");
assert.equal(profiledObjects[1].x - profiledObjects[0].x, 2250);
assert.equal(profiledObjects[3].y - profiledObjects[0].y, 1350);
const explicitGapPlan = api.parseLayoutAiCommand("스쿨식 3x3 2석씩 가로 간격 600mm 세로 간격 1000mm").plan;
assert.equal(api.applySchoolSpacingProfile(explicitGapPlan, profile).horizontalGapMm, 600);
assert.equal(api.applySchoolSpacingProfile(explicitGapPlan, profile).verticalGapMm, 1000);

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
assert(source.includes("workspaceFloorplanRecord?.id") && source.includes("layoutAiContextMatches(requested, currentNames)"));
assert(source.includes("sameSpace && sameSpec ? 1 : sameSpace ? 2 : sameFamily ? 3 : 4"));
assert(source.includes('plan.layoutType === "round" ? generateRoundLayout'));

console.log("floorplan layout AI V2 tests passed");
