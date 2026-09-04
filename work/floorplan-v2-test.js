const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.window = {};
global.document = { getElementById: () => null };
require("../outputs/src/baseFloorplanWizard.js");
const geometry = window.BANQUET_ERP_FLOORPLAN_V2_GEOMETRY;
const wizardSource = fs.readFileSync(path.join(__dirname, "..", "outputs", "src", "baseFloorplanWizard.js"), "utf8");
const assetStyles = fs.readFileSync(path.join(__dirname, "..", "outputs", "src", "styles", "assets.css"), "utf8");
const editorSource = fs.readFileSync(path.join(__dirname, "..", "outputs", "src", "floorplanEditor.js"), "utf8");

assert.equal(geometry.toMillimeters("12"), 12000);
assert.equal(geometry.toMillimeters("0.0014"), 1);
assert.equal(geometry.isFloorplanEditingLocked({ id: "floorplan-1", is_locked: true }, true), true);
assert.equal(geometry.isFloorplanEditingLocked({ id: "floorplan-1", is_locked: true }, false), false);
assert.equal(geometry.isFloorplanEditingLocked({ id: "floorplan-1", is_locked: false }, true), false);

const structureBounds = geometry.boundsOf(geometry.rectanglePoints(16200, 15000));
const restoredPillar = geometry.structureFromRow({
  id: "pillar-1", object_type: "pillar", label: "P1", x: 0.25, y: 0.2, width: 0.05, height: 0.06,
  rotation: 15, metadata: { geometryVersion: 2, unit: "mm", xMm: 4200, yMm: 3600, widthMm: 900, heightMm: 700 },
}, structureBounds);
assert.deepEqual({ xMm: restoredPillar.xMm, yMm: restoredPillar.yMm, widthMm: restoredPillar.widthMm, heightMm: restoredPillar.heightMm },
  { xMm: 4200, yMm: 3600, widthMm: 900, heightMm: 700 }, "fixed structures restore mm metadata before normalized fields");
const pillarPayload = geometry.structureToPayload(restoredPillar, "floorplan-1", structureBounds, 10);
assert.equal(pillarPayload.metadata.geometryVersion, 2);
assert.equal(pillarPayload.metadata.unit, "mm");
assert.equal(pillarPayload.metadata.xMm, 4200);
assert.equal(pillarPayload.metadata.widthMm, 900);
assert.equal(pillarPayload.is_locked, true);
assert.equal(pillarPayload.x, (4200 - 450) / 16200);

const rectangle = geometry.rectanglePoints(10000, 8000);
assert.equal(geometry.validate(rectangle).valid, true);
assert.deepEqual(geometry.boundsOf(rectangle), { minX: 0, minY: 0, maxX: 10000, maxY: 8000, width: 10000, height: 8000 });
assert.equal(geometry.boundsOf(rectangle).width / geometry.boundsOf(rectangle).height, 10 / 8);
assert.equal(geometry.polygonArea(rectangle), 80000000);
assert.deepEqual(geometry.addWall(rectangle, "right", 1000), rectangle, "closed polygons cannot receive another wall");

let lShape = [{ x: 0, y: 0 }];
[["right", 12000], ["down", 5000], ["right", 4000], ["down", 7000], ["left", 16000], ["up", 12000]]
  .forEach(([direction, length]) => { lShape = geometry.addWall(lShape, direction, length); });
assert.equal(geometry.validate(lShape).valid, true);
assert.deepEqual(lShape.at(-1), { x: 0, y: 0 });
assert.deepEqual(lShape, [
  { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 5000 },
  { x: 16000, y: 5000 }, { x: 16000, y: 12000 }, { x: 0, y: 12000 }, { x: 0, y: 0 },
]);
assert.equal(geometry.polygonArea(lShape), 172000000);

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
assert.deepEqual(geometry.autoClose(crossing.slice(0, -1)), crossing.slice(0, -1), "an intersecting path is not auto-closed");

const overlapping = [
  { x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 4000, y: 0 },
  { x: 4000, y: 5000 }, { x: 0, y: 5000 }, { x: 0, y: 0 },
];
assert.equal(geometry.hasSelfIntersection(overlapping), true);
assert.equal(geometry.validate(overlapping).code, "self_intersection");

const diagonal = [{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }, { x: 0, y: 0 }];
assert.equal(geometry.validate(diagonal).code, "not_orthogonal");

const beforeUndo = geometry.addWall(open, "down", 3000);
const afterUndo = beforeUndo.slice(0, -1);
assert.deepEqual(afterUndo.at(-1), { x: 10000, y: 0 });
const snapshot = JSON.stringify(rectangle);
geometry.boundsOf(rectangle);
const fittedView = geometry.viewBoxFor(rectangle, 1);
const zoomedView = geometry.viewBoxFor(rectangle, 2);
assert.equal(zoomedView.width, fittedView.width / 2);
assert.equal(zoomedView.height, fittedView.height / 2);
assert.equal(JSON.stringify(rectangle), snapshot);

