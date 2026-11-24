const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const constantsSource = fs.readFileSync("outputs/src/constants.js", "utf8");
function constants(runtime) { const context = { window: { BANQUET_ERP_RUNTIME_CONFIG: runtime }, URL }; vm.createContext(context); vm.runInContext(constantsSource, context); return context.window.BANQUET_ERP_CONSTANTS; }
assert.deepEqual(JSON.parse(JSON.stringify(constants({}).featureFlags)), { venueTimelineEnabled: true, venueTimelineEditingEnabled: false });
assert.equal(constants({ features: { venueTimelineEnabled: false, venueTimelineEditingEnabled: true } }).featureFlags.venueTimelineEnabled, false);
assert.equal(constants({ features: { venueTimelineEnabled: false, venueTimelineEditingEnabled: true } }).featureFlags.venueTimelineEditingEnabled, true, "raw flag remains visible; board helper also requires enabled");
assert.equal(constants({ features: { venueTimelineEditingEnabled: true } }).featureFlags.venueTimelineEditingEnabled, true);

const boardSource = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
assert(boardSource.includes('if (!requireVenueTimelineEditing()) return false;'), "save function must fail closed");
assert(boardSource.includes('if (venueTimelineEditingEnabled()) root.querySelectorAll("[data-timeline-color]")'), "color handlers must not bind in read-only mode");
assert(boardSource.includes('if (venueTimelineEditingEnabled()) root.querySelectorAll("[data-timeline-date][data-timeline-venue]")'), "drag/drop handlers must not bind in read-only mode");
assert(boardSource.includes('if (!venueTimelineEnabled() && activeBoardTab === "timeline") activeBoardTab = "operations"'), "emergency disable must return to operations");
assert(boardSource.includes('{ ...(item.metadata || {}), setupOverride:'), "metadata must be merged, not replaced");
assert(boardSource.includes('{ ...(state.setupOverrides[key] || {}), ...changes }'), "setupOverride changes must preserve existing keys");

for (const script of ["backup-operation-board.mjs", "restore-operation-board-item.mjs", "v32-canary-operation-board.mjs"]) {
  const output = execFileSync(process.execPath, [`scripts/${script}`, "--help"], { encoding: "utf8" }); assert(output.includes("Usage:"), `${script} help`);
}
const dryRun = execFileSync(process.execPath, ["scripts/v32-canary-operation-board.mjs"], { encoding: "utf8" });
assert.equal(JSON.parse(dryRun).writes, 0);
const ignore = fs.readFileSync(".gitignore", "utf8"); assert(ignore.includes("backups/") && ignore.includes(".env.*"));
for (const page of ["outputs/index.html", "outputs/event-order-preview.html", "outputs/board/index.html"]) {
  const html = fs.readFileSync(page, "utf8");
  assert(html.includes("constants.js?v=venue-timeline-v32-safety"), `${page} must cache-bust feature flags`);
  assert(html.includes("operationBoard.js?v=venue-timeline-responsive-v1"), `${page} must cache-bust timeline guards`);
}
console.log("venue timeline safety flags V1 tests passed");
