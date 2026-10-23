const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: {}, Intl, Date, Set, Map, JSON };
vm.createContext(context);
vm.runInContext(fs.readFileSync("outputs/src/venueUtils.js", "utf8"), context);
context.window.BANQUET_ERP_OPERATION_BOARD = { getActualTodaySeoul: () => "2026-10-23", setupDocumentSummary: () => "등록 1T" };
vm.runInContext(fs.readFileSync("outputs/src/operationsAutopilot.js", "utf8"), context);
const autopilot = context.window.BANQUET_ERP_OPERATIONS_AUTOPILOT;

const ended = { id: "ended", companyName: "대한전기학회", venue: "부라노1", eventType: "세미나", guestCount: 60, startDate: "2026-10-22", schedule: [{ date: "2026-10-22", time: "18:00", content: "행사 종료" }] };
let candidates = autopilot.buildPostEventReviewCandidates({ events: [ended], reviews: [], now: new Date("2026-10-22T19:00:00+09:00") });
assert.strictEqual(candidates.length, 1, "종료 행사이며 review가 없으면 candidate를 만든다");
assert.strictEqual(candidates[0].priority, "normal");
candidates = autopilot.buildPostEventReviewCandidates({ events: [ended], reviews: [{ event_order_id: "ended", content: "특이사항 없음" }], now: new Date("2026-10-22T19:00:00+09:00") });
assert.strictEqual(candidates.length, 0, "동일 eventOrderId review가 있으면 중복 생성하지 않는다");
assert.strictEqual(autopilot.buildPostEventReviewCandidates({ events: [{ ...ended, id: "front", venue: "Front" }], now: new Date("2026-10-22T19:00:00+09:00") }).length, 0, "기존 제외 공간을 유지한다");

const structured = autopilot.structurePostEventReview("등록대 2개 필요. 뒤 통로가 좁았다. 무선마이크 1개 더 요청.");
assert.deepStrictEqual(Array.from(structured, (item) => item.category), ["registration", "circulation", "av"]);
assert.strictEqual(structured[0].suggestedQuantity, 2);
assert.strictEqual(autopilot.structurePostEventReview("등록대 1개로 부족했고 2개는 있어야겠어.")[0].suggestedQuantity, 2, "현재 부족 수량보다 뒤의 권장 수량을 구조화한다");
assert.strictEqual(new Set(structured.map((item) => item.key)).size, structured.length, "한 review 안의 같은 structured item을 중복하지 않는다");

const review = (id, date) => ({ id, content: JSON.stringify({ source: "post_event_review", eventOrderId: id, venueCanonical: "부라노1", eventType: "세미나", guestCount: 60, organizer: `학회${id}`, eventDate: date, completed: true, createdAt: `${date}T18:00:00+09:00`, summary: "등록대 2개 필요", structuredItems: [{ key: "registration:등록테이블", category: "registration", subject: "등록테이블", summary: "등록대 2개 필요", suggestedQuantity: 2, unit: "개" }] }) });
let similar = autopilot.findSimilarReviews({ venue: "부라노ALL", eventType: "세미나", guestCount: 70 }, [review("r1", "2026-10-01")]);
assert.strictEqual(similar.length, 1, "동일 venue hierarchy와 ±25% 인원 review를 찾는다");
let patterns = autopilot.reviewPatterns(ended, [review("r1", "2026-10-01")]);
assert.strictEqual(patterns[0].patternType, "reference", "1건은 과거 참고다");
patterns = autopilot.reviewPatterns(ended, [review("r1", "2026-10-01"), review("r2", "2026-10-02"), review("r3", "2026-10-03")]);
assert.strictEqual(patterns[0].patternType, "repeated", "3건 반복은 반복 운영 패턴이다");

const upcoming = { ...ended, id: "upcoming", startDate: "2026-10-24", schedule: [{ date: "2026-10-23", time: "07:00", content: "세팅" }], layoutText: "등록 테이블 1T" };
const plan = autopilot.buildProposals({ events: [upcoming], reviews: [review("r1", "2026-10-01"), review("r2", "2026-10-02"), review("r3", "2026-10-03")], actualToday: "2026-10-23" });
assert.strictEqual(plan.proposals[0].checklist.find((item) => /등록/.test(item.name)).quantity, "1", "현재 event order 1T를 과거 review가 변경하지 않는다");
assert.strictEqual(plan.proposals[0].operatingNotes[0].type, "OPERATING_NOTE");
assert.strictEqual(plan.proposals[0].operatingNotes[0].blocking, false);
assert.strictEqual(plan.proposals[0].operatingNotes[0].conflict, true, "과거 2T와 현재 1T 충돌은 참고 warning만 만든다");

const serialized = autopilot.serializePostEventReview({ event: ended, answer: "특이사항 없음", structuredItems: [] });
assert.strictEqual(autopilot.parsePostEventReview({ content: serialized }).reviewType, "no_issue", "특이사항 없음도 completed review로 저장한다");

const aiSource = fs.readFileSync("outputs/src/aiAssistant.js", "utf8");
const html = fs.readFileSync("outputs/index.html", "utf8");
assert(aiSource.includes("postEventReview: true") && aiSource.includes("structurePostEventReview"), "자연어 회고는 저장 전 structured preview를 거친다");
assert(aiSource.includes("buildPostEventReviewCandidates") && !aiSource.includes('mode: "create_post_event_review_questions"'), "회고 후보는 기존 event/interview/note 데이터에서 결정하고 새 Edge 로직에 의존하지 않는다");
assert(aiSource.includes('action === "promote_review"') && aiSource.includes("운영 지식으로 승격"), "3회 반복 지식 승격은 사용자 버튼 승인이 필요하다");
assert(aiSource.includes("현재 이벤오더 지시 유지"), "과거 경험은 event order를 자동 변경하지 않는다");
assert(aiSource.includes('action === "apply_review_suggestion"') && aiSource.includes("reviewOverrideApproved"), "과거 수량 반영은 별도 사용자 승인 액션으로만 수행한다");
assert(html.includes("operationsAutopilot.js?v=operations-autopilot-v6"));
console.log("operations autopilot V6 tests passed");
