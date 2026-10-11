(function initializeBoardLayoutRecommendations(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BANQUET_ERP_BOARD_LAYOUT_RECOMMENDATIONS = api;
})(typeof window !== "undefined" ? window : globalThis, function createBoardLayoutRecommendations() {
  function integer(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : null; }
  function normalizeLayoutType(value) {
    const text = String(value || "").toLowerCase().replace(/\s+/g, "");
    if (/스쿨|세미나|class|school/.test(text)) return "school";
    if (/라운드|round|원형/.test(text)) return "round";
    if (/u[-_]?shape|u자|유자/.test(text)) return "u_shape";
    if (/ㅁ[-_]?shape|ㅁ자|o[-_]?shape|o자/.test(text)) return "box_shape";
    if (/t[-_]?shape|t자/.test(text)) return "t_shape";
    if (/극장|theater/.test(text)) return "theater";
    return text;
  }
  function layoutTypeLabel(value) {
    return ({ school: "스쿨식", round: "라운드식", u_shape: "U-Shape", box_shape: "ㅁ-Shape", t_shape: "T-Shape", theater: "극장식" })[normalizeLayoutType(value)] || String(value || "기타");
  }
  function parseRequest(text) {
    const value = String(text || "");
    const people = value.match(/(\d+)\s*(?:명|석)(?!\s*(?:씩|테이블당))/i);
    const seatsPerTable = value.match(/(?:테이블당\s*)?(\d+)\s*석\s*씩|(?:한\s*테이블에\s*)(\d+)\s*석/i);
    const tables = value.match(/(\d+)\s*(?:t|테이블)/i);
    return { layoutType: normalizeLayoutType(value), people: people ? integer(people[1]) : null, seatsPerTable: seatsPerTable ? integer(seatsPerTable[1] || seatsPerTable[2]) : null, tableCount: tables ? integer(tables[1]) : null };
  }
  function capacity(layout) { return integer(layout.setup_capacity) ?? integer(layout.max_people) ?? integer(layout.min_people) ?? integer(layout.object_seats); }
  function scoreLayout(request, layout) {
    if (normalizeLayoutType(layout.layout_type) !== request.layoutType) return Number.NEGATIVE_INFINITY;
    let score = 100;
    const seats = capacity(layout);
    if (request.people != null && seats != null) score += Math.max(0, 60 - Math.abs(seats - request.people));
    if (request.tableCount != null && integer(layout.table_count) === request.tableCount) score += 30;
    if (request.seatsPerTable != null && integer(layout.seats_per_table) === request.seatsPerTable) score += 20;
    return score;
  }
  function rankLayouts(request, layouts, limit = 3) {
    return layouts.map((layout) => ({ ...layout, recommendationScore: scoreLayout(request, layout), recommendationCapacity: capacity(layout) }))
      .filter((layout) => Number.isFinite(layout.recommendationScore))
      .sort((left, right) => right.recommendationScore - left.recommendationScore || Math.abs((left.recommendationCapacity ?? 99999) - (request.people ?? left.recommendationCapacity ?? 0)) - Math.abs((right.recommendationCapacity ?? 99999) - (request.people ?? right.recommendationCapacity ?? 0)) || String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")))
      .slice(0, limit);
  }
  function compareLayouts(current, next) {
    if (!current || normalizeLayoutType(current.layout_type) !== normalizeLayoutType(next?.layout_type)) return "major_change";
    return integer(current.seats ?? current.setup_capacity) === capacity(next) && integer(current.tables ?? current.table_count) === integer(next?.table_count) ? "same" : "minor_change";
  }
  return { normalizeLayoutType, layoutTypeLabel, parseRequest, capacity, scoreLayout, rankLayouts, compareLayouts };
});
