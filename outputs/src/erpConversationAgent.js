(function (global) {
  "use strict";

  const DEFAULT_CONTEXT = { event: null, setting: null, asset: null, venue: null, lastDomain: "", lastResults: [] };
  const ORDINALS = { "첫": 0, "첫째": 0, "첫번째": 0, "두": 1, "둘째": 1, "두번째": 1, "세": 2, "셋째": 2, "세번째": 2, "네": 3, "넷째": 3, "네번째": 3 };

  function compact(value) { return String(value || "").replace(/\s+/g, ""); }
  function ordinalIndex(text, length) {
    const value = compact(text); if (/마지막(?:거|행사)?/.test(value)) return length ? length - 1 : -1;
    const numeric = value.match(/(\d+)번째/); if (numeric) return Number(numeric[1]) - 1;
    const word = Object.keys(ORDINALS).find((key) => value.includes(key)); return word ? ORDINALS[word] : -1;
  }
  function venueIn(text) { return compact(text).match(/(?:컨벤션(?:A|B|C|[123])?|부라노(?:[123])?|카프리(?:[123](?:\+[123])*)?|페스타|포이어)/i)?.[0] || ""; }
  function createToolRegistry(tools) {
    const registry = { ...tools };
    return Object.freeze({ has: (name) => typeof registry[name] === "function", run: (name, input) => { if (typeof registry[name] !== "function") throw new Error(`ERP tool not registered: ${name}`); return registry[name](input); }, names: () => Object.keys(registry) });
  }
  function create(options = {}) {
    const storage = options.storage || global.sessionStorage; const key = options.storageKey || "banquetBoard.conversationContext.v1"; const maxSteps = Math.min(4, Math.max(1, Number(options.maxSteps) || 4));
    function load() { try { return { ...DEFAULT_CONTEXT, ...JSON.parse(storage?.getItem(key) || "{}") }; } catch { return { ...DEFAULT_CONTEXT }; } }
    function save(context) { const next = { ...DEFAULT_CONTEXT, ...context, lastResults: Array.isArray(context?.lastResults) ? context.lastResults.slice(0, 20) : [] }; try { storage?.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ } return next; }
    function plan(text, fastRoute = "") {
      const context = load(); const value = String(text || "").trim(); const results = context.lastResults || []; const ordinal = ordinalIndex(value, results.length); const venue = venueIn(value);
      if (/(?:이번|다음|지난)\s*(?:주|달).*(?:뭐|행사|일정).*(?:있|하지)|(?:뭐|행사|일정).*(?:이번|다음|지난)\s*(?:주|달)/.test(value)) return { route: "event_query", tool: "findEvents", text: value.includes("행사") ? value : `${value} 행사`, maxSteps };
      if (ordinal >= 0 && results[ordinal]?.id) return { route: "event_query", tool: /원본|엑셀/.test(value) ? "openEventOriginal" : /몇\s*명|인원/.test(value) ? "getEventDetail" : "getEventDetail", selectedResultId: results[ordinal].id, text: value, maxSteps };
      if (venue && context.event?.period && /(?:은|는)?\??$/.test(value) && !/세팅|현재/.test(value)) return { route: "event_query", tool: "findEvents", text: `${context.event.period.label || "이번 주"} ${venue} 행사 뭐 있어?`, maxSteps };
      if (/^(?:원본|엑셀).*(?:보여|띄워|열어)|^(?:보여|띄워|열어).*(?:원본|엑셀)/.test(value) && context.event) return { route: "event_query", tool: "openEventOriginal", selectedResultId: context.event.eventOrderId, text: value, actions: [{ type: "open_event_original", eventOrderId: context.event.eventOrderId, storagePath: context.event.storagePath || "" }], maxSteps };
      if (/^(?:몇\s*명|인원(?:은)?\??)$/.test(compact(value)) && context.event) return { route: "event_query", tool: "getEventDetail", selectedResultId: context.event.eventOrderId, text: value, maxSteps };
      if (/^(?:몇\s*개|수량(?:은)?|얼마나)\??$/.test(compact(value)) && context.asset?.assetId) return { route: "asset_query", tool: "getAssetQuantity", assetId: context.asset.assetId, text: value, maxSteps };
      if (/^(?:다|전부)\s*(?:했어|끝냈어|완료했어)$/.test(value) && context.setting) return { route: "confirm_current_setup", tool: "proposeCurrentSetupUpdate", text: value, maxSteps };
      if (/그거.*오늘.*해야|오늘.*그거.*해야/.test(value) && context.setting) return { route: "setting_advisor", tool: "getSettingCandidates", text: value, maxSteps };
      if (venue && /세팅.*끝났.*다음|다음.*뭐\s*(?:하지|해)/.test(value)) return { route: "setting_execution_plan", tool: "getSettingExecutionPlan", text: value, maxSteps };
      if (fastRoute && fastRoute !== "conversation_agent") return { route: fastRoute, tool: "", text: value, maxSteps };
      return { route: "board_command", tool: "proposeScheduleChange", text: value, needsLlm: true, maxSteps };
    }
    return Object.freeze({ load, save, plan, ordinalIndex: (text) => ordinalIndex(text, load().lastResults.length), maxSteps });
  }

  global.erpConversationAgent = Object.freeze({ create, createToolRegistry, ordinalIndex });
})(window);
