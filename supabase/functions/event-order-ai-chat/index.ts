const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = "gpt-4.1-mini";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "POST 요청만 지원합니다." }, 405);
  }

  try {
    assertServerConfig();

    const payload = await request.json();
    const { question, mode, analysisData, attachments } = payload;
    if (mode === "event_order_analysis") {
      const [banquetAssets, recommendItems] = await Promise.all([
        loadBanquetAssets(),
        loadRecommendItems(),
      ]);
      const operationalAnalysis = calculateOperationalAnalysis(analysisData);
      const representativePeople = Number(operationalAnalysis.representativePeople || 0);
      const calculatedStaff = calculateStaffRecommendation(analysisData, representativePeople, operationalAnalysis);
      const recommendedItems = calculateRecommendedItems(analysisData, recommendItems, representativePeople);
      const result = await askAiForEventOrderAnalysis({
        question: String(question ?? "Analyze this event order for staff, beverages, required items, and warnings."),
        analysisData,
        banquetAssets,
        calculatedStaff,
        recommendedItems,
        recommendItems,
        operationalAnalysis,
      });
      return jsonResponse(result);
    }

    if (mode === "interview_knowledge_analysis") {
      const analysis = await askAiForInterviewKnowledge(payload.interview ?? {});
      return jsonResponse({ analysis });
    }

    if (mode === "generate_interview_questions") {
      const questions = await generateInterviewQuestions();
      return jsonResponse({ questions });
    }

    if (mode === "analyze_event_order_knowledge_gaps") {
      const result = await analyzeEventOrderKnowledgeGaps(String(payload.eventOrderId ?? ""));
      return jsonResponse(result);
    }

    if (mode === "create_post_event_review_questions") {
      const result = await createPostEventReviewQuestions();
      return jsonResponse(result);
    }

    if (mode === "search_venue_layout_images") {
      const result = await searchVenueLayoutImages({
        venueName: String(payload.venueName ?? payload.venue ?? payload.spaceName ?? ""),
        layoutType: String(payload.layoutType ?? payload.layout_type ?? ""),
        people: toOptionalNumber(payload.people ?? payload.guestCount ?? payload.guest_count),
        minPeople: toOptionalNumber(payload.minPeople ?? payload.min_people),
        maxPeople: toOptionalNumber(payload.maxPeople ?? payload.max_people),
        tableType: String(payload.tableType ?? payload.table_type ?? ""),
        hasStage: parseOptionalBoolean(payload.hasStage ?? payload.has_stage),
        hasBuffet: parseOptionalBoolean(payload.hasBuffet ?? payload.has_buffet),
        isVerified: parseOptionalBoolean(payload.isVerified ?? payload.is_verified),
        limit: Math.min(Math.max(toOptionalNumber(payload.limit) ?? 5, 1), 20),
      });
      return jsonResponse(result);
    }

    const cleanQuestion = String(question ?? "").trim();
    if (!cleanQuestion) {
      return jsonResponse({ message: "질문을 입력해주세요." }, 400);
    }

    const chatDataContext = await loadChatDataContext(cleanQuestion);
    const chatAttachments = Array.isArray(attachments) ? attachments : [];
    const coffeeBreakAnswer = answerCoffeeBreakQuestion(cleanQuestion, chatDataContext.eventData);
    if (coffeeBreakAnswer && !chatAttachments.length) {
      return jsonResponse({ answer: `${coffeeBreakAnswer}\n\n출처: event_orders, event_schedules, event_calendar_dates, event_items` });
    }
    const assetAnswer = answerAssetQuestion(cleanQuestion, chatDataContext.banquetAssets);
    if (assetAnswer && !chatAttachments.length) {
      return jsonResponse({ answer: `${assetAnswer}\n\n출처: banquet_assets` });
    }

    const answer = await askAi({
      question: cleanQuestion,
      dataContext: chatDataContext,
      attachments: chatAttachments,
    });

    return jsonResponse({ answer });
  } catch (error) {
    console.error("event-order-ai-chat error:", error);
    return jsonResponse({ message: getErrorMessage(error, "AI response generation failed.") }, 500);
  }
});

function assertServerConfig() {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL 환경변수가 설정되지 않았습니다.");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.");
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function loadEventOrderData() {
  const eventOrders = await supabaseSelect("event_orders", "select=*&order=created_at.desc");
  const eventIds = eventOrders.map((row) => row.id).filter(Boolean);
  if (!eventIds.length) return [];

  const idFilter = `event_order_id=in.(${eventIds.join(",")})`;
  const [calendarDates, schedules, items, notes] = await Promise.all([
    supabaseSelect("event_calendar_dates", `select=*&${idFilter}&order=calendar_date.asc`),
    supabaseSelect("event_schedules", `select=*&${idFilter}&order=created_at.asc`),
    supabaseSelect("event_items", `select=*&${idFilter}&order=created_at.asc`),
    supabaseSelect("event_notes", `select=*&${idFilter}&order=created_at.asc`),
  ]);

  return eventOrders.map((eventOrder) => ({
    id: eventOrder.id,
    eventName: eventOrder.event_name,
    companyName: eventOrder.company_name,
    eventDateTime: eventOrder.event_datetime,
    venue: eventOrder.venue,
    color: eventOrder.color,
    mealTypes: eventOrder.meal_types,
    originalFilename: eventOrder.original_filename,
    storagePath: eventOrder.storage_path,
    internalMemo: eventOrder.internal_memo,
    calendarDates: calendarDates
      .filter((row) => row.event_order_id === eventOrder.id)
      .map((row) => row.calendar_date),
    schedules: schedules
      .filter((row) => row.event_order_id === eventOrder.id)
      .map((row) => ({
        date: row.schedule_date,
        time: row.schedule_time,
        content: row.content,
        venue: row.venue,
        people: row.people,
      })),
    items: items
      .filter((row) => row.event_order_id === eventOrder.id)
      .map((row) => ({
        itemName: row.item_name,
        unitPrice: row.unit_price,
        quantity: row.quantity,
        amount: row.amount,
      })),
    notes: notes
      .filter((row) => row.event_order_id === eventOrder.id)
      .map((row) => ({
        noteType: row.note_type,
        content: row.content,
      })),
  }));
}

async function loadBanquetAssets() {
  return supabaseSelect("banquet_assets", "select=asset_name,floor,location,quantity,spec&order=asset_name.asc");
}

async function loadRecommendItems() {
  try {
    return await supabaseSelect("banquet_recommend_items", "select=*&is_active=eq.true&order=name.asc");
  } catch (error) {
    console.error("banquet_recommend_items select failed:", error);
    return [];
  }
}

async function loadVenueLayoutImages() {
  return safeSupabaseSelect(
    "venue_layout_images",
    "select=*,files(id,bucket,storage_path,public_url,original_filename,file_type,mime_type,description),venues(venue_name),venue_spaces(space_name,floor)&is_active=eq.true&order=is_verified.desc,created_at.desc&limit=200",
  );
}

type VenueLayoutSearchInput = {
  venueName: string;
  layoutType: string;
  people: number | null;
  minPeople: number | null;
  maxPeople: number | null;
  tableType: string;
  hasStage: boolean | null;
  hasBuffet: boolean | null;
  isVerified: boolean | null;
  limit: number;
};

type VenueLayoutTargetMatch = {
  source: "venue" | "venue_alias" | "venue_space";
  id: string;
  name: string;
  venue_id?: string;
  space_id?: string;
};

type RankedVenueLayoutImage = {
  score: number;
  peopleDistance: number;
  peopleInRange: boolean;
  isVerified: boolean;
  result: Record<string, unknown>;
};

async function searchVenueLayoutImages(input: VenueLayoutSearchInput) {
  const target = await resolveVenueLayoutTargets(input.venueName);
  const rawRows = await safeSupabaseSelect(
    "venue_layout_images",
    "select=*,files(id,bucket,storage_path,public_url,original_filename,file_type,mime_type,description),venues(venue_name),venue_spaces(space_name,floor)&is_active=eq.true&limit=500",
  );

  const normalizedLayoutType = normalizeVenueLayoutSearchText(input.layoutType);
  const normalizedTableType = normalizeVenueLayoutSearchText(input.tableType);
  const hasTargetFilter = Boolean(normalizeVenueLayoutSearchText(input.venueName));
  const venueIds = new Set(target.venueIds);
  const spaceIds = new Set(target.spaceIds);

  const ranked = rawRows
    .map((row) => {
      const venue = firstRelation(row.venues);
      const space = firstRelation(row.venue_spaces);
      const file = firstRelation(row.files);
      const rowVenueId = String(row.venue_id ?? "");
      const rowSpaceId = String(row.space_id ?? "");
      const rowLayoutType = normalizeVenueLayoutSearchText(row.layout_type);
      const rowTableType = normalizeVenueLayoutSearchText(row.table_type);
      const rowMinPeople = toOptionalNumber(row.min_people);
      const rowMaxPeople = toOptionalNumber(row.max_people);
      const peopleDistance = calculatePeopleDistance(input.people, rowMinPeople, rowMaxPeople);
      const peopleInRange = input.people !== null && peopleDistance === 0;

      const targetMatched =
        !hasTargetFilter ||
        (rowVenueId && venueIds.has(rowVenueId)) ||
        (rowSpaceId && spaceIds.has(rowSpaceId)) ||
        fuzzyVenueTextMatches(input.venueName, String(venue?.venue_name ?? "")) ||
        fuzzyVenueTextMatches(input.venueName, String(space?.space_name ?? ""));

      if (!targetMatched) return null;
      if (normalizedLayoutType && (!rowLayoutType || (!rowLayoutType.includes(normalizedLayoutType) && !normalizedLayoutType.includes(rowLayoutType)))) return null;
      if (normalizedTableType && (!rowTableType || (!rowTableType.includes(normalizedTableType) && !normalizedTableType.includes(rowTableType)))) return null;
      if (input.hasStage !== null && Boolean(row.has_stage) !== input.hasStage) return null;
      if (input.hasBuffet !== null && Boolean(row.has_buffet) !== input.hasBuffet) return null;
      if (input.isVerified !== null && Boolean(row.is_verified) !== input.isVerified) return null;
      if (input.minPeople !== null && rowMaxPeople !== null && rowMaxPeople < input.minPeople) return null;
      if (input.maxPeople !== null && rowMinPeople !== null && rowMinPeople > input.maxPeople) return null;

      let score = 0;
      if (peopleInRange) score += 100;
      if (Boolean(row.is_verified)) score += 50;
      if (rowVenueId && venueIds.has(rowVenueId)) score += 40;
      if (rowSpaceId && spaceIds.has(rowSpaceId)) score += 40;
      if (normalizedLayoutType && rowLayoutType === normalizedLayoutType) score += 30;
      else if (normalizedLayoutType && rowLayoutType.includes(normalizedLayoutType)) score += 20;
      if (normalizedTableType && rowTableType === normalizedTableType) score += 20;
      else if (normalizedTableType && rowTableType.includes(normalizedTableType)) score += 10;
      score += Math.max(0, 40 - peopleDistance / 5);

      return {
        score,
        peopleDistance,
        peopleInRange,
        isVerified: Boolean(row.is_verified),
        result: {
          id: row.id,
          venue_name: venue?.venue_name ?? "",
          space_name: space?.space_name ?? "",
          layout_type: row.layout_type ?? "",
          min_people: row.min_people ?? null,
          max_people: row.max_people ?? null,
          table_type: row.table_type ?? "",
          table_count: row.table_count ?? null,
          has_stage: Boolean(row.has_stage),
          has_buffet: Boolean(row.has_buffet),
          layout_notes: row.layout_notes ?? "",
          public_url: file?.public_url ?? "",
        },
      };
    })
    .filter((row): row is RankedVenueLayoutImage => Boolean(row))
    .sort((a, b) => {
      if (a.peopleInRange !== b.peopleInRange) return a.peopleInRange ? -1 : 1;
      if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
      if (a.peopleDistance !== b.peopleDistance) return a.peopleDistance - b.peopleDistance;
      return b.score - a.score;
    });

  const results = ranked.slice(0, input.limit).map((row) => row.result);
  console.log("venue layout image search:", {
    query: input,
    matchedTargets: target.matched,
    resultCount: results.length,
  });

  return {
    query: input,
    matchedTargets: target.matched,
    results,
  };
}

async function resolveVenueLayoutTargets(rawVenueName: string) {
  const normalizedVenueName = normalizeVenueLayoutSearchText(rawVenueName);
  const [venues, aliases, spaces] = await Promise.all([
    safeSupabaseSelect("venues", "select=id,venue_name"),
    safeSupabaseSelect("venue_aliases", "select=id,alias_name,venue_id,space_id"),
    safeSupabaseSelect("venue_spaces", "select=id,space_name"),
  ]);
  const venueIds = new Set<string>();
  const spaceIds = new Set<string>();
  const matched: VenueLayoutTargetMatch[] = [];

  if (!normalizedVenueName) {
    return { venueIds: Array.from(venueIds), spaceIds: Array.from(spaceIds), matched };
  }

  for (const row of aliases) {
    const aliasName = String(row.alias_name ?? "");
    if (!isVenueLookupMatch(normalizedVenueName, aliasName)) continue;
    const venueId = String(row.venue_id ?? "");
    const spaceId = String(row.space_id ?? "");
    if (venueId) venueIds.add(venueId);
    if (spaceId) spaceIds.add(spaceId);
    matched.push({
      source: "venue_alias",
      id: String(row.id ?? ""),
      name: aliasName,
      venue_id: venueId || undefined,
      space_id: spaceId || undefined,
    });
  }

  for (const row of venues) {
    const venueName = String(row.venue_name ?? "");
    if (!isVenueLookupMatch(normalizedVenueName, venueName)) continue;
    const venueId = String(row.id ?? "");
    if (venueId) venueIds.add(venueId);
    matched.push({
      source: "venue",
      id: venueId,
      name: venueName,
      venue_id: venueId || undefined,
    });
  }

  for (const row of spaces) {
    const spaceName = String(row.space_name ?? "");
    if (!isVenueLookupMatch(normalizedVenueName, spaceName)) continue;
    const spaceId = String(row.id ?? "");
    if (spaceId) spaceIds.add(spaceId);
    matched.push({
      source: "venue_space",
      id: spaceId,
      name: spaceName,
      space_id: spaceId || undefined,
    });
  }

  console.log("venue layout target lookup:", {
    rawVenueName,
    normalizedVenueName,
    matched,
  });

  return {
    venueIds: Array.from(venueIds),
    spaceIds: Array.from(spaceIds),
    matched,
  };
}

