const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");

assert(html.includes('id="boardBrowserVoice"'));
assert(html.includes('<option value="">자동 추천</option>'));
assert(html.includes('id="boardTtsRate"'));
assert(html.includes('value="0.9">느리게'));
assert(html.includes('value="0.96">보통'));
assert(html.includes('value="1.05">빠르게'));
assert(html.includes('id="boardVoiceTestButton"'));

assert(page.includes("function selectBestKoreanVoice(voices)"));
assert(page.includes('/^ko(?:-|$)/i.test'));
assert(page.includes('String(voice.lang).toLowerCase() === "ko-kr"'));
assert(page.includes("voice.localService"));
assert(page.includes("natural|neural|google|samsung|microsoft"));
assert(page.includes("voice.default"));
assert(page.includes('addEventListener?.("voiceschanged", loadBrowserVoices)'));
assert(page.includes("cachedKoreanVoices.find((voice) => voice.name === ttsSettings.browserVoiceName)"));
assert(page.includes('browserVoiceName: browserVoiceSelect.value'));

assert(page.includes('speed: 0.96'));
assert(page.includes('utterance.rate = ttsSettings.speed || 0.96'));
assert(page.includes('utterance.pitch = 1'));
assert(page.includes('utterance.volume = 1'));
assert(page.includes("function formatTtsForSpeech(text)"));
assert(page.includes('"컨벤션 에이비"'));
assert(page.includes('"카프리 투"'));
assert(page.includes('spokenClock(hour, minute)'));
assert(page.includes('`${Number(month)}월 ${Number(day)}일`'));
assert(page.includes("sentences.slice(index, index + 2)"));
assert(page.includes("setTimeout(() => speakNext(index + 1), 120)"));
assert(page.includes("function isNearDuplicateSpeech(text)"));

const eventList = page.slice(page.indexOf("function showEventList"), page.indexOf("function textValues"));
assert(eventList.includes("eventOrganizer(event)"));
assert(!eventList.includes("event.eventName"));
assert(page.includes("if (voiceConversationEnabled) startVoiceRecognitionSafely(250)"));

const voiceHelper = page.slice(page.indexOf("function selectBestKoreanVoice"), page.indexOf("function loadBrowserVoices"));
const voiceContext = {}; vm.createContext(voiceContext); vm.runInContext(voiceHelper, voiceContext);
const best = voiceContext.selectBestKoreanVoice([
  { name: "Remote Korean", lang: "ko-KR", localService: false, default: false },
  { name: "Local Korean", lang: "ko-KR", localService: true, default: false },
  { name: "Microsoft Natural Korean", lang: "ko-KR", localService: true, default: false },
  { name: "English", lang: "en-US", localService: true, default: true },
]);
assert.equal(best.name, "Microsoft Natural Korean");
assert.equal(voiceContext.selectBestKoreanVoice([{ name: "English", lang: "en-US" }]), null);

const speechHelpers = page.slice(page.indexOf("function spokenKoreanCount"), page.indexOf("function selectBestKoreanVoice"));
const speechContext = {}; vm.createContext(speechContext); vm.runInContext(speechHelpers, speechContext);
assert.equal(speechContext.formatTtsForSpeech("컨AB 카2 2EA 2T 13:00 10/26"), "컨벤션 에이비 카프리 투 두 개 테이블 두 개 오후 한 시 10월 26일");
assert.deepEqual(Array.from(speechContext.ttsChunks("하나입니다. 둘입니다. 셋입니다.")), ["하나입니다. 둘입니다.", "셋입니다."]);

console.log("board Browser TTS Quality V3 tests passed");
