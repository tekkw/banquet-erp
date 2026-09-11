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
rows[13] = ["2026-09-11", "09:00", "행사시작", "", "페스타", "", "100"];
rows[14] = ["Items"];
const general = service.extractEventOrderInfo([{ name: "Sheet1", rows }]);
assert.strictEqual(general.eventName, "일반 세미나");
assert.strictEqual(general.place, "페스타");
assert.strictEqual(general.schedule[0].venue, "페스타");
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(general.eventSpaces)),
  [{ spaceName: "페스타", role: "unspecified", roleLabel: "사용 공간" }]
);
console.log("event-spaces-v1 tests passed");