function firstRelation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value[0] && typeof value[0] === "object" ? value[0] as Record<string, unknown> : null;
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return null;
}

function calculatePeopleDistance(people: number | null, minPeople: number | null, maxPeople: number | null) {
  if (people === null) return 999999;
  if (minPeople !== null && maxPeople !== null && people >= minPeople && people <= maxPeople) return 0;
  if (minPeople !== null && maxPeople === null && people >= minPeople) return 0;
  if (minPeople === null && maxPeople !== null && people <= maxPeople) return 0;
  if (minPeople !== null && people < minPeople) return minPeople - people;
  if (maxPeople !== null && people > maxPeople) return people - maxPeople;
  return 999999;
}

function fuzzyVenueTextMatches(searchText: string, candidateText: string) {
  const normalizedSearch = normalizeVenueLayoutSearchText(searchText);
  const normalizedCandidate = normalizeVenueLayoutSearchText(candidateText);
  return Boolean(
    normalizedSearch &&
    normalizedCandidate &&
    (normalizedSearch === normalizedCandidate ||
      normalizedSearch.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedSearch))
  );
}

function isVenueLookupMatch(normalizedSearch: string, candidateText: string) {
  const normalizedCandidate = normalizeVenueLayoutSearchText(candidateText);
  return Boolean(
    normalizedSearch &&
    normalizedCandidate &&
    (normalizedSearch === normalizedCandidate ||
      normalizedSearch.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedSearch))
  );
}

function normalizeVenueLayoutSearchText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\s*\d\s*(f|층)\s*/i, "")
    .replace(/ⅲ|iii/gi, "3")
    .replace(/Ⅱ|ii/gi, "2")
    .replace(/Ⅰ|i/gi, "1")
    .replace(/[,\u00b7ㆍ/]/g, "+")
    .replace(/\s+/g, "")
    .replace(/\++/g, "+");
}

async function loadApprovedKnowledge() {
  return safeSupabaseSelect(
    "ai_knowledge",
    "select=category,subject,predicate,object,value,natural_language,object_value,explanation,reason,confidence,updated_at&status=eq.approved&order=updated_at.desc&limit=300",
  );
}

type ChatIntent = {
  venue: boolean;
  event: boolean;
  asset: boolean;
  recommendItem: boolean;
  knowledge: boolean;
  operationResult: boolean;
  incident: boolean;
  staffResult: boolean;
  recommendationFeedback: boolean;
  knowledgeVersion: boolean;
  layoutImage: boolean;
  labels: string[];
};

type ChatDataContext = {
  intent: ChatIntent;
  sources: string[];
  eventData: unknown[];
  venueData: Record<string, unknown[]>;
  banquetAssets: Array<Record<string, unknown>>;
  recommendItems: Array<Record<string, unknown>>;
  venueLayoutImages: Array<Record<string, unknown>>;
  operationalHistoryData: Record<string, unknown[]>;
  approvedKnowledge: unknown[];
};

type ChatAttachment = {
  name?: string;
  originalFilename?: string;
  mimeType?: string;
  size?: number;
  type?: string;
  storageBucket?: string;
  storagePath?: string;
  dataUrl?: string;
  textContent?: string;
};

function classifyChatQuestion(question: string): ChatIntent {
  const text = normalizeIntentText(question);
  const venue = /(행사장|연회장|공간|장소|홀|룸|부라노|카프리|컨벤션|피렌체|페스타|올리비아|레이아웃|수용|좌석|시설|기둥|스크린|마이크|빔|매핑|alias|별칭)/i.test(text);
  const event = /(행사|일정|스케줄|캘린더|예약|오늘|내일|이번주|다음주|이번달|월별|연간|주최|고객|인원|매출|조식|중식|석식|디너|뷔페|커피브레이크|이벤트오더)/i.test(text);
  const asset = /(자산|비품|장비|재고|수량|몇개|몇대|입고|출고|이동|반납|파손|분실|테이블|의자|이젤|냉온수기|스탠드|포디움|고블렛|하이볼|소주잔|나이프|포크|스푼|커트러리)/i.test(text);
  const recommendItem = /(추천|필요기물|준비물|기물|커트러리|세팅|양식|웨스턴|뷔페기물|음주류|음료|계산|체크리스트)/i.test(text);
  const knowledge = /(규칙|노하우|방법|기준|주의|해야|어떻게|가능|불가|추천|운영|배운|지식|알려줘|설명|왜|버전|이력|수정|폐기|대체)/i.test(text);
  const operationResult = /(운영결과|운영 결과|결과|실제운영|실제 운영|사후|리뷰|평가|고객피드백|고객 피드백|계획대비|계획 대비|실적)/i.test(text);
  const incident = /(사고|문제|클레임|불만|컴플레인|파손|분실|원인|조치|재발|주의사항|이슈|incident|claim)/i.test(text);
  const staffResult = /(인력|직원|스태프|투입|충분|부족|추천인원|추천 인원|실제인원|실제 인원|staff)/i.test(text);
  const recommendationFeedback = /(AI추천|AI 추천|추천값|추천 결과|정확|피드백|관리자평가|관리자 평가|accepted|rating)/i.test(text);
  const knowledgeVersion = /(지식버전|지식 버전|지식이력|지식 이력|수정이력|수정 이력|폐기|대체|승인 이력|knowledge version)/i.test(text);
  const layoutImage = /(도면|이미지|사진|레이아웃이미지|레이아웃 이미지|배치도|세팅도|layoutimage|floorplan|floor plan)/i.test(text);

  const labels: string[] = [];
  if (venue) labels.push("space");
  if (event) labels.push("event");
  if (asset) labels.push("asset");
  if (recommendItem) labels.push("recommend_item");
  if (knowledge) labels.push("knowledge");
  if (operationResult) labels.push("operation_result");
  if (incident) labels.push("incident");
  if (staffResult) labels.push("staff_result");
  if (recommendationFeedback) labels.push("recommendation_feedback");
  if (knowledgeVersion) labels.push("knowledge_version");
  if (layoutImage) labels.push("layout_image");
  if (!labels.length) labels.push("knowledge");

  return {
    venue,
    event,
    asset,
    recommendItem,
    knowledge: knowledge || !labels.length,
    operationResult,
    incident,
    staffResult,
    recommendationFeedback,
    knowledgeVersion,
    layoutImage,
    labels,
  };
}
function normalizeIntentText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

async function loadChatDataContext(question: string): Promise<ChatDataContext> {
  const intent = classifyChatQuestion(question);
  const shouldLoadKnowledge = true;
  const sources = new Set<string>();

  const [eventData, venueData, banquetAssets, recommendItems, venueLayoutImages, operationalHistoryData, approvedKnowledge] = await Promise.all([
    intent.event ? loadEventOrderData() : Promise.resolve([]),
    intent.venue ? loadVenueOperationData() : Promise.resolve(emptyVenueData()),
    intent.asset ? loadBanquetAssets() : Promise.resolve([]),
    intent.recommendItem ? loadRecommendItems() : Promise.resolve([]),
    (intent.venue || intent.recommendItem || intent.layoutImage) ? loadVenueLayoutImages() : Promise.resolve([]),
    loadOperationalHistoryData(intent),
    shouldLoadKnowledge ? loadApprovedKnowledge() : Promise.resolve([]),
  ]);

  if (intent.event) {
    ["event_orders", "event_calendar_dates", "event_schedules", "event_items", "event_notes"].forEach((source) => sources.add(source));
  }
  if (intent.venue) {
    ["venues", "venue_spaces", "venue_aliases", "venue_space_mappings", "venue_facilities", "layout_rules"].forEach((source) => sources.add(source));
  }
  if (intent.asset) sources.add("banquet_assets");
  if (intent.recommendItem) sources.add("banquet_recommend_items");
  if (intent.venue || intent.recommendItem || intent.layoutImage) {
    sources.add("venue_layout_images");
    sources.add("files");
  }
  if (intent.asset) sources.add("asset_transactions");
  if (intent.operationResult) sources.add("event_operation_results");
  if (intent.incident) sources.add("event_incidents");
  if (intent.staffResult) sources.add("event_staff_results");
  if (intent.recommendationFeedback) sources.add("ai_recommendation_feedback");
  if (intent.knowledgeVersion) sources.add("ai_knowledge_versions");
  if (shouldLoadKnowledge) sources.add("ai_knowledge(status=approved)");

  const context = {
    intent,
    sources: Array.from(sources),
    eventData,
    venueData,
    banquetAssets,
    recommendItems,
    venueLayoutImages,
    operationalHistoryData,
    approvedKnowledge,
  };

  console.log("chat intent:", intent);
  console.log("chat selected sources:", context.sources);
  return context;
}

function emptyVenueData() {
  return {
    venues: [],
    venueSpaces: [],
    venueAliases: [],
    venueSpaceMappings: [],
    venueFacilities: [],
    layoutRules: [],
  };
}

async function loadVenueOperationData() {
  const [venues, venueSpaces, venueAliases, venueSpaceMappings, venueFacilities, layoutRules] = await Promise.all([
    safeSupabaseSelect("venues", "select=*"),
    safeSupabaseSelect("venue_spaces", "select=*"),
    safeSupabaseSelect("venue_aliases", "select=*"),
    safeSupabaseSelect("venue_space_mappings", "select=*"),
    safeSupabaseSelect("venue_facilities", "select=*"),
    safeSupabaseSelect("layout_rules", "select=*"),
  ]);

  return {
    venues,
    venueSpaces,
    venueAliases,
    venueSpaceMappings,
    venueFacilities,
    layoutRules,
  };
}

async function loadOperationalHistoryData(intent: ChatIntent) {
  const [
    assetTransactions,
    operationResults,
    incidents,
    staffResults,
    recommendationFeedback,
    knowledgeVersions,
  ] = await Promise.all([
    intent.asset
      ? safeSupabaseSelect("asset_transactions", "select=*&order=occurred_at.desc&limit=200")
      : Promise.resolve([]),
    intent.operationResult
      ? safeSupabaseSelect("event_operation_results", "select=*&order=created_at.desc&limit=200")
      : Promise.resolve([]),
    intent.incident
      ? safeSupabaseSelect("event_incidents", "select=*&order=occurred_at.desc&limit=200")
      : Promise.resolve([]),
    intent.staffResult
      ? safeSupabaseSelect("event_staff_results", "select=*&order=created_at.desc&limit=200")
      : Promise.resolve([]),
    intent.recommendationFeedback
      ? safeSupabaseSelect("ai_recommendation_feedback", "select=*&order=created_at.desc&limit=200")
      : Promise.resolve([]),
    intent.knowledgeVersion
      ? safeSupabaseSelect("ai_knowledge_versions", "select=*&order=created_at.desc&limit=200")
      : Promise.resolve([]),
  ]);

  return {
    assetTransactions,
    operationResults,
    incidents,
    staffResults,
    recommendationFeedback,
    knowledgeVersions,
  };
}

export function answerAssetQuestion(question: string, banquetAssets: Array<Record<string, unknown>>) {
  if (!banquetAssets.length) return "";

  const normalizedQuestion = normalizeAssetText(question);
  const eventContext = /(커피\s*브레이크|티\s*브레이크|행사|일정|스케줄|오늘|내일|이번\s*주|이번\s*달|몇\s*번|횟수|건수)/i.test(question);
  if (eventContext) return "";
  const floorMatch = question.match(/(\d+)\s*(?:floor|f|\uCE35)/i);
  const requestedFloor = floorMatch?.[1] ? `${floorMatch[1]}\uCE35` : "";
  const quantityIntent = /(몇\s*(?:개|대)|수량|개수|보유|재고|있어)/i.test(question);
  const assetIntent = /(테이블|냉온수기|스탠드|이젤|커피\s*포트|flip|chart|자산|비품|장비|수량|보유|재고)/i.test(question);
  if (!assetIntent) return "";

  const matches = banquetAssets.filter((asset) => {
    const assetName = String(asset.asset_name ?? "");
    const assetFloor = String(asset.floor ?? "");
    const normalizedName = normalizeAssetText(assetName);
    // 전체 자산명이 직접 포함된 경우만 shortcut에 사용한다. "커피"처럼 일반적인
    // 부분 단어가 겹친다는 이유로 "커피브레이크"를 "커피 포트"로 보지 않는다.
    const nameMatches = normalizedName.length >= 2 && normalizedQuestion.includes(normalizedName);
    const floorMatches = !requestedFloor || normalizeAssetText(assetFloor) === normalizeAssetText(requestedFloor);
    return nameMatches && floorMatches;
  });

  if (!matches.length) return "";

  if (quantityIntent && matches.length === 1) {
    const asset = matches[0];
    const quantity = asset.quantity ?? "수량 미입력";
    const floor = asset.floor ? ` / ${asset.floor}` : "";
    const spec = asset.spec ? ` / 규격: ${asset.spec}` : "";
    return `${asset.asset_name}${floor}: ${quantity}${spec}`;
  }

  const totalQuantity = matches.reduce((sum, asset) => {
    const quantity = Number(asset.quantity ?? 0);
    return Number.isFinite(quantity) ? sum + quantity : sum;
  }, 0);

  if (quantityIntent && matches.length > 1) {
    const details = matches
      .map((asset) => `- ${asset.asset_name}${asset.floor ? ` / ${asset.floor}` : ""}: ${asset.quantity ?? "수량 미입력"}${asset.spec ? ` / 규격: ${asset.spec}` : ""}`)
      .join("\n");
    return `조회된 자산 총 수량: ${totalQuantity}\n${details}`;
  }

  return matches
    .map((asset) => `- ${asset.asset_name}${asset.floor ? ` / ${asset.floor}` : ""}${asset.quantity !== null && asset.quantity !== undefined ? ` / ${asset.quantity}` : ""}${asset.spec ? ` / 규격: ${asset.spec}` : ""}`)
    .join("\n");
}

