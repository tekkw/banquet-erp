const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const css = fs.readFileSync("outputs/src/styles/operationBoardPage.css", "utf8");

assert(html.includes('id="boardSpeechButton"'));
assert(html.includes('id="boardSpeechStatus"'));
assert(/operationBoardPage\.js\?v=[^"]+/.test(html));
assert(/operationBoardPage\.css\?v=[^"]+/.test(html));

assert(page.includes("window.SpeechRecognition || window.webkitSpeechRecognition"));
assert(page.includes('speechRecognition.lang = "ko-KR"'));
assert(page.includes("speechRecognition.interimResults = true"));
assert(page.includes("speechRecognition.continuous = false"));
assert(page.includes("speechRecognition.stop()"));
assert(page.includes("speechRecognition.abort()"));
assert(page.includes("aiInput.value = speechInputValue(speechFinalText)"));
assert(page.includes("인식된 문장을 확인한 후 보내기를 눌러주세요."));
assert(page.includes("마이크 권한이 필요합니다."));
assert(page.includes("이 브라우저에서는 음성 입력을 지원하지 않습니다."));
assert(page.includes("speechButton.disabled = true"));

// Voice only fills the existing input. It must not auto-submit or add an audio API.
const speechBlock = page.slice(page.indexOf("function setSpeechStatus"), page.indexOf('visualCameraButton.addEventListener("click"'));
assert(!speechBlock.includes("requestSubmit"));
assert(!speechBlock.includes("aiForm.submit"));
assert(!page.includes("transcriptions"));
assert(!page.includes("audio/transcription"));

// Existing submit routing remains the single path for query, intake/decrease, and board commands.
const submitStart = page.indexOf('aiForm.addEventListener("submit"');
assert(submitStart > 0);
assert(page.indexOf("isAssetQueryRequest(text)", submitStart) > submitStart);
assert(page.indexOf("isAssetIntakeRequest(text)", submitStart) > submitStart);
assert(page.includes("(?:\\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)"));

assert(css.includes('.board-speech-button[data-state="listening"]'));
assert(css.includes(".board-speech-status"));

console.log("board speech input V5 tests passed");
