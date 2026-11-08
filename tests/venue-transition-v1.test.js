const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { console }; context.globalThis = context; vm.createContext(context);
for (const file of ["venueUtils.js", "eventStructuredData.js", "venueTimeline.js", "venueTransition.js"]) vm.runInContext(fs.readFileSync(`outputs/src/${file}`, "utf8"), context);
const api = context.BANQUET_ERP_VENUE_TRANSITION;
function event(id, venue, date, start, end, layoutText) { return { id, venue, layoutText, schedule: [{ id: `${id}-s`, date, time: `${start}~${end}`, content: "세미나", venue }] }; }
function transition(fromText, toText, options = {}) { const events = [event("from", options.fromVenue || "컨벤션A", "2026-11-08", "09:00", "18:00", fromText), event("to", options.toVenue || "컨벤션A", "2026-11-09", "09:00", "17:00", toText)]; return api.buildVenueTransitions(events, options).transitions.find((row) => row.venue === "CONVENTION_A" || row.venue === "BURANO_1"); }

const keep = transition("CLASSROOM 3×7 의자 63", "스쿨식 3×7 의자 63");
assert.equal(keep.transitionType, "KEEP");
assert.equal(keep.fromRequirement.tableCount, 21);
assert.equal(keep.gapMinutes, 900);
const partial = transition("CLASSROOM 3×7 의자 63", "CLASSROOM 3×7 의자 63 등록테이블 2");
assert.equal(partial.transitionType, "PARTIAL_CHANGE");
assert(partial.add.some((row) => row.component === "registrationTableCount" && row.quantity === 2));
const turnover = transition("CLASSROOM 3×7", "ROUND 라운드테이블 5");
assert.equal(turnover.transitionType, "FULL_TURNOVER");
assert(turnover.change.some((row) => row.component === "layoutType"));
assert.equal(transition("ROUND 라운드테이블 5 의자 40", "ROUND 라운드테이블 5 의자 40").transitionType, "KEEP");
assert.equal(transition("CLASSROOM", "CLASSROOM").transitionType, "UNKNOWN");
const reinform = transition("CLASSROOM 3×7", "RE-INFORM");
assert.equal(reinform.transitionType, "UNKNOWN"); assert.equal(reinform.needsReview, true);

const multiEvents = [
  { id: "m-from", venue: "컨벤션A / 부라노1", layoutText: "CLASSROOM 3×7", schedule: [{ id: "mc1", date: "2026-11-08", time: "09:00~18:00", content: "세미나", venue: "컨벤션A" }, { id: "mb1", date: "2026-11-08", time: "09:00~17:00", content: "세미나", venue: "부라노1" }] },
  { id: "m-to", venue: "컨벤션A / 부라노1", layoutText: "CLASSROOM 3×7", schedule: [{ id: "mc2", date: "2026-11-09", time: "09:00~17:00", content: "세미나", venue: "컨벤션A" }, { id: "mb2", date: "2026-11-09", time: "08:00~16:00", content: "세미나", venue: "부라노1" }] },
];
const multi = api.buildVenueTransitions(multiEvents).transitions;
assert(multi.some((row) => row.id === "m-from|m-to|CONVENTION_A"));
assert(multi.some((row) => row.id === "m-from|m-to|BURANO_1"));
const hierarchy = api.buildVenueTransitions([event("all", "부라노 I+II+III", "2026-11-08", "09:00", "18:00", "ROUND 라운드테이블 5"), event("child", "부라노1", "2026-11-09", "09:00", "17:00", "ROUND 라운드테이블 5")]).transitions;
assert(hierarchy.some((row) => row.venue === "BURANO_1" && row.fromEvent.id === "all" && row.toEvent.id === "child"));

const currentState = [{ id: "state-1", source: "manual_confirmed", source_event_order_id: "from", space_key: "CONVENTION_A", layout_type: "스쿨식", tables: 21, seats: 63, equipment: {} }];
const statePreferred = transition("RE-INFORM", "CLASSROOM 3×7 의자 63", { hallCurrentStates: currentState });
assert.equal(statePreferred.currentHallStateApplied, true);
assert.equal(statePreferred.fromRequirement.confidence, "confirmed");
assert.equal(statePreferred.transitionType, "KEEP");
const currentUnlinkedState = [{ id: "state-2", source: "manual_confirmed", source_event_order_id: null, space_key: "CONVENTION_A", layout_type: "스쿨식", tables: 21, seats: 63, equipment: {} }];
const currentPreferred = transition("RE-INFORM", "CLASSROOM 3×7 의자 63", { hallCurrentStates: currentUnlinkedState, atDateTime: "2026-11-08T12:00:00+09:00" });
assert.equal(currentPreferred.currentHallStateApplied, true);
const upcoming = api.getUpcomingTransitions({ transitions: [keep, partial, turnover], startDate: "2026-11-09", endDate: "2026-11-09" });
assert.equal(upcoming.length, 3);

const registry = fs.readFileSync("outputs/src/erpActionRegistry.js", "utf8"); const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
for (const action of ["get_venue_transition", "get_upcoming_transitions"]) { assert(registry.includes(action)); assert(page.includes(action)); }
console.log("venue transition V1 tests passed");
