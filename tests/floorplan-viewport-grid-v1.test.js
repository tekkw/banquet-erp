const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("outputs/src/floorplanEditor.js", "utf8");
const assets = fs.readFileSync("outputs/src/styles/assets.css", "utf8");
const dark = fs.readFileSync("outputs/src/styles/darkTheme.css", "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const api = context.window.BANQUET_ERP_FLOORPLAN_EDITOR;

assert.equal(api.chooseVisualGridStep(1), 100, "100%에서는 가장 세밀한 100mm visual grid를 쓴다");
assert.equal(api.chooseVisualGridStep(.18), 250, "축소 시 화면 간격 24px 이상인 다음 LOD를 선택한다");
assert.equal(api.chooseVisualGridStep(.05), 500, "5%에서도 25px 간격 grid가 유지된다");
assert.equal(api.chooseVisualGridStep(.01), 2500, "강한 축소에서는 meter 단위 grid로 전환한다");
assert.equal(api.chooseVisualGridStep(.001), 10000, "최저 LOD는 10m로 제한한다");

const bounds = { minX: -1000, minY: 2000, width: 20000, height: 10000 };
const geometrySnapshot = JSON.stringify(bounds);
const fitted = api.calculateFitViewport(bounds, { width: 1200, height: 800 }, .08);
assert.equal(fitted.scale, .0504);
assert.equal(JSON.stringify(bounds), geometrySnapshot, "화면 맞춤은 world bounds를 변경하지 않는다");
assert.equal((bounds.minX + bounds.width / 2) * fitted.scale + fitted.panX, 600, "가로 bounds 중심을 viewport 중앙에 배치한다");
assert.equal((bounds.minY + bounds.height / 2) * fitted.scale + fitted.panY, 400, "세로 bounds 중심을 viewport 중앙에 배치한다");

assert(source.includes("workspaceShowMinorVisualGrid") && source.includes("majorUnit = unit * 5"), "minor/major adaptive grid를 사용한다");
assert(source.includes("workspaceGridSizeMm") && source.includes("workspaceVisualGridSizeMm"), "snap grid와 visual grid 상태를 분리한다");
assert(source.includes('workspaceGridLayer.style.display = workspaceGrid ? "" : "none"'), "Grid OFF는 visual layer만 숨긴다");
assert(source.includes("scheduleWorkspaceFit();") && source.includes("requestAnimationFrame(() => requestAnimationFrame(run))"), "로드 완료와 layout 확정 뒤 공용 fit을 실행한다");
assert(source.includes("workspaceExportRendering"), "화면용 최소 label 크기와 export label 크기를 분리한다");
assert(assets.includes("var(--text-primary") && assets.includes("var(--surface-elevated"), "Auto Grid UI는 theme palette를 사용한다");
assert(dark.includes(".layout-auto-grid-panel, .layout-ai-panel") && dark.includes("var(--text-secondary)"), "dark editor helper text contrast를 명시한다");

console.log("floorplan viewport/grid V1 tests passed");
