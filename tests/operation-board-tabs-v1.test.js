const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const styles = fs.readFileSync("outputs/src/styles/dashboardWidgets.css", "utf8");

assert(source.includes('data-board-tab="operations"') && source.includes('data-board-tab="setup"'), "PC/모바일 공용 탭이 있어야 한다");
assert(source.includes('let activeBoardTab = "operations"'), "새로고침 기본 탭은 운영이어야 한다");
assert(source.includes('const operationBlocks = blocks.filter((block) => block.type !== "next_setup")'), "운영 탭에서 다음 세팅을 제외해야 한다");
assert(source.includes('const setupBlocks = blocks.filter((block) => block.type === "next_setup")'), "다음 세팅 후보는 기존 레코드를 재사용해야 한다");
assert(source.includes("groupBlocksBySpace(operationBlocks.filter"), "행사장 accordion은 운영 일정만 받아야 한다");
assert(source.includes('showStandaloneMobileAgenda ? renderTodayAgenda(activeAgenda, completedAgenda) : ""'), "오늘 남은 일정 본문은 모바일 /board/에서만 표시해야 한다");
assert(source.includes("renderSetupTaskBoard(blocks)") && source.includes("renderSetupCandidates(setupBlocks)"), "다음 세팅 탭에 pinned와 후보를 표시해야 한다");
assert(source.includes("data-setup-create"), "PC/모바일 공용 다음 세팅 추가 버튼이 있어야 한다");
assert(source.includes("data-setup-edit") && source.includes("data-setup-original") && source.includes("data-setup-pin"), "수정/원본/고정 액션을 유지해야 한다");
assert(source.includes("data-add-item") && source.includes("data-check-item"), "하위 세팅 항목 기능을 유지해야 한다");
assert(source.includes("data-restore-complete"), "완료된 세팅 복원을 유지해야 한다");
assert(source.includes("completeBoardItem") && source.includes("syncItem(block)"), "양 탭은 기존 completion 저장 경로를 사용해야 한다");
assert(styles.includes(".operation-board-tabs") && styles.includes('.operation-board-tab-panel[hidden]'), "dark theme 탭 스타일이 있어야 한다");

console.log("operation board tabs V1 tests passed");
