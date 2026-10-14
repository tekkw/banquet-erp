(function (global) {
  "use strict";

  const DEFAULT_CONTEXT = { event: null, setting: null, asset: null, venue: null, lastDomain: "", lastResults: [] };
  const ORDINALS = { "첫": 0, "첫째": 0, "첫번째": 0, "두": 1, "둘째": 1, "두번째": 1, "세": 2, "셋째": 2, "세번째": 2, "네": 3, "넷째": 3, "네번째": 3 };

  function compact(value) { return String(value || "").replace(/\s+/g, ""); }
  function normalizeTranscript(text) {
    return String(text || "").trim()
      .replace(/요번\s*주/gi, "이번주")
      .replace(/이벤트\s*오더|이벤\s*오더|이벤트오더/gi, "이벤오더")
      .replace(/레이\s+아웃/gi, "레이아웃")
      .replace(/커피\s+브레이크/gi, "커피브레이크")
      .replace(/부라노\s+(?:일|원)(?=\s|$)/gi, "부라노1")
      .replace(/카프리\s+(?:일|원)(?=\s|$)/gi, "카프리1")
      .replace(/컨벤션\s*에이/gi, "컨벤션A")
      .replace(/컨벤션\s*비/gi, "컨벤션B")
      .replace(/\s+/g, " ");
  }
  function hasRecentReference(text) { return /그\s*(?:행사|거|세팅)|이\s*행사|이벤\s*오더에|해당\s*행사|아까\s*(?:거|것)|아까(?:\s*\S+){0,2}\s*행사|거기|그\s*곳/.test(String(text || "")); }
  function ordinalIndex(text, length) {
    const value = compact(text); if (/마지막(?:거|행사)?/.test(value)) return length ? length - 1 : -1;
    const numeric = value.match(/(\d+)번째/); if (numeric) return Number(numeric[1]) - 1;
    const word = Object.keys(ORDINALS).find((key) => value.includes(key)); return word ? ORDINALS[word] : -1;
  }
  function venueIn(text) { return compact(text).match(/(?:컨벤션(?:A|B|C|[123])?|부라노(?:[123])?|카프리(?:[123](?:\+[123])*)?|페스타|포이어)/i)?.[0] || ""; }
  function eventDocumentTool(text) { const value = String(text || ""); if (/(?:첨부|별도\s*파일|레이아웃\s*파일).*(?:있|보여|열어|목록)|(?:보여|열어).*(?:첨부|파일)/i.test(value)) return "getEventAttachments"; if (/(?:요청\s*사항|요청사항|비고|others?|다른\s*요청|특이\s*사항|이벤\s*오더.*(?:뭐라고|써\s*있|적혀))/i.test(value)) return "getEventRequests"; if (/(?:레이아웃|lay\s*&?\s*out|재인폼|re-?inform|세팅.*어떻게.*(?:해달|하래)|음료|bev(?:erage)?|마이크|단상|장비|품목|커피\s*브레이크|커피브레이크)/i.test(value)) return "getEventDocumentSection"; return ""; }
  function createToolRegistry(tools) {
    const registry = { ...tools };
    return Object.freeze({ has: (name) => typeof registry[name] === "function", run: (name, input) => { if (typeof registry[name] !== "function") throw new Error(`ERP tool not registered: ${name}`); return registry[name](input); }, names: () => Object.keys(registry) });
  }
  function create(options = {}) {
    const storage = options.storage || global.sessionStorage; const key = options.storageKey || "banquetBoard.conversationContext.v1"; const maxSteps = Math.min(4, Math.max(1, Number(options.maxSteps) || 4));
    function load() { try { return { ...DEFAULT_CONTEXT, ...JSON.parse(storage?.getItem(key) || "{}") }; } catch { return { ...DEFAULT_CONTEXT }; } }
    function save(context) { const next = { ...DEFAULT_CONTEXT, ...context, lastResults: Array.isArray(context?.lastResults) ? context.lastResults.slice(0, 20) : [] }; try { storage?.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ } return next; }
    function plan(text, fastRoute = "") {
      const context = load(); const value = String(text || "").trim(); const results = context.lastResults || []; const ordinal = ordinalIndex(value, results.length); const venue = venueIn(value); const referencesRecent = hasRecentReference(value) || /(?:\d+번째|첫째|첫번째|둘째|두번째|셋째|세번째|넷째|네번째|마지막)/.test(value); const explicitRoute = fastRoute && fastRoute !== "conversation_agent";
      const contextVenue = venueIn(context.event?.venue || ""); const eventReference = referencesRecent && context.event && (context.lastDomain === "event" || /행사|이벤\s*오더|이벤트\s*오더/.test(value)) && (!venue || !contextVenue || compact(contextVenue).includes(compact(venue)) || compact(venue).includes(compact(contextVenue)));
      if (explicitRoute && !referencesRecent) return { route: fastRoute, tool: "", text: value, usesContext: false, maxSteps };
      if (/(?:이번|다음|지난)\s*(?:주|달).*(?:뭐|행사|일정).*(?:있|하지)|(?:뭐|행사|일정).*(?:이번|다음|지난)\s*(?:주|달)/.test(value)) return { route: "event_query", tool: "findEvents", text: value.includes("행사") ? value : `${value} 행사`, maxSteps };
      if (ordinal >= 0 && results[ordinal]?.id) return { route: "event_query", tool: /원본|엑셀/.test(value) ? "openEventOriginal" : /몇\s*명|인원/.test(value) ? "getEventDetail" : "getEventDetail", selectedResultId: results[ordinal].id, text: value, maxSteps };
      if (eventReference && /원본|엑셀/.test(value)) return { route: "event_query", tool: "openEventOriginal", selectedResultId: context.event.eventOrderId, text: value, usesContext: true, actions: [{ type: "open_event_original", eventOrderId: context.event.eventOrderId, storagePath: context.event.storagePath || "" }], maxSteps };
      const documentTool = eventDocumentTool(value);
      if (documentTool) { const explicitTarget = Boolean(venue || /(?:오늘|내일|모레|이번|다음|지난)\s*(?:주|달)?|\d{1,2}\s*월|\d{4}[-./년]/.test(value)); return { route: "event_query", tool: documentTool, selectedResultId: explicitTarget ? "" : context.event?.eventOrderId || "", text: value, usesContext: !explicitTarget && Boolean(context.event), maxSteps }; }
      if (eventReference && /몇\s*명|인원/.test(value)) return { route: "event_query", tool: "getEventDetail", selectedResultId: context.event.eventOrderId, text: value, usesContext: true, maxSteps };
      if (referencesRecent && context.lastDomain === "asset" && context.asset?.assetId && /몇\s*개|수량|얼마나|어디/.test(value)) return { route: "asset_query", tool: "getAssetQuantity", assetId: context.asset.assetId, text: value, usesContext: true, maxSteps };
      if (referencesRecent && context.lastDomain === "setting" && context.setting && /(?:다|전부).*(?:했어|끝냈어|완료했어)/.test(value)) return { route: "confirm_current_setup", tool: "proposeCurrentSetupUpdate", text: value, usesContext: true, maxSteps };
      if (referencesRecent && context.lastDomain === "setting" && context.setting && /오늘.*해야|뭐.*해야/.test(value)) return { route: "setting_advisor", tool: "getSettingCandidates", text: value, usesContext: true, maxSteps };
      if (venue && /세팅.*끝났.*다음|다음.*뭐\s*(?:하지|해)/.test(value)) return { route: "setting_execution_plan", tool: "getSettingExecutionPlan", text: value, maxSteps };
      if (fastRoute && fastRoute !== "conversation_agent") return { route: fastRoute, tool: "", text: value, maxSteps };
      return { route: "board_command", tool: "proposeScheduleChange", text: value, needsLlm: true, maxSteps };
    }
    function submit(text, options = {}) { const normalizedText = options.normalizeSpeech ? normalizeTranscript(text) : String(text || "").trim(); return plan(normalizedText, options.fastRoute || ""); }
    return Object.freeze({ load, save, plan, submit, ordinalIndex: (text) => ordinalIndex(text, load().lastResults.length), maxSteps });
  }

  global.erpConversationAgent = Object.freeze({ create, createToolRegistry, ordinalIndex, hasRecentReference, eventDocumentTool, normalizeTranscript });
})(window);