export function answerCoffeeBreakQuestion(question: string, eventData: unknown[]) {
  if (!/(커피\s*브레이크|coffee\s*break)/i.test(question)) return "";

  const dateFilter = resolveEventDateFilter(question, new Date());
  const matches: Array<{ eventName: string; date: string; time: string; content: string }> = [];
  (Array.isArray(eventData) ? eventData : []).forEach((eventValue) => {
    const event = eventValue as Record<string, unknown>;
    const schedules = Array.isArray(event.schedules) ? event.schedules as Array<Record<string, unknown>> : [];
    const calendarDates = Array.isArray(event.calendarDates) ? event.calendarDates.map(String) : [];
    const matchCountBeforeEvent = matches.length;
    schedules.forEach((schedule) => {
      if (!/(커피\s*브레이크|coffee\s*break)/i.test(String(schedule.content ?? ""))) return;
      const date = normalizeDateKey(schedule.date) || calendarDates[0] || normalizeDateKey(event.eventDateTime);
      if (dateFilter && (!date || !dateFilter(date))) return;
      matches.push({
        eventName: String(event.eventName || "행사명 미입력"),
        date,
        time: String(schedule.time || "").trim(),
        content: String(schedule.content || "커피브레이크").trim(),
      });
    });
    if (matches.length !== matchCountBeforeEvent) return;

    const mealTypes = Array.isArray(event.mealTypes) ? event.mealTypes.map(String) : [String(event.mealTypes || "")];
    const items = Array.isArray(event.items) ? event.items as Array<Record<string, unknown>> : [];
    const hasCoffeeBreak = mealTypes.some((value) => /coffee_?break|커피\s*브레이크/i.test(value))
      || items.some((item) => /커피\s*브레이크|coffee\s*break/i.test(String(item.itemName ?? "")));
    if (!hasCoffeeBreak) return;
    const date = calendarDates[0] || normalizeDateKey(event.eventDateTime);
    if (dateFilter && (!date || !dateFilter(date))) return;
    matches.push({ eventName: String(event.eventName || "행사명 미입력"), date, time: "", content: "커피브레이크" });
  });

  const periodLabel = getRequestedPeriodLabel(question);
  if (!matches.length) {
    return `${periodLabel}등록된 행사 데이터에서 커피브레이크 일정을 찾지 못했습니다.`;
  }
  matches.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const details = matches
    .map((item) => `- ${item.date || "날짜 미입력"}${item.time ? ` ${item.time}` : ""} · ${item.eventName} · ${item.content}`)
    .join("\n");
  return `${periodLabel}커피브레이크 일정이 총 ${matches.length}회 있습니다.\n${details}`;
}

function normalizeDateKey(value: unknown) {
  const text = String(value ?? "").trim();
  const match = text.match(/(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function resolveEventDateFilter(question: string, now: Date): ((dateKey: string) => boolean) | null {
  const koreaNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const year = koreaNow.getFullYear();
  const month = koreaNow.getMonth() + 1;
  const today = `${year}-${String(month).padStart(2, "0")}-${String(koreaNow.getDate()).padStart(2, "0")}`;
  if (/오늘/.test(question)) return (dateKey) => dateKey === today;
  const monthMatch = question.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월/);
  if (monthMatch) {
    const requestedYear = Number(monthMatch[1] || year);
    const requestedMonth = Number(monthMatch[2]);
    return (dateKey) => dateKey.startsWith(`${requestedYear}-${String(requestedMonth).padStart(2, "0")}-`);
  }
  if (/이번\s*달/.test(question)) {
    const prefix = `${year}-${String(month).padStart(2, "0")}-`;
    return (dateKey) => dateKey.startsWith(prefix);
  }
  if (/이번\s*주/.test(question)) {
    const day = koreaNow.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(koreaNow);
    monday.setDate(koreaNow.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return (dateKey) => {
      const date = new Date(`${dateKey}T00:00:00`);
      return date >= monday && date <= sunday;
    };
  }
  return null;
}

function getRequestedPeriodLabel(question: string) {
  if (/오늘/.test(question)) return "오늘 ";
  if (/이번\s*주/.test(question)) return "이번 주 ";
  if (/이번\s*달/.test(question)) return "이번 달 ";
  const match = question.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월/);
  return match ? `${match[1] ? `${match[1]}년 ` : ""}${Number(match[2])}월에는 ` : "";
}

function normalizeAssetText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[(){}\[\]_\-./\\|,]/g, "");
}

function buildChatSystemPrompt() {
  return [
    '너는 여수 베네치아 호텔 연회팀 전용 "연회장 AI 비서"다.',
    "",
    "일반 대화에서는 질문 의도에 따라 선택적으로 조회된 Supabase 업무 DB와 승인된 운영 지식만 사용한다.",
    "ai_interviews.answer 원문은 일반 답변의 근거로 사용하지 않는다. ai_interviews는 출처 추적용 학습 로그다.",
    "운영 노하우는 approvedKnowledge, 즉 ai_knowledge.status='approved'인 데이터만 사용한다.",
    "",
    "우선순위:",
    "1. 자산 수량, 행사 일정, 매출, 장소 원문처럼 변하는 값은 원본 업무 테이블을 ai_knowledge보다 우선한다.",
    "2. 운영 판단, 예외 기준, 노하우는 approvedKnowledge를 참고한다.",
    "3. 운영 결과, 사고, 인력 결과, 추천 피드백, 지식 버전 이력은 operationalHistoryData를 참고한다.",
    "4. 도면, 레이아웃 이미지, 검증된 세팅 사례는 venueLayoutImages를 참고한다.",
    "5. 조회된 데이터에 없는 내용은 추측하지 말고 '현재 저장된 데이터에서는 확인되지 않습니다.'라고 답한다.",
    "6. 사용자가 새 정보 저장을 원할 만한 답변을 하면 바로 저장했다고 말하지 말고, 저장 전 사용자 확인이 필요하다고 안내한다.",
    "7. 답변은 연회팀 직원이 바로 사용할 수 있도록 간결하고 실무적으로 작성한다.",
    "8. venueLayoutImages에 public_url이 있으면 관련 레이아웃 이미지 이름과 URL을 함께 안내한다.",
    "9. 답변 끝에는 반드시 '출처:' 줄을 붙이고, 사용한 테이블명을 적는다.",
    "",
    "선택 조회된 데이터 묶음:",
    "- eventData: event_orders, event_calendar_dates, event_schedules, event_items, event_notes",
    "- venueData: venues, venue_spaces, venue_aliases, venue_space_mappings, venue_facilities, layout_rules",
    "- venueLayoutImages: venue_layout_images, files",
    "- banquetAssets: banquet_assets",
    "- recommendItems: banquet_recommend_items",
    "- operationalHistoryData: asset_transactions, event_operation_results, event_incidents, event_staff_results, ai_recommendation_feedback, ai_knowledge_versions",
    "- approvedKnowledge: ai_knowledge(status='approved')",
  ].join("\n");
}
async function supabaseSelect(table: string, query: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`${table} select error:`, body);
    throw new Error(`${table} 議고쉶 ?ㅽ뙣`);
  }

  return body ? JSON.parse(body) : [];
}

async function askAi(input: { question: string; dataContext: ChatDataContext; attachments?: ChatAttachment[] }) {
  const systemPrompt = buildChatSystemPrompt();
  const legacyPrompt = [
    "For learned hotel operation know-how, use only approvedKnowledge rows from ai_knowledge where status='approved'.",
    "Do not read, quote, or rely on raw ai_interviews.answer in normal chat. ai_interviews is only a learning process log.",
    '너는 여수 베네치아 호텔 연회팀 전용 "연회장 AI 비서"다.',
    "",
    "너는 일반 챗봇이 아니라 다음 정보를 바탕으로 답변한다.",
    "1. 행사 데이터(event_orders, schedules, items, notes)",
    "2. 연회장 기본 정보(banquet_hall_specs)",
    "3. 운영 규칙(banquet_operation_rules)",
    "4. 업무 매뉴얼(banquet_manuals)",
    "",
    "현재 eventData에는 event_orders, event_calendar_dates, event_schedules, event_items, event_notes 테이블 조회 결과가 행사별로 합쳐져 있다.",
    "현재 banquetAssets에는 banquet_assets 테이블의 자산명, 층, 수량, 규격 정보가 들어 있다.",
    "자산 질문은 banquetAssets를 최우선으로 사용한다.",
    "사용자가 '라운드 테이블 몇 개', '3층 라운드 테이블', '냉온수기 몇 대'처럼 물으면 banquet_assets의 asset_name, floor, quantity, spec 기준으로 답한다.",
    "asset_name 비교 시 띄어쓰기 차이는 무시한다. 예: '라운드테이블'과 '라운드 테이블'은 같은 자산으로 본다.",
    "banquetAssets에 일치하는 자산 데이터가 있으면 절대 확인되지 않는다고 답하지 않는다.",
    "연회장 기본 정보, 운영 규칙, 업무 매뉴얼 데이터가 제공되지 않은 경우에는 해당 내용은 현재 저장된 데이터에서는 확인되지 않는다고 답한다.",
    '모르는 내용은 추측하지 말고 "현재 저장된 데이터에서는 확인되지 않습니다."라고 답한다.',
    "답변은 연회팀 직원이 바로 사용할 수 있도록 간결하고 실무적으로 작성한다.",
  ].join("\n");


  const userContent = buildChatUserContent(input);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  const body = await response.json().catch(() => null);
  console.log("OpenAI response body:", body);

  if (!response.ok) {
    console.error("OpenAI API error:", body);
    throw new Error(body?.error?.message || "OpenAI API ?몄텧 ?ㅽ뙣");
  }

  const answerText =
    body?.output_text ||
    body?.choices?.[0]?.message?.content ||
    body?.output?.[0]?.content?.[0]?.text;

  if (!answerText) {
    throw new Error("OpenAI response did not include answer text.");
  }

  return answerText;
}

function buildChatUserContent(input: { question: string; dataContext: ChatDataContext; attachments?: ChatAttachment[] }) {
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const textAttachments = attachments
    .filter((attachment) => String(attachment.textContent || "").trim())
    .map((attachment) => ({
      name: attachment.name || attachment.originalFilename || "text attachment",
      mimeType: attachment.mimeType || "text/plain",
      textContent: String(attachment.textContent || "").slice(0, 12000),
    }));
  const attachmentSummary = attachments.map((attachment) => ({
    name: attachment.name || attachment.originalFilename || "",
    mimeType: attachment.mimeType || "",
    type: attachment.type || "",
    size: attachment.size || 0,
    storageBucket: attachment.storageBucket || "",
    storagePath: attachment.storagePath || "",
    hasImageInput: Boolean(attachment.dataUrl && String(attachment.mimeType || "").startsWith("image/")),
    hasTextContent: Boolean(attachment.textContent),
  }));
  const contextText = JSON.stringify({
    question: input.question,
    instruction: [
      "If images are attached, inspect the actual image content and answer based on visible evidence.",
      "Do not guess uncertain image details. Say what is visible and what is not confirmed.",
      "Use ERP data only when it helps answer the user's question.",
    ],
    intent: input.dataContext.intent.labels,
    selectedSources: input.dataContext.sources,
    eventData: input.dataContext.eventData,
    venueData: input.dataContext.venueData,
    venueLayoutImages: input.dataContext.venueLayoutImages,
    banquetAssets: input.dataContext.banquetAssets,
    recommendItems: input.dataContext.recommendItems,
    operationalHistoryData: input.dataContext.operationalHistoryData,
    approvedKnowledge: input.dataContext.approvedKnowledge,
    attachments: attachmentSummary,
    textAttachments,
  });

  const content: Array<Record<string, unknown>> = [
    { type: "input_text", text: contextText },
  ];
  attachments
    .filter((attachment) => String(attachment.mimeType || "").startsWith("image/") && attachment.dataUrl)
    .slice(0, 5)
    .forEach((attachment) => {
      content.push({
        type: "input_image",
        image_url: String(attachment.dataUrl),
      });
    });

  return content;
}

