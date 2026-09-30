const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "outputs/board/index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "outputs/src/operationBoardPage.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "outputs/operation-board.webmanifest"), "utf8"));

assert(html.includes('id="todayOperationBoard"'), "standalone board mount is required");
assert(!html.includes("sidebar-nav") && !html.includes("dashboard-widget"), "ERP chrome must stay out of the board entry");
assert(script.indexOf("events = cachedEvents(); render();") < script.indexOf("refresh();"), "cached events must render before Supabase refresh");
assert(script.includes("constants.authStorageKey"), "existing ERP auth session must be reused");
assert(script.includes('serviceWorker.register("../push-sw.js")'), "existing service worker must be reused");
assert(script.includes("const batchSize = 50"), "child queries must be safely batched");
assert.strictEqual(manifest.name, "연회 운영보드");
assert.strictEqual(manifest.start_url, "/board/");
assert.strictEqual(manifest.display, "standalone");

console.log("operation-board page tests passed");
