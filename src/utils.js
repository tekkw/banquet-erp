/*
 * 역할:
 * - 연회 ERP 여러 기능에서 반복해서 쓰는 작은 도구 함수를 관리한다.
 * - 문자열 정리, 라벨 정규화, 날짜 key 포맷, 숫자 변환처럼 특정 업무 화면에 묶이지 않는 함수를 담는다.
 *
 * 왜 분리했는지:
 * - 같은 정리/포맷 로직이 여러 함수 안에 흩어지면 작은 기준 변경도 여러 곳을 수정해야 한다.
 * - 실무에서는 “업무 규칙”과 “공통 도구 함수”를 분리해 코드의 의도를 더 쉽게 읽게 만든다.
 *
 * 다른 파일과 어떻게 연결되는지:
 * - event-order-preview.html과 index.html이 app script보다 먼저 이 파일을 불러온다.
 * - 앱 스크립트는 window.BANQUET_ERP_UTILS에서 필요한 함수를 꺼내 기존 함수명처럼 사용한다.
 *
 * 향후 어떤 기능이 추가될 예정인지:
 * - 객실, 식음, 시설, 구매 모듈이 추가되어도 날짜/문자열/숫자 유틸은 이 파일에서 재사용한다.
 */

(function registerBanquetErpUtils() {
/*
 * 왜 이 함수를 만들었는지:
 * - 엑셀 셀, 입력값, DB 값에서 불필요한 공백과 구분문자를 제거해 비교 가능한 문자열로 만들기 위해 작성했다.
 *
 * 왜 여기 있어야 하는지:
 * - 행사 추출, 검색, 저장, AI 분석 전처리에서 모두 쓰이는 공통 문자열 유틸이기 때문이다.
 *
 * 실무 설계 이유:
 * - 문자열 정리 기준이 기능마다 다르면 같은 값도 다르게 인식되므로 한 함수로 통일한다.
 */
function cleanValue(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/^[\s:：·ㆍ*\-]+|[\s:：·ㆍ*\-]+$/g, "")
    .trim();
}

/*
 * 왜 이 함수를 만들었는지:
 * - “행사명”, “행 사 명”, “행사명:”처럼 모양이 다른 라벨을 같은 키로 비교하기 위해 작성했다.
 *
 * 왜 여기 있어야 하는지:
 * - 엑셀 추출뿐 아니라 유사 행사 검색, 섹션 제목 비교에서도 같은 정규화 기준이 필요하다.
 *
 * 실무 설계 이유:
 * - 호텔 양식은 작성자마다 공백과 기호가 달라질 수 있으므로 비교 전 라벨 표준화가 필요하다.
 */
function normalizeLabel(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s*()[\]{}<>:：·ㆍ._\-\/\\|]/g, "");
}

/*
 * 왜 이 함수를 만들었는지:
 * - 사용자가 입력하거나 엑셀에서 읽은 텍스트를 안전하게 정규식 패턴 안에 넣기 위해 작성했다.
 *
 * 왜 여기 있어야 하는지:
 * - 여러 추출 함수가 라벨 alias를 정규식으로 찾기 때문에 공통으로 사용한다.
 *
 * 실무 설계 이유:
 * - 특수문자를 이스케이프하지 않으면 괄호, 점, 별표 같은 문자가 정규식 의미로 해석되어 추출 오류가 생긴다.
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * 왜 이 함수를 만들었는지:
 * - 월과 일을 항상 두 자리로 맞춰 yyyy-mm-dd 날짜 key를 안정적으로 만들기 위해 작성했다.
 *
 * 왜 여기 있어야 하는지:
 * - 캘린더, 저장 날짜, 엑셀 다운로드 파일명 등 여러 곳에서 같은 날짜 key 형식을 쓴다.
 *
 * 실무 설계 이유:
 * - 날짜 문자열 형식이 섞이면 정렬과 비교가 틀어지므로 공통 포맷 함수가 필요하다.
 */
function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function sameDate(a, b) {
  return a && b && formatDateKey(a) === formatDateKey(b);
}

function dateKeyToLocalDate(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function formatDateLabel(dateKey) {
  if (!dateKey) return "";
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return "";
  return `${year}.${month}.${day}`;
}

/*
 * 왜 이 함수를 만들었는지:
 * - 금액, 수량, 인원 입력값을 DB에 넣기 전 숫자 또는 null로 통일하기 위해 작성했다.
 *
 * 왜 여기 있어야 하는지:
 * - 저장, 수정, 엑셀 내보내기에서 숫자 변환 기준을 공유해야 한다.
 *
 * 실무 설계 이유:
 * - 빈 문자열을 0으로 저장하면 “미입력”과 “0”을 구분할 수 없으므로 null 변환 함수가 필요하다.
 */
function toNullableNumber(value) {
  const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
  return normalized ? Number(normalized) : null;
}

function toNullableInteger(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number.parseInt(normalized, 10) : null;
}

window.BANQUET_ERP_UTILS = {
  cleanValue,
  normalizeLabel,
  escapeRegExp,
  pad2,
  formatDateKey,
  sameDate,
  dateKeyToLocalDate,
  formatDateLabel,
  toNullableNumber,
  toNullableInteger,
};
})();
