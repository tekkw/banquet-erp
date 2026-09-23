const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("outputs/src/styles/darkTheme.css", "utf8");
const scope = "#uploadPage .meal-type-options .meal-type-option";
assert(css.includes(`${scope} {`));
assert(css.includes("background: #0D2235;"));
assert(css.includes("color: #C9D5DE;"));
assert(css.includes(`${scope}:has(input:checked)`));
assert(css.includes("color: #F4F7FA;"));
assert(css.includes(`${scope}:focus-within`));
assert(css.includes(`${scope}:has(input:disabled)`));
assert(css.includes("color: #70879A;"));
console.log("upload meal-type contrast test passed");
