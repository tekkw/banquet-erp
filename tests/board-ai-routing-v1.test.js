const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const functionSource = (name) => {
  const start = page.indexOf(`  function ${name}`);
  assert(start >= 0, `${name} must exist`);
  let depth = 0; let opened = false;
  for (let index = page.indexOf("{", start); index < page.length; index += 1) {
    if (page[index] === "{") { depth += 1; opened = true; }
    if (page[index] === "}") depth -= 1;
    if (opened && depth === 0) return page.slice(start, index + 1);
  }
  throw new Error(`${name} source is incomplete`);
};

const context = { activeEventContexts: [], settingAdvisorContext: null, settingAdvisorRows: [], conversationContext: { setting: null }, layoutRecommendations: require("../outputs/src/boardLayoutRecommendations.js") };
vm.createContext(context);
vm.runInContext(`
  function queryPeriod(text) { return /오늘|이번\\s*주|다음\\s*주/.test(text) ? {} : null; }
  function venueTerm(text) { return /(부라노|컨벤션|카프리|페스타|포이어)/.test(text) ? "venue" : ""; }
  ${functionSource("isEventQueryRequest")}
  ${functionSource("isAssetAnalyticsRequest")}
  ${functionSource("isAssetQueryRequest")}
  ${functionSource("isAssetDecreaseRequest")}
  ${functionSource("isAssetMoveRequest")}
  ${functionSource("isAssetIntakeRequest")}
  ${functionSource("isBoardCommandRequest")}
  ${functionSource("isHallStateQueryRequest")}
  ${functionSource("isLayoutRecommendationRequest")}
  ${functionSource("isSettingAdvisorRequest")}
  ${functionSource("isSettingExecutionPlanRequest")}
  ${functionSource("isConfirmCurrentSetupRequest")}
  ${functionSource("hallStateLayout")}
  ${functionSource("fieldSetupFacts")}
  ${functionSource("isRecordFieldSetupRequest")}
  ${functionSource("isFieldSetupHistoryQuery")}
  ${functionSource("boardAiRoute")}
  this.route = boardAiRoute;
`, context);

assert.equal(context.route("13일날 뭘 세팅해야돼?"), "setting_advisor");
assert.equal(context.route("이 행사 세팅하려면 뭐 필요해?"), "setting_execution_plan");
assert.equal(context.route("오늘 행사 뭐 있어?"), "event_query");
assert.equal(context.route("부라노1 현재 세팅 뭐야?"), "hall_state_query");
assert.equal(context.route("지금 컨벤션 어떻게 돼있어?"), "hall_state_query");
assert.equal(context.route("부라노1 스쿨식 40명 추천해줘"), "recommend_layouts");
assert.equal(context.route("멀티탭 어디 있어?"), "asset_query");
assert.equal(context.route("A3 용지 몇 장 있어?"), "asset_query");
assert.equal(context.route("멀티탭 2개 사용했어"), "asset_intake");
assert.equal(context.route("13시 커피브레이크 추가해"), "board_command");
assert.equal(context.route("세팅했어"), "confirm_current_setup");
assert.equal(context.route("컨벤션A 스쿨식 60석 세팅했어"), "record_field_setup");
assert.equal(context.route("컨벤션A 라운드 26개 7줄로 세팅했어"), "record_field_setup");
assert.equal(context.route("부라노1은 뭐 해야돼?"), "setting_advisor");
assert.equal(context.route("오늘 뭐 세팅해야 돼?"), "setting_advisor");

const submitStart = page.indexOf('aiForm.addEventListener("submit"');
assert(page.indexOf('route === "event_query"', submitStart) < page.indexOf('route === "recommend_layouts"', submitStart));
assert(page.indexOf('route === "asset_query"', submitStart) < page.indexOf('route === "asset_intake"', submitStart));
console.log("board AI routing V1 tests passed");
