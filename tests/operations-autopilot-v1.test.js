const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {}, Intl, Date, Set, Map, JSON };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
context.window.BANQUET_ERP_OPERATION_BOARD = { getActualTodaySeoul: () => "2026-10-22", setupDocumentSummary: () => "스쿨식 150석 · 등록 2T" };
vm.runInContext(fs.readFileSync("outputs/src/operationsAutopilot.js", "utf8"), context);
const autopilot = context.window.BANQUET_ERP_OPERATIONS_AUTOPILOT;

const wedding = { id: "wedding", companyName: "대한전기학회", eventName: "결혼식", startDate: "2026-10-24", venue: "부라노ALL", guestCount: 150, layoutText: "스쿨식 150석, 등록 테이블 2T, 무선 마이크 3개", schedule: [{ date: "2026-10-23", time: "07:00", content: "행사장 세팅" }, { date: "2026-10-24", time: "11:00", content: "행사 시작" }] };
const checklist = autopilot.extractChecklist(wedding);
assert.deepStrictEqual(Array.from(checklist, (item) => item.name), ["스쿨식 좌석", "등록 테이블", "무선 마이크"]);
assert.strictEqual(autopilot.explicitSetupDate(wedding), "2026-10-23", "명시된 세팅일은 행사일과 분리한다");
assert.strictEqual(autopilot.explicitSetupTime(wedding), "07:00", "행사 시작시간이 아니라 명시된 세팅시간만 쓴다");

let plan = autopilot.buildProposals({ events: [wedding], actualToday: "2026-10-22" });
assert.strictEqual(plan.proposals[0].scheduledDate, "2026-10-23");
assert.strictEqual(plan.proposals[0].eventDate, "2026-10-24");
assert.strictEqual(plan.proposals[0].status, "proposal");

plan = autopilot.buildProposals({ events: [wedding], actualToday: "2026-10-22", existingTasks: [{ eventOrderId: "wedding", venue: "부라노1", scheduledDate: "2026-10-23" }] });
assert.strictEqual(plan.proposals.length, 0, "persistent task는 ALL/하위공간 auto 제안보다 우선한다");

plan = autopilot.buildProposals({ events: [wedding], actualToday: "2026-10-22", hallStates: [{ event_order_id: "wedding", venue_name: "부라노1" }] });
assert.strictEqual(plan.proposals.length, 0, "이미 동일 행사로 세팅된 홀에는 작업을 제안하지 않는다");

plan = autopilot.buildProposals({ events: [{ ...wedding, id: "re", venue: "카프리ALL" }], actualToday: "2026-10-22", proactiveAlerts: [{ type: "layout_reinform", eventOrderId: "re", summary: "레이아웃 재인폼 상태" }] });
assert.strictEqual(plan.proposals[0].status, "needs_confirmation");
assert(!plan.proposals[0].actions.includes("approve"), "재인폼은 확인 전 등록할 수 없다");

plan = autopilot.buildProposals({ events: [{ ...wedding, id: "empty", layoutText: "", schedule: [] }], actualToday: "2026-10-22" });
assert.strictEqual(plan.proposals[0].status, "needs_information");
assert.strictEqual(plan.proposals[0].scheduledTime, "", "근거 없는 시간을 생성하지 않는다");

plan = autopilot.buildProposals({ events: [wedding], actualToday: "2026-10-22", assets: [{ asset_name: "무선 마이크", quantity: 1 }], proactiveAlerts: [{ type: "beverage_shortage", summary: "맥주 5병 부족" }] });
assert(plan.proposals[0].assetWarnings.some((text) => text.includes("2EA 부족")));
assert.strictEqual(plan.beverageAlert.summary, "맥주 5병 부족", "기존 음주류 부족 alert를 재사용한다");

assert(autopilot.matchesCommand("준비할 거 정리해줘"));
assert(autopilot.matchesCommand("자동으로 다음 세팅 잡아줘"));
assert.strictEqual(autopilot.buildProposals({ events: [{ ...wedding, id: "late", startDate: "2026-11-01" }], actualToday: "2026-10-22" }).proposals.length, 0, "7일 범위 밖 행사는 제외한다");

const boardSource = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const aiSource = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
assert(boardSource.includes('recordType: "autopilot_next_setup"'));
assert(boardSource.includes('state.pins[key] = false'));
assert(aiSource.includes('banquet:event-order-saved'));
assert(aiSource.includes("addSetupTasks"));
console.log("operations autopilot V1 tests passed");
