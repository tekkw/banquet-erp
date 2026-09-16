const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/eventOrder.js", "utf8"), context);

const cleanValue = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const service = context.window.BANQUET_ERP_EVENT_ORDER.createEventOrderService({
  constants: { knownSectionAliases: ["Items", "Others", "시설(Engineering)"] },
  helpers: {
    cleanValue,
    normalizeLabel: (value) => cleanValue(value).toLowerCase().replace(/[\s:：]/g, ""),
    escapeRegExp: (value) => String(value),
    splitEditorLines: (value) => String(value || "").split(/\n/).map(cleanValue).filter(Boolean),
    normalizeMealTypes: (value) => value,
  },
});

const wedding = {
  eventName: "김지형, 이하영 님 웨딩",
  place: "1F 피렌체, 3F 컨벤션센터, 올리비아",
  schedule: [
    { time: "11:00", content: "식사시작", venue: "1F 피렌체", people: "220" },
    { time: "11:30", content: "예식시작", venue: "3F 컨벤션센터" },
    { time: "12:30", content: "예식종료", venue: "3F 컨벤션센터" },
    { time: "14:00", content: "식사종료", venue: "1F 피렌체" },
  ],
};
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(service.deriveEventSpaces(wedding))),
  [
    { spaceName: "컨벤션센터 A", role: "ceremony", roleLabel: "예식장" },
    { spaceName: "올리비아", role: "bridal_waiting", roleLabel: "신부대기실" },
    { spaceName: "부라노1", role: "family_lounge", roleLabel: "혼주라운지" },
    { spaceName: "피렌체", role: "dining", roleLabel: "식사장" },
  ]
);
assert.strictEqual(wedding.place, "1F 피렌체, 3F 컨벤션센터, 올리비아");

const rows = Array.from({ length: 16 }, () => []);
rows[0] = ["행사명(Name of Event)", "", "", "일반 세미나"];
rows[1] = ["장소(Venue)", "", "", "페스타"];
rows[2] = ["행사일시(Date / Time)", "", "", "2026-09-11 09:00"];
rows[13] = ["2026-09-11", "09:00", "세미나", "", "페스타", "", "100"];
rows[14] = ["Items"];
const general = service.extractEventOrderInfo([{ name: "Sheet1", rows }]);
assert.strictEqual(general.eventName, "일반 세미나");
assert.strictEqual(general.place, "페스타");
assert.strictEqual(general.schedule[0].venue, "페스타");
assert.strictEqual(general.validation.status, "ok");
assert.strictEqual(general.sources.eventName, "fixed");
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(general.eventSpaces)),
  [{ spaceName: "페스타", role: "unspecified", roleLabel: "사용 공간" }]
);

const variantRows = Array.from({ length: 12 }, () => []);
variantRows[0] = ["", "행사명(Name of Event)", "", "", "", "변형 세미나"];
variantRows[1] = ["", "행사일시(Date / Time)", "", "", "", "2026-09-11"];
variantRows[2] = ["", "장소(Venue)", "", "", "", "부라노1"];
variantRows[4] = ["시간/날짜", "", "내용", "", "장소", "", "인원"];
variantRows[5] = ["09. 11", "17:30", "세미나", "", "부라노1", "", "31"];
variantRows[6] = ["", "20:00", "행사 종료", "", "부라노1", "", "31"];
variantRows[7] = ["Items"];
const variant = service.extractEventOrderInfo([{ name: "Variant", rows: variantRows }]);
assert.strictEqual(variant.eventName, "변형 세미나");
assert.strictEqual(variant.schedule.length, 2);
assert.strictEqual(variant.schedule[1].date, "09. 11");
assert.strictEqual(variant.validation.status, "ok");
assert.strictEqual(variant.sources.eventName, "fallback");
assert.strictEqual(variant.sources.schedule, "fallback");

const blank = service.extractEventOrderInfo([{ name: "Blank", rows: [] }]);
assert.strictEqual(blank.validation.status, "review");
assert.ok(blank.validation.issues.some((issue) => issue.field === "eventName"));
assert.ok(blank.validation.issues.some((issue) => issue.field === "schedule"));

const corrections = service.buildCorrectionRecords({
  originalValues: { eventName: "행사", eventDate: "2026-09-11", place: "부라노", guestCount: "34" },
  correctedValues: { eventName: "행사", eventDate: "2026-09-11", place: "부라노1", guestCount: "31" },
  sources: { place: "manual", guestCount: "manual" },
  fileName: "sample.xlsx",
  eventName: "행사",
  correctedAt: "2026-09-16T00:00:00.000Z",
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(corrections.map((record) => record.field))), ["place", "guestCount"]);
assert.strictEqual(corrections[0].correctedValue, "부라노1");
assert.strictEqual(corrections[1].originalValue, "34");
assert.strictEqual(corrections[1].correctedValue, "31");
assert.ok(corrections.every((record) => record.source === "manual"));
console.log("event-spaces-v1 tests passed");
