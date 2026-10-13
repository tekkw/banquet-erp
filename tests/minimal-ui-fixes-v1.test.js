const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/index.html", "utf8");
const preview = fs.readFileSync("outputs/event-order-preview.html", "utf8");
const ai = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
const modal = fs.readFileSync("outputs/src/styles/modal.css", "utf8");

for (const source of [html, preview]) {
  assert(/await loadEventsFromSupabase\(\);\r?\n\s+showErpPage\("home"\);/.test(source));
  assert(!source.includes("requestAiAnalysis(pendingEvent);"));
  assert(!source.includes("await reviewSavedEventOrderWithAi(savedEvent.id);"));
  assert(source.includes('id="globalAiLauncher"'));
  assert(source.includes('id="globalAiDrawer"'));
  assert(source.includes('id="globalAiVoiceButton"'));
  assert(source.includes("function openGlobalAiDrawer()"));
  assert(source.includes("function closeGlobalAiDrawer()"));
  assert(source.includes("function toggleGlobalAiVoiceInput()"));
  const mainCloseIndex = source.indexOf("</main>");
  const overlayRootIndex = source.indexOf('id="overlayRoot" class="overlay-root" hidden');
  assert(mainCloseIndex >= 0 && mainCloseIndex < overlayRootIndex);
  assert(overlayRootIndex < source.indexOf('id="globalAiLauncher"'));
  assert(overlayRootIndex < source.indexOf('id="eventModal"'));
  assert(overlayRootIndex < source.indexOf('id="excelViewerModal"'));
}

assert(ai.includes('toggle.textContent = aiAnalysisLoading ? "분석 중"'));
assert(ai.includes(': "분석하기";'));
assert(ai.includes("requestAiAnalysis(state.getPendingEvent?.())"));
assert(ai.includes("if (!aiAnalysisExpanded && !aiAnalysisLoading) return section;"));
assert(ai.includes("window.erpConversationAgent?.create"));
assert(ai.includes("window.erpActionRegistry?.create"));
assert(ai.includes("chatMessages.dataset.pageContext"));

assert(modal.includes("#eventModal .modal"));
assert(modal.includes("max-height: calc(100dvh - 24px)"));
assert(modal.includes("#eventModal .card-grid"));
assert(modal.includes("#eventModal .info-card"));
assert(modal.includes("min-height: 72px"));
assert(modal.includes(".overlay-root"));
assert(modal.includes("position: fixed"));
assert(modal.includes(".modal-body"));
assert(modal.includes("overflow-y: auto"));

console.log("minimal-ui-fixes-v1 tests passed");