async function askAiForEventOrderAnalysis(input: {
  question: string;
  analysisData: unknown;
  banquetAssets: unknown[];
  calculatedStaff: Record<string, unknown>;
  recommendedItems: Array<Record<string, unknown>>;
  recommendItems: unknown[];
  operationalAnalysis: Record<string, unknown>;
}) {
  const systemPrompt = [
    "You are the banquet operations AI assistant for Venezia Hotel & Suite.",
    "Analyze only the extracted ERP JSON data and banquet asset data. Do not ask for the original Excel file.",
    "Return only valid JSON. Do not wrap it in markdown.",
    "",
    "Required JSON shape:",
    "{",
    "  \"staff\": {",
    "    \"recommended\": number,",
    "    \"operation\": number,",
    "    \"setup\": number,",
    "    \"risk\": \"low\" | \"medium\" | \"high\",",
    "    \"warnings\": string[],",
    "    \"basis\": string[]",
    "    \"excluded\": string[]",
    "  },",
    "  \"beverages\": {",
    "    \"beerBoxes\": number,",
    "    \"sojuBoxes\": number,",
    "    \"colaBoxes\": number,",
    "    \"ciderBoxes\": number",
    "  },",
    "  \"items\": [{ \"name\": string, \"qty\": number | string, \"courseType\"?: string, \"basePeople\"?: number, \"children\"?: [{ \"name\": string, \"qty\": number }] }],",
    "  \"representativePeople\": number,",
    "  \"warnings\": string[],",
    "  \"summary\": string",
    "}",
    "",
    "Rules:",
    "- Seminar under 50 guests: 1 staff.",
    "- Seminar 50 guests or more: 2 staff.",
    "- Buffet or lunchbox: 1 staff per 50 guests.",
    "- Course meal: 1 staff per 15 guests.",
    "- Western course meals detected from schedule, items, or F&B text must use 1 staff per 15 guests.",
    "- Western course keywords include \uC6E8\uC2A4\uD134, \uC591\uC2DD, \uC591\uC2DD\uCF54\uC2A4, Western, \uB514\uB108/\uC6E8\uC2A4\uD134, and \uB514\uB108 / \uC6E8\uC2A4\uD134.",
    "- If a western course line has a guest count such as '*134G', use that guest count for staff calculation. Use representativePeople only when the line has no guest count.",
    "- IMPORTANT: Any schedule whose venue contains Florence or \uD53C\uB80C\uCCB4 must be excluded from banquet staff calculation, regardless of whether it is dinner, buffet, breakfast, lunch, or any other meal.",
    "- IMPORTANT: Any schedule whose venue contains Florence or \uD53C\uB80C\uCCB4 must also be excluded from beverage consumption, cutlery/required-item recommendation, and operation records.",
    "- Do not sum staff across multiple dates.",
    "- First calculate the peak staff needed per date. The recommended staff is the maximum peak staff among dates, not the total of all dates.",
    "- staff.basis must explain each date's counted peak basis, for example: '06/29: seminar 120 people / 3F Convention B / 2 staff'.",
    "- staff.excluded must mention excluded Florence schedules and include 'Florence schedules are excluded from banquet staff calculation.' when any Florence schedule exists.",
    "- If schedules overlap, sum required staff for the overlapping time slot.",
    "- If schedules do not overlap, use the maximum required staff.",
    "- If layout changes from Class Type to Round, add a high-risk flip warning.",
    "- If Lay out & EQP or Others mention booth, banner, snack, coffee break, table move, registration table, podium, hot/cold water dispenser, add warnings/items.",
    "- Alcohol/beverage consumption must be calculated only when explicit alcohol keywords are present: \uB9E5\uC8FC, \uC18C\uC8FC, \uC640\uC778, \uC8FC\uB958, \uD558\uC774\uBCFC, Beer, Wine, Cocktail, Reception. Do not treat Beverage alone as alcohol.",
    "- Do not infer alcohol from seminar, breakfast, lunch, coffee break, or tea break unless explicit alcohol keywords are present.",
    "- Beer: guest count * 1 bottle, 30 bottles per box, only when alcohol is explicitly present.",
    "- Soju: guest count * 0.3 bottle, 24 bottles per box, only when alcohol is explicitly present.",
    "- Cola and cider: guest count * 0.15 bottle each, 24 bottles per box, only when alcohol is explicitly present.",
    "- Coffee break or tea break schedules outside Florence must be returned in records/neededRecords for operation records.",
    "- Required item recommendation must use only recommendedItemsPolicy, which is already filtered from banquet_recommend_items where is_active=true and trigger conditions matched.",
    "- Western course tableware can be returned only when recommendedItemsPolicy includes the calculated western course item with children.",
    "- Western 88,000 course children: main fork x1, main knife x1, appetizer fork x2, appetizer knife x1, dessert fork x1, soup spoon x1, tea spoon x1 per course guest.",
    "- Western 108,000 course children: main fork x1, main knife x1, appetizer fork x3, appetizer knife x2, dessert fork x1, soup spoon x1, tea spoon x1 per course guest.",
    "- Do not invent required items outside recommendedItemsPolicy.",
    "- Do not expose the full banquet_recommend_items master list.",
    "- Florence venue meals are excluded from required item recommendation when the master row has exclude_venues including Florence or \uD53C\uB80C\uCCB4.",
    "- Use banquet_assets only as reference information, never as the source list of required items.",
    "- Be conservative and practical for hotel banquet operations.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            question: input.question,
            extractedEventOrder: input.analysisData,
            banquetAssets: input.banquetAssets,
            activeRecommendItemMaster: input.recommendItems,
            calculatedStaffPolicy: input.calculatedStaff,
            recommendedItemsPolicy: input.recommendedItems,
            operationalAnalysisPolicy: input.operationalAnalysis,
          }),
        },
      ],
    }),
  });

  const body = await response.json().catch(() => null);
  console.log("OpenAI response body:", body);

  if (!response.ok) {
    console.error("OpenAI API error:", body);
    throw new Error(body?.error?.message || "OpenAI API analysis request failed");
  }

  const rawText =
    body?.output_text ||
    body?.choices?.[0]?.message?.content ||
    body?.output?.[0]?.content?.[0]?.text;

  if (!rawText) {
    throw new Error("OpenAI response did not include analysis text.");
  }

  const analysis = parseJsonObject(rawText);
  if (!analysis) {
    return {
      analysis: null,
      rawText,
      message: "AI JSON parsing failed. Raw text is returned as fallback.",
    };
  }

  const analysisRecord = analysis as Record<string, unknown>;
  const staffRecord = (analysisRecord.staff || {}) as Record<string, unknown>;
  const operationalWarnings = ((input.operationalAnalysis.warnings || []) as string[]);
  analysisRecord.staff = {
    ...staffRecord,
    ...input.calculatedStaff,
    warnings: [
      ...new Set([
        ...((staffRecord.warnings || []) as string[]),
        ...((input.calculatedStaff.warnings || []) as string[]),
        ...operationalWarnings,
      ].map((warning) => normalizeWarningText(warning))),
    ],
  };
  analysisRecord.representativePeople = input.operationalAnalysis.representativePeople;
  analysisRecord.warnings = [
    ...new Set([
      ...((analysisRecord.warnings || []) as string[]),
      ...operationalWarnings,
    ].map((warning) => normalizeWarningText(warning))),
  ];
  analysisRecord.beverages = input.operationalAnalysis.beverages;
  analysisRecord.records = input.operationalAnalysis.records;
  analysisRecord.neededRecords = input.operationalAnalysis.records;
  analysisRecord.items = input.recommendedItems;
  analysisRecord.summary = "";

  return {
    analysis: analysisRecord,
    rawText,
  };
}

async function askAiForInterviewKnowledge(interview: Record<string, unknown>) {
  const systemPrompt = [
    "You are a new banquet team AI employee learning hotel operation know-how from senior staff.",
    "Your task is not to force every answer into existing UUIDs. Preserve the original natural-language answer and separately structure what you understood.",
    "Use UUID/entity fields only when the interview already provides an official entity_type/entity_id. Do not invent UUIDs.",
    "Choose the best category automatically. Allowed categories include layout, staffing, equipment, food, beverage, operation, venue, and general.",
    "If the answer is ambiguous or missing an important condition, set needs_follow_up=true and ask one practical follow-up question.",
    "Return only valid JSON. Do not wrap it in markdown.",
    "",
    "Required JSON shape:",
    "{",
    "  \"summary\": \"사용자 답변을 자연어로 정리한 내용\",",
    "  \"knowledge\": [",
    "    {",
    "      \"category\": \"layout\",",
    "      \"subject\": \"부라노1\",",
    "      \"predicate\": \"recommended_grid\",",
    "      \"object\": \"부라노3\",",
    "      \"value\": \"3열 8줄\",",
    "      \"natural_language\": \"부라노1은 세미나 기준 3열 8줄까지 가능하고 다과가 있으면 3열 7줄이 적당합니다.\",",
    "      \"object_value\": \"3열 8줄\",",
    "      \"explanation\": \"다과가 있으면 3열 7줄이 적당합니다.\",",
    "      \"reason\": \"condition: 다과 없음\",",
    "      \"confidence\": 0.95",
    "    }",
    "  ],",
    "  \"needs_follow_up\": true,",
    "  \"follow_up_question\": \"추가로 확인할 질문\"",
    "}",
    "",
    "Rules:",
    "- The user's answer text is stored separately as original_answer by the ERP. Do not summarize away important details.",
    "- Do not create or modify official operation DB records such as venue_aliases, layout_rules, or staffing_rules. Only return knowledge candidates.",
    "- Prefer practical predicates such as recommended_layout, recommended_grid, staffing_rule, equipment_needed, exception, operating_tip, venue_alias, capacity_note.",
    "- If a condition exists, put the condition in reason using a short prefix such as \"condition: ...\".",
    "- subject must be a concrete venue, space, facility, rule, asset, or operation concept mentioned by the user.",
    "- predicate must be a stable snake_case relationship or property.",
    "- object should be the compared target or rule target when one exists. Use null or empty string if not applicable.",
    "- value should be the short structured value that answers the predicate.",
    "- natural_language must be the staff-friendly Korean sentence that explains the fact.",
    "- object_value must be a short text value, boolean string, number string, or concise rule.",
    "- explanation must be practical Korean that banquet staff can understand immediately.",
    "- reason is null unless the user provided a condition, exception, or specific reason.",
    "- confidence must be between 0 and 1.",
    "- If the answer is too vague, return an empty knowledge array and set needs_follow_up true.",
    "- Do not invent facts that are not supported by the answer.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            category: interview.category ?? "",
            question: interview.question ?? "",
            questionReason: interview.question_reason ?? "",
            answer: interview.answer ?? "",
            entityType: interview.entity_type ?? null,
            entityId: interview.entity_id ?? null,
          }),
        },
      ],
    }),
  });

  const body = await response.json().catch(() => null);
  console.log("OpenAI interview response body:", body);

  if (!response.ok) {
    console.error("OpenAI interview API error:", body);
    throw new Error(body?.error?.message || "OpenAI interview analysis request failed");
  }

  const rawText =
    body?.output_text ||
    body?.choices?.[0]?.message?.content ||
    body?.output?.[0]?.content?.[0]?.text;

  if (!rawText) {
    throw new Error("OpenAI response did not include interview analysis text.");
  }

  const analysis = parseJsonObject(rawText) as Record<string, unknown> | null;
  if (!analysis || !Array.isArray(analysis.knowledge)) {
    throw new Error("AI interview analysis JSON parsing failed.");
  }

  return {
    summary: String(analysis.summary ?? ""),
    knowledge: analysis.knowledge,
    needs_follow_up: Boolean(analysis.needs_follow_up),
    follow_up_question: String(analysis.follow_up_question ?? ""),
  };
}

async function generateInterviewQuestions() {
  const [knowledgeRows, interviewRows] = await Promise.all([
    safeSupabaseSelect("ai_knowledge", "select=category,subject,predicate,object,value,natural_language,object_value,explanation,reason,confidence,updated_at&status=eq.approved&order=updated_at.desc&limit=200"),
    safeSupabaseSelect("ai_interviews", "select=category,question,question_reason,status&status=in.(pending,answered,confirmed,skipped)&order=created_at.desc&limit=1000"),
  ]);

  if (!knowledgeRows.length) return [];

  const systemPrompt = [
    "You are a banquet ERP knowledge interview planner.",
    "Analyze confirmed operational knowledge and propose follow-up interview questions that fill gaps.",
    "Return only valid JSON. Do not wrap it in markdown.",
    "",
    "Required JSON shape:",
    "{",
    "  \"questions\": [",
    "    {",
    "      \"category\": \"venue_space\",",
    "      \"question\": \"부라노1과 부라노2를 연결해서 사용할 수 있나요?\",",
    "      \"reason\": \"현재 부라노1과 부라노2의 독립 사용 여부만 확인되어 있고 연결 사용 여부는 확인되지 않았습니다.\",",
    "      \"priority\": \"high\"",
    "    }",
    "  ]",
    "}",
    "",
    "Find at most 3 questions.",
    "Look for missing information, ambiguous standards, missing numeric ranges, missing exceptions, conflicting knowledge, and connected facts that need confirmation.",
    "Do not repeat existing interview questions.",
    "Do not create generic questions. Ask practical questions that a banquet manager can answer.",
    "priority must be high, medium, or low.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            confirmedKnowledge: knowledgeRows,
            existingInterviewQuestions: interviewRows.map((row) => ({
              category: row.category,
              question: row.question,
              reason: row.question_reason,
              status: row.status,
            })),
          }),
        },
      ],
    }),
  });

  const body = await response.json().catch(() => null);
  console.log("OpenAI interview question response body:", body);

  if (!response.ok) {
    console.error("OpenAI interview question API error:", body);
    throw new Error(body?.error?.message || "OpenAI interview question generation failed");
  }

  const rawText =
    body?.output_text ||
    body?.choices?.[0]?.message?.content ||
    body?.output?.[0]?.content?.[0]?.text;

  if (!rawText) throw new Error("OpenAI response did not include interview questions.");

  const parsed = parseJsonObject(rawText) as Record<string, unknown> | null;
  const generated = Array.isArray(parsed?.questions) ? parsed.questions as Array<Record<string, unknown>> : [];
  return filterInterviewQuestionCandidates(generated, interviewRows).slice(0, 3);
}

async function safeSupabaseSelect(table: string, query: string) {
  try {
    return await supabaseSelect(table, query);
  } catch (error) {
    console.error(`${table} safe select failed:`, error);
    return [];
  }
}

export function filterInterviewQuestionCandidates(
  candidates: Array<Record<string, unknown>>,
  existingInterviews: Array<Record<string, unknown>>,
) {
  const existingKeys = new Set(existingInterviews.map((row) => normalizeQuestionText(String(row.question || ""))).filter(Boolean));
  const seen = new Set<string>();
  return candidates
    .map((candidate) => ({
      category: String(candidate.category || "general").trim(),
      question: String(candidate.question || "").trim(),
      reason: String(candidate.reason || candidate.question_reason || "").trim(),
      priority: normalizePriority(String(candidate.priority || "medium")),
    }))
    .filter((candidate) => {
      const key = normalizeQuestionText(candidate.question);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      for (const existingKey of existingKeys) {
        if (isSimilarQuestionKey(key, existingKey)) return false;
      }
      return true;
    });
}

export function normalizeQuestionText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function isSimilarQuestionKey(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 10 && b.includes(a)) return true;
  if (b.length >= 10 && a.includes(b)) return true;
  return characterNgramSimilarity(a, b) >= 0.82;
}

function characterNgramSimilarity(left: string, right: string) {
  const toBigrams = (value: string) => {
    const grams = new Set<string>();
    for (let index = 0; index < value.length - 1; index += 1) grams.add(value.slice(index, index + 2));
    return grams;
  };
  const a = toBigrams(left);
  const b = toBigrams(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((gram) => b.has(gram)).length;
  return (2 * intersection) / (a.size + b.size);
}

function normalizePriority(value: string) {
  const priority = value.toLowerCase();
  return ["high", "medium", "low"].includes(priority) ? priority : "medium";
}

function normalizeVenueMatchText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^\s*(?:[123]\s*f|[123]\s*층)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[\s,./_-]*(?:b\d+|地下\d+|지하\s*\d+\s*층?|地下|地下층)/i, "")
    .replace(/^[\s,./_-]*(?:\d+\s*(?:f|층|floor|fl)\s*)/i, "")
    .replace(/^[\s,./_-]*(?:[123456789]\s*층\s*)/i, "")
    .replace(/[Ⅲⅲ]/g, "3")
    .replace(/[Ⅱⅱ]/g, "2")
    .replace(/[Ⅰⅰ]/g, "1")
    .replace(/iii/g, "3")
    .replace(/ii/g, "2")
    .replace(/\bi\b/g, "1")
    .replace(/\s*(?:\+|,|，|·|ㆍ|∙|･|&|＆)\s*/g, "+")
    .replace(/[\s.()（）\[\]{}_\-]/g, "")
    .trim();
}

