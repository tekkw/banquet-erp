const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {}, Intl, Date, Set };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
const rules = context.window.BANQUET_ERP_CORE_RULES;

assert.strictEqual(rules.normalizeVenue("부라노 I"), "BURANO_1");
assert(rules.spacesOverlap("부라노1", "부라노ALL"), "부라노1과 부라노ALL은 겹쳐야 한다");
assert(rules.spacesOverlap("카프리1", "카프리ALL"), "카프리1과 카프리ALL은 겹쳐야 한다");
assert.strictEqual(rules.venueMatchRank("카프리1", "카프리1"), 3, "동일 공간이 가장 높은 rank여야 한다");
assert.strictEqual(rules.venueMatchRank("카프리1", "카프리ALL"), 2, "계층 overlap은 동일 공간보다 낮아야 한다");
assert.deepStrictEqual(Array.from(rules.normalizeVenueSet("컨벤션AB + 페스타")), ["CONVENTION_1", "CONVENTION_2", "CONVENTION_3", "FESTA"]);
assert(rules.spacesOverlap("컨벤션AB + 페스타", "컨벤션A"));
assert(rules.spacesOverlap("컨벤션AB + 페스타", "페스타"));

const scheduled = { eventOrderId: "wedding", venue: "부라노ALL", scheduledDate: "2026-10-23", eventDate: "2026-10-24", completed: false };
assert.strictEqual(rules.getSetupTimingStatus(scheduled, "2026-10-22"), "future", "행사일이 아니라 scheduledDate로 상태를 계산해야 한다");
assert.strictEqual(rules.getSetupTaskStatus(scheduled, { selectedDate: "2026-10-22", actualToday: "2026-10-22" }).visible, false);
assert.strictEqual(rules.getSetupTaskStatus(scheduled, { selectedDate: "2026-10-23", actualToday: "2026-10-22" }).visible, true, "미래 선택일에는 예정 task를 표시해야 한다");
assert.deepStrictEqual({ ...rules.getSetupTaskStatus(scheduled, { selectedDate: "2026-10-24", actualToday: "2026-10-24" }) }, { timing: "overdue", visible: true }, "실제 오늘 화면에는 지연 task를 표시해야 한다");
assert.strictEqual(rules.getSetupTaskStatus(scheduled, { selectedDate: "2026-10-25", actualToday: "2026-10-24" }).visible, false, "actualToday가 아닌 선택일에는 지연 task를 숨겨야 한다");

const persistent = { ...scheduled, key: "persistent", kind: "manual" };
const automatic = { ...scheduled, key: "automatic", kind: "next_setup", venue: "부라노1" };
assert.notStrictEqual(rules.getSetupTaskKey(persistent), rules.getSetupTaskKey(automatic), "task key는 각 normalized venue set을 보존해야 한다");
assert.deepStrictEqual(Array.from(rules.dedupeSetupCandidates([automatic, persistent]), (item) => item.key), ["persistent"], "persistent task가 auto candidate보다 우선해야 한다");

const next = rules.resolveNextEventForVenue({ venue: "카프리1", afterDateTime: "2026-10-22T09:00", candidates: [
  { eventOrderId: "later-exact", venue: "카프리1", dateTime: "2026-10-24T09:00" },
  { eventOrderId: "near-all", venue: "카프리ALL", dateTime: "2026-10-23T09:00" },
  { eventOrderId: "wrong", venue: "부라노ALL", dateTime: "2026-10-23T08:00" },
] });
assert.strictEqual(next.eventOrderId, "near-all", "overlap 공간 중 가장 가까운 다음 행사를 선택해야 한다");

const operationBoardSource = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
assert(operationBoardSource.includes("coreRules().resolveNextEventForVenue"));
assert(operationBoardSource.includes("coreRules().getSetupTaskStatus"));
assert(operationBoardSource.includes("coreRules().dedupeSetupCandidates"));
console.log("core rules consolidation V1 tests passed");
