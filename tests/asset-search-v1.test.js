const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("outputs/index.html", "utf8");
const preview = fs.readFileSync("outputs/event-order-preview.html", "utf8");
const script = fs.readFileSync("outputs/src/assetManager.js", "utf8");
const context = { window: {} };

vm.runInNewContext(script, context);
const { filterAssets } = context.window.BANQUET_ERP_ASSET_MANAGER;
const assets = [
  { id: 1, asset_name: "원형 테이블", floor: "2층", location: "연회 창고", spec: "1800mm" },
  { id: 2, asset_name: "접이식 의자", floor: "1층", location: "로비 창고", spec: "검정" },
  { id: 3, asset_name: "LED Monitor", floor: "3층", location: "AV실", spec: "65 inch" },
];

assert.deepStrictEqual(Array.from(filterAssets(assets, ""), ({ id }) => id), [1, 2, 3]);
assert.deepStrictEqual(Array.from(filterAssets(assets, "2층 창고"), ({ id }) => id), [1]);
assert.deepStrictEqual(Array.from(filterAssets(assets, "의자 검정"), ({ id }) => id), [2]);
assert.deepStrictEqual(Array.from(filterAssets(assets, "led 65"), ({ id }) => id), [3]);
assert.deepStrictEqual(Array.from(filterAssets(assets, "없는 항목"), ({ id }) => id), []);

for (const source of [html, preview]) {
  assert(source.includes('id="assetSearchInput"'));
  assert(source.includes('id="assetSearchCount"'));
  assert(source.includes('id="assetSearchResetButton"'));
}
assert(script.includes('assetSearchInput.addEventListener("input", renderBanquetAssets)'));
assert(script.includes('assetSearchResetButton.addEventListener("click"'));

console.log("asset-search-v1 tests passed");
