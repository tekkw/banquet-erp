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
assert(script.includes('new Date(`${current}T12:00:00`)'), "date movement must use local noon to avoid UTC date rollover");
assert(script.includes("moveBoardDate(Number(button.dataset.boardPageStep))"), "previous and next buttons must share the same movement function");
const originalTimezone = process.env.TZ;
process.env.TZ = "Asia/Seoul";
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const move = (current, step) => { const date = new Date(`${current}T12:00:00`); date.setDate(date.getDate() + step); return dateKey(date); };
assert.strictEqual(move("2026-10-01", 1), "2026-10-02");
assert.strictEqual(move("2026-10-02", 1), "2026-10-03");
assert.strictEqual(move("2026-10-03", -1), "2026-10-02");
if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone;
assert.strictEqual(manifest.name, "연회 운영보드");
assert.strictEqual(manifest.start_url, "/board/");
assert.strictEqual(manifest.display, "standalone");

console.log("operation-board page tests passed");
