const assert = require("assert");
const fs = require("fs");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");

assert(page.includes("conciseBoardReply(text)"));
assert(page.includes('mode: "board_tts", text: spokenText'));
assert(page.includes("playBrowserTts(spokenText)"));
assert(page.includes("const ttsProviders = { browser: playBrowserTts, high_quality: playHighQualityTts }"));
assert(page.includes("localStorage.setItem(ttsSettingsStorageKey"));
assert(page.includes("showTtsSettingsProposal(ttsProposal)"));

assert(edge.includes('mode === "board_tts"'));
assert(edge.includes('https://api.openai.com/v1/audio/speech'));
assert(edge.includes('model: "gpt-4o-mini-tts"'));
assert(edge.includes('"marin", "cedar"'));
assert(edge.includes("BOARD_TTS_VOICES.has(requestedVoice)"));
assert(edge.includes('"Content-Type": "audio/mpeg"'));
assert(!page.includes("OPENAI_API_KEY"));

console.log("board high quality TTS V1 tests passed");
