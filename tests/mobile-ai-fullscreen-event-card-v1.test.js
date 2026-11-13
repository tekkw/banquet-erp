const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("outputs/index.html", "utf8");
const css = fs.readFileSync("outputs/src/styles/mobile.css", "utf8");
const aiCss = fs.readFileSync("outputs/src/styles/ai.css", "utf8");
const ai = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");

// Full-screen mobile chat keeps existing ids/handlers while changing presentation.
for (const id of ["aiPageMessages", "aiPageAttachmentPreview", "aiPageChatForm", "aiPageAttachButton", "aiPageVoiceButton", "aiPageChatInput", "aiPageChatSendButton"]) {
  assert(html.includes(`id="${id}"`));
}
assert(html.includes('id="aiPageChatInput" rows="2"'));
assert(html.indexOf('id="aiPageAttachmentPreview"') > html.indexOf('id="aiPageChatForm"'));
assert(html.includes("부라노1 다음 행사 뭐야?"));
assert(ai.includes("messages.some((message) => message.type === \"user\")"));
assert(ai.includes("ai-page-loading"));
assert(aiCss.includes(".ai-page-chat-form > .ai-attachment-preview"));

// visualViewport owns the keyboard-height state; the backend request remains unchanged.
assert(html.includes("function syncMobileAiViewport()"));
assert(html.includes('window.visualViewport?.addEventListener("resize"'));
assert(html.includes('appMain.classList.toggle("mobile-keyboard-open", keyboardOpen)'));
assert(html.includes('Math.min(aiPageChatInput.scrollHeight, 144)'));
assert(css.includes('main.erp-shell.mobile-keyboard-open ~ .mobile-bottom-nav'));
assert(css.includes("--mobile-ai-viewport-height"));
assert(css.includes("min-height: 68px"));
assert(css.includes("max-height: 144px"));
assert(css.includes('grid-template-areas:'));
assert(css.includes('"preview preview preview preview"'));
assert(css.includes(".ai-attachment-chip button"));

// Today events are venue-first, with nowrap time and independently wrapping names.
assert(html.includes("function splitMobileVenueSummary"));
assert(html.includes('class="mobile-event-venue"'));
assert(html.includes('class="mobile-event-info"'));
assert(html.includes("venue.secondary"));
assert(css.includes(".mobile-home-event .mobile-event-venue b"));
assert(css.includes(".mobile-home-event .mobile-event-info time"));
assert(css.includes("white-space: nowrap"));
assert(css.includes("overflow-wrap: anywhere"));

console.log("mobile AI full-screen chat and venue-first event card tests passed");
