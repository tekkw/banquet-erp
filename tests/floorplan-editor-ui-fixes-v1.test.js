const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const styles = fs.readFileSync("outputs/src/styles/assets.css", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const api = context.window.BANQUET_ERP_FLOORPLAN_EDITOR;

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
assert(source.includes('.layout-ai-panel h3{margin:0 0 8px;color:#102A40}'));
assert(source.includes('.layout-ai-panel .layout-ai-result{color:#1B2A3A}'));
assert(source.includes('.layout-ai-panel .layout-ai-history{color:#526579}'));
assert(styles.includes('.layout-editor-canvas-shell * { user-select: none; -webkit-user-select: none; }'));

console.log("floorplan editor UI fixes V1 tests passed");
