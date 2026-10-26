const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/event-order-preview.html", "utf8");
const editor = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");

assert(html.includes('id="layoutWorkspaceImportBaseButton"'));
assert(html.includes('id="layoutWorkspaceImportBaseModal"'));
assert(html.includes('data-composite-align="left"') && html.includes('data-composite-align="center-y"'));

assert(editor.includes('objectType: "base_plan_group"'));
assert(editor.includes("sourceBasePlanId"));
assert(editor.includes("offsetX") && editor.includes("offsetY") && editor.includes("rotation"));
assert(editor.includes("async function loadCompositePlanGeometry"));
assert(editor.includes('throw new Error("기본도면 순환 참조는 허용되지 않습니다.")'));
assert(editor.includes("function refreshCompositeGroupChildren"));
assert(editor.includes("compositeBaseChild: true"));
assert(editor.includes("workspaceObjects.filter((object) => isWorkspaceBaseObject(object) && !isCompositeChild(object))"));
assert(editor.includes("venue_floorplan_objects?select=*&floorplan_id=eq."));
assert(editor.includes("syncCompositeGroupFromObject(group, true)"));
assert(editor.includes("const tolerance = 250"));
assert(editor.includes("function alignSelectedCompositeGroups"));
assert(editor.includes("await hydrateCompositeGroups(fixedObjects)"));

const saveBlock = editor.slice(editor.indexOf("async function saveWorkspaceBaseFloorplan"), editor.indexOf("async function replaceFloorplanStructures"));
assert(!saveBlock.includes("sourceBasePlanId: null"));
assert(editor.includes("layoutOnlyObjects = workspaceObjects.filter((object) => !isWorkspaceBaseObject(object))"), "composite 위 일반 layout object 저장 경로 유지");
assert(editor.includes("workspacePointToMillimeters") && editor.includes("geometryVersion: 2"), "기존 mm geometry 저장 유지");
assert(!fs.readdirSync("supabase/migrations").some((name) => name.includes("composite")), "DB migration 없이 기존 metadata 사용");

console.log("Floorplan Composite Base Plan V1 tests passed");
