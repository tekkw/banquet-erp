const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("outputs/index.html", "utf8");
const script = fs.readFileSync("outputs/src/dashboardWidgets.js", "utf8");
const styles = fs.readFileSync("outputs/src/styles/dashboardWidgets.css", "utf8");

assert(html.includes("dashboardWidgets.js?v=dashboard-ai-overlay-v1"));
assert(styles.includes("background: #102a40"));
assert(styles.includes("background: #0d2235"));
assert(styles.includes("color: #f4f7fa"));
assert(script.includes('expandButton.textContent = "⛶ 펼치기"'));
assert(script.includes('dialog.querySelector("[data-ai-modal-close]").addEventListener("click", closeOverlay)'));
assert(script.includes("modalBody.append(widget)"));
assert(script.includes("placeholder.replaceWith(widget)"));

console.log("dashboard-ai-overlay-v1 tests passed");
