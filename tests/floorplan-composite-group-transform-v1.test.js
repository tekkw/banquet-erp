const assert = require("assert");
const fs = require("fs");

global.window = {};
require("../outputs/src/floorplanEditor.js");

const { transformBasePlanPoint } = window.BANQUET_ERP_FLOORPLAN_EDITOR;
const sourceWall = Object.freeze({ start: Object.freeze({ x: 1200, y: 3400 }), end: Object.freeze({ x: 9200, y: 3400 }) });
const moved = { metadata: { offsetX: 20000, offsetY: -10000, rotation: 0 } };
assert.deepStrictEqual(transformBasePlanPoint(moved, sourceWall.start), { x: 21200, y: -6600 });
assert.deepStrictEqual(transformBasePlanPoint(moved, sourceWall.end), { x: 29200, y: -6600 });

const rotated = { metadata: { offsetX: 20000, offsetY: -10000, rotation: 90 } };
const rotatedStart = transformBasePlanPoint(rotated, sourceWall.start);
const rotatedEnd = transformBasePlanPoint(rotated, sourceWall.end);
assert(Math.abs(rotatedStart.x - 16600) < 0.0001 && Math.abs(rotatedStart.y + 8800) < 0.0001, "90도 회전 후 offset을 한 번 적용한다");
assert(Math.abs(rotatedEnd.x - 16600) < 0.0001 && Math.abs(rotatedEnd.y + 800) < 0.0001, "wall 양 끝점이 같은 transform을 사용한다");
assert.deepStrictEqual(sourceWall, { start: { x: 1200, y: 3400 }, end: { x: 9200, y: 3400 } }, "source geometry는 변경하지 않는다");

const movedAgain = { metadata: { offsetX: 25000, offsetY: -8000, rotation: 0 } };
assert.deepStrictEqual(transformBasePlanPoint(movedAgain, sourceWall.start), { x: 26200, y: -4600 }, "재이동은 source에 새 offset을 한 번만 적용한다");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
assert(source.includes("syncWorkspaceLineObjectFromMetadata(object, true)"), "composite wall center를 fixed frame으로 clamp하지 않는다");
assert(source.includes("preserveWorldCoordinates ? { x: Number(metadata.start_x_mm"), "wall start/end의 음수 world 좌표를 보존한다");
assert(source.includes("const center = transformBasePlanPoint(group, { x: source.x, y: source.y })"), "fixed object center도 공용 transform을 사용한다");
assert(source.includes("const start = transformBasePlanPoint(group") && source.includes("const end = transformBasePlanPoint(group"), "wall 양 끝점이 공용 transform을 사용한다");
assert(source.includes("workspaceObjects = workspaceObjects.filter((object) => object.metadata?.compositeGroupId !== group.instanceId)"), "이전 child snapshot을 제거한 뒤 재렌더한다");
assert(source.includes("const boxWidth = Math.abs(width * Math.cos(radians))"), "회전된 child geometry를 기준으로 selection bbox를 계산한다");

console.log("Floorplan composite group transform tests passed");
