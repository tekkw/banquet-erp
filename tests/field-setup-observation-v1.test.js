const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const html = fs.readFileSync("outputs/board/index.html", "utf8");
function source(name) {
  const start = page.indexOf(`  function ${name}`); assert(start >= 0, `${name} missing`);
  let depth = 0; let opened = false;
  for (let index = page.indexOf("{", start); index < page.length; index += 1) { if (page[index] === "{") { depth += 1; opened = true; } if (page[index] === "}") depth -= 1; if (opened && depth === 0) return page.slice(start, index + 1); }
}
const context = { conversationContext: { setting: { nextEventOrderId: "event-1" } } };
vm.createContext(context);
vm.runInContext(`${source("hallStateLayout")} ${source("fieldSetupFacts")} ${source("fieldSetupObservationText")} ${source("isRecordFieldSetupRequest")} this.api={fieldSetupFacts,fieldSetupObservationText,isRecordFieldSetupRequest};`, context);

const facts = context.api.fieldSetupFacts("컨벤션A 라운드 26개 7줄로 세팅했어");
assert.equal(facts.layoutType, "라운드"); assert.equal(facts.tables, 26); assert.equal(facts.rows, 7);
assert.equal(context.api.fieldSetupFacts("아 26개 아니고 25개야").tables, 25);
assert.equal(context.api.isRecordFieldSetupRequest("실제로 26T까지 들어가"), true);
assert.match(context.api.fieldSetupObservationText("컨벤션 A", facts), /라운드.*26T.*7줄/);
assert(page.includes('intent: "record_field_setup"'));
assert(page.includes('note: proposal.observation || proposal.previous?.note || null'));
assert(page.includes('note_type: "others"') && page.includes("[field_setup_observation]"));
assert(page.includes('source: "manual_confirmed"') && page.includes("confidence: 1"));
assert(!page.includes('request("event_orders"') && !page.includes('approvedKnowledge'));
assert(page.includes('String(state.note || "").match(/(\\d+줄)/)'));
assert(html.includes("operationBoardPage.js?v=27-field-setup-observation"));
console.log("field setup observation V1 tests passed");
