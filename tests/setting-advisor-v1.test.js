const assert = require("node:assert/strict");
const fs = require("node:fs");
const advisor = require("../outputs/src/settingAdvisor.js");

const current = { id: "current", eventName: "현재 행사", guestCount: 42, calendarDates: ["2026-10-13"], schedule: [{ date: "2026-10-13", time: "10:00", content: "행사 시작", venue: "컨벤션A" }, { date: "2026-10-13", time: "18:00", content: "행사 종료", venue: "컨벤션A" }] };
const next = { id: "next", eventName: "다음 행사", guestCount: 60, calendarDates: ["2026-10-14"], layoutText: "스쿨식 60석 등록 테이블 30T", schedule: [{ date: "2026-10-14", time: "09:00", content: "행사 시작", venue: "컨벤션A" }, { date: "2026-10-14", time: "17:00", content: "행사 종료", venue: "컨벤션A" }], items: [{ item_name: "등록 테이블", quantity: 2 }] };
const rows = advisor.buildCandidates([current, next], "2026-10-13", (left, right, leftRow, rightRow) => leftRow.venue === rightRow.venue);
assert.equal(rows.length, 1);
assert.equal(rows[0].gapHours, 15, "A: 자정을 넘는 18:00→09:00 간격은 15시간이다");
assert.equal(advisor.recommendation(rows[0], "minor_change"), "오늘 종료 후 세팅 권장");

const same = advisor.compare({ layoutType: "school", seats: 42, tables: 21 }, { layoutType: "school", seats: 42, tables: 21 });
assert.equal(same, "same");
assert.equal(advisor.recommendation(rows[0], same), "큰 변경 없음", "B: 동일 세팅은 큰 변경 없음이다");
assert.equal(advisor.compare({ layoutType: "round", seats: 40, tables: 5 }, advisor.layoutFacts(next)), "major_change", "C: 라운드→스쿨은 major_change다");
assert.equal(advisor.tableClaim({ items: [{ item_name: "등록 테이블", quantity: 2 }] }, 2), 2, "E: 실제 저장 item의 테이블 수만 확인한다");

const later = { ...rows[0], space: "부라노1", nextDate: "2026-10-14", nextStart: "15:00", gapHours: 21, change: "same", nextEvent: { guestCount: 100 } };
const urgent = { ...rows[0], space: "컨벤션A", change: "major_change", nextLayout: { seats: 60 } };
assert.equal(advisor.prioritize([later, urgent])[0].space, "컨벤션A", "G: 다음 시작이 빠른 공간이 우선이다");

const page = fs.readFileSync("outputs/src/operationBoardPage.js", "utf8");
const html = fs.readFileSync("outputs/board/index.html", "utf8");
assert(page.includes('return "setting_advisor"'), "setting_advisor intent가 존재해야 한다");
assert(page.includes("settingAdvisorContextKey") && page.includes("sessionStorage.setItem(settingAdvisorContextKey"), "H: 상담 context를 sessionStorage에 유지한다");
assert(page.includes("row.nextEvent.guestCount"), "D: 다음 행사 인원은 저장 데이터에서 답한다");
assert(page.includes("window.openStoredExcel(row.nextEvent.storagePath)"), "F: 기존 Excel preview를 재사용한다");
assert(!html.includes('id="boardSettingAdvisorButton"') && html.includes("settingAdvisor.js?v=2"));
assert(html.includes("operationBoardPage.js?v=23-setting-execution"));
console.log("setting advisor V1 tests passed");
