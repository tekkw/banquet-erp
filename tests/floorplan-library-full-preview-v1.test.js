const assert = require("assert");
const fs = require("fs");
const path = require("path");

global.window = {};
require(path.join(__dirname, "../outputs/src/floorplanEditor.js"));
const api = global.window.BANQUET_ERP_FLOORPLAN_EDITOR;
const source = fs.readFileSync(path.join(__dirname, "../outputs/src/floorplanEditor.js"), "utf8");

function seminarGrid(columns, rows) {
  const objects = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    objects.push({ object_type: "seminar_table", rotation: 0, metadata: { xMm: 1500 + column * 2700, yMm: 1000 + row * 1750, widthMm: 1800, heightMm: 450 } });
  }
  return objects;
}

const fiveBySixteen = seminarGrid(5, 16);
assert.strictEqual(fiveBySixteen.length, 80);
const fiveView = api.layoutLibraryViewBox(12000, 15000, [], fiveBySixteen);
const lastFive = api.layoutLibraryObjectBounds(fiveBySixteen.at(-1), 12000, 15000);
assert(fiveView.y + fiveView.height > lastFive.bottom, "5×16 마지막 줄까지 preview bounds에 포함");

const sixBySixteen = seminarGrid(6, 16);
assert.strictEqual(sixBySixteen.length, 96);
const sixView = api.layoutLibraryViewBox(12000, 15000, [], sixBySixteen);
const lastSix = api.layoutLibraryObjectBounds(sixBySixteen.at(-1), 12000, 15000);
assert(sixView.x + sixView.width > lastSix.right && sixView.y + sixView.height > lastSix.bottom, "6×16 전체 bounds 포함");

const round = Array.from({ length: 28 }, (_, index) => ({ object_type: "round_table", metadata: { xMm: 1200 + (index % 4) * 2600, yMm: 1200 + Math.floor(index / 4) * 2600, widthMm: 1800, heightMm: 1800 } }));
const roundView = api.layoutLibraryViewBox(12000, 19000, [], round);
assert(roundView.width > 12000 && roundView.height > 19000, "round 4×7 floorplan union과 padding 유지");

const rotated = api.layoutLibraryObjectBounds({ rotation: 90, metadata: { xMm: 5000, yMm: 5000, widthMm: 1800, heightMm: 450 } }, 10000, 10000);
assert(Math.abs(rotated.boxWidth - 450) < 0.001 && Math.abs(rotated.boxHeight - 1800) < 0.001, "회전된 실제 visual bounds 포함");

assert(source.includes("while (true)") && source.includes("limit=${pageSize}&offset=${offset}") && source.includes("offset += rows.length"), "PostgREST 응답 상한을 넘어 끝까지 pagination");
assert(source.includes("renderSavedLayoutObjectSvg") && source.includes("createWorkspaceObjectShape"), "thumbnail/modal은 editor shape renderer 재사용");
assert(source.includes('libraryPreview(layout, "modal")') && source.includes("${libraryPreview(row)}"), "thumbnail/modal 공용 preview path");
assert(source.includes('data-layout-object-count="${savedCount}"'), "renderer input object count 노출");
assert(source.includes('data-layout-revision="${escapeAttribute(layout.updated_at'), "updated_at revision으로 즉시 DOM preview 갱신");
assert(source.includes("await loadAllLibraryLayouts();") && source.includes("await replaceObjects(\"venue_layout_objects\""), "객체 저장 완료 후 library authoritative data reload");

console.log("floorplan library full preview V1 tests passed");
