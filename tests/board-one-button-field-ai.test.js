const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");

assert(html.includes('id="boardSpeechButton" class="board-field-ai-button"'));
assert(html.includes('placeholder="현장 AI에게 물어보기..."'));
assert(html.includes('id="boardAiPlusButton"'));
assert(html.includes("operationBoardPage.js?v=26-conversation-agent-core"));
assert(html.includes("operationBoardPage.css?v=12-setting-execution"));

const recognition = page.slice(page.indexOf("function ensureSpeechRecognition"), page.indexOf("function captureVisualFrame"));
assert(recognition.includes("fieldAiAutoSubmit = true"));
assert(recognition.includes("aiForm.requestSubmit()"));
assert(recognition.indexOf("cancelBoardSpeech()") < recognition.indexOf("recognition.start()"));

assert(page.includes("function isDeicticVisualQuery"));
assert(page.includes("captureOneFrameForFieldAi(text)"));
assert(page.includes("imageDataUrl: captureVisualFrame()"));
assert(page.includes("return requestVisualQuery(text, true)"));
assert(page.includes("capturedImage: includeImage ? visualSession.imageDataUrl : null"));
assert(!page.includes("setInterval("));

const submit = page.slice(page.indexOf('aiForm.addEventListener("submit"'), page.indexOf('aiInput.addEventListener("input"'));
assert(submit.includes('route === "asset_query"'));
assert(submit.includes('route === "asset_intake"'));
assert(submit.includes('route === "hall_state_query"'));
assert(submit.includes('route === "setting_advisor"'));
assert(submit.includes("interpret(text)"));

assert(page.includes("recentConversation.slice(-3)"));
assert(page.includes('setSpeechStatus("● 답변 완료")'));
assert(css.includes(".board-field-ai-button"));
assert(!page.includes("transcriptions"));
assert(!page.includes("audio/transcription"));

console.log("board one-button field AI tests passed");
