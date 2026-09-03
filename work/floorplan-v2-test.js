const assert = require("node:assert/strict");
global.window = {};
global.document = { getElementById: () => null };
require("../outputs/src/baseFloorplanWizard.js");
const geometry = window.BANQUET_ERP_FLOORPLAN_V2_GEOMETRY;

const rectangle = geometry.rectanglePoints(10000, 8000);
assert.equal(geometry.validate(rectangle).valid, true);
assert.deepEqual(geometry.boundsOf(rectangle), { minX: 0, minY: 0, maxX: 10000, maxY: 8000, width: 10000, height: 8000 });
assert.equal(geometry.boundsOf(rectangle).width / geometry.boundsOf(rectangle).height, 10 / 8);

let lShape = [{ x: 0, y: 0 }];
[["right", 12000], ["down", 5000], ["right", 4000], ["down", 7000], ["left", 16000], ["up", 12000]]
  .forEach(([direction, length]) => { lShape = geometry.addWall(lShape, direction, length); });
assert.equal(geometry.validate(lShape).valid, true);
assert.deepEqual(lShape.at(-1), { x: 0, y: 0 });

const open = geometry.addWall([{ x: 0, y: 0 }], "right", 10000);
assert.equal(geometry.validate(open).valid, false);
assert.equal(geometry.validate(open).message, "외곽선이 닫히지 않았습니다.");
assert.equal(geometry.validate(geometry.autoClose(geometry.addWall(open, "down", 8000))).valid, true);

const crossing = [
  { x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 4000 },
  { x: 2000, y: 4000 }, { x: 2000, y: -2000 }, { x: 0, y: -2000 }, { x: 0, y: 0 },
];
assert.equal(geometry.hasSelfIntersection(crossing), true);
assert.equal(geometry.validate(crossing).valid, false);

const beforeUndo = geometry.addWall(open, "down", 3000);
const afterUndo = beforeUndo.slice(0, -1);
assert.deepEqual(afterUndo.at(-1), { x: 10000, y: 0 });
const snapshot = JSON.stringify(rectangle);
geometry.boundsOf(rectangle);
geometry.boundsOf(rectangle);
assert.equal(JSON.stringify(rectangle), snapshot);

console.log("Floorplan V2 geometry tests passed.");
