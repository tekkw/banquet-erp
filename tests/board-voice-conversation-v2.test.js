const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const agentSource = fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8");

assert(html.includes("🎙 음성 OFF") && html.includes('aria-pressed="false"'), "A. 음성 대화는 기본 OFF여야 한다");
assert(page.includes("let voiceConversationEnabled = false"));
assert(page.includes("function startVoiceRecognitionSafely") && page.includes("voiceStartFailures >= 2"), "A/B. 한 번 ON 후 안전하게 recognition을 재시작해야 한다");
assert(page.includes("voiceConversationEnabled || voiceTtsSpeaking || voiceRequestProcessing || speechListening || speechStartPending"), "중복 recognition start를 막아야 한다");
assert(page.includes('setSpeechStatus("AI 처리 중...")') && page.includes('setSpeechStatus("AI 답변 중...")') && page.includes('setSpeechStatus("듣는 중...")'), "상태 UI를 제공해야 한다");
assert(page.includes("voiceTtsSpeaking = true") && page.includes("voicePlaybackEnded(playbackId)"), "B/C. TTS 종료 후에만 STT를 재개해야 한다");
assert(page.includes("if (!voiceConversationEnabled || voiceTtsSpeaking || voiceRequestProcessing"), "C. TTS/처리 중 STT 시작을 막아야 한다");
assert(page.includes("setVoiceConversationEnabled(false, speechErrorMessage)"), "D. permission/network 오류는 자동 재시작을 중단해야 한다");
assert(page.includes("isCompactEventListQuestion(text)") && page.includes("showEventList(queryResult, text)"), "E. 오늘 행사 질문은 전체 목록으로 답해야 한다");
assert(page.includes("eventOrganizer(event)") && page.includes("eventVoiceLabel(event)"), "E. 행사장과 주최명 중심 TTS를 사용해야 한다");
assert(page.includes("eventReferenceMatches(text)"), "F. recent 행사명/주최명 후속 질문을 지원해야 한다");
assert(page.includes("choicesTts") && page.includes("어느 행사인가요?"), "G. 중복 행사는 음성 clarification을 제공해야 한다");
assert(page.includes("pendingVenue ? candidates.find") && page.includes("ordinal >= 0 ? candidates[ordinal]"), "H/I. 장소와 순번으로 후보를 선택해야 한다");
assert(page.includes("음성\\s*꺼") && page.includes("대화\\s*종료") && page.includes("마이크\\s*꺼"), "J. 음성 종료 명령을 지원해야 한다");
assert(page.includes("preferredKoreanVoice") && page.includes("localService") && page.includes('utterance.lang = "ko-KR"'));
assert(page.includes("ttsChunks") && page.includes("utterance.pitch = 1") && page.includes("utterance.volume = 1"));

const window = {};
vm.runInNewContext(agentSource, { window });
assert.equal(window.erpConversationAgent.ordinalIndex("1번", 2), 0);
assert.equal(window.erpConversationAgent.ordinalIndex("첫 번째", 2), 0);

console.log("board voice conversation V2 tests passed");
