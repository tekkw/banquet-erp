const assert = require("assert");
const fs = require("fs");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");

assert(page.includes("conciseBoardReply(text)"));
assert(page.includes('mode: "board_tts", text: formatQwenTtsText(spokenText)'));
assert(page.includes("playBrowserTts(spokenText, playbackId)"));
assert(page.includes("const ttsProviders = { qwen: playQwenTts, browser: playBrowserTts }"));
assert(page.includes("localStorage.setItem(ttsSettingsStorageKey"));
assert(page.includes("showTtsSettingsProposal(ttsProposal)"));

assert(edge.includes('mode === "board_tts"'));
assert(edge.includes('const QWEN_TTS_MODEL = "qwen3-tts-flash"'));
assert(edge.includes('Deno.env.get("DASHSCOPE_API_KEY")'));
assert(edge.includes('Deno.env.get("DASHSCOPE_TTS_ENDPOINT")'));
assert(edge.includes("QWEN_TTS_VOICES.has(requestedVoice)"));
assert(edge.includes('audioResponse.headers.get("Content-Type") || "audio/mpeg"'));
assert(!page.includes("DASHSCOPE_API_KEY"));

console.log("board high quality TTS V1 tests passed");
