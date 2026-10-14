const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const window = {};
vm.runInNewContext(fs.readFileSync("outputs/src/erpConversationAgent.js", "utf8"), { window });
const normalize = window.erpConversationAgent.normalizeSpeechTranscript;

assert.equal(normalize("브라노 1 오늘 행사").text, "부라노1 오늘 행사");
assert.equal(normalize("카브리 2").text, "카프리2");
assert.equal(normalize("컨벤선 에이").text, "컨벤션A");
assert.equal(normalize("컨벤숀 비").text, "컨벤션B");
assert.equal(normalize("컨벤션 센타 행사").text, "컨벤션센터 행사");
assert.equal(normalize("부라노 삼").text, "부라노3");
assert.equal(normalize("카프리 이").text, "카프리2");
assert.equal(normalize("컨벤션 에이비").text, "컨벤션AB");
assert.equal(normalize("부라 오늘 행사").text, "부라 오늘 행사", "짧고 애매한 입력은 자동 확정하지 않는다");

const directory = [{ alias_name: "오션그랜드홀", venue_name: "오션그랜드연회장" }];
const exact = normalize("오션그랜드홀 행사", directory);
assert.equal(exact.text, "오션그랜드연회장 행사");
assert.equal(exact.confidence, 1);
const fuzzy = normalize("오션그렌드홀 행사", directory);
assert.equal(fuzzy.text, "오션그랜드연회장 행사");
assert(fuzzy.confidence >= 0.78 && fuzzy.confidence < 1);

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
assert(page.includes("venue_aliases?select=alias_name,venue_id&is_active=eq.true"));
assert(page.includes("normalizeSpeechTranscript(speechRawTranscript, speechVenueAliases)"));
assert(page.includes("matchedVenue: speechNormalization.matchedVenue"));
assert(page.includes("confidence: speechNormalization.confidence"));

console.log("Board speech venue normalization V1 tests passed");
