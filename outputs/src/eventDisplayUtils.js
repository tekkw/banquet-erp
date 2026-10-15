(function registerEventDisplayUtils(global) {
  const EMPTY_VALUES = new Set(["", "-", "미입력", "없음"]);
  function valid(value) { const text = String(value ?? "").trim(); return EMPTY_VALUES.has(text.toLowerCase()) ? "" : text; }
  function organizer(event) { return valid(event?.companyName || event?.company_name || event?.company || event?.organizer || event?.organizer_name); }
  function eventName(event) { return valid(event?.eventName || event?.event_name || event?.name); }
  function comparable(value) { return String(value || "").toLowerCase().replace(/[\s()[\]{}<>｜|/\\.,·ㆍ∙･_-]/g, ""); }
  function getEventDisplayTitle(event, fallback = "이름 없는 행사") { return organizer(event) || eventName(event) || fallback; }
  function getEventSecondaryTitle(event) {
    const main = getEventDisplayTitle(event, ""); const secondary = eventName(event);
    if (!main || !secondary || comparable(main) === comparable(secondary)) return "";
    return secondary;
  }
  global.BANQUET_ERP_EVENT_DISPLAY = { getEventDisplayTitle, getEventSecondaryTitle };
})(typeof window !== "undefined" ? window : globalThis);
