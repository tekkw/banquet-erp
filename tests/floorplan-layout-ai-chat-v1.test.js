const assert = require("node:assert/strict");
const fs = require("node:fs");

global.window = {};
require("../outputs/src/floorplanEditor.js");
const api = window.BANQUET_ERP_FLOORPLAN_EDITOR;
const plan = api.parseLayoutAiCommand("스쿨식 3x7 2석씩 만들어줘").plan;

assert.equal(api.parseLayoutAiEditCommand("스쿨식 3x7 2석씩 만들어줘", null), null, "최초 생성 명령을 후속 좌석 변경으로 오인하지 않는다");
assert.deepEqual(api.parseLayoutAiEditCommand("앞뒤 간격 10cm 더 벌려줘", plan), { type: "gap", axis: "vertical", amount: 100 });
assert.deepEqual(api.parseLayoutAiEditCommand("좌우 간격 20cm 줄여", plan), { type: "gap", axis: "horizontal", amount: -200 });
assert.deepEqual(api.parseLayoutAiEditCommand("전체를 오른쪽으로 20cm 옮겨", plan), { type: "move", dx: 200, dy: 0, amount: 200, direction: "오른쪽" });
assert.deepEqual(api.parseLayoutAiEditCommand("위로 0.5m", plan), { type: "move", dx: 0, dy: -500, amount: 500, direction: "위" });
assert.deepEqual(api.parseLayoutAiEditCommand("첫 줄 하나 빼", plan), { type: "remove-row", edge: "first" });
assert.deepEqual(api.parseLayoutAiEditCommand("마지막 줄 빼", plan), { type: "remove-row", edge: "last" });
assert.deepEqual(api.parseLayoutAiEditCommand("4x6으로 바꿔", plan), { type: "grid", columns: 4, rows: 6 });
assert.deepEqual(api.parseLayoutAiEditCommand("3석씩으로 바꿔", plan), { type: "seats", seatsPerTable: 3 });
assert.equal(api.parseLayoutAiEditCommand("의자 하나씩 더", plan).seatsPerTable, 3);
assert.equal(api.parseLayoutAiEditCommand("방금 수정 취소", plan).type, "undo");
assert.equal(api.parseLayoutAiEditCommand("이 상태 저장하자", plan).type, "save");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
assert(source.includes("workspaceObjects = candidate"), "이동은 최신 workspace 객체 좌표를 기준으로 적용한다");
assert(source.includes('openLayoutInfoModal("save", true)'), "채팅 저장도 기존 저장 모달을 재사용한다");
assert(source.includes("layoutOnlyObjects.map(workspaceObjectToDbShape)"), "기존 venue_layout_objects 저장 변환을 재사용한다");
assert(source.includes("if (movedLayoutAiObject) refreshLayoutAiValidation()"), "수동 이동 뒤 AI draft 검증 상태를 갱신한다");

console.log("floorplan layout AI chat V1 tests passed");