for (const htmlFile of ["index.html", "event-order-preview.html"]) {
  const html = fs.readFileSync(path.join(__dirname, "..", "outputs", htmlFile), "utf8");
  [
    "floorplanV2NewButton", "floorplanV2VenueSelect", "floorplanV2SpaceSelect", "floorplanV2NameInput",
    "floorplanV2Directions", "floorplanV2WallList", "floorplanV2UndoWallButton", "floorplanV2ResetButton",
    "floorplanV2AutoCloseButton", "floorplanV2ZoomInButton", "floorplanV2ZoomOutButton", "floorplanV2FitButton",
    "floorplanV2LockedInput", "floorplanV2LockStatus", "floorplanV2EventPanel", "floorplanV2Structures",
    "floorplanV2StructureTypes", "floorplanV2StructureProperties", "floorplanV2StructureNameInput",
    "floorplanV2StructureXInput", "floorplanV2StructureYInput", "floorplanV2StructureWidthInput",
    "floorplanV2StructureHeightInput", "floorplanV2StructureRotationInput", "floorplanV2StructureDeleteButton",
  ].forEach((id) => assert.match(html, new RegExp(`id=["']${id}["']`), `${htmlFile} contains #${id}`));
  assert.match(html, /src=["']\.\/src\/floorplanEditor\.js(?:\?[^"']+)?["']/);
  assert.match(html, /src=["']\.\/src\/baseFloorplanWizard\.js(?:\?[^"']+)?["']/);
  assert.ok(html.indexOf("floorplanEditor.js") < html.indexOf("baseFloorplanWizard.js"), "advanced editor remains loaded before V2 shell");
}

const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260902160000_enable_geometry_base_floorplans.sql"), "utf8");
assert.match(migration, /alter column file_id drop not null/i);
assert.match(migration, /add column if not exists is_locked boolean not null default false/i);
assert.doesNotMatch(migration, /alter table public\.(venue_layout_objects|layout_object_types)/i, "object specification tables remain unchanged");
assert.match(wizardSource, /method: currentFloorplan\?\.id \? "PATCH" : "POST"/, "existing floorplans are updated instead of duplicated");
assert.match(wizardSource, /unit: "mm", points:/, "millimeter points are the stored geometry source of truth");
assert.match(wizardSource, /geometryControls\.forEach\(\(control\) => \{ control\.disabled = locked; \}\)/, "locked plans disable geometry controls");
assert.match(wizardSource, /if \(isEditingLocked\(\) \|\| points\.length <= 1\) return;/, "locked plans block wall undo");
assert.match(wizardSource, /strokeWidthPx: 2\.5/, "hall outlines store a display stroke, not wall thickness");
assert.doesNotMatch(wizardSource, /strokeWidthMm/, "hall outlines do not imply physical wall thickness");
assert.match(assetStyles, /\.floorplan-v2-outline \{[^}]*stroke-width: 2\.5px;[^}]*vector-effect: non-scaling-stroke;/, "outline stays thin while zooming");
assert.match(editorSource, /geometryVersion: 2,[\s\S]*xMm: Math\.round\(object\.x\),[\s\S]*widthMm: Math\.round\(object\.widthM \* 1000\)/, "layout objects persist millimeter source coordinates");
assert.match(editorSource, /Number\.isFinite\(Number\(row\.metadata\?\.xMm\)\)/, "V2 reload prefers millimeter coordinates");
assert.match(editorSource, /object\.rotation = normalizeDegrees\(Number\(object\.rotation \|\| 0\) \+ 90\)/, "objects rotate in 90 degree steps");
assert.match(editorSource, /object\.x \+ 200/, "duplicates use a 200mm offset");
assert.match(editorSource, /event\.shiftKey \? 500 : 100/, "keyboard movement uses 100mm and Shift+500mm steps");
assert.match(editorSource, /zoomWorkspaceAtCenter\(2\)/, "zoom controls cover 100 to 200 percent");
assert.match(editorSource, /zoomWorkspaceAtCenter\(0\.5\)/, "zoom controls cover 100 to 50 percent");
assert.match(editorSource, /vector-effect", "non-scaling-stroke"/, "V2 hall outline remains a fixed display stroke while zooming");
assert.match(wizardSource, /venue_floorplan_objects\?select=\*&floorplan_id=.*is_active=eq\.true&order=sort_order\.asc/, "base editor reloads outlines and fixed structures together");
assert.match(wizardSource, /geometryVersion: 2, unit: "mm", coordinateAnchor: "center"/, "fixed structures persist millimeter metadata");
assert.match(editorSource, /group\.dataset\.baseFloorplanObject = "true";[\s\S]*group\.setAttribute\("pointer-events", "none"\)/, "event layouts render base structures as non-interactive background objects");
assert.match(editorSource, /"fixed_wall"/, "event workspace recognizes fixed walls as base structures");

console.log("Floorplan V2 geometry tests passed.");
