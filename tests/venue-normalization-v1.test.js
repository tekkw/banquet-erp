const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const memory = new Map();
const context = { window: {}, localStorage: { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) }, sessionStorage: { getItem: () => null, setItem: () => {} }, document: { getElementById: () => null }, crypto: { randomUUID: () => "test" }, console, Date, Set, Map };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(fs.readFileSync("outputs/src/operationBoard.js", "utf8"), context);
const venue = context.window.BANQUET_ERP_VENUE_UTILS;
const board = context.window.BANQUET_ERP_OPERATION_BOARD;

assert.strictEqual(venue.normalizeVenue("카프리"), "CAPRI_ALL");
assert.strictEqual(venue.normalizeVenue("카프리 전체"), "CAPRI_ALL");
assert.strictEqual(venue.normalizeVenue("카프리ALL"), "CAPRI_ALL");
assert.strictEqual(venue.normalizeVenue("카프리 1+2+3"), "CAPRI_ALL");
assert.deepStrictEqual(Array.from(venue.normalizeVenueSet("카프리")), ["CAPRI_1", "CAPRI_2", "CAPRI_3"]);
assert(venue.spacesOverlap("카프리ALL", "카프리1"), "A. 카프리ALL은 카프리1과 겹쳐야 한다");
assert(venue.spacesOverlap("카프리1", "카프리ALL"), "B. overlap은 양방향이어야 한다");
assert(!venue.spacesOverlap("카프리1", "카프리2"), "C. 카프리 개별홀끼리는 겹치지 않아야 한다");
assert(venue.spacesOverlap("컨벤션A", "컨벤션AB"));
assert(venue.spacesOverlap("컨벤션센터 A", "컨벤션AB"));
assert.strictEqual(venue.normalizeVenue("3F 컨벤션센터"), "CONVENTION_AB");
assert.strictEqual(venue.normalizeVenue("컨벤션센터"), "CONVENTION_AB");
assert.strictEqual(venue.normalizeVenue("컨벤션"), "CONVENTION_AB");
assert.strictEqual(board.getVenueGroup("3F 컨벤션센터"), "컨벤션AB");
for (const raw of ["3F 컨벤션A", "컨벤션 A", "컨벤션B", "부라노1", "부라노 ALL", "카프리3", "카프리"]) assert.notStrictEqual(board.getVenueGroup(raw), "기타", `${raw}는 기타 그룹이면 안 된다`);
assert(!venue.spacesOverlap("컨벤션A", "부라노1"));
assert(!venue.spacesOverlap("컨벤션B", "컨벤션A"));
assert(venue.spacesOverlap("카프리", "카프리2"));
assert(!venue.spacesOverlap("카프리1", "카프리2"));
assert.strictEqual(venue.formatVenueShort("3F 부라노 I"), "부1");
assert.strictEqual(venue.formatVenueShort("2F 카프리 III"), "카3");
assert.strictEqual(venue.formatVenueShort("3F 컨벤션A"), "컨A");
assert.strictEqual(venue.formatVenueShort("카프리"), "카ALL");
assert.strictEqual(venue.formatVenueShortList(["카프리1", "카프리2", "카프리3"]), "카ALL");
assert.strictEqual(venue.formatVenueShortList(["컨벤션A", "부라노1"]), "컨A+부1");
assert.strictEqual(venue.formatVenueShortList(["컨벤션A", "부라노1", "카프리1"]), "컨A 외 2");
assert.deepStrictEqual(Array.from(venue.parseVenueCodes("3F 부라노 I")), ["BURANO_1"]);
assert.deepStrictEqual(Array.from(venue.parseVenueCodes("3F 페스타, 부라노 I+II+III")), ["FESTA", "BURANO_ALL"]);
for (const raw of ["부라노", "부라노ALL", "부라노123", "부라노1+2+3", "부라노 I+II+III"]) assert.strictEqual(venue.normalizeVenue(raw), "BURANO_ALL", `D. ${raw}는 부라노전체여야 한다`);
for (const raw of ["컨벤션AB", "컨벤션 A+B", "컨벤션1+2+3", "컨벤션 I+II+III"]) assert.strictEqual(venue.normalizeVenue(raw), "CONVENTION_AB", `${raw}는 컨벤션AB여야 한다`);
assert.deepStrictEqual(Array.from(venue.parseVenueCodes("컨벤션AB + 페스타")), ["CONVENTION_AB", "FESTA"]);
assert.deepStrictEqual(Array.from(venue.normalizeVenueSet("컨벤션AB + 페스타")), ["CONVENTION_1", "CONVENTION_2", "CONVENTION_3", "FESTA"]);
assert(venue.spacesOverlap("컨벤션AB + 페스타", "컨벤션A"), "E. 복합 장소는 컨벤션A와 겹쳐야 한다");
assert(venue.spacesOverlap("컨벤션AB + 페스타", "페스타"), "F. 복합 장소는 페스타와 겹쳐야 한다");
assert(!venue.spacesOverlap("컨벤션AB + 페스타", "부라노1"), "G. 관계없는 공간과 겹치면 안 된다");
assert.strictEqual(venue.formatVenueShort("컨벤션AB + 페스타"), "컨AB+페스타");
assert.strictEqual(venue.venueLabel(venue.normalizeVenue("카프리")), "카프리전체");
assert.deepStrictEqual(Array.from(venue.buildVenueOptions("부"), (item) => item.label), ["부라노1", "부라노2", "부라노3", "부라노전체"]);
assert.deepStrictEqual(Array.from(venue.buildVenueOptions("카2"), (item) => item.label), ["카프리2"]);
assert.deepStrictEqual(Array.from(venue.buildVenueOptions("컨A"), (item) => item.label), ["컨벤션A"]);
assert.deepStrictEqual(Array.from(venue.buildVenueOptions("3F 부라노 I"), (item) => item.label), ["부라노1"]);

