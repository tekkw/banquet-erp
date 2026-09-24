(function registerAiKnowledgeRules(global) {
  const state = { request: null, loaded: false, loading: null, rules: [] };

  function text(value) { return String(value ?? "").trim(); }
  function comparable(value) {
    return text(value).toLowerCase().replace(/[Ⅰⅰ]/g, "1").replace(/[Ⅱⅱ]/g, "2").replace(/[Ⅲⅲ]/g, "3")
      .replace(/^\s*\d+\s*f\s*/i, "").replace(/[\s()[\]{}<>｜|/\\.,·ㆍ∙･_-]/g, "");
  }
  function metadataOf(row) {
    let stored = {};
    try { stored = JSON.parse(row?.original_answer || "{}"); } catch { /* Legacy natural-language answer. */ }
    return { ...stored, ...(row?.metadata && typeof row.metadata === "object" ? row.metadata : {}) };
  }
  const calculationCategories = ["staffing", "equipment", "beverage", "layout", "guest_count", "warnings"];
  function buildExecutionRuleCandidate(value) {
    const source = text(value);
    if (!/피렌체|florence|firenze/i.test(source) || !/식사|뷔페|조식|중식|석식|디너|meal|buffet/i.test(source)
      || !/연회/.test(source) || !/준비\s*대상이\s*아니|계산에서\s*제외|산정에서\s*제외|준비에서\s*제외|준비하지\s*않/.test(source)
      || /제외하지|제외하면\s*안|대상이\s*아닌\s*것은\s*아니/.test(source)) return null;
    return { ruleType: "exclude_schedule_from_banquet_calculation", venue: "피렌체", categories: [...calculationCategories], approved: true };
  }
  function matchesVenue(value, venue) {
    const name = comparable(value); const target = comparable(venue);
    if (!target) return false;
    return /^(피렌체|florence|firenze)$/.test(target) ? /피렌체|florence|firenze/.test(name) : name.includes(target);
  }
  function partitionSchedule(event, category, knowledgeRows = state.rules) {
    const rules = normalizedRows(knowledgeRows).map((row) => row.executionRule).filter((rule) =>
      rule.ruleType === "exclude_schedule_from_banquet_calculation" && Array.isArray(rule.categories)
      && (rule.categories.includes(category) || (category === "warnings" && rule.categories.includes("staffing"))));
    const included = []; const excluded = [];
    for (const row of event.schedule || []) {
      const venue = row.venue || row.location || row.place || event.venue;
      (rules.some((rule) => matchesVenue(venue, rule.venue)) ? excluded : included).push(row);
    }
    return { included, excluded };
  }
  function calculationView(event, category, knowledgeRows = state.rules) {
    const { included, excluded } = partitionSchedule(event, category, knowledgeRows);
    if (!excluded.length) return { ...event, schedule: [...(event.schedule || [])] };
    const excludedVenues = excluded.map((row) => row.venue || row.location || row.place || event.venue).filter(Boolean);
    const includedVenues = included.map((row) => row.venue || row.location || row.place || event.venue).filter(Boolean);
    const hasIncludedVenue = (value) => includedVenues.some((venue) => matchesVenue(value, venue));
    const retainedMeal = included.some((row) => /식|뷔페|디너|lunch|dinner|buffet|breakfast/i.test(text(row.content)));
    const cleanLines = (value) => text(value).split(/\r?\n/).filter((line) =>
      !excludedVenues.some((venue) => matchesVenue(line, venue))
      && (hasIncludedVenue(line) || !excluded.some((row) => text(row.content) && line.includes(text(row.content))))).join("\n");
    const people = included.map((row) => Number(countOf(row.people))).filter((count) => count > 0);
    const view = { ...event, schedule: included, guestCount: people.length ? Math.max(...people) : 0,
      venue: [...new Set(included.map((row) => row.venue || row.location || row.place || event.venue).filter(Boolean))].join(" · "),
      mealTypes: retainedMeal ? event.mealTypes : [],
      items: (event.items || []).filter((item) => {
        const venue = item.venue || item.location || item.place;
        return venue ? !excludedVenues.some((excludedVenue) => matchesVenue(venue, excludedVenue))
          : !!cleanLines(JSON.stringify(item)) && (retainedMeal || !/식사|뷔페|디너|조식|중식|석식|양식|맥주|소주|와인|주류|buffet|dinner|lunch|breakfast|western|beer|wine|alcohol/i.test(JSON.stringify(item)));
      }),
    };
    for (const key of ["beveragesText", "fnbText", "layoutEqpText", "othersText"]) view[key] = included.length ? cleanLines(event[key]) : "";
    if (!retainedMeal) {
      for (const key of ["beveragesText", "fnbText"]) view[key] = view[key].split(/\r?\n/).filter(hasIncludedVenue).join("\n");
    }
    if (!included.length) view.items = [];
    return view;
  }
  function calculationNotices(event, knowledgeRows = state.rules) {
    const excluded = new Set(calculationCategories.flatMap((category) => partitionSchedule(event, category, knowledgeRows).excluded));
    const counts = new Map();
    for (const row of excluded) {
      const venue = row.venue || row.location || row.place || event.venue || "제외 대상";
      counts.set(venue, (counts.get(venue) || 0) + 1);
    }
    return [...counts].map(([venue, count]) => `${venue} 일정 ${count}건은 연회 준비 계산에서 제외되었습니다.`);
  }
  function inferExecutionRule(row) {
    const metadata = metadataOf(row);
    const explicit = metadata.executionRule || metadata.rule;
    if (explicit?.ruleType) return { ...explicit, approved: explicit.approved !== false };
    const exclusion = buildExecutionRuleCandidate(row?.natural_language || row?.content || row?.explanation);
    if (exclusion) return exclusion;
    const predicate = comparable(`${row?.subject || ""} ${row?.predicate || ""} ${row?.natural_language || ""}`);
    if (row?.category === "operation_rule" && /guestcount|attendance|representative|대표인원/.test(predicate)) {
      return { ruleType: "guest_count_priority", prefer: ["main_event", "seminar"], deprioritize: ["breakfast", "lunch", "dinner", "coffee_break"], approved: true };
    }
    if (row?.category === "space_knowledge" && /notoverlap|different|별도|다른공간/.test(predicate)) {
      return { ruleType: "space_relation", subject: row.subject, relation: "not_overlap", object: row.object || row.value || row.object_value, approved: true };
    }
    if (row?.category === "layout_rule" && (row.object_value || row.value)) {
      return { ruleType: "layout_preference", eventType: row.subject, preferLayoutType: row.object_value || row.value, approved: true };
    }
    return null;
  }
  function normalizedRows(rows) {
    return (rows || []).filter((row) => row?.status === "approved").map((row) => ({ ...row, executionRule: inferExecutionRule(row) }))
      .filter((row) => row.executionRule?.approved === true);
  }
  function logApplied(row, detail) {
    console.info(`[AI knowledge] Applied ai_knowledge #${row.id || "unknown"}: ${detail}`);
  }
  function configure({ supabaseRequest } = {}) { state.request = supabaseRequest || null; }
  async function load({ force = false } = {}) {
    if (state.loaded && !force) return state.rules;
    if (state.loading && !force) return state.loading;
    if (!state.request) return state.rules;
    state.loading = state.request("ai_knowledge?select=*&status=eq.approved&order=updated_at.desc&limit=500")
      .then((rows) => { state.rules = normalizedRows(rows); state.loaded = true; return state.rules; })
      .catch((error) => { console.warn("approved ai_knowledge load failed:", error); return state.rules; })
      .finally(() => { state.loading = null; });
    return state.loading;
  }
  function countOf(value) { const match = text(value).replace(/,/g, "").match(/\d+/); return match ? match[0] : ""; }
  function applyGuestCount(scheduleRows, fallbackValue, { explicit = false } = {}) {
    if (explicit) return fallbackValue;
    const knowledge = state.rules.find((row) => row.executionRule.ruleType === "guest_count_priority");
    if (!knowledge) return fallbackValue;
    const candidates = (scheduleRows || []).map((row) => ({ row, count: countOf(row?.people), label: text(`${row?.content || ""} ${row?.venue || ""}`).toLowerCase() })).filter((item) => item.count);
    const preferred = candidates.find((item) => /(세미나|본행사|메인\s*행사|행사|예식|회의|seminar|main\s*event|ceremony|conference)/i.test(item.label)
      && !/(조식|중식|석식|런치|디너|breakfast|lunch|dinner|커피\s*브레이크|coffee\s*break)/i.test(item.label));
    if (!preferred || preferred.count === text(fallbackValue)) return fallbackValue;
    logApplied(knowledge, `대표인원 ${fallbackValue || "-"} → ${preferred.count}`);
    return preferred.count;
  }
  function eventNames(event, row = {}) {
    return [row.venue, row.location, row.place, event?.venue, ...(event?.venueSpaceNames || []),
      ...(row.venueSpaces || []).flatMap((space) => [space?.spaceName, space?.spaceCode]),
      ...(event?.venueSpaces || []).flatMap((space) => [space?.spaceName, space?.spaceCode]),
      ...(event?.eventSpaces || []).map((space) => space?.spaceName)].filter(Boolean).map(comparable);
  }
  function spacesOverlapOverride(currentEvent, futureEvent, currentRow = {}, futureRow = {}) {
    const left = eventNames(currentEvent, currentRow); const right = eventNames(futureEvent, futureRow);
    for (const knowledge of state.rules.filter((row) => row.executionRule.ruleType === "space_relation")) {
      const rule = knowledge.executionRule; const subject = comparable(rule.subject); const object = comparable(rule.object);
      if (!subject || !object) continue;
      const matches = (left.includes(subject) && right.includes(object)) || (left.includes(object) && right.includes(subject));
      if (!matches) continue;
      const result = rule.relation === "not_overlap" ? false : ["overlap", "same_space", "alias"].includes(rule.relation) ? true : null;
      if (result !== null) logApplied(knowledge, `${rule.subject} ${result ? "=" : "!="} ${rule.object}`);
      return result;
    }
    return null;
  }
  function adjustLayoutScore(layout, context = {}, baseScore = 0) {
    let score = baseScore;
    state.rules.filter((row) => row.executionRule.ruleType === "layout_preference").forEach((knowledge) => {
      const rule = knowledge.executionRule;
      const eventMatches = !rule.eventType || comparable(rule.eventType) === comparable(context.eventType || context.layoutType);
      const layoutMatches = [layout?.layout_type, layout?.layout_name].some((value) => comparable(value) === comparable(rule.preferLayoutType || rule.preferLayoutName));
      if (eventMatches && layoutMatches) { score += Number(rule.weight || 3); logApplied(knowledge, `레이아웃 ${layout.layout_name || layout.layout_type} 우선`); }
    });
    return score;
  }
  function setRulesForTest(rows) { state.rules = normalizedRows(rows); state.loaded = true; }

  global.BANQUET_ERP_AI_KNOWLEDGE_RULES = { configure, load, applyGuestCount, spacesOverlapOverride, adjustLayoutScore, matchesVenue, buildExecutionRuleCandidate, partitionSchedule, calculationView, calculationNotices, _setRulesForTest: setRulesForTest };
})(typeof window !== "undefined" ? window : globalThis);
