const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const context = { window: {}, Blob, TextEncoder, Uint8Array, Map, Set, console };
vm.createContext(context);
vm.runInContext(source, context);
const { calculateExportVisualBounds } = context.window.BANQUET_ERP_FLOORPLAN_EDITOR;

const geometry = { x: 0, y: 0, width: 8600, height: 15500 };
const topDimension = { x: -80, y: -420, width: 8760, height: 120 };
const verticalLabel = { x: -520, y: 7200, width: 360, height: 180 };
const screenLabel = { x: 8300, y: 7000, width: 700, height: 240 };
const bounds = calculateExportVisualBounds([geometry, topDimension, verticalLabel, screenLabel]);
assert(bounds.minX < verticalLabel.x && bounds.minY < topDimension.y, "상단/좌측 치수와 라벨 바깥에 여백이 있어야 한다");
assert(bounds.maxX > screenLabel.x + screenLabel.width && bounds.maxY > geometry.y + geometry.height, "우측 라벨과 하단 도면 바깥에 여백이 있어야 한다");

const renderedScale = Math.min(4800 / bounds.width, 4800 / bounds.height);
assert(Math.abs(bounds.padding * renderedScale - 64) < 1, "화면 zoom과 무관한 약 64px export padding을 유지해야 한다");

const composite = calculateExportVisualBounds([
  { x: -400, y: -300, width: 9000, height: 16000 },
  { x: 10000, y: -500, width: 9000, height: 16200 },
]);
assert(composite.minX < -400 && composite.maxX > 19000 && composite.minY < -500 && composite.maxY > 15700, "composite 양쪽 도면과 외부 annotation을 모두 포함해야 한다");

const withoutDimensions = calculateExportVisualBounds([geometry]);
assert(withoutDimensions.minX > bounds.minX && withoutDimensions.minY > bounds.minY, "치수 OFF bounds에는 외부 치수 bbox가 포함되지 않아야 한다");

assert(source.includes('getWorkspaceExportVisualBounds({ includeDimensions })'), "clone viewBox는 export 전용 visual bounds를 사용해야 한다");
assert(source.includes('[data-floorplan-dimensions], .layout-workspace-dimension'), "치수 ON에서 floorplan/object 치수를 bounds에 포함해야 한다");
assert(source.includes('workspaceBackgroundLayer?.children') && source.includes('workspaceObjectLayer?.children'), "구조물과 실제 object/label 레이어를 bounds에 포함해야 한다");
assert(source.includes('clone.querySelector("#layoutWorkspaceSelectionLayer")?.remove()'), "selection UI는 export에서 제거해야 한다");
assert(source.includes('const exportSize = { width: Number(clone.getAttribute("width"))'), "PNG와 PDF canvas는 clone과 동일한 framing을 사용해야 한다");
assert(source.includes('view.scale = 1') && source.includes('view.panX = 0') && source.includes('view.panY = 0'), "editor zoom/pan과 export viewport를 분리해야 한다");

console.log("floorplan export visual bounds V1 tests passed");
