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

const today = "2026-10-15";
const event = (id, day, hall) => ({ id, eventName: id, calendarDates: [day], venue: hall, schedule: [{ date: day, time: day === today ? "18:00" : "09:00", content: day === today ? "행사 종료" : "행사 시작", venue: hall }] });
board._setStateForTest({ completions: {}, manual: [], checklist: [] });
let next = board.buildAutoBlocks([event("current", today, "컨벤션A"), event("wrong-nearest", "2026-10-16", "부라노1"), event("right", "2026-10-17", "컨벤션AB")], today).find((item) => item.type === "next_setup");
assert.strictEqual(next.next.name, "right", "다른 그룹의 가까운 행사를 건너뛰어야 한다");
next = board.buildAutoBlocks([event("current", today, "카프리"), event("right", "2026-10-16", "카프리2")], today).find((item) => item.type === "next_setup");
assert.strictEqual(next.next.name, "right", "카프리 전체는 개별 카프리와 겹쳐야 한다");
next = board.buildAutoBlocks([event("current", today, "카프리1"), event("wrong", "2026-10-16", "카프리2")], today).find((item) => item.type === "next_setup");
assert.strictEqual(next.next, null, "카프리 개별홀끼리는 겹치지 않아야 한다");

console.log("venue normalization V1 tests passed");
