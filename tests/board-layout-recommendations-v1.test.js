const assert = require("assert");
const fs = require("fs");
const path = require("path");
const api = require("../outputs/src/boardLayoutRecommendations.js");

const school = (id, seats, extra = {}) => ({ id, space_id: "burano-1", layout_name: `스쿨 ${seats}석`, layout_type: "school", setup_capacity: seats, ...extra });

const request40 = api.parseRequest("부라노1 스쿨식 40명 세팅하려는데 레이아웃 알려줘");
const ranked40 = api.rankLayouts(request40, [school("30", 30), school("42", 42), school("52", 52), { id: "round-40", layout_type: "round", setup_capacity: 40 }]);
assert.strictEqual(ranked40[0].id, "42", "A: 같은 타입에서 요청 인원에 가장 가까운 저장안을 먼저 추천한다");
assert(ranked40.every((row) => api.normalizeLayoutType(row.layout_type) === "school"), "A: 다른 레이아웃 타입은 후보에서 제외한다");

const requestTwoSeats = api.parseRequest("부라노1 2석씩 스쿨식 40명 보여줘");
const rankedTwoSeats = api.rankLayouts(requestTwoSeats, [school("four", 40, { seats_per_table: 4 }), school("two", 40, { seats_per_table: 2 })]);
assert.strictEqual(rankedTwoSeats[0].id, "two", "B: 테이블당 좌석 수가 같은 저장안을 우선한다");

const round = api.parseRequest("부라노1 라운드 7테이블 추천해줘");
assert.strictEqual(api.rankLayouts(round, [{ id: "six", layout_type: "round", table_count: 6 }, { id: "seven", layout_type: "round", table_count: 7 }])[0].id, "seven", "C: 테이블 수 일치 후보를 우선한다");
assert.strictEqual(api.normalizeLayoutType("Class Type"), "school");
assert.strictEqual(api.normalizeLayoutType("U Shape"), "u_shape");
assert.strictEqual(api.normalizeLayoutType("O Shape"), "box_shape");

const page = fs.readFileSync(path.join(__dirname, "../outputs/src/operationBoardPage.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../outputs/board/index.html"), "utf8");
assert(page.includes("space_id=in.(${memberIds.join(\",\")})"), "D: 선택 공간 ID로만 저장 레이아웃을 조회한다");
assert(page.includes("저장된 ${layoutRecommendations.layoutTypeLabel(parsed.layoutType)} 레이아웃이 없습니다."), "E: 같은 공간·타입 후보가 없으면 명시적으로 안내한다");
assert(page.includes("../index.html?layoutPreview=${encodeURIComponent(layout.id)}"), "F: 기존 레이아웃 미리보기 진입점을 재사용한다");
assert(page.includes("source_layout_id: layout.id"), "G: 승인된 현재 세팅에 source_layout_id를 저장한다");
assert(page.indexOf("&& isLayoutRecommendationRequest(text))") < page.indexOf("&& isEventQueryRequest(text))"), "H: 음성/텍스트 공통 submit 경로에서 추천을 먼저 분기한다");
assert(page.includes('queryType: "recommend_layouts"'));
assert(page.includes('source: "manual_confirmed"'));
assert(page.includes("data-layout-recommend-approve"), "현재 세팅 연결 전에 명시적 승인을 받는다");
assert(html.includes("boardLayoutRecommendations.js?v=1"));
assert(html.includes("operationBoardPage.js?v=20-layout-recommendations"));
assert(page.includes('banquet-erp-events-cache-v6'));

console.log("board layout recommendations v1 tests passed");