function getVenueLookupResults(
  venueText: unknown,
  venues: Array<Record<string, unknown>>,
  venueAliases: Array<Record<string, unknown>>,
) {
  const normalizedLookup = normalizeVenueMatchText(venueText);
  const venueResults = venues
    .map((row) => ({
      venue: row.venue_name,
      normalized: normalizeVenueMatchText(row.venue_name),
    }))
    .filter((row) => row.normalized && (
      row.normalized === normalizedLookup
      || normalizedLookup.includes(row.normalized)
      || row.normalized.includes(normalizedLookup)
    ));
  const aliasResults = venueAliases
    .map((row) => ({
      alias: row.alias_name,
      venueId: row.venue_id,
      normalized: normalizeVenueMatchText(row.alias_name),
    }))
    .filter((row) => row.normalized && (
      row.normalized === normalizedLookup
      || normalizedLookup.includes(row.normalized)
      || row.normalized.includes(normalizedLookup)
    ));
  return {
    originalVenue: String(venueText ?? "").trim(),
    normalizedVenue: normalizedLookup,
    normalizedAliases: venueAliases
      .map((row) => ({
        alias: row.alias_name,
        normalized: normalizeVenueMatchText(row.alias_name),
      }))
      .filter((row) => row.normalized),
    venueResults,
    aliasResults,
  };
}

function isKnownVenueText(
  venueText: unknown,
  venues: Array<Record<string, unknown>>,
  venueAliases: Array<Record<string, unknown>>,
) {
  const target = normalizeVenueMatchText(venueText);
  if (!target) return true;
  const venueMatched = venues.some((row) => {
    const venueName = normalizeVenueMatchText(row.venue_name);
    return venueName && (venueName === target || target.includes(venueName) || venueName.includes(target));
  });
  const aliasMatched = venueAliases.some((row) => {
    const alias = normalizeVenueMatchText(row.alias_name);
    return alias && (alias === target || target.includes(alias) || alias.includes(target));
  });
  const debug = getVenueLookupResults(venueText, venues, venueAliases);
  console.log("event schedule venue lookup:", {
    rawVenueName: debug.originalVenue,
    normalizedVenueName: debug.normalizedVenue,
    normalizedAliases: debug.normalizedAliases,
    venueResults: debug.venueResults,
    aliasResults: debug.aliasResults,
    finalMatch: venueMatched ? "venue" : aliasMatched ? "alias" : null,
  });
  if (!venueMatched && !aliasMatched) {
    console.warn("event schedule venue lookup failed:", {
      ...debug,
      aliasSample: venueAliases.slice(0, 20).map((row) => ({
        alias: row.alias_name,
        normalized: normalizeVenueMatchText(row.alias_name),
      })),
      venueSample: venues.slice(0, 20).map((row) => ({
        venue: row.venue_name,
        normalized: normalizeVenueMatchText(row.venue_name),
      })),
    });
  }
  return venueMatched || aliasMatched;
}

function isAuxiliaryScheduleForVenueQuestion(schedule: Record<string, unknown>) {
  const text = `${schedule.content ?? ""} ${schedule.venue ?? ""}`.toLowerCase().replace(/\s+/g, "");
  return /checkin|checkout|체크인|체크아웃|프론트|front|사전준비|준비|리허설|등록|접수|휴식|개회식|폐회식|사진촬영|철수|반입|반출|피렌체|florence/.test(text);
}

function isMajorScheduleForVenueQuestion(schedule: Record<string, unknown>) {
  const content = String(schedule.content ?? "").toLowerCase();
  if (isAuxiliaryScheduleForVenueQuestion(schedule)) return false;
  return /(세미나|회의|교육|강의|워크숍|워크샵|학회|포럼|컨퍼런스|행사|디너|만찬|중식|석식|뷔페|커피\s*브레이크|커피브레이크|티\s*브레이크|티브레이크|연회|리셉션|피로연|웨딩|seminar|meeting|education|lecture|workshop|conference|dinner|buffet|banquet|reception|wedding|coffee\s*break|tea\s*break)/i.test(content);
}

function formatScheduleLabelForQuestion(schedule: Record<string, unknown>) {
  return [
    schedule.schedule_date,
    schedule.schedule_time,
    schedule.content,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" / ") || "주요 일정";
}

