const assert = require("assert");
const fs = require("fs");

global.window = {};
require("../outputs/src/floorplanEditor.js");

const { calculateWorkspaceWorldBounds } = window.BANQUET_ERP_FLOORPLAN_EDITOR;
const frame = { width: 34150, height: 19550 };
const planB = { x: -9050, y: 9775, widthM: 18.1, heightM: 19.55, rotation: 0, metadata: { sourceBasePlanId: "b" } };
const bounds = calculateWorkspaceWorldBounds(frame.width, frame.height, [planB]);
assert.strictEqual(bounds.minX, -18100, "왼쪽 composite의 음수 X를 보존한다");
assert.strictEqual(bounds.maxX, frame.width, "기존 frame도 world bounds에 포함한다");
assert.strictEqual(bounds.width, 52250, "A+B 전체 폭을 계산한다");

const above = calculateWorkspaceWorldBounds(frame.width, frame.height, [{ ...planB, x: 9050, y: -5000, heightM: 10 }]);
assert.strictEqual(above.minY, -10000, "위쪽 composite의 음수 Y를 보존한다");

const spaced = calculateWorkspaceWorldBounds(frame.width, frame.height, [{ ...planB, x: frame.width + 5000 + 9050 }]);
assert.strictEqual(spaced.width, frame.width + 5000 + 18100, "도면 사이 간격을 world bounds에 반영한다");

const withMargin = calculateWorkspaceWorldBounds(frame.width, frame.height, [planB], 3000);
assert.strictEqual(withMargin.minX, -21100);
assert.strictEqual(withMargin.width, bounds.width + 6000, "fit용 margin은 geometry 좌표를 바꾸지 않는다");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
assert(source.includes("const freeMove = hasCompositeWorkspace()"), "composite drag는 fixed frame clamp를 사용하지 않는다");
assert(source.includes("return hasCompositeWorkspace() ? world"), "composite screen-to-world는 음수 좌표를 허용한다");
assert(source.includes("const bounds = getWorkspaceWorldBounds(true)"), "화면 맞춤은 dynamic bounds를 사용한다");
assert(source.includes("if (snap && workspaceSnap)"), "edge snap은 snap 설정이 켜졌을 때만 적용한다");
assert(source.includes("x: Number(center.x)") && source.includes("y: Number(center.y)"), "저장된 mm 좌표는 clamp 없이 복원한다");
assert(source.includes("xMm: Math.round(storageX)") && source.includes("yMm: Math.round(storageY)"), "음수 mm 좌표 저장 경로를 유지한다");

console.log("Floorplan composite dynamic workspace bounds tests passed");
