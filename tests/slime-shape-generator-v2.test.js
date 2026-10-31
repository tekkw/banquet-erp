const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const helperPath = path.join(root, "outputs/src/slimeShapeGenerator.js");
const helperSource = fs.readFileSync(helperPath, "utf8");
const prototypeSource = fs.readFileSync(path.join(root, "outputs/src/slimePrototype.js"), "utf8");
const html = fs.readFileSync(path.join(root, "outputs/board/slime-test.html"), "utf8");

class PathStub {
  constructor() { this.commands = []; }
  moveTo(x, y) { this.commands.push(["M", x, y]); }
  lineTo(x, y) { this.commands.push(["L", x, y]); }
  quadraticCurveTo(x1, y1, x2, y2) { this.commands.push(["Q", x1, y1, x2, y2]); }
  closePath() { this.commands.push(["Z"]); }
}
class ShapeStub extends PathStub { constructor() { super(); this.holes = []; this.userData = {}; } }

const executableSource = helperSource.replace(/^import .*?;\r?\n/, "").replace(/export /g, "");
const api = new Function("THREE", `${executableSource}\nreturn { SLIME_SHAPES, analyzeOccupancy, occupancyBoundaryEdges, traceOccupancyLoops, buildRoundedShapeFromCells };`)({ Shape: ShapeStub, Path: PathStub });

const expected = {
  horizontal2: { rows: 1, columns: 2, active: 2, edges: 6 },
  square2x2: { rows: 2, columns: 2, active: 4, edges: 8 },
  horizontal4: { rows: 1, columns: 4, active: 4, edges: 10 },
  vertical4: { rows: 4, columns: 1, active: 4, edges: 10 },
  lShape: { rows: 2, columns: 3, active: 4, edges: 10 },
  stepShape: { rows: 2, columns: 3, active: 5, edges: 10 },
};

Object.entries(expected).forEach(([key, contract]) => {
  const matrix = api.SLIME_SHAPES[key];
  const analyzed = api.analyzeOccupancy(matrix);
  const boundary = api.occupancyBoundaryEdges(matrix);
  const traced = api.traceOccupancyLoops(matrix);
  const shape = api.buildRoundedShapeFromCells(matrix, { cellSize: 2, radius: .72, concaveRadius: .38 });
  assert.strictEqual(analyzed.rows, contract.rows, `${key} row count`);
  assert.strictEqual(analyzed.columns, contract.columns, `${key} column count`);
  assert.strictEqual(analyzed.activeCount, contract.active, `${key} active cell count`);
  assert.strictEqual(boundary.edges.length, contract.edges, `${key} must remove internal shared edges`);
  assert.strictEqual(traced.loops.length, 1, `${key} must create one connected outer loop`);
  assert(shape instanceof ShapeStub, `${key} must return one THREE.Shape`);
  assert.strictEqual(shape.holes.length, 0, `${key} must not create accidental holes`);
  assert.strictEqual(shape.userData.occupancy.activeCount, contract.active, `${key} shape metadata`);
  assert(shape.commands.some((command) => command[0] === "Q"), `${key} must use rounded quadratic corners`);
});

const lShape = api.buildRoundedShapeFromCells(api.SLIME_SHAPES.lShape, { cellSize: 2, radius: .72, concaveRadius: .38 });
assert.strictEqual(lShape.commands.filter((command) => command[0] === "Q").length, 6, "L shape must round its convex and concave corners");
const stepShape = api.buildRoundedShapeFromCells(api.SLIME_SHAPES.stepShape, { cellSize: 2, radius: .72, concaveRadius: .38 });
assert.strictEqual(stepShape.commands.filter((command) => command[0] === "Q").length, 6, "step shape must preserve and round its partial silhouette");

assert(!helperSource.includes("Mesh(") && !helperSource.includes("ExtrudeGeometry"), "helper must only build a reusable THREE.Shape");
assert(prototypeSource.includes('import { SLIME_SHAPES, buildRoundedShapeFromCells }'), "prototype must consume the reusable helper");
assert.strictEqual((prototypeSource.match(/new THREE\.Mesh\(geometry, material\)/g) || []).length, 1, "each gallery item must use one shared mesh construction path");
assert(prototypeSource.includes("PROTOTYPE_BLOCKS.map") && prototypeSource.includes("slimes.forEach"), "all six occupancy shapes must render together");
assert.strictEqual((prototypeSource.match(/Object\.freeze\(\{ key:/g) || []).length, 6, "gallery must contain six jelly definitions");
assert(prototypeSource.includes('get("stress")') && prototypeSource.includes("Math.min(10"), "prototype-only 10-shape stress mode is required");
assert(prototypeSource.includes("geometry.boundingBox.getSize(geometrySize)"), "shape bounds must be measured from generated geometry");
assert(prototypeSource.includes("frameCamera()") && prototypeSource.includes("targetFloorY: PHYSICS.floorY + halfHeight"), "camera and floor target must follow dynamic bounds");
assert(prototypeSource.includes("massFactor") && prototypeSource.includes("PHYSICS.spring / slime.massFactor"), "spring response must adapt gently to shape mass");
for (const key of Object.keys(expected)) assert(prototypeSource.includes(`key: "${key}"`), `${key} gallery item is required`);
assert.throws(() => api.analyzeOccupancy([[1, 0, 1]]), /connected/, "disconnected cells must not become multiple meshes or accidental holes");
assert(!prototypeSource.slice(prototypeSource.indexOf("function animate"), prototypeSource.indexOf("createControls")).includes("makeGeometry"), "geometry must not be rebuilt per frame");
assert(html.includes('id="slimeLabels"'), "DOM overlay labels must stay outside jelly geometry");

console.log("slime shape generator V2 tests passed");