function createUnmappedVenueQuestionCandidates(
  schedules: Array<Record<string, unknown>>,
  venues: Array<Record<string, unknown>>,
  venueAliases: Array<Record<string, unknown>>,
) {
  const seen = new Set<string>();
  const candidates: Array<Record<string, unknown>> = [];
  schedules.forEach((schedule) => {
    const venueText = String(schedule.venue ?? "").trim();
    const normalizedVenue = normalizeVenueMatchText(venueText);
    if (!normalizedVenue) {
      if (!isMajorScheduleForVenueQuestion(schedule)) return;
      const scheduleLabel = formatScheduleLabelForQuestion(schedule);
      const key = `missing:${normalizeQuestionText(scheduleLabel)}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      candidates.push({
        category: "venue_mapping",
        question: `이벤트오더 주요 일정 "${scheduleLabel}"의 장소가 비어 있습니다. 실제 사용 행사장은 어디인가요?`,
        reason: `[Verification Question] event_schedules.venue가 비어 있어 venues/venue_aliases 기준 장소 매핑을 할 수 없습니다.`,
        priority: "high",
        detected_value: "",
      });
      return;
    }

    if (isAuxiliaryScheduleForVenueQuestion(schedule)) return;
    if (seen.has(normalizedVenue)) return;
    seen.add(normalizedVenue);
    if (isKnownVenueText(venueText, venues, venueAliases)) return;
    candidates.push({
      category: "venue_mapping",
      question: `이벤트오더 장소명 "${venueText}"은 어떤 행사장 또는 실제 공간을 의미하나요?`,
      reason: `[Verification Question] 저장된 venues/venue_aliases 기준으로 "${venueText}" 장소명을 매핑하지 못했습니다.`,
      priority: "high",
      detected_value: venueText,
    });
  });
  return candidates;
}

function createLearningQuestionCandidates(
  schedules: Array<Record<string, unknown>>,
  venues: Array<Record<string, unknown>>,
  venueAliases: Array<Record<string, unknown>>,
) {
  const seen = new Set<string>();
  const candidates: Array<Record<string, unknown>> = [];
  schedules.forEach((schedule) => {
    if (!isMajorScheduleForVenueQuestion(schedule)) return;
    const venueText = String(schedule.venue ?? "").trim();
    if (!venueText || !isKnownVenueText(venueText, venues, venueAliases)) return;
    const content = String(schedule.content ?? "").trim();
    const people = Number(String(schedule.people ?? "").replace(/[^0-9]/g, "")) || 0;
    const normalizedVenue = normalizeVenueMatchText(venueText);
    const normalizedContent = normalizeQuestionText(content);
    const peopleBand = people >= 150 ? "150명 이상" : people >= 100 ? "100명대" : people >= 50 ? "50명대" : people > 0 ? "50명 미만" : "인원 미확인";
    const key = `${normalizedVenue}:${normalizedContent}:${peopleBand}`;
    if (!normalizedVenue || !normalizedContent || seen.has(key)) return;
    seen.add(key);

    if (/(세미나|회의|교육|강의|워크숍|워크샵|학회|포럼|컨퍼런스|seminar|meeting|education|lecture|workshop|conference)/i.test(content)) {
      candidates.push({
        category: "learning_layout",
        question: `${venueText}에서 ${people ? `${people}명 ` : ""}${content}를 운영할 때 권장 레이아웃과 주의할 점은 무엇인가요?`,
        reason: `[Learning Question] 이벤트오더에서 장소·인원·행사유형 조합을 발견했습니다. 신입 직원처럼 운영 노하우를 배우기 위한 질문입니다.`,
        priority: "medium",
        detected_value: `${venueText} / ${people || "인원 미확인"}명 / ${content}`,
      });
    }

    if (/(뷔페|디너|만찬|중식|석식|연회|리셉션|피로연|웨딩|buffet|dinner|banquet|reception|wedding)/i.test(content)) {
      candidates.push({
        category: "learning_operation",
        question: `${venueText}에서 ${people ? `${people}명 ` : ""}${content} 진행 시 인력 배치, 기물 준비, 세팅 전환 기준은 어떻게 잡으면 되나요?`,
        reason: `[Learning Question] 식음/연회 운영 노하우를 학습하기 위한 질문입니다.`,
        priority: "medium",
        detected_value: `${venueText} / ${people || "인원 미확인"}명 / ${content}`,
      });
    }
  });
  return candidates;
}

async function analyzeEventOrderKnowledgeGaps(eventOrderId: string) {
  const id = eventOrderId.trim();
  if (!id) return { ok: false, questions: [], message: "행사 ID가 없습니다." };
  console.log("analyzeEventOrderKnowledgeGaps start:", { eventOrderId: id });

  const [eventRows, calendarDates, schedules, items, notes] = await Promise.all([
    safeSupabaseSelect("event_orders", `select=*&id=eq.${encodeURIComponent(id)}&limit=1`),
    safeSupabaseSelect("event_calendar_dates", `select=*&event_order_id=eq.${encodeURIComponent(id)}&order=calendar_date.asc`),
    safeSupabaseSelect("event_schedules", `select=*&event_order_id=eq.${encodeURIComponent(id)}&order=created_at.asc`),
    safeSupabaseSelect("event_items", `select=*&event_order_id=eq.${encodeURIComponent(id)}&order=created_at.asc`),
    safeSupabaseSelect("event_notes", `select=*&event_order_id=eq.${encodeURIComponent(id)}&order=created_at.asc`),
  ]);
  const eventOrder = eventRows[0];
  if (!eventOrder) return { ok: false, questions: [], message: "행사 데이터를 찾지 못했습니다." };
  console.log("event order knowledge gap source rows:", {
    eventOrderId: id,
    calendarDateCount: calendarDates.length,
    scheduleCount: schedules.length,
    itemCount: items.length,
    noteCount: notes.length,
  });

  const [
    venues,
    venueSpaces,
    venueAliases,
    venueSpaceMappings,
    venueFacilities,
    requiredItemRules,
    beverageRules,
    banquetAssets,
    confirmedKnowledge,
    existingInterviews,
  ] = await Promise.all([
    safeSupabaseSelect("venues", "select=id,venue_name,venue_code&order=venue_name.asc"),
    safeSupabaseSelect("venue_spaces", "select=id,space_name,space_code,floor&order=space_name.asc"),
    safeSupabaseSelect("venue_aliases", "select=alias_name,venue_id&order=alias_name.asc"),
    safeSupabaseSelect("venue_space_mappings", "select=venue_id,space_id,sort_order"),
    safeSupabaseSelect("venue_facilities", "select=space_id,facility_name,quantity,spec"),
    safeSupabaseSelect("required_items_rules", "select=*&limit=200"),
    safeSupabaseSelect("beverages_rules", "select=*&limit=200"),
    safeSupabaseSelect("banquet_assets", "select=asset_name,floor,location,quantity,spec&order=asset_name.asc"),
    safeSupabaseSelect("ai_knowledge", "select=category,subject,predicate,object,value,natural_language,object_value,explanation,reason,confidence&status=eq.approved&order=updated_at.desc&limit=300"),
    safeSupabaseSelect("ai_interviews", "select=category,question,question_reason,status,source_type,source_id&status=in.(pending,answered,confirmed,skipped)&order=created_at.desc&limit=1000"),
  ]);
  const deterministicVenueCandidates = createUnmappedVenueQuestionCandidates(schedules, venues, venueAliases);
  const learningCandidates = createLearningQuestionCandidates(schedules, venues, venueAliases);
  console.log("deterministic unmapped venue question candidates:", deterministicVenueCandidates);
  console.log("learning question candidates:", learningCandidates);

  const systemPrompt = [
    "You are a banquet ERP knowledge gap reviewer.",
    "Review one newly saved event order against existing venue, rules, assets, and confirmed AI knowledge.",
    "Create two kinds of questions: Verification Questions and Learning Questions.",
    "Verification Questions confirm missing, conflicting, unknown, or unmapped data.",
    "Learning Questions help the AI learn operational know-how like layout, staffing, equipment, food, beverage, operation, and venue tips from senior staff.",
    "Do not ask about customer name, event name, dates, times, normal extracted guest counts, staff names, or venue terms that are already mapped.",
    "Venue mapping rule: event_orders does not have one representative venue_id. Inspect event_schedules.venue values. Ask only about raw schedule venue strings that cannot be matched to venue_aliases.alias_name or venues.venue_name.",
    "If a major banquet schedule row has an empty event_schedules.venue value, create a venue_mapping question. Exclude auxiliary rows such as check-in, check-out, front desk, Florence restaurant, registration, rehearsal, setup, break, opening, closing, photo, loading, and teardown.",
    "For mapped venues, you may ask Learning Questions about practical operation know-how for the venue + people + event type combination.",
    "Do not ask generic questions. Ask practical confirmation questions only.",
    "If there is nothing meaningful to confirm, return an empty questions array.",
    "Return only valid JSON. Do not wrap it in markdown.",
    "",
    "Required JSON shape:",
    "{",
    "  \"questions\": [",
    "    {",
    "      \"category\": \"venue_mapping\",",
    "      \"question\": \"‘부라노Ⅰ·Ⅱ·Ⅲ’은 부라노1+2+3을 의미하나요?\",",
    "      \"reason\": \"업로드된 장소명을 기존 공간 매핑에서 찾을 수 없습니다.\",",
    "      \"priority\": \"high\",",
    "      \"detected_value\": \"부라노Ⅰ·Ⅱ·Ⅲ\"",
    "    }",
    "  ]",
    "}",
    "",
    "priority must be high, medium, or low.",
    "Limit to at most 3 questions.",
  ].join("\n");

  let generated: Array<Record<string, unknown>> = [];
  try {
    const openAiPayload = {
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            eventOrder,
            calendarDates,
            schedules,
            items,
            notes,
              deterministicVenueCandidates,
              learningCandidates,
            referenceData: {
              venues,
              venueSpaces,
              venueAliases,
              venueSpaceMappings,
              venueFacilities,
              requiredItemRules,
              beverageRules,
              banquetAssets,
              confirmedKnowledge,
              existingInterviews,
            },
          }),
        },
      ],
    };
    console.log("OpenAI event order knowledge gap request payload:", {
      model: openAiPayload.model,
      eventOrderId: id,
      deterministicVenueCandidateCount: deterministicVenueCandidates.length,
    });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openAiPayload),
    });

    const body = await response.json().catch(() => null);
    console.log("OpenAI event order knowledge gap response body:", body);
    if (!response.ok) {
      console.error("OpenAI event order knowledge gap API error:", body);
      throw new Error(body?.error?.message || "OpenAI event order knowledge gap generation failed");
    }

    const rawText =
      body?.output_text ||
      body?.choices?.[0]?.message?.content ||
      body?.output?.[0]?.content?.[0]?.text;
    if (!rawText) throw new Error("OpenAI response did not include event order knowledge gap questions.");

    const parsed = parseJsonObject(rawText) as Record<string, unknown> | null;
    generated = Array.isArray(parsed?.questions) ? parsed.questions as Array<Record<string, unknown>> : [];
  } catch (error) {
    console.error("OpenAI event order knowledge gap generation failed:", error);
    if (!deterministicVenueCandidates.length) throw error;
  }

  const candidates = filterEventOrderQuestionCandidates([
    ...deterministicVenueCandidates,
    ...learningCandidates,
    ...generated,
  ], existingInterviews).slice(0, 3);
  console.log("event order knowledge gap filtered candidates:", candidates);
  const inserted = await insertEventOrderInterviewQuestions(id, candidates);
  console.log("event order knowledge gap inserted questions:", inserted);
  return {
    ok: true,
    questions: inserted,
    message: inserted.length
      ? `AI가 확인이 필요한 항목 ${inserted.length}개를 발견했습니다.`
      : "AI 검토 결과 추가 확인이 필요한 항목은 없습니다.",
  };
}

function filterEventOrderQuestionCandidates(
  candidates: Array<Record<string, unknown>>,
  existingInterviews: Array<Record<string, unknown>>,
) {
  const blockedKeywords = ["고객", "고객사", "행사명", "날짜", "시간", "담당자", "담당"];
  return filterInterviewQuestionCandidates(candidates, existingInterviews)
    .filter((candidate) => {
      const text = `${candidate.category} ${candidate.question} ${candidate.reason}`.toLowerCase();
      return !blockedKeywords.some((keyword) => text.includes(keyword));
    });
}

async function insertEventOrderInterviewQuestions(eventOrderId: string, candidates: Array<Record<string, unknown>>) {
  if (!candidates.length) return [];
  const existing = await safeSupabaseSelect(
    "ai_interviews",
    "select=question,status&status=in.(pending,answered,confirmed,skipped)&order=created_at.desc&limit=1000",
  );
  const existingKeys = existing.map((row) => normalizeQuestionText(String(row.question || ""))).filter(Boolean);
  const now = new Date().toISOString();
  const rows = candidates
    .filter((candidate) => {
      const key = normalizeQuestionText(String(candidate.question || ""));
      return key && !existingKeys.some((existingKey) => isSimilarQuestionKey(key, existingKey));
    })
    .map((candidate) => ({
      category: String(candidate.category || "event_order").trim(),
      question: String(candidate.question || "").trim(),
      question_reason: String(candidate.reason || candidate.question_reason || "").trim(),
      priority: normalizePriority(String(candidate.priority || "medium")),
      status: "pending",
      source_type: "event_order",
      source_id: eventOrderId,
      entity_type: "event_order",
      entity_id: eventOrderId,
      created_at: now,
    }));
  if (!rows.length) return [];
  const inserted = await supabaseInsert("ai_interviews", rows);
  console.log("ai_interviews insert result:", inserted);
  return inserted.map((row) => ({
    category: row.category,
    question: row.question,
    reason: row.question_reason,
    priority: row.priority,
  }));
}

async function createPostEventReviewQuestions() {
  const today = getKoreaDateKey(new Date());
  const targetDate = addDaysKey(today, -1);
  const eventRows = await safeSupabaseSelect(
    "event_orders",
    `select=id,event_name,event_datetime,venue,end_date&end_date=eq.${targetDate}&order=end_date.asc`,
  );
  if (!eventRows.length) return { created: 0, questions: [] };

  const eventIds = eventRows.map((row) => String(row.id || "")).filter(Boolean);
  const existingRows = eventIds.length
    ? await safeSupabaseSelect(
        "ai_interviews",
        `select=source_id,status&category=eq.post_event_review&source_type=eq.event_order&source_id=in.(${eventIds.join(",")})&status=in.(pending,answered,confirmed,skipped)`,
      )
    : [];
  const existingIds = new Set(existingRows.map((row) => String(row.source_id || "")));
  const now = new Date().toISOString();
  const rows = eventRows
    .filter((eventOrder) => !existingIds.has(String(eventOrder.id || "")))
    .map((eventOrder) => ({
      category: "post_event_review",
      question: `${eventOrder.event_name || "종료된 행사"} 진행 후 특이사항, 변경사항, 문제점, 다음 행사 참고사항이 있었나요?`,
      question_reason: "행사 종료 다음날 운영 회고를 내부 메모로 남기기 위해 확인합니다.",
      priority: "high",
      status: "pending",
      source_type: "event_order",
      source_id: eventOrder.id,
      entity_type: "event_order",
      entity_id: eventOrder.id,
      created_at: now,
    }));
  if (!rows.length) return { created: 0, questions: [] };
  const inserted = await supabaseInsert("ai_interviews", rows);
  return {
    created: inserted.length,
    questions: inserted.map((row) => ({
      id: row.id,
      question: row.question,
      eventOrderId: row.source_id,
    })),
  };
}

function getKoreaDateKey(date: Date) {
  const korea = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return korea.toISOString().slice(0, 10);
}

function addDaysKey(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

async function supabaseInsert(table: string, rows: Array<Record<string, unknown>>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`${table} insert error:`, body);
    throw new Error(`${table} insert failed`);
  }
  return body ? JSON.parse(body) : [];
}

function calculateOperationalAnalysis(analysisData: unknown) {
  const eventData = (analysisData || {}) as Record<string, unknown>;
  const schedule = getScheduleRows(eventData);
  const analysisSchedule = getNonFlorenceScheduleRows(eventData);
  const representativePeople = Math.max(0, ...analysisSchedule.map((row) => toNumber(row.people)).filter((people) => people > 0));
  const layoutEqpText = removeFlorenceLines(String(eventData.layoutEqpText || ""));
  const othersText = removeFlorenceLines(String(eventData.othersText || ""));
  const layoutText = `${layoutEqpText}\n${othersText}`;
  const hasBuffet = analysisSchedule.some((row) => isBuffetContent(String(row.content || "")));
  const hasFlorence = schedule.some((row) => isFlorenceVenue(String(row.venue || "")));
  const hasClassLayout = /(class\s*type|\uC2A4\uCFE8\uC2DD|\uD074\uB798\uC2A4|\uC138\uBBF8\uB098\s*\uD14C\uC774\uBE14|seminar\s*table)/i.test(layoutText);
  const hasRoundLayout = /(round|\uB77C\uC6B4\uB4DC|round\s*type)/i.test(layoutText);
  const flipDetected = detectFlipTransition(analysisSchedule) || (hasClassLayout && hasBuffet && (hasRoundLayout || hasBuffet));
  const warnings: string[] = [];
  if (flipDetected) warnings.push("Class Type \u2192 Round Type \uC804\uD658\uC73C\uB85C \uB4A4\uC9D1\uAE30 \uAC00\uB2A5\uC131\uC774 \uB192\uC2B5\uB2C8\uB2E4.");

  return {
    representativePeople,
    hasBuffet,
    hasFlorence,
    hasClassLayout,
    hasRoundLayout,
    needsFlip: flipDetected,
    warnings,
    beverages: calculateBeveragesForEvent(eventData, representativePeople),
    records: detectCoffeeTeaBreakRecords(eventData),
  };
}

function calculateBeveragesForEvent(eventData: Record<string, unknown>, representativePeople: number) {
  const contextText = getRecommendationContextText(eventData);
  if (!hasAlcoholMention(contextText)) {
    return {
      hasAlcohol: false,
      beerBoxes: 0,
      sojuBoxes: 0,
      colaBoxes: 0,
      ciderBoxes: 0,
      message: "\uC74C\uC8FC\uB958 \uC900\uBE44 \uC5C6\uC74C",
    };
  }
  return {
    hasAlcohol: true,
    ...calculateBeverageBoxes(representativePeople),
  };
}

function calculateBeverageBoxes(representativePeople: number) {
  const people = Math.max(0, representativePeople || 0);
  return {
    beerBoxes: Math.ceil((people * 1) / 30),
    sojuBoxes: Math.ceil((people * 0.3) / 24),
    colaBoxes: Math.ceil((people * 0.15) / 24),
    ciderBoxes: Math.ceil((people * 0.15) / 24),
  };
}

function detectFlipTransition(schedule: Array<Record<string, unknown>>) {
  const rows = schedule
    .map((row) => ({
      date: String(row.date || row.scheduleDate || ""),
      time: String(row.time || ""),
      content: String(row.content || ""),
      venue: String(row.venue || ""),
      startMinute: parseStartMinute(String(row.time || "")),
      endMinute: parseEndMinute(String(row.time || "")),
    }))
    .filter((row) => row.date && !isFlorenceVenue(row.venue))
    .sort((a, b) => a.date.localeCompare(b.date) || ((Number.isFinite(a.startMinute) ? a.startMinute : 99999) - (Number.isFinite(b.startMinute) ? b.startMinute : 99999)));

  for (let index = 0; index < rows.length - 1; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];
    if (current.date !== next.date) continue;
    if (!isSameBanquetArea(current.venue, next.venue)) continue;
    if (!isSeminarLikeContent(current.content)) continue;
    if (!isBuffetContent(next.content)) continue;
    if (!Number.isFinite(current.endMinute) || !Number.isFinite(next.startMinute)) continue;
    const gap = next.startMinute - current.endMinute;
    if (gap >= 0 && gap <= 60) return true;
  }
  return false;
}

function isSeminarLikeContent(value: string) {
  return /(\uC138\uBBF8\uB098|\uD68C\uC758|\uAD50\uC721|\uD3EC\uB7FC|\uCEE8\uD37C\uB7F0\uC2A4|class\s*type|\uC2A4\uCFE8\uC2DD|\uD074\uB798\uC2A4|seminar)/i.test(value);
}

function isBuffetContent(value: string) {
  return /(\uBDD4\uD398|\uB514\uB108\uBDD4\uD398|\uC11D\uC2DD\uBDD4\uD398|\uC911\uC2DD\uBDD4\uD398|\uB7F0\uCE58\uBDD4\uD398|buffet)/i.test(value);
}

function isSameBanquetArea(left: string, right: string) {
  const a = normalizeRecommendText(left);
  const b = normalizeRecommendText(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const conventionTokens = ["\uCEE8\uBCA4\uC158", "\uCEE8\uBCA4\uC158\uC13C\uD130", "convention", "\uCE74\uD504\uB9AC", "\uBD80\uB77C\uB178", "\uD53C\uC2A4\uD0C0"];
  return conventionTokens.some((token) => a.includes(normalizeRecommendText(token)) && b.includes(normalizeRecommendText(token)));
}

function calculateStaffRecommendation(analysisData: unknown, representativePeople = 0, operationalAnalysis: Record<string, unknown> = {}) {
  const eventData = (analysisData || {}) as Record<string, unknown>;
  const schedule = Array.isArray(eventData.schedule) ? eventData.schedule as Array<Record<string, unknown>> : [];
  const fallbackGuests = representativePeople || toNumber(eventData.guestCount);
  const countedRows: Array<Record<string, unknown>> = [];
  const excluded: string[] = [];
  const warnings: string[] = [];

  for (const row of schedule) {
    const venue = String(row.venue ?? "");
    const content = String(row.content ?? "");
    const date = String(row.date ?? row.scheduleDate ?? "unknown date") || "unknown date";
    const people = toNumber(row.people) || fallbackGuests || 0;
    if (isFlorenceVenue(venue)) {
      excluded.push(`${date}: ${content || "\uC77C\uC815"} ${people ? `${people}\uBA85 ` : ""}/ ${venue} \uD53C\uB80C\uCCB4 \uC81C\uC678`);
      continue;
    }
    if (isStaffExcludedContent(content)) continue;
    const staff = calculateRowStaff(content, people);
    if (staff <= 0) continue;
    countedRows.push({
      date,
      time: String(row.time ?? ""),
      content,
      venue,
      people,
      staff,
      startMinute: parseStartMinute(String(row.time ?? "")),
      endMinute: parseEndMinute(String(row.time ?? "")),
    });
  }

  countedRows.push(...detectWesternCourseStaffRows(eventData, fallbackGuests));

  const byDate = new Map<string, Array<Record<string, unknown>>>();
  for (const row of countedRows) {
    const date = String(row.date || "unknown date");
    byDate.set(date, [...(byDate.get(date) || []), row]);
  }

  const basis: string[] = [];
  const dailyPeaks: number[] = [];
  for (const [date, rows] of byDate.entries()) {
    const peakRows = getDailyPeakRows(rows);
    const peakStaff = peakRows.reduce((sum, row) => sum + (toNumber(row.staff) || 0), 0);
    if (peakStaff > 0) {
      dailyPeaks.push(peakStaff);
      basis.push(...peakRows.map((row) => `${date}: ${row.content || "\uC77C\uC815"} ${row.people || 0}\uBA85 / ${row.staff}\uBA85`));
    }
  }

  if (excluded.length) {
    warnings.push("\uD53C\uB80C\uCCB4 \uC77C\uC815\uC740 \uC5F0\uD68C \uC778\uB825 \uC0B0\uC815\uC5D0\uC11C \uC81C\uC678\uB429\uB2C8\uB2E4.");
  }

  const recommended = dailyPeaks.length ? Math.max(...dailyPeaks) : 0;
  const setupRiskText = `${String(eventData.layoutEqpText || "")}\n${String(eventData.othersText || "")}`;
  const setup = /(class\s*type|round|\uB77C\uC6B4\uB4DC|\uC2A4\uCFE8\uC2DD|\uBD80\uC2A4|\uD604\uC218\uB9C9|\uB2E4\uACFC|\uD14C\uC774\uBE14\s*\uC774\uB3D9|\uB4F1\uB85D\uD14C\uC774\uBE14|\uD3EC\uB514\uC6C0|\uB0C9\uC628\uC218\uAE30)/i.test(setupRiskText) ? 1 : 0;
  const flipRisk = Boolean(operationalAnalysis.needsFlip) || /(class\s*type)[\s\S]*(round|\uB77C\uC6B4\uB4DC)|(round|\uB77C\uC6B4\uB4DC)[\s\S]*(class\s*type)/i.test(setupRiskText);
  if (flipRisk) warnings.push("Class Type \u2192 Round Type \uC804\uD658\uC73C\uB85C \uB4A4\uC9D1\uAE30 \uAC00\uB2A5\uC131\uC774 \uB192\uC2B5\uB2C8\uB2E4.");

  return {
    recommended,
    operation: recommended,
    setup,
    risk: flipRisk || warnings.length >= 2 ? "high" : warnings.length ? "medium" : "low",
    warnings,
    basis,
    excluded,
  };
}

function calculateRecommendedItems(analysisData: unknown, masterItems: unknown[], representativePeople = 0) {
  const eventData = (analysisData || {}) as Record<string, unknown>;
  const guestCount = representativePeople || toNumber(eventData.guestCount);
  const scheduleRows = getNonFlorenceScheduleRows(eventData);
  const sections = buildRecommendSections(eventData);
  const roundTableCount = extractRoundTableCount(`${sections.layoutEqp}\n${sections.others}`);
  const results: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  addMealAndBeverageGlassRecommendations(results, seen, eventData, guestCount);

  for (const rawItem of masterItems || []) {
    const master = rawItem as Record<string, unknown>;
    const keywords = parseMasterList(master.keywords);
    const triggerSections = parseMasterList(master.trigger_section);
    if (!keywords.length || !triggerSections.length) continue;

    const matchContext = findRecommendItemMatch({
      keywords,
      triggerSections,
      sections,
      scheduleRows,
      excludeVenues: parseMasterList(master.exclude_venues),
    });
    if (!matchContext.matched) continue;

    const componentEntries = parseMasterComponents(master.components);
    const basePeople = matchContext.people || extractCoursePeople(matchContext.text || "") || guestCount;
    if (componentEntries.length) {
      const name = String(master.name ?? "").trim();
      const key = normalizeRecommendText(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      results.push({
        name,
        qty: basePeople ? `${basePeople}\uBA85 \uAE30\uC900` : "quantity TBD",
        basePeople,
        category: master.category || "",
        calcType: master.calc_type || "",
        children: calculateComponentChildren(componentEntries, master, basePeople, roundTableCount),
      });
      continue;
    }

    const names = parseMasterList(master.recommended_items);
    const outputNames = names.length ? names : [String(master.name ?? "").trim()].filter(Boolean);
    for (const name of outputNames) {
      const key = normalizeRecommendText(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      results.push({
        name,
        qty: calculateRecommendedItemQty(master, guestCount, roundTableCount),
        category: master.category || "",
        basis: getRecommendationBasis(master, guestCount, roundTableCount),
      });
    }
  }

  if (!results.some((item) => Array.isArray(item.children) && normalizeRecommendText(String(item.name || "")).includes(normalizeRecommendText("\uC591\uC2DD")))) {
    for (const item of detectWesternCourseItems(eventData, guestCount)) {
      const key = normalizeRecommendText(String(item.name || ""));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
  }

  return results;
}

function getScheduleRows(eventData: Record<string, unknown>) {
  return Array.isArray(eventData.schedule) ? eventData.schedule as Array<Record<string, unknown>> : [];
}

function getNonFlorenceScheduleRows(eventData: Record<string, unknown>) {
  return getScheduleRows(eventData).filter((row) => !isFlorenceVenue(String(row.venue || "")));
}

function detectCoffeeTeaBreakRecords(eventData: Record<string, unknown>) {
  return getNonFlorenceScheduleRows(eventData)
    .filter((row) => isCoffeeTeaBreakContent(String(row.content || "")))
    .map((row) => ({
      type: "coffee_tea_break",
      label: "\uCEE4\uD53C\uBE0C\uB808\uC774\uD06C \uC788\uC74C",
      date: String(row.date || row.scheduleDate || ""),
      time: String(row.time || ""),
      people: toNumber(row.people),
      venue: String(row.venue || ""),
      content: String(row.content || ""),
    }));
}

function buildRecommendSections(eventData: Record<string, unknown>) {
  const scheduleRows = getNonFlorenceScheduleRows(eventData);
  const itemRows = Array.isArray(eventData.items) ? eventData.items as Array<Record<string, unknown>> : [];
  return {
    schedule: scheduleRows.map((row) => `${row.date || ""} ${row.time || ""} ${row.content || ""} ${row.venue || ""} ${row.people || ""}`).join("\n"),
    items: itemRows.map((row) => `${row.itemName || row.name || ""} ${row.quantity || ""} ${row.amount || ""}`).join("\n"),
    fnb: removeFlorenceLines(String(eventData.beveragesText || "")),
    beverages: removeFlorenceLines(String(eventData.beveragesText || "")),
    layoutEqp: removeFlorenceLines(String(eventData.layoutEqpText || "")),
    layout: removeFlorenceLines(String(eventData.layoutEqpText || "")),
    others: removeFlorenceLines(String(eventData.othersText || "")),
  } as Record<string, string>;
}

function findRecommendItemMatch(input: {
  keywords: string[];
  triggerSections: string[];
  sections: Record<string, string>;
  scheduleRows: Array<Record<string, unknown>>;
  excludeVenues: string[];
}) {
  for (const sectionName of input.triggerSections) {
    const normalizedSection = normalizeSectionName(sectionName);
    if (normalizedSection === "schedule") {
      for (const row of input.scheduleRows) {
        const rowText = `${row.content || ""} ${row.venue || ""} ${row.time || ""}`;
        if (venueMatchesExclusion(String(row.venue || ""), input.excludeVenues)) continue;
        const keyword = findMatchedKeyword(rowText, input.keywords);
        if (keyword) return { matched: true, reason: `schedule:${keyword}`, text: rowText, people: toNumber(row.people) };
      }
      continue;
    }
    const text = input.sections[normalizedSection] || "";
    const keyword = findMatchedKeyword(text, input.keywords);
    if (keyword) return { matched: true, reason: `${normalizedSection}:${keyword}`, text, people: extractCoursePeople(text) };
  }
  return { matched: false, reason: "", text: "", people: 0 };
}

function calculateRecommendedItemQty(master: Record<string, unknown>, guestCount: number, roundTableCount: number) {
  const calcType = String(master.calc_type || "manual").toLowerCase();
  const defaultQty = toNumber(master.default_qty);
  const multiplier = toNumber(master.multiplier) || 1;
  if (calcType === "per_person") return guestCount ? Math.ceil(guestCount * multiplier) : defaultQty || "quantity TBD";
  if (calcType === "fixed") return defaultQty || "quantity TBD";
  if (calcType === "per_table") return roundTableCount || defaultQty || "quantity TBD";
  return "quantity TBD";
}

function parseMasterComponents(value: unknown) {
  const source = typeof value === "string" && value.trim() ? safeJsonParse(value) : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  return Object.entries(source as Record<string, unknown>)
    .map(([name, multiplier]) => ({
      name: String(name || "").trim(),
      multiplier: toNumber(multiplier),
    }))
    .filter((item) => item.name && item.multiplier > 0);
}

function calculateComponentChildren(
  components: Array<{ name: string; multiplier: number }>,
  master: Record<string, unknown>,
  guestCount: number,
  roundTableCount: number,
) {
  const calcType = String(master.calc_type || "manual").toLowerCase();
  const defaultQty = toNumber(master.default_qty);
  let baseQty = defaultQty || 1;
  if (calcType === "per_person") baseQty = guestCount || defaultQty || 0;
  if (calcType === "per_table") baseQty = roundTableCount || defaultQty || 0;
  const parentName = String(master.name || "").trim();
  return components.map((component) => ({
    name: component.name,
    qty: baseQty ? Math.ceil(baseQty * component.multiplier) : "quantity TBD",
    basis: calcType === "per_person"
      ? component.multiplier === 1
        ? parentName
        : `1\uC778\uB2F9 ${component.multiplier}\uAC1C`
      : `${baseQty} x ${component.multiplier}`,
  }));
}

function getRecommendationBasis(master: Record<string, unknown>, guestCount: number, roundTableCount: number) {
  const calcType = String(master.calc_type || "manual").toLowerCase();
  if (calcType === "per_person") return `${guestCount}\uBA85 \uAE30\uC900`;
  if (calcType === "per_table") return `${roundTableCount}\uD14C\uC774\uBE14 \uAE30\uC900`;
  if (calcType === "fixed") return "\uACE0\uC815 \uC218\uB7C9";
  return "";
}

function addMealAndBeverageGlassRecommendations(
  results: Array<Record<string, unknown>>,
  seen: Set<string>,
  eventData: Record<string, unknown>,
  guestCount: number,
) {
  const basisPeople = guestCount || getMaxSchedulePeople(eventData);
  if (!basisPeople) return;
  const contextText = getRecommendationContextText(eventData);

  if (hasMealForGoblet(contextText)) {
    pushSimpleRecommendedItem(results, seen, "\uACE0\uBE14\uB81B\uC794", basisPeople, "\uC2DD\uC0AC \uD3EC\uD568");
  }

  if (hasAlcoholMention(contextText)) {
    pushSimpleRecommendedItem(results, seen, "\uD558\uC774\uBCFC\uC794", basisPeople, "\uC8FC\uB958 \uD3EC\uD568");
    pushSimpleRecommendedItem(results, seen, "\uC18C\uC8FC\uC794", basisPeople, "\uC8FC\uB958 \uD3EC\uD568");
  }
}

function pushSimpleRecommendedItem(
  results: Array<Record<string, unknown>>,
  seen: Set<string>,
  name: string,
  qty: number,
  basis: string,
) {
  const key = normalizeRecommendText(name);
  if (!key || seen.has(key)) return;
  seen.add(key);
  results.push({
    name,
    qty,
    basis,
    category: "glassware",
  });
}

function getRecommendationContextText(eventData: Record<string, unknown>) {
  const scheduleRows = getNonFlorenceScheduleRows(eventData);
  const itemRows = Array.isArray(eventData.items) ? eventData.items as Array<Record<string, unknown>> : [];
  return [
    removeFlorenceLines(String(eventData.beveragesText || "")),
    removeFlorenceLines(String(eventData.fnbText || "")),
    scheduleRows.map((row) => `${row.content || ""} ${row.venue || ""} ${row.people || ""}`).join("\n"),
    itemRows.map((row) => `${row.itemName || row.name || ""} ${row.unitPrice || ""} ${row.quantity || ""} ${row.amount || ""}`).join("\n"),
  ].join("\n");
}

function removeFlorenceLines(text: string) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !isFlorenceVenue(line))
    .join("\n");
}

function hasMealForGoblet(text: string) {
  if (isLunchboxLike(text)) return false;
  return /(\uC2DD\uC0AC|\uB514\uB108|\uB9CC\uCC2C|\uC870\uC2DD|\uC911\uC2DD|\uC11D\uC2DD|\uD55C\uC2DD|\uC591\uC2DD|\uC591\uC2DD\uCF54\uC2A4|\uC6E8\uC2A4\uD134|western|\uBDD4\uD398|\uCF54\uC2A4|course|dinner|lunch|breakfast|banquet|reception)/i.test(text);
}

function isCoffeeTeaBreakContent(text: string) {
  return /(\uCEE4\uD53C\s*\uBE0C\uB808\uC774\uD06C|\uCEE4\uD53C\uBE0C\uB808\uC774\uD06C|coffee\s*break|\uD2F0\s*\uBE0C\uB808\uC774\uD06C|\uD2F0\uBE0C\uB808\uC774\uD06C|tea\s*break)/i.test(String(text || ""));
}

function hasAlcoholMention(text: string) {
  const value = String(text || "");
  const explicitAlcohol = /(\uC8FC\uB958|\uC18C\uC8FC|\uB9E5\uC8FC|\uC640\uC778|\uC591\uC8FC|\uD558\uC774\uBCFC|\uC74C\uC8FC\uB958|beer|soju|wine|cocktail|reception|whisky|whiskey|highball)/i;
  if (explicitAlcohol.test(value)) return true;
  return /(beverage|beverages)/i.test(value) && explicitAlcohol.test(value.replace(/beverages?/gi, ""));
}

function isLunchboxLike(text: string) {
  return /(\uB3C4\uC2DC\uB77D|\uC0CC\uB4DC\uC704\uCE58\s*\uBC15\uC2A4|\uD14C\uC774\uD06C\uC544\uC6C3\s*\uB3C4\uC2DC\uB77D|lunch\s*box|lunchbox|take\s*out)/i.test(text);
}

function getMaxSchedulePeople(eventData: Record<string, unknown>) {
  const scheduleRows = getNonFlorenceScheduleRows(eventData);
  return Math.max(0, ...scheduleRows.map((row) => toNumber(row.people)).filter((people) => people > 0));
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function detectWesternCourseItems(eventData: Record<string, unknown>, fallbackPeople: number) {
  const detected: Array<Record<string, unknown>> = [];
  const seenCourseTypes = new Set<string>();
  for (const course of detectWesternCourseLines(eventData, fallbackPeople)) {
    const courseAmount = course.courseAmount;
    if (!courseAmount) continue;
    const courseType = `western_${courseAmount}`;
    if (seenCourseTypes.has(courseType)) continue;
    seenCourseTypes.add(courseType);
    detected.push(createWesternCourseRecommendation(courseType, course.basePeople));
  }
  return detected;
}

function detectWesternCourseStaffRows(eventData: Record<string, unknown>, fallbackPeople: number) {
  return detectWesternCourseLines(eventData, fallbackPeople).map((course) => ({
    date: course.date,
    time: course.time,
    content: `${course.label} ${course.basePeople}\uBA85`,
    venue: "F&B",
    people: course.basePeople,
    staff: Math.ceil(course.basePeople / 15),
    startMinute: parseStartMinute(course.time),
    endMinute: parseEndMinute(course.time),
  }));
}

function detectWesternCourseLines(eventData: Record<string, unknown>, fallbackPeople: number) {
  const scheduleRows = Array.isArray(eventData.schedule) ? eventData.schedule as Array<Record<string, unknown>> : [];
  const itemRows = Array.isArray(eventData.items) ? eventData.items as Array<Record<string, unknown>> : [];
  const fallbackDate = String(eventData.startDate || eventData.eventDate || eventData.eventDateTime || "F&B");
  const rawLines = [
    ...String(eventData.beveragesText || "").split(/\r?\n/).map((line) => ({ line, date: fallbackDate, time: "" })),
    ...String(eventData.fnbText || "").split(/\r?\n/).map((line) => ({ line, date: fallbackDate, time: "" })),
    ...scheduleRows.map((row) => ({
      line: `${row.content || ""} ${row.venue || ""} ${row.people || ""}`,
      date: String(row.date || row.scheduleDate || fallbackDate),
      time: String(row.time || ""),
    })),
    ...itemRows.map((row) => ({
      line: `${row.itemName || row.name || ""} ${row.unitPrice || ""} ${row.quantity || ""} ${row.amount || ""}`,
      date: fallbackDate,
      time: "",
    })),
  ];

  const courses: Array<{ courseAmount: number; basePeople: number; date: string; time: string; label: string }> = [];
  const seen = new Set<string>();
  for (const raw of rawLines) {
    const line = String(raw.line || "").trim();
    if (!line || !isWesternCourseLine(line) || isFlorenceVenue(line)) continue;
    const courseAmount = extractWesternCourseAmount(line);
    const basePeople = extractCoursePeople(line) || fallbackPeople || 0;
    if (!basePeople) continue;
    const key = `${raw.date}|${raw.time}|${courseAmount || "course"}|${basePeople}|${normalizeRecommendText(line)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const amountLabel = courseAmount ? `${courseAmount.toLocaleString("ko-KR")}\uC6D0` : "\uC591\uC2DD \uCF54\uC2A4";
    courses.push({
      courseAmount,
      basePeople,
      date: String(raw.date || "F&B"),
      time: String(raw.time || ""),
      label: `\uB514\uB108/\uC6E8\uC2A4\uD134 ${amountLabel}`,
    });
  }
  return courses;
}

function isWesternCourseLine(line: string) {
  return /(\uC6E8\uC2A4\uD134|\uC591\uC2DD|\uC591\uC2DD\s*\uCF54\uC2A4|western|\uB514\uB108\s*\/?\s*(?:\uC6E8\uC2A4\uD134|western))/i.test(line);
}

function extractWesternCourseAmount(line: string) {
  const normalized = String(line || "").replace(/,/g, "");
  const match = normalized.match(/\b(88000|108000)\s*(?:\uC6D0|krw)?\b/i);
  return match ? Number(match[1]) : 0;
}

function extractCoursePeople(line: string) {
  const text = String(line || "");
  const guestMatch = text.match(/(?:\*|x|X)\s*(\d{1,4})\s*(?:G|g|\uBA85|\uC778)?/);
  if (guestMatch) return Number(guestMatch[1]) || 0;
  const amountQuantityMatch = text.replace(/,/g, "").match(/(?:88000|108000)\D+(\d{1,4})(?!\d)/);
  if (amountQuantityMatch) return Number(amountQuantityMatch[1]) || 0;
  const peopleMatch = text.match(/(\d{1,4})\s*(?:G|g|\uBA85|\uC778)\b/);
  return peopleMatch ? Number(peopleMatch[1]) || 0 : 0;
}

function createWesternCourseRecommendation(courseType: string, basePeople: number) {
  const courseAmount = courseType === "western_108000" ? 108000 : 88000;
  const multipliers = courseAmount === 108000
    ? [
        ["\uBA54\uC778\uD3EC\uD06C", 1],
        ["\uBA54\uC778\uB098\uC774\uD504", 1],
        ["\uC5D0\uD53C\uD3EC\uD06C", 3],
        ["\uC5D0\uD53C\uB098\uC774\uD504", 2],
        ["\uB514\uC800\uD2B8\uD3EC\uD06C", 1],
        ["\uC2A4\uD504\uC2A4\uD47C", 1],
        ["\uD2F0\uC2A4\uD47C", 1],
      ]
    : [
        ["\uBA54\uC778\uD3EC\uD06C", 1],
        ["\uBA54\uC778\uB098\uC774\uD504", 1],
        ["\uC5D0\uD53C\uD3EC\uD06C", 2],
        ["\uC5D0\uD53C\uB098\uC774\uD504", 1],
        ["\uB514\uC800\uD2B8\uD3EC\uD06C", 1],
        ["\uC2A4\uD504\uC2A4\uD47C", 1],
        ["\uD2F0\uC2A4\uD47C", 1],
      ];
  return {
    name: "\uC591\uC2DD\uAE30\uBB3C",
    courseType,
    courseAmount,
    basePeople,
    qty: `${courseAmount.toLocaleString("ko-KR")}\uC6D0 course / ${basePeople} people`,
    category: "tableware",
    reason: `western_course:${courseAmount}`,
    children: multipliers.map(([name, multiplier]) => ({
      name,
      qty: Math.ceil(basePeople * Number(multiplier)),
    })),
  };
}

function parseMasterList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  const text = String(value ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  } catch {
  }
  return text
    .split(/[,|\n]/)
    .map((item) => item.trim().replace(new RegExp("^[\\\"'\\[]+|[\\\"'\\]]+$", "g"), ""))
    .filter(Boolean);
}

function normalizeSectionName(value: string) {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");
  if (["layouteqp", "layout", "eqp"].includes(normalized)) return "layoutEqp";
  if (["beverage", "beverages", "bev", "fnb", "f&b", "foodbeverage"].includes(normalized)) return "fnb";
  if (["item", "items"].includes(normalized)) return "items";
  if (["schedule", "schedules"].includes(normalized)) return "schedule";
  if (["others", "other"].includes(normalized)) return "others";
  return normalized;
}

function findMatchedKeyword(text: string, keywords: string[]) {
  const normalizedText = normalizeRecommendText(text);
  return keywords.find((keyword) => normalizedText.includes(normalizeRecommendText(keyword))) || "";
}

function venueMatchesExclusion(venue: string, exclusions: string[]) {
  if (!exclusions.length) return false;
  const normalizedVenue = normalizeRecommendText(venue);
  return exclusions.some((item) => normalizedVenue.includes(normalizeRecommendText(item)));
}

function normalizeRecommendText(value: string) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "").replace(/[(){}\[\]_\-./\\|,]/g, "");
}

