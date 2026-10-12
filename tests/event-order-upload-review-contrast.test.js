const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("outputs/src/styles/ai.css", "utf8");
assert(css.includes("#uploadPage #resultWrap .event-order-ai-review"));
assert(css.includes("#102A40"), "review title and question title need dark navy text");
assert(css.includes("#1B2A3A"), "review body needs dark readable text");
assert(css.includes("#526579"), "review supporting text needs readable muted text");
assert(!css.includes("body .event-order-ai-review"), "override must stay scoped to upload results");
console.log("event order upload review contrast test passed");
