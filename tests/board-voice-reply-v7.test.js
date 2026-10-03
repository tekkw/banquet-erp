const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");

assert(html.includes('id="boardVoiceReplyButton"'));
assert(html.includes("🔊 음성 답변 OFF"));
assert(/operationBoardPage\.js\?v=[^"]+/.test(html));
assert(/operationBoardPage\.css\?v=[^"]+/.test(html));

assert(page.includes('const voiceReplyStorageKey = "banquetBoard.voiceReplyEnabled"'));
assert(page.includes("window.speechSynthesis"));
assert(page.includes("window.SpeechSynthesisUtterance"));
assert(page.includes('utterance.lang = "ko-KR"'));
assert(page.includes("utterance.rate = 1"));
assert(page.includes('.toLowerCase().startsWith("ko")'));
assert(page.includes("speechSynthesisApi.cancel()"));
assert(page.includes("spokenText === lastSpokenText"));

assert(page.includes("storedVoiceReplyEnabled()"));
assert(page.includes("localStorage.setItem(voiceReplyStorageKey"));
assert(page.includes("voiceReplyButton.disabled = true"));
assert(page.includes("이 브라우저에서는 음성 답변을 지원하지 않습니다."));

const queryBlock = page.slice(page.indexOf("function showAssetQueryResult"), page.indexOf("function beginAssetUpdateFromQuery"));
assert(queryBlock.includes("speakBoardReply"));
assert(queryBlock.includes("자세한 내용은 화면을 확인해주세요."));
const visualBlock = page.slice(page.indexOf("function showVisualResult"), page.indexOf("async function captureAndAnalyzeVisual"));
assert(visualBlock.includes("speakBoardReply(finalAnswer)"));
const transientBlock = page.slice(page.indexOf("function showTransientMessage"), page.indexOf("function proposalSummary"));
assert(!transientBlock.includes("speakBoardReply"));

const micBlock = page.slice(page.indexOf("function toggleSpeechRecognition"), page.indexOf("function captureVisualFrame"));
assert(micBlock.indexOf("cancelBoardSpeech()") < micBlock.indexOf("recognition.start()"));
assert(page.includes("clean.length <= 220"));
assert(css.includes(".board-ai-voice-settings"));

console.log("board voice reply V7 tests passed");
