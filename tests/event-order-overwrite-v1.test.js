const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("outputs/index.html", "utf8");
function source(name) {
  const start = html.indexOf(`    function ${name}`); assert(start >= 0, `${name} missing`);
  let depth = 0; let opened = false;
  for (let index = html.indexOf("{", start); index < html.length; index += 1) { if (html[index] === "{") { depth += 1; opened = true; } if (html[index] === "}") depth -= 1; if (opened && depth === 0) return html.slice(start, index + 1); }
}
const context = { savedEvents: [] }; vm.createContext(context);
vm.runInContext(`${source("normalizeOverwriteMatchText")} ${source("eventOverwriteDates")} ${source("eventOverwriteDatesOverlap")} ${source("eventOverwriteVenueText")} ${source("eventNamesMatchForOverwrite")} ${source("findEventOverwriteCandidate")} this.find=findEventOverwriteCandidate;`, context);
const existing = { id: "event-1", eventName: "OOO 행사", calendarDates: ["2026-10-15"], venue: "컨벤션 A", originalFilename: "old.xlsx" };
const revision = { eventName: "OOO행사", calendarDates: ["2026-10-15"], venue: "컨벤션A", originalFilename: "new.xlsx" };
assert.equal(context.find(revision, [existing]).id, "event-1");
assert.equal(context.find({ ...revision, calendarDates: ["2026-10-16"] }, [existing]), null);
assert.equal(context.find({ ...revision, venue: "부라노1" }, [existing]), null);
assert.equal(context.find({ ...revision, eventName: "다른 행사" }, [existing]), null);
assert(html.includes("동일 행사로 보이는 기존 이벤오더가 있습니다."));
for (const label of ["기존 행사 덮어쓰기", "새 행사로 등록", "취소"]) assert(html.includes(label));
assert(html.includes('method: "PATCH"') && html.includes("return { ...eventItem, id: eventOrderId"));
for (const table of ["event_calendar_dates", "event_schedules", "event_items"]) assert(html.includes(`${table}?event_order_id=eq.`));
assert(html.includes('!String(note.content || "").startsWith("[field_setup_observation]")'));
assert(html.includes("original_filename: eventItem.originalFilename") && html.includes("storage_path: eventItem.storagePath"));
const overwriteSection = html.slice(html.indexOf("async function overwriteEventInSupabase"), html.indexOf("async function insertEventChildren"));
assert(!overwriteSection.includes("operation_board_items") && !overwriteSection.includes("hall_current_states"));
assert(!overwriteSection.includes("storage/v1/object") && html.includes('overwriteChoice === "overwrite" ? await overwriteEventInSupabase'));
console.log("event order overwrite V1 tests passed");
