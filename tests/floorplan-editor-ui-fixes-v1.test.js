const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const styles = fs.readFileSync("outputs/src/styles/assets.css", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const api = context.window.BANQUET_ERP_FLOORPLAN_EDITOR;

const conventionOutline = [
  { x: 0, y: 0 }, { x: 18090, y: 0 }, { x: 18090, y: -19550 },
  { x: -16060, y: -19550 }, { x: -16060, y: -5550 }, { x: 0, y: -5550 }, { x: 0, y: 0 },
];
const conventionBounds = api.floorplanOutlineMetrics(conventionOutline);
assert.deepEqual(
  JSON.parse(JSON.stringify({ minX: conventionBounds.minX, minY: conventionBounds.minY, maxX: conventionBounds.maxX, maxY: conventionBounds.maxY })),
  { minX: -16060, minY: -19550, maxX: 18090, maxY: 0 },
);
const conventionOffset = { x: -conventionBounds.minX, y: -conventionBounds.minY };
const conventionRows = [
  { id: "door-1", object_type: "door", rotation: 0, metadata: { xMm: 5394, yMm: -256, widthMm: 1700, heightMm: 250 } },
  { id: "door-2", object_type: "door", rotation: 0, metadata: { xMm: 12597, yMm: -229, widthMm: 1700, heightMm: 250 } },
  { id: "pillar-1", object_type: "pillar", rotation: 0, metadata: { xMm: 7621, yMm: -4346, widthMm: 1130, heightMm: 2430 } },
  { id: "pillar-2", object_type: "pillar", rotation: 0, metadata: { xMm: 15719, yMm: -4391, widthMm: 1130, heightMm: 2430 } },
  { id: "screen-1", object_type: "screen", rotation: 0, metadata: { xMm: -15860, yMm: -12716, widthMm: 300, heightMm: 9600 } },
];
const conventionBase = conventionRows.map((row) => {
  const center = api.floorplanObjectWorkspaceCenter(row, { width: 34150, height: 19550 }, { width: row.metadata.widthMm, height: row.metadata.heightMm }, conventionOffset);
  return { instanceId: row.id, objectType: row.object_type, x: center.x, y: center.y, widthM: row.metadata.widthMm / 1000, heightM: row.metadata.heightMm / 1000, rotation: row.rotation, locked: true, metadata: { ...row.metadata, baseFloorplanObject: true } };
});
assert.deepEqual(conventionBase.map(({ x, y }) => ({ x, y })), [
  { x: 21454, y: 19294 }, { x: 28657, y: 19321 }, { x: 23681, y: 15204 }, { x: 31779, y: 15159 }, { x: 200, y: 6834 },
]);
const conventionSnapshot = conventionBase.map(({ x, y, widthM, heightM, rotation }) => ({ x, y, widthM, heightM, rotation }));
const conventionDraft = api.cloneFloorplanObjectsForLayout(conventionBase);
assert.deepEqual(JSON.parse(JSON.stringify(conventionDraft.map(({ x, y, widthM, heightM, rotation }) => ({ x, y, widthM, heightM, rotation })))), conventionSnapshot);

for (const rectangularOutline of [
  [{ x: 0, y: 0 }, { x: 8600, y: 0 }, { x: 8600, y: 15500 }, { x: 0, y: 15500 }],
  [{ x: 0, y: 0 }, { x: 7200, y: 0 }, { x: 7200, y: 13400 }, { x: 0, y: 13400 }],
]) {
  const bounds = api.floorplanOutlineMetrics(rectangularOutline);
  const center = api.floorplanObjectWorkspaceCenter({ x: 0, y: 0, metadata: { xMm: 1200, yMm: 3400 } }, { width: bounds.widthMm, height: bounds.heightMm }, { x: -bounds.minX, y: -bounds.minY });
  assert.deepEqual(JSON.parse(JSON.stringify(center)), { x: 1200, y: 3400 }, "zero-origin Burano/Capri coordinates must not change");
}

const base = [
  { instanceId: "pillar-1", objectType: "pillar", x: 1250, y: 2100, widthM: 0.8, heightM: 0.8, rotation: 15, locked: true, metadata: { baseFloorplanObject: true } },
  { instanceId: "table-1", objectType: "seminar_table", x: 4200, y: 5300, widthM: 1.8, heightM: 0.45, rotation: 90, locked: true, metadata: { baseFloorplanObject: true } },
  { instanceId: "av-1", objectType: "av_table", x: 6100, y: 3400, widthM: 1.8, heightM: 0.6, rotation: 0, locked: true, metadata: { baseFloorplanObject: true } },
];
const draft = api.cloneFloorplanObjectsForLayout(base);

for (const index of [0, 1, 2]) {
  assert.deepEqual(
    [draft[index].x, draft[index].y, draft[index].rotation, draft[index].widthM, draft[index].heightM],
    [base[index].x, base[index].y, base[index].rotation, base[index].widthM, base[index].heightM],
    "draft creation must preserve object geometry exactly",
  );
}
assert.equal(api.isFloorplanStructuralObject(draft[0]), true);
assert.equal(draft[0].locked, true);
assert.equal(api.isFloorplanStructuralObject(draft[1]), false);
assert.equal(draft[1].locked, false);
assert.equal(draft[2].locked, false);
draft[1].x += 500;
assert.equal(base[1].x, 4200, "moving a draft object must not mutate the base floorplan");

assert(source.includes('return !object.locked && !isFloorplanStructuralObject(object);'));
assert(source.includes('marquee.setAttribute("fill", "none")'));
assert(source.includes('marquee.setAttribute("stroke-width", String(1 /'));
assert(source.includes("showLayoutEditor(true)"));
assert(source.includes("cancelWorkspaceFit();"));
assert(source.includes("Object.assign(view, previousView)"));
const fitSource = source.slice(source.indexOf("function fitWorkspaceToScreen()"), source.indexOf("function setWorkspaceActualSize()"));
const centerSource = source.slice(source.indexOf("function centerWorkspaceView()"), source.indexOf("function markWorkspaceDirty()"));
assert(!fitSource.includes("workspaceObjects"), "fit must only change the viewport");
assert(!centerSource.includes("workspaceObjects"), "center must only change the viewport");
assert(source.includes('.layout-ai-panel h3{margin:0 0 8px;color:#102A40}'));
assert(source.includes('.layout-ai-panel .layout-ai-result{color:#1B2A3A}'));
assert(source.includes('.layout-ai-panel .layout-ai-history{color:#526579}'));
assert(styles.includes('.layout-editor-canvas-shell * { user-select: none; -webkit-user-select: none; }'));

console.log("floorplan editor UI fixes V1 tests passed");
