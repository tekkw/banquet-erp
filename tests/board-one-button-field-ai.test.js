const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");

assert(html.includes('id="boardSpeechButton" class="board-field-ai-button"'));
assert(html.includes("🎙 현장 AI"));
assert(html.includes("📦 자산 등록"));
assert(html.includes("operationBoardPage.js?v=20-layout-recommendations"));
assert(html.includes("operationBoardPage.css?v=9-layout-recommendations"));

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
assert(submit.includes("isAssetQueryRequest(text)"));
assert(submit.includes("isAssetIntakeRequest(text)"));
assert(submit.includes("isHallStateQueryRequest(text)"));
assert(submit.includes("interpret(text)"));

assert(page.includes("recentConversation.slice(-3)"));
assert(page.includes('setSpeechStatus("● 답변 완료")'));
assert(css.includes(".board-field-ai-button"));
assert(!page.includes("transcriptions"));
assert(!page.includes("audio/transcription"));

console.log("board one-button field AI tests passed");
