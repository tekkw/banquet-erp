const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = { value: "", getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
const window = { sessionStorage: storage };
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), { window });
const agent = window.erpConversationAgent.create({ storage });
agent.save({ event: { eventOrderId: "event-next", storagePath: "orders/next.xlsx", originalFilename: "next.xlsx" }, setting: { nextEventOrderId: "event-next" }, lastDomain: "setting" });

for (const text of ["원본 보여줘", "원본 엑셀 보여줘", "엑셀 보여줘", "이벤오더 보여줘", "원본 파일 열어줘", "파일 좀 보여줘"]) {
  const plan = agent.submit(text, { fastRoute: "board_command" });
  assert.equal(plan.route, "event_query", text);
  assert.equal(plan.tool, "openEventOriginal", text);
  assert.equal(plan.selectedResultId, "event-next", text);
}
assert.equal(agent.submit("인원 몇 명?", { fastRoute: "board_command" }).tool, "getEventDetail");
assert.equal(agent.submit("레이아웃 뭐야?", { fastRoute: "recommend_layouts" }).tool, "getEventDocumentSection");
assert.equal(agent.submit("요청사항 뭐야?", { fastRoute: "board_command" }).tool, "getEventRequests");
assert.equal(agent.submit("음료 뭐 준비해?", { fastRoute: "board_command" }).tool, "getEventDocumentSection");
assert.equal(agent.submit("몇 시 시작해?", { fastRoute: "board_command" }).tool, "getEventSchedule");
assert.equal(agent.submit("13시 커피브레이크 추가해", { fastRoute: "board_command" }).route, "board_command");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
assert(page.includes('await showEventAnswer(row.nextEvent, "find_events_by_period_space", "행사 선택"'), "setting selection reuses common event renderer");
assert(page.includes("row.nextEvent.sourceLayoutId ||= row.nextLayout?.sourceLayoutId"));
for (const field of ["eventOrderId", "eventName", "venue", "eventDate", "guestCount", "storagePath", "originalFilename", "sourceLayoutId"]) assert(page.includes(field));
assert(page.includes("event_orders?select=id,storage_path,original_filename&id=eq.${encodeURIComponent(event.id)}&limit=1"), "missing storage path is hydrated once by event id");
assert(page.includes("window.openStoredExcel(event.storagePath)"));
assert(page.includes('"원본 이벤오더를 열었습니다."'));
assert(!page.includes("publicUrl: event.storagePath"));

console.log("Board event follow-up routing V1 tests passed");