function extractRoundTableCount(text: string) {
  const value = String(text || "");
  const roundMatch = value.match(/(?:round|\uB77C\uC6B4\uB4DC)[^\d]{0,10}(\d{1,3})/i);
  if (roundMatch) return Number(roundMatch[1]) || 0;
  const tableMatch = value.match(/(\d{1,3})\s*(?:t|\uD14C\uC774\uBE14|\uAC1C)/i);
  return tableMatch ? Number(tableMatch[1]) || 0 : 0;
}

function isFlorenceVenue(value: string) {
  const normalized = String(value ?? "").toLowerCase().replace(/\s+/g, "");
  return normalized.includes("\uD53C\uB80C\uCCB4") || normalized.includes("florence");
}

function calculateRowStaff(content: string, people: number) {
  const text = String(content ?? "").toLowerCase();
  const guests = Math.max(0, Number(people) || 0);
  if (!guests) return 0;
  if (isStaffExcludedContent(text)) return 0;
  if (isWesternCourseLine(text)) return Math.ceil(guests / 15);
  if (/(\uCF54\uC2A4|course)/i.test(text)) return Math.ceil(guests / 15);
  if (/(\uBDD4\uD398|buffet|\uB3C4\uC2DC\uB77D|lunch\s*box|lunchbox)/i.test(text)) return Math.ceil(guests / 50);
  if (/(\uC138\uBBF8\uB098|seminar|\uD68C\uC758|\uAD50\uC721|\uD3EC\uB7FC|\uCEE8\uD37C\uB7F0\uC2A4|conference)/i.test(text)) return guests >= 50 ? 2 : 1;
  if (!isStaffRequiredContent(text)) return 0;
  return guests >= 50 ? 2 : 1;
}

