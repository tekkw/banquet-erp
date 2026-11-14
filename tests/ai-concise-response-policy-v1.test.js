const assert = require("node:assert/strict");
const fs = require("node:fs");

const assistant = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
const analytics = fs.readFileSync("outputs/src/eventOrderAnalytics.js", "utf8");
const mobileCss = fs.readFileSync("outputs/src/styles/mobile.css", "utf8");
const edge = fs.readFileSync("supabase/functions/event-order-ai-chat/index.ts", "utf8");

assert(assistant.includes("function applyConciseAnswerPolicy(question, answer)"));
assert(assistant.includes("event_calendar_dates|event_schedules|event_items|event_notes"));
assert(analytics.includes("function isCompactEventListQuestion(question, plan)"));
assert(analytics.includes("- ${row.venue || \"장소 미등록\"} · ${row.organizer || row.eventName || \"행사명 미등록\"}"));
assert(edge.includes("사용자가 명시적으로 요청한 정보만 답한다"));
assert(edge.includes("DB table명을 절대 표시하지 않는다"));
assert(!edge.includes("답변 끝에는 반드시 '출처:' 줄을 붙이고"));
assert(mobileCss.includes('main.erp-shell[data-active-page="ai"] ~ .mobile-bottom-nav'));

console.log("AI concise response policy V1 tests passed");
