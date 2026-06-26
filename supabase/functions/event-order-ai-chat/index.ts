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

    const { question } = await request.json();
    const cleanQuestion = String(question ?? "").trim();
    if (!cleanQuestion) {
      return jsonResponse({ message: "질문을 입력해주세요." }, 400);
    }

    const [eventData, banquetAssets] = await Promise.all([
      loadEventOrderData(),
      loadBanquetAssets(),
    ]);
    const assetAnswer = answerAssetQuestion(cleanQuestion, banquetAssets);
    if (assetAnswer) {
      return jsonResponse({ answer: assetAnswer });
    }

    const answer = await askAi({
      question: cleanQuestion,
      eventData,
      banquetAssets,
    });

    return jsonResponse({ answer });
  } catch (error) {
    console.error("event-order-ai-chat error:", error);
    return jsonResponse({ message: error?.message || "AI 답변 생성에 실패했습니다." }, 500);
  }
});

function assertServerConfig() {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL 환경변수가 없습니다.");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 환경변수가 없습니다.");
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
  return supabaseSelect("banquet_assets", "select=asset_name,floor,quantity,spec&order=asset_name.asc");
}

function answerAssetQuestion(question: string, banquetAssets: Array<Record<string, unknown>>) {
  if (!banquetAssets.length) return "";

  const normalizedQuestion = normalizeAssetText(question);
  const floorMatch = question.match(/(\d+)\s*층/);
  const requestedFloor = floorMatch?.[1] ? `${floorMatch[1]}층` : "";
  const quantityIntent = /(몇|수량|개|대|있어|보유|재고)/.test(question);
  const assetIntent = /(테이블|냉온수기|스탠드|이젤|flip|chart|자산|비품|장비|몇|수량|보유|재고)/i.test(question);
  if (!assetIntent) return "";

  const matches = banquetAssets.filter((asset) => {
    const assetName = String(asset.asset_name ?? "");
    const assetFloor = String(asset.floor ?? "");
    const normalizedName = normalizeAssetText(assetName);
    const nameParts = assetName
      .split(/\s+/)
      .map((part) => normalizeAssetText(part))
      .filter((part) => part.length >= 2);
    const nameMatches =
      normalizedQuestion.includes(normalizedName) ||
      normalizedName.includes(normalizedQuestion) ||
      nameParts.some((part) => normalizedQuestion.includes(part));
    const floorMatches = !requestedFloor || normalizeAssetText(assetFloor) === normalizeAssetText(requestedFloor);
    return nameMatches && floorMatches;
  });

  if (!matches.length) return "";

  if (quantityIntent && matches.length === 1) {
    const asset = matches[0];
    const quantity = asset.quantity ?? "수량 미입력";
    const floor = asset.floor ? ` / ${asset.floor}` : "";
    const spec = asset.spec ? ` / 규격: ${asset.spec}` : "";
    return `${asset.asset_name}${floor} 자산은 ${quantity}개 있습니다.${spec}`;
  }

  const totalQuantity = matches.reduce((sum, asset) => {
    const quantity = Number(asset.quantity ?? 0);
    return Number.isFinite(quantity) ? sum + quantity : sum;
  }, 0);

  if (quantityIntent && matches.length > 1) {
    const details = matches
      .map((asset) => `- ${asset.asset_name}${asset.floor ? ` / ${asset.floor}` : ""}: ${asset.quantity ?? "수량 미입력"}개${asset.spec ? ` / 규격: ${asset.spec}` : ""}`)
      .join("\n");
    return `조회된 자산은 총 ${totalQuantity}개입니다.\n${details}`;
  }

  return matches
    .map((asset) => `- ${asset.asset_name}${asset.floor ? ` / ${asset.floor}` : ""}${asset.quantity !== null && asset.quantity !== undefined ? ` / ${asset.quantity}개` : ""}${asset.spec ? ` / 규격: ${asset.spec}` : ""}`)
    .join("\n");
}

function normalizeAssetText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[(){}\[\]_\-./\\|·,]/g, "");
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
    throw new Error(`${table} 조회 실패`);
  }

  return body ? JSON.parse(body) : [];
}

async function askAi(input: { question: string; eventData: unknown[]; banquetAssets: unknown[] }) {
  const systemPrompt = [
    "너는 여수 베네치아 호텔 연회팀 전용 \"연회장 AI 비서\"다.",
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
    "사용자가 '라운드 테이블 몇 개', '3층 라운드테이블', '냉온수기 몇 대'처럼 물으면 banquet_assets의 asset_name, floor, quantity, spec 기준으로 답한다.",
    "asset_name 비교 시 띄어쓰기 차이는 무시한다. 예: '라운드테이블'과 '라운드 테이블'은 같은 자산으로 본다.",
    "banquetAssets에 일치하는 자산 데이터가 있으면 절대 확인되지 않는다고 답하지 않는다.",
    "연회장 기본 정보, 운영 규칙, 업무 매뉴얼 데이터가 제공되지 않은 경우에는 해당 내용이 현재 저장된 데이터에서 확인되지 않는다고 답한다.",
    "모르는 내용은 추측하지 말고 \"현재 저장된 데이터에서는 확인되지 않습니다.\"라고 답한다.",
    "답변은 연회팀 직원이 바로 사용할 수 있도록 간결하고 실무적으로 작성한다.",
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
            eventData: input.eventData,
            banquetAssets: input.banquetAssets,
          }),
        },
      ],
    }),
  });

  const body = await response.json().catch(() => null);
  console.log("OpenAI response body:", body);

  if (!response.ok) {
    console.error("OpenAI API error:", body);
    throw new Error(body?.error?.message || "OpenAI API 호출 실패");
  }

  const answerText =
    body?.output_text ||
    body?.choices?.[0]?.message?.content ||
    body?.output?.[0]?.content?.[0]?.text;

  if (!answerText) {
    throw new Error("OpenAI 응답에서 답변 텍스트를 찾지 못했습니다.");
  }

  return answerText;
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