function isStaffExcludedContent(content: string) {
  return /(check\s*in|check\s*out|\uCCB4\uD06C\uC778|\uCCB4\uD06C\uC544\uC6C3|\uC0AC\uC804\uC900\uBE44|\uC900\uBE44|\uB9AC\uD5C8\uC124|\uB4F1\uB85D|\uC624\uD508\s*\uC694\uCCAD|\uCCA0\uC218|\uBC18\uC785|\uBC18\uCD9C)/i.test(content);
}

function isStaffRequiredContent(content: string) {
  return /(\uC138\uBBF8\uB098|seminar|\uD68C\uC758|\uAD50\uC721|\uAC15\uC758|\uD589\uC0AC|\uB514\uB108|\uB9CC\uCC2C|\uC2DD\uC0AC|\uCEE4\uD53C\s*\uBE0C\uB808\uC774\uD06C|\uC5F0\uD68C|\uB9AC\uC149\uC158|meeting|education|lecture|dinner|meal|coffee\s*break|banquet|reception)/i.test(content);
}

function getDailyPeakRows(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return [];
  const timedRows = rows.filter((row) => Number.isFinite(row.startMinute as number) && Number.isFinite(row.endMinute as number));
  const untimedRows = rows.filter((row) => !Number.isFinite(row.startMinute as number) || !Number.isFinite(row.endMinute as number));
  const bestUntimed = untimedRows.reduce<Record<string, unknown> | null>((best, row) => {
    if (!best) return row;
    return (toNumber(row.staff) || 0) > (toNumber(best.staff) || 0) ? row : best;
  }, null);
  if (!timedRows.length) {
    return [rows.reduce((best, row) => (toNumber(row.staff) || 0) > (toNumber(best.staff) || 0) ? row : best, rows[0])];
  }
  let bestRows: Array<Record<string, unknown>> = [];
  let bestStaff = 0;
  for (const point of timedRows.flatMap((row) => [row.startMinute, row.endMinute]).filter((value) => Number.isFinite(value as number))) {
    const activeRows = timedRows.filter((row) => (toNumber(row.startMinute) || 0) <= (point as number) && (toNumber(row.endMinute) || 0) > (point as number));
    const activeStaff = activeRows.reduce((sum, row) => sum + (toNumber(row.staff) || 0), 0);
    if (activeStaff > bestStaff) {
      bestStaff = activeStaff;
      bestRows = activeRows;
    }
  }
  const bestUntimedStaff = bestUntimed ? toNumber(bestUntimed.staff) || 0 : 0;
  if (bestUntimedStaff > bestStaff) return bestUntimed ? [bestUntimed] : [];
  return bestRows.length ? bestRows : bestUntimed ? [bestUntimed] : [rows[0]];
}

function parseStartMinute(value: string) {
  const match = String(value ?? "").match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseEndMinute(value: string) {
  const matches = [...String(value ?? "").matchAll(/(\d{1,2})\s*:\s*(\d{2})/g)];
  if (matches.length < 2) return Number.NaN;
  const last = matches[matches.length - 1];
  return Number(last[1]) * 60 + Number(last[2]);
}

function toNumber(value: unknown) {
  const number = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function ensureStaffPolicySummary(summary: string, staff: Record<string, unknown>) {
  const warnings = (staff.warnings || []) as string[];
  const additions = [
    "\uD53C\uB80C\uCCB4 \uC77C\uC815\uC740 \uC5F0\uD68C \uC778\uB825 \uC0B0\uC815\uC5D0\uC11C \uC81C\uC678\uB429\uB2C8\uB2E4.",
    "\uCD94\uCC9C \uC778\uC6D0\uC740 \uB0A0\uC9DC\uBCC4 \uCD5C\uB300 \uD544\uC694 \uC778\uC6D0 \uAE30\uC900\uC785\uB2C8\uB2E4.",
    ...warnings.some((warning) => String(warning).toLowerCase().includes("flip"))
      ? ["Class Type \u2192 Round Type \uC804\uD658\uC73C\uB85C \uB4A4\uC9D1\uAE30 \uAC00\uB2A5\uC131\uC774 \uB192\uC2B5\uB2C8\uB2E4."]
      : [],
  ];
  const base = summary.trim();
  return [base, ...additions.filter((line) => !base.includes(line))].filter(Boolean).join(" ");
}

function normalizeWarningText(value: unknown) {
  const warning = String(value || "").trim();
  const lowered = warning.toLowerCase();
  if (!warning) return "";
  if (lowered.includes("class type") && (lowered.includes("round") || lowered.includes("flip"))) {
    return "Class Type \u2192 Round Type \uC804\uD658\uC73C\uB85C \uB4A4\uC9D1\uAE30 \uAC00\uB2A5\uC131\uC774 \uB192\uC2B5\uB2C8\uB2E4.";
  }
  if (lowered.includes("florence") || warning.includes("\uD53C\uB80C\uCCB4")) {
    return "\uD53C\uB80C\uCCB4 \uC77C\uC815\uC740 \uC5F0\uD68C \uC778\uB825 \uC0B0\uC815\uC5D0\uC11C \uC81C\uC678\uB429\uB2C8\uB2E4.";
  }
  if (lowered.includes("daily peak") || lowered.includes("multiple dates")) {
    return "\uCD94\uCC9C \uC778\uC6D0\uC740 \uB0A0\uC9DC\uBCC4 \uCD5C\uB300 \uD544\uC694 \uC778\uC6D0 \uAE30\uC900\uC785\uB2C8\uB2E4.";
  }
  return warning;
}

function parseJsonObject(value: string) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
