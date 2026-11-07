const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const api = context.window.BANQUET_ERP_FLOORPLAN_EDITOR;
const table = (x, y, rotation = 0) => ({ objectType: "seminar_table", x, y, widthM: 0.1, heightM: 0.1, rotation });

let snap = api.resolveSmartGuideSnap({ movingObject: table(0, 0), proposedCenter: { x: 450, y: 7 }, references: [table(0, 0)], zoom: 1, thresholdPx: 8 });
assert.equal(snap.point.y, 0, "A. centerY alignment snap");
assert.equal(snap.snappedBy.y, "alignment");
assert(snap.guides.some((guide) => guide.type === "alignment" && guide.axis === "y"));

snap = api.resolveSmartGuideSnap({ movingObject: table(0, 0), proposedCenter: { x: 6, y: 450 }, references: [table(0, 0)], zoom: 1, thresholdPx: 8 });
assert.equal(snap.point.x, 0, "B. centerX alignment snap");

const row = [table(0, 0), table(1000, 0)];
snap = api.resolveSmartGuideSnap({ movingObject: table(0, 0), proposedCenter: { x: 2006, y: 0 }, references: row, zoom: 1, thresholdPx: 8 });
assert.equal(snap.point.x, 2000, "C. 900mm horizontal gap snap");
assert.equal(snap.snappedBy.x, "spacing");
assert.equal(snap.guides.find((guide) => guide.type === "spacing" && guide.axis === "x").gapMm, 900);

const column = [table(0, 0), table(0, 1400)];
snap = api.resolveSmartGuideSnap({ movingObject: table(0, 0), proposedCenter: { x: 0, y: 2805 }, references: column, zoom: 1, thresholdPx: 8 });
assert.equal(snap.point.y, 2800, "D. 1300mm vertical gap snap");
assert.equal(snap.guides.find((guide) => guide.type === "spacing" && guide.axis === "y").gapMm, 1300);

const at100 = api.resolveSmartGuideSnap({ movingObject: table(0, 0), proposedCenter: { x: 2005, y: 0 }, references: row, zoom: 1, thresholdPx: 8 });
const at20 = api.resolveSmartGuideSnap({ movingObject: table(0, 0), proposedCenter: { x: 2025, y: 0 }, references: row, zoom: .2, thresholdPx: 8 });
assert.equal(at100.point.x, 2000); assert.equal(at20.point.x, 2000, "E. zoom과 무관하게 동일 mm 결과");

const gridPriority = api.resolveSmartGuideSnap({ movingObject: table(0, 0), proposedCenter: { x: 2006, y: 0 }, references: row, zoom: 1, thresholdPx: 8, gridEnabled: true, gridSizeMm: 300 });
assert.equal(gridPriority.point.x, 2000, "G. spacing snap이 2100mm grid snap보다 우선");
assert.equal(gridPriority.snappedBy.x, "spacing");

const rotated = api.smartGuideObjectBounds({ x: 0, y: 0, widthM: 1.8, heightM: .45, rotation: 90 });
assert(Math.abs(rotated.width - 450) < .001 && Math.abs(rotated.height - 1800) < .001, "rotation 90 bounds 반영");

assert(html.includes('id="layoutWorkspaceViewGridInput" type="checkbox"> Grid'), "Grid 기본 OFF");
assert(source.includes("if (!workspaceSnap) return point") && !source.includes("if (!workspaceSnap || !workspaceGrid) return point"), "F. visual Grid와 grid snap 분리");
assert(source.includes('workspaceDragState.smartGuides = smartSnap.guides'));
assert(source.includes('workspaceDragState = null') && source.includes('classList.add("layout-smart-guides")'), "H. drop 후 transient guide 제거");
assert(source.includes('[data-floorplan-dimensions], .layout-workspace-dimension') && !source.includes('[data-floorplan-dimensions], .layout-workspace-dimension, .layout-smart-guides'), "I. export bounds에서 smart guide 제외");

console.log("floorplan smart guides V1 tests passed");
