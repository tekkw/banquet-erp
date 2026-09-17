(function registerAiKnowledgeRules(global) {
  const state = { request: null, loaded: false, loading: null, rules: [] };

  function text(value) { return String(value ?? "").trim(); }
  function comparable(value) {
    return text(value).toLowerCase().replace(/[Ⅰⅰ]/g, "1").replace(/[Ⅱⅱ]/g, "2").replace(/[Ⅲⅲ]/g, "3")
      .replace(/^\s*\d+\s*f\s*/i, "").replace(/[\s()[\]{}<>｜|/\\.,·ㆍ∙･_-]/g, "");
  }
  function metadataOf(row) {
    if (row?.metadata && typeof row.metadata === "object") return row.metadata;
    try { return JSON.parse(row?.original_answer || "{}"); } catch { return {}; }
  }
  function inferExecutionRule(row) {
    const metadata = metadataOf(row);
    const explicit = metadata.executionRule || metadata.rule;
    if (explicit?.ruleType) return { ...explicit, approved: explicit.approved !== false };
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
    state.loading = state.request("ai_knowledge?select=id,category,subject,predicate,object,value,natural_language,object_value,original_answer,status&status=eq.approved&order=updated_at.desc&limit=500")
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

  global.BANQUET_ERP_AI_KNOWLEDGE_RULES = { configure, load, applyGuestCount, spacesOverlapOverride, adjustLayoutScore, _setRulesForTest: setRulesForTest };
})(typeof window !== "undefined" ? window : globalThis);
