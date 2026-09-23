const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("outputs/src/styles/darkTheme.css", "utf8");
const scope = "#aiPage .ai-page-message.assistant .ai-answer-list-item";
assert(css.includes(`${scope} {`));
assert(css.includes("background: #FFFFFF;"));
assert(css.includes("color: #102A40;"));
assert(css.includes(`${scope} :where(small, .subtle)`));
assert(css.includes(`${scope}::selection`));
assert(!css.includes("#aiPage .ai-page-chat-form textarea::placeholder"));
console.log("AI answer highlight contrast test passed");
