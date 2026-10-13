const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/index.html", "utf8");
const script = fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8");
const styles = fs.readFileSync("outputs/src/styles/dashboardWidgets.css", "utf8");

assert(html.includes("dashboardWidgets.js?v=global-ai-drawer-v1"));
assert(styles.includes("background: #102a40"));
assert(styles.includes("background: #0d2235"));
assert(styles.includes("color: #f4f7fa"));
assert(html.includes('id="globalAiLauncher"'));
assert(html.includes('id="globalAiDrawer"'));
assert(html.includes('id="globalAiVoiceButton"'));
assert(html.includes('id="globalAiCloseButton"'));
assert(!script.includes('{ id: "ai-assistant", name: "AI 비서"'));
assert(styles.includes(".erp-shell .global-ai-drawer"));
assert(styles.includes(".global-ai-launcher"));

console.log("dashboard-ai-overlay-v1 tests passed");
