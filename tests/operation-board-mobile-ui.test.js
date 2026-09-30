const assert = require("assert");
const fs = require("fs");

const board = fs.readFileSync("outputs/src/operationBoard.js", "utf8");
const styles = fs.readFileSync("outputs/src/styles/dashboardWidgets.css", "utf8");

assert(board.includes('class="operation-block-mobile-header"'), "모바일 카드 첫 줄에 시간/장소/유형 영역이 필요하다");
assert(board.includes("data-mobile-reminder-toggle"), "모바일 알림 버튼이 필요하다");
assert(board.includes('["default","기본값"],["30","30분 전"],["60","1시간 전"],["none","없음"]'), "모바일 알림 메뉴는 지정된 네 옵션을 제공해야 한다");
assert(board.includes("applyReminderValue(key, button.dataset.mobileReminderValue)"), "모바일 알림은 기존 reminder 저장 로직을 재사용해야 한다");
assert(board.includes('class="next-setup-mobile-summary"'), "다음 세팅 축약 요약이 필요하다");
assert(board.includes("data-next-detail-toggle"), "다음 세팅 상세 토글이 필요하다");
assert(styles.includes("@media (max-width: 768px)"), "변경은 모바일 미디어 쿼리 안에 있어야 한다");
assert(styles.includes(".operation-reminder { display: none; }"), "모바일에서는 기존 select를 숨겨야 한다");
assert(styles.includes("word-break: keep-all"), "한글이 한 글자씩 줄바꿈되지 않아야 한다");
assert(styles.includes(".operation-block.next-setup-expanded .next-setup-detail { display: grid; }"), "상세 보기 시 다음 세팅 상세가 확장돼야 한다");

console.log("operation-board mobile UI tests passed");
