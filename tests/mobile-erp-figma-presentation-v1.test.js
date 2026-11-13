const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("outputs/index.html", "utf8");
const css = fs.readFileSync("outputs/src/styles/mobile.css", "utf8");
const ai = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");

for (const widget of ["today_events", "remaining_schedule", "ai_quick_questions", "asset_search", "current_setup"]) {
  assert(html.includes(`data-mobile-widget="${widget}"`), `${widget} widget missing`);
}
assert(html.includes('const MOBILE_HOME_WIDGETS_KEY = "banquet-erp-mobile-home-widgets-v2"'));
assert(html.includes('{ id: "current_setup", label: "현재 세팅 상태", enabled: false'));
assert(html.includes('data-mobile-widget="current_setup" hidden'));
assert(html.includes("applyMobileHomeWidgets"));
assert(html.includes("data-mobile-widget-move"));
assert(html.includes("data-mobile-widget-reset"));
assert(html.includes('localStorage.setItem(MOBILE_HOME_WIDGETS_KEY'));

assert(html.includes('id="aiPageVoiceButton"'));
assert(html.includes("data-ai-quick-question"));
assert(html.includes("function resizeAiPageComposer()"));
assert(html.includes("window.webkitSpeechRecognition"));
assert(ai.includes('row.classList.add("loading")'));
assert(ai.includes('aiPageChatInput.dispatchEvent(new Event("input"))'));

assert(css.includes("grid-template-columns: repeat(4, minmax(0, 1fr)) !important"));
assert(css.includes("env(safe-area-inset-bottom)"));
assert(css.includes("max-width: 359px"));
assert(css.includes("overflow-wrap: anywhere"));
assert(css.includes(".ai-page-message.loading"));
assert(css.includes(".mobile-widget-stack > [hidden]"));
assert(!html.includes("글로벌 파트너스 포럼"));

console.log("mobile ERP Figma presentation V1 tests passed");