const today = "2026-10-15";
const event = (id, day, hall) => ({ id, eventName: id, calendarDates: [day], venue: hall, schedule: [{ date: day, time: day === today ? "18:00" : "09:00", content: day === today ? "행사 종료" : "행사 시작", venue: hall }] });
board._setStateForTest({ completions: {}, manual: [], checklist: [] });
let next = board.buildAutoBlocks([event("current", today, "컨벤션A"), event("wrong-nearest", "2026-10-16", "부라노1"), event("right", "2026-10-17", "컨벤션AB")], today).find((item) => item.type === "next_setup");
assert.strictEqual(next.next.name, "right", "다른 그룹의 가까운 행사를 건너뛰어야 한다");
next = board.buildAutoBlocks([event("current", today, "카프리"), event("right", "2026-10-16", "카프리2")], today).find((item) => item.type === "next_setup");
assert.strictEqual(next.next.name, "right", "카프리 전체는 개별 카프리와 겹쳐야 한다");
next = board.buildAutoBlocks([event("current", today, "카프리1"), event("wrong", "2026-10-16", "카프리2")], today).find((item) => item.type === "next_setup");
assert.strictEqual(next.next, null, "카프리 개별홀끼리는 겹치지 않아야 한다");
next = board.buildAutoBlocks([event("all-current", today, "카프리1+2+3"), event("one-next", "2026-10-16", "카프리1")], today).find((item) => item.type === "next_setup");
assert.strictEqual(next.next.name, "one-next", "H. 현재 카프리ALL에서 다음 카프리1을 연결해야 한다");
next = board.buildAutoBlocks([event("one-current", today, "카프리1"), event("all-next", "2026-10-16", "카프리1+2+3")], today).find((item) => item.type === "next_setup");
assert.strictEqual(next.next.name, "all-next", "I. 현재 카프리1에서 다음 카프리ALL을 연결해야 한다");
const compoundNext = board.buildAutoBlocks([
  event("compound-current", today, "컨벤션AB + 페스타"),
  event("convention-next", "2026-10-16", "컨벤션A"),
  event("festa-next", "2026-10-17", "페스타"),
], today).filter((item) => item.type === "next_setup" && item.next);
assert.deepStrictEqual(Array.from(compoundNext, (item) => item.next.name).sort(), ["convention-next", "festa-next"], "J. 복합 venue의 양쪽 공간에서 각각 next setup을 계산해야 한다");

console.log("venue normalization V1 tests passed");
