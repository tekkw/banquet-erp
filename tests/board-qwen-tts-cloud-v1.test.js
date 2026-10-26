const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/board/index.html", "utf8");
const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");

assert(html.includes('<option value="qwen">Qwen</option>'));
assert(page.includes("async function playQwenTts(spokenText, playbackId)"));
assert(page.includes("const ttsProviders = { qwen: playQwenTts, browser: playBrowserTts }"));
assert(page.includes("preferred board TTS failed; using browser fallback"));
assert(page.includes("const controller = new AbortController()"));
assert(page.includes("voiceTtsSpeaking = true"));
assert(page.includes("speechRecognition.abort()"));
assert(page.includes("voicePlaybackEnded(playbackId)"));
assert(page.includes("if (voiceConversationEnabled) startVoiceRecognitionSafely(250)"));

assert(page.includes('.replace(/컨\\s*AB/gi, "컨벤션 에이비")'));
assert(page.includes('.replace(/부\\s*ALL/gi, "부라노 전체")'));
assert(page.includes('.replace(/카\\s*1/g, "카프리 원")'));
assert(page.includes('language: "ko", provider: "qwen"'));
const qwenRequest = page.slice(page.indexOf("async function playQwenTts"), page.indexOf("const ttsProviders"));
assert(!qwenRequest.includes("eventOrder"));
assert(!qwenRequest.includes("metadata"));
assert(!page.includes("DASHSCOPE_API_KEY"));
assert(!page.includes("dashscope.aliyuncs.com"));

assert(edge.includes('const TTS_PROVIDER = (Deno.env.get("TTS_PROVIDER") ?? "browser")'));
assert(edge.includes('const QWEN_TTS_MODEL = "qwen3-tts-flash"'));
assert(edge.includes("if (TTS_PROVIDER !== \"qwen\" || !DASHSCOPE_API_KEY || !DASHSCOPE_TTS_ENDPOINT)"));
assert(edge.includes('fallback: "browser"'));
assert(edge.includes("BOARD_TTS_TIMEOUT_MS = 8000"));
assert(edge.includes('characterCount: input.length'));
assert(!edge.includes('console.info("board TTS", input'));

console.log("board Qwen TTS Cloud V1 tests passed");
