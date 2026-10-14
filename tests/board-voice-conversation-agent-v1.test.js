const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = { value: "", getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
const window = { sessionStorage: storage };
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), { window });
const agent = window.erpConversationAgent.create({ storage });
agent.save({ event: { eventOrderId: "event-a", venue: "부라노1" }, lastDomain: "event" });

assert.equal(window.erpConversationAgent.normalizeTranscript("요번주 카프리 일 행사 뭐있어"), "이번주 카프리1 행사 뭐있어");
assert.equal(window.erpConversationAgent.normalizeTranscript("이벤트 오더에 레이 아웃 어떻게 해달래"), "이벤오더에 레이아웃 어떻게 해달래");
assert.equal(window.erpConversationAgent.normalizeTranscript("컨벤션 에이 세팅했어"), "컨벤션A 세팅했어");

assert.equal(agent.submit("이번주 카프리 행사 뭐있어").route, "event_query");
assert.equal(agent.submit("이벤오더에 레이아웃 어떻게 해달래").tool, "getEventDocumentSection");
assert.equal(agent.submit("음료 뭐 준비하래").tool, "getEventDocumentSection");
assert.equal(agent.submit("아까 그 행사 원본 보여줘").tool, "openEventOriginal");
assert.equal(agent.submit("컨벤션 에이 세팅했어", { normalizeSpeech: true, fastRoute: "confirm_current_setup" }).route, "confirm_current_setup");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const speechBlock = page.slice(page.indexOf("function ensureSpeechRecognition"), page.indexOf("function toggleSpeechRecognition"));
assert(speechBlock.includes("event.results[index].isFinal"));
assert(speechBlock.includes("!speechSubmitPending"));
assert.equal((speechBlock.match(/aiForm\.requestSubmit\(\)/g) || []).length, 1, "final transcript submits once");
assert(page.includes("conversationAgent.submit(text, { fastRoute })"), "voice and text share Conversation Agent submit");
assert(page.includes('console.debug("conversation speech", { rawTranscript: speechRawTranscript, normalizedTranscript: speechFinalText })'));
assert(page.includes('console.debug("conversation route", { rawTranscript: speechRawTranscript || text, normalizedTranscript: text, route })'));

const ttsStart = page.indexOf("function buildEventSelectionTts");
const ttsEnd = page.indexOf("function eventVenue", ttsStart);
const ttsBlock = page.slice(ttsStart, ttsEnd);
assert(ttsBlock.includes("event.eventName"));
assert(ttsBlock.includes("eventVenue(event)"));
for (const forbidden of ["guestCount", "schedule", "items", "notes", "storagePath"]) assert(!ttsBlock.includes(forbidden));
assert(page.includes('queryType === "find_events_by_period_space" ? buildEventSelectionTts(event, period).text'));
assert(page.includes('"원본 이벤오더를 열었습니다."'));

console.log("Board voice Conversation Agent V1 tests passed");
