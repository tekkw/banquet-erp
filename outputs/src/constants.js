/*
 * 역할:
 * - 연회 ERP에서 여러 기능이 함께 사용하는 고정값을 한곳에서 관리한다.
 * - 로그인 계정, Supabase 설정, 행사 색상, 식사유형, 추출 필드, 검색 제외어, 섹션 제목 목록을 담는다.
 *
 * 왜 분리했는지:
 * - 고정값이 앱 코드 중간에 흩어져 있으면 색상, 라벨, 테이블명, API 설정을 바꿀 때 실수가 생기기 쉽다.
 * - 실무에서는 “자주 바뀌는 설정값”과 “동작하는 함수”를 분리해 변경 범위를 줄인다.
 *
 * 다른 파일과 어떻게 연결되는지:
 * - event-order-preview.html과 index.html이 app script보다 먼저 이 파일을 불러온다.
 * - 앱 스크립트는 window.BANQUET_ERP_CONSTANTS에서 필요한 값을 꺼내 기존 변수명으로 사용한다.
 *
 * 향후 어떤 기능이 추가될 예정인지:
 * - 객실, 식음, 시설, 구매 모듈이 추가되면 부서 공통 코드, 권한, 메뉴, 상태값도 이 파일 또는 shared constants로 확장한다.
 */

window.BANQUET_ERP_CONSTANTS = {
  authStorageKey: "banquetErpCurrentUser.v1",
  storageKey: "banquetErpEvents.v1",

  loginAccounts: [
    { id: "banquet123", password: "1303", role: "user", label: "일반 사용자" },
    { id: "banquet1303", password: "1303", role: "admin", label: "관리자" },
  ],

  supabaseConfig: {
    url: "https://pnolttdubxxmxorufpyk.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBub2x0dGR1Ynh4bXhvcnVmcHlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDYxMTIsImV4cCI6MjA5NzU4MjExMn0.WhDRdoQUSQdQTfkcdEvzV2QT642vROHJxAE6k7hLqxA",
    bucket: "event-orders",
    assetImageBucket: "asset-images",
    chatAttachmentBucket: "ai-chat-attachments",
    chatFunction: "event-order-ai-chat",
    functionUrl: "https://pnolttdubxxmxorufpyk.supabase.co/functions/v1/event-order-ai-chat",
  },

  /*
   * 왜 이 상수를 만들었는지:
   * - 캘린더 배지, 컬러칩, 범례가 같은 색상 기준을 쓰도록 하기 위해 만들었다.
   *
   * 왜 여기 있어야 하는지:
   * - 색상은 캘린더, 저장 설정, 상세 수정 화면에서 함께 쓰이는 공통 설정값이다.
   *
   * 실무 설계 이유:
   * - 색상값이 화면마다 흩어지면 행사 유형 색상 정책을 바꿀 때 일부 화면만 다르게 보이는 문제가 생긴다.
   */
  eventColors: {
    navy: { label: "Navy", background: "#dbe7f2", border: "#0F2A43", text: "#0F2A43", dot: "#0F2A43" },
    blue: { label: "Blue", background: "#DBEAFE", border: "#2563EB", text: "#1E3A8A", dot: "#2563EB" },
    black: { label: "Black", background: "#E5E7EB", border: "#111827", text: "#111827", dot: "#111827" },
    sky: { label: "Sky", background: "#dff7ff", border: "#2b9fc7", text: "#116078", dot: "#2b9fc7" },
    teal: { label: "Teal", background: "#e2f7ef", border: "#2a9d8f", text: "#126b5f", dot: "#2a9d8f" },
    green: { label: "Green", background: "#DCFCE7", border: "#16A34A", text: "#14532D", dot: "#16A34A" },
    gold: { label: "Gold", background: "#fff1bd", border: "#D4AF37", text: "#7a5600", dot: "#D4AF37" },
    yellow: { label: "Yellow", background: "#FEF3C7", border: "#EAB308", text: "#713F12", dot: "#EAB308" },
    orange: { label: "Orange", background: "#FFEDD5", border: "#F97316", text: "#7C2D12", dot: "#F97316" },
    red: { label: "Red", background: "#ffe4e6", border: "#e11d48", text: "#9f1239", dot: "#e11d48" },
    pink: { label: "Pink", background: "#FCE7F3", border: "#EC4899", text: "#831843", dot: "#EC4899" },
    purple: { label: "Purple", background: "#e7e0ff", border: "#7b61ff", text: "#4c35b0", dot: "#7b61ff" },
    brown: { label: "Brown", background: "#f4e7d3", border: "#b7791f", text: "#7c4a03", dot: "#b7791f" },
    gray: { label: "Gray", background: "#f2f4f7", border: "#98a2b3", text: "#475467", dot: "#98a2b3" },
  },

  legacyColorMap: {
    family: "orange",
    seminar: "blue",
    pharma: "teal",
    public: "gray",
    school: "gold",
    corporate: "purple",
    wedding: "pink",
    lodging: "sky",
    banquet: "brown",
    exhibition: "green",
    association: "navy",
    other: "gray",
    yellow: "gold",
  },

  /*
   * 왜 이 상수를 만들었는지:
   * - 식사유형 자동 감지 결과와 사용자의 체크박스 수정값이 같은 목록을 기준으로 움직이게 하기 위해 만들었다.
   *
   * 왜 여기 있어야 하는지:
   * - 이벤트오더 추출, 저장 화면, DB 저장, 엑셀 다운로드에서 공통으로 쓰이는 업무 코드다.
   *
   * 실무 설계 이유:
   * - 업무 코드값은 화면 라벨보다 오래 살아남으므로 한곳에서 관리해야 통계와 AI 질문이 정확해진다.
   */
  mealTypeOptions: [
    { key: "breakfast", label: "조식" },
    { key: "coffee_break", label: "커피브레이크" },
    { key: "tea_break", label: "티브레이크" },
    { key: "lunch_buffet", label: "중식뷔페" },
    { key: "dinner_buffet", label: "석식뷔페" },
    { key: "western_course", label: "양식코스" },
    { key: "lunch_box", label: "도시락" },
  ],

  fields: [
    { key: "eventName", label: "행사명", type: "text" },
    { key: "host", label: "행사주최", type: "text" },
    { key: "eventDate", label: "행사일시", type: "date" },
    { key: "place", label: "장소", type: "text" },
    { key: "guestCount", label: "대표 행사 인원", type: "number" },
    { key: "schedule", label: "Schedule", type: "schedule" },
    { key: "items", label: "Items", type: "items" },
    { key: "beveragesText", label: "Beverages", type: "list" },
    { key: "layoutEqpText", label: "Lay out & EQP", type: "list" },
    { key: "othersText", label: "Others", type: "list" },
  ],

  genericEventKeywords: [
    "세미나",
    "워크숍",
    "워크샵",
    "학회",
    "교육",
    "연수",
    "간담회",
    "회의",
    "행사",
    "포럼",
    "컨퍼런스",
  ],

  knownSectionAliases: [
    "Schedule",
    "Items",
    "F&B",
    "Food",
    "Food & Beverage",
    "Beverages",
    "BEV",
    "Lay out & EQP",
    "Lay out",
    "EQP",
    "Layout",
    "Layout & EQP",
    "Layout & Equipment",
    "Equipment",
    "Others",
    "예상 매출",
    "Expected Revenue",
    "정산",
    "Payment",
    "시설",
    "Engineering",
    "디자인",
    "음향",
    "경영지원",
  ],
};
