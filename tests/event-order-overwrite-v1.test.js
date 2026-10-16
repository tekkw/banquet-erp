const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("outputs/index.html", "utf8");
const modalCss = fs.readFileSync("outputs/src/styles/modal.css", "utf8");
function source(name) {
  const start = html.indexOf(`    function ${name}`); assert(start >= 0, `${name} missing`);
  let depth = 0; let opened = false;
  for (let index = html.indexOf("{", start); index < html.length; index += 1) { if (html[index] === "{") { depth += 1; opened = true; } if (html[index] === "}") depth -= 1; if (opened && depth === 0) return html.slice(start, index + 1); }
}
const context = { savedEvents: [], window: {} }; vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
vm.runInContext(`${source("normalizeOverwriteMatchText")} ${source("normalizeFilenameBase")} ${source("normalizeOverwriteOrganizer")} ${source("eventOverwriteDates")} ${source("eventOverwriteDatesOverlap")} ${source("eventOverwriteVenueMatch")} ${source("eventOverwriteDuplicateScore")} ${source("findEventOverwriteCandidate")} this.find=findEventOverwriteCandidate; this.score=eventOverwriteDuplicateScore; this.filename=normalizeFilenameBase;`, context);
const existing = { id: "event-1", eventName: "기존 행사", companyName: "(사)전남여수산학융합원", calendarDates: ["2026-10-15"], venue: "컨벤션 A", originalFilename: "event.xlsx" };
const revision = { eventName: "수정 행사", companyName: "전남여수산학융합원", calendarDates: ["2026-10-15"], venue: "컨벤션A", originalFilename: "event (1).xlsx" };
assert.equal(context.find(revision, [existing]).id, "event-1");
assert.equal(context.filename("event (2).xlsx"), "EVENT");
assert.equal(context.filename("event copy.xlsx"), "EVENT");
assert.equal(context.find({ ...revision, companyName: "다른 주최", calendarDates: ["2026-11-15"] }, [existing]), null, "파일명만 같으면 후보로 강제하면 안 된다");
assert.equal(context.find({ ...revision, originalFilename: "different.xlsx" }, [existing]).id, "event-1", "주최/날짜/장소가 같으면 후보여야 한다");
assert.equal(context.find({ ...revision, calendarDates: ["2026-11-15"] }, [existing]), null, "주최가 같아도 날짜가 다르면 후보가 아니어야 한다");
assert.equal(context.score(existing, revision).duplicate, true);
assert(html.includes("기존 행사와 유사한 이벤트오더가 있습니다."));
assert(html.includes('delete-choice-panel event-overwrite-dialog'), "중복 감지 dialog에 전용 scope가 있어야 한다");
assert(modalCss.includes(".event-overwrite-dialog h3") && modalCss.includes("color: #102033"), "제목은 밝은 배경용 dark text여야 한다");
assert(modalCss.includes(".event-overwrite-dialog pre") && modalCss.includes("color: #526477"), "기존/업로드 행사 본문은 읽을 수 있는 secondary dark text여야 한다");
for (const label of ["기존 행사 덮어쓰기", "새 행사로 등록", "취소"]) assert(html.includes(label));
assert(html.includes('method: "PATCH"') && html.includes("return { ...eventItem, id: eventOrderId"));
for (const table of ["event_calendar_dates", "event_schedules", "event_items"]) assert(html.includes(`${table}?event_order_id=eq.`));
assert(html.includes('!String(note.content || "").trim().startsWith("[")'));
assert(html.includes("original_filename: eventItem.originalFilename") && html.includes("storage_path: eventItem.storagePath"));
assert(html.includes("updated_at: new Date().toISOString()"));
const overwriteSection = html.slice(html.indexOf("async function overwriteEventInSupabase"), html.indexOf("async function insertEventChildren"));
assert(!overwriteSection.includes("operation_board_items") && !overwriteSection.includes("hall_current_states"));
assert(!overwriteSection.includes("storage/v1/object") && html.includes('overwriteChoice === "overwrite" ? await overwriteEventInSupabase'));
console.log("event order overwrite V1 tests passed");
