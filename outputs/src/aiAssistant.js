/*
 * 역할:
 * - 오른쪽 AI 비서 채팅과 이벤트오더 업로드 후 자동 AI 분석을 담당한다.
 *
 * 왜 분리했는지:
 * - AI 기능은 화면 입력, Edge Function 호출, 응답 파싱, 분석 카드 렌더링이 함께 얽힌 독립 업무 흐름이다.
 * - 엑셀 추출/캘린더/자산관리 코드와 섞이면 AI 프롬프트나 응답 UI를 고칠 때 전체 앱이 흔들린다.
 *
 * 다른 파일과 어떻게 연결되는지:
 * - storage.js의 parseSupabaseResponse를 받아 Edge Function 응답을 안전하게 읽는다.
 * - constants.js의 supabaseConfig를 받아 event-order-ai-chat 함수를 호출한다.
 * - 메인 앱은 현재 미리보기 이벤트와 자산 목록을 getter로 넘기고, AI 상태 변경 시 다시 렌더링하는 콜백을 제공한다.
 *
 * 향후 추가 예정:
 * - 부서별 AI 비서, 자동 체크리스트 생성, 연간 통계 질의, RAG 문서 검색을 같은 컨트롤러 패턴으로 확장할 수 있다.
 */
(function registerBanquetErpAiAssistant() {
  /*
   * 왜 이 함수를 만들었는지:
   * - AI 채팅/자동분석 상태와 DOM 이벤트를 하나의 컨트롤러로 묶기 위해 만들었다.
   *
   * 왜 여기 있어야 하는지:
   * - AI 상태는 캘린더나 자산 저장 상태와 다른 비동기 흐름으로 움직인다.
   *
   * 실무 설계 이유:
   * - AI API 호출부를 격리하면 API 응답 형식, 오류 표시, 분석 카드 UI를 바꿔도 다른 업무 모듈에 영향이 작다.
   */
  function createAiAssistant({ elements, deps, state, callbacks = {} }) {
    const { chatInput, chatMessages, chatSendButton } = elements;
    const { supabaseConfig, parseSupabaseResponse, cleanValue, normalizeMealTypes } = deps;

    let aiAnalysis = null;
    let aiAnalysisRawText = "";
    let aiAnalysisLoading = false;
    let aiAnalysisError = "";

    /*
     * 왜 이 함수를 만들었는지:
     * - 채팅 메시지를 사용자/AI 말풍선 형태로 일관되게 추가하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 채팅 DOM은 AI 비서 패널 전용 UI다.
     *
     * 실무 설계 이유:
     * - 메시지 추가 규칙을 한곳에 두면 사용자 말풍선 색상, 오류 메시지 스타일, 자동 스크롤을 한 번에 관리할 수 있다.
     */
    function appendChatMessage(type, message) {
      const row = document.createElement("div");
      row.className = `chat-message ${type}`;
      const bubble = document.createElement("div");
      bubble.className = "chat-bubble";
      bubble.textContent = message;
      row.append(bubble);
      chatMessages.append(row);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return row;
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 사용자의 자연어 질문을 Supabase Edge Function으로 보내고 답변을 채팅창에 표시하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 질문 입력, 버튼 비활성화, 로딩 메시지, 오류 표시가 모두 AI 비서 패널의 책임이다.
     *
     * 실무 설계 이유:
     * - 프론트엔드는 질문만 보내고 API key는 Edge Function에 숨기는 구조를 유지해야 보안상 안전하다.
     */
    async function handleChatSubmit(event) {
      event.preventDefault();
      const question = chatInput.value.trim();
      if (!question) return;
      appendChatMessage("user", question);
      chatInput.value = "";
      chatSendButton.disabled = true;
      const loadingMessage = appendChatMessage("assistant", "답변을 생성하는 중입니다...");
      try {
        const response = await fetch(supabaseConfig.functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${supabaseConfig.anonKey}`,
          },
          body: JSON.stringify({ question }),
        });
        const body = await parseSupabaseResponse(response);
        if (!response.ok) throw new Error(body.message || "AI 답변 생성에 실패했습니다.");
        loadingMessage.querySelector(".chat-bubble").textContent = body.answer || body.message || "답변을 생성하지 못했습니다.";
      } catch (error) {
        console.error(error);
        loadingMessage.classList.add("error");
        loadingMessage.querySelector(".chat-bubble").textContent = error.message || "AI 답변 생성에 실패했습니다.";
      } finally {
        chatSendButton.disabled = false;
        chatInput.focus();
      }
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - AI 자동 분석에 필요한 행사 JSON만 선별해서 Edge Function으로 보내기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - AI에는 원본 엑셀 파일이 아니라 정리된 업무 데이터만 전달해야 한다.
     *
     * 실무 설계 이유:
     * - API 비용과 개인정보 노출을 줄이고, 응답 품질을 안정화하려면 payload를 명확하게 제한해야 한다.
     */
    function buildAiAnalysisPayload(eventItem) {
      return {
        eventName: eventItem.eventName || "",
        eventDateTime: eventItem.eventDateTime || eventItem.eventDate || "",
        venue: eventItem.venue || eventItem.place || "",
        guestCount: eventItem.guestCount || "",
        schedule: eventItem.schedule || [],
        items: eventItem.items || [],
        beveragesText: eventItem.beveragesText || "",
        layoutEqpText: eventItem.layoutEqpText || "",
        othersText: eventItem.othersText || "",
        eventType: eventItem.eventType || "",
        mealTypes: normalizeMealTypes(eventItem.mealTypes),
        banquetAssets: state.getAssets(),
      };
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 이벤트오더 업로드 직후 사용자가 질문하지 않아도 인력/주의사항/음주류/필요기물을 자동 분석하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 자동 분석은 채팅과 같은 Edge Function을 쓰지만, 화면에는 카드 형태로 표시되는 AI 전용 상태다.
     *
     * 실무 설계 이유:
     * - 업로드 직후 자동 분석을 독립 함수로 두면 나중에 재분석 버튼, 분석 이력 저장, 비용 제한을 붙이기 쉽다.
     */
    async function requestAiAnalysis(eventItem) {
      aiAnalysisLoading = true;
      aiAnalysisError = "";
      aiAnalysis = null;
      aiAnalysisRawText = "";
      callbacks.onAnalysisStateChange?.();
      try {
        const response = await fetch(supabaseConfig.functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${supabaseConfig.anonKey}`,
          },
          body: JSON.stringify({
            mode: "event_order_analysis",
            question: "이번 행사의 인력, 음주류, 필요기물, 주의사항을 분석해줘.",
            analysisData: buildAiAnalysisPayload(eventItem),
          }),
        });
        const body = await parseSupabaseResponse(response);
        if (!response.ok) throw new Error(body.message || "AI 자동 분석에 실패했습니다.");
        aiAnalysisRawText = body.answer || body.text || body.message || "";
        aiAnalysis = body.analysis || parseAiAnalysisJson(aiAnalysisRawText) || body;
      } catch (error) {
        console.error(error);
        aiAnalysisError = error.message || "AI 자동 분석에 실패했습니다.";
      } finally {
        aiAnalysisLoading = false;
        callbacks.onAnalysisStateChange?.();
      }
    }

    function parseAiAnalysisJson(value) {
      const text = cleanValue(value);
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

    /*
     * 왜 이 함수를 만들었는지:
     * - AI 자동 분석 상태를 저장 전 미리보기 화면 안의 카드 섹션으로 렌더링하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 분석 카드 UI는 AI 응답 구조를 가장 잘 아는 aiAssistant.js가 담당해야 한다.
     *
     * 실무 설계 이유:
     * - AI 응답 JSON 구조가 바뀌어도 미리보기 전체 렌더링 코드를 고치지 않고 이 섹션만 수정할 수 있다.
     */
    function createAiAnalysisSection() {
      const section = document.createElement("section");
      section.className = "ai-analysis-section";
      const header = document.createElement("div");
      header.className = "ai-analysis-header";
      header.innerHTML = '<div><h2>AI 자동 분석</h2><p>업로드된 이벤트오더 추출 JSON과 자산관리 데이터를 기준으로 자동 분석합니다.</p></div>';
      section.append(header);

      if (aiAnalysisLoading) {
        const loading = document.createElement("div");
        loading.className = "status";
        loading.textContent = "AI가 인력, 주의사항, 음주류, 필요기물을 분석하는 중입니다.";
        section.append(loading);
        return section;
      }

      if (aiAnalysisError) {
        const error = document.createElement("div");
        error.className = "status error";
        error.textContent = aiAnalysisError;
        section.append(error);
        return section;
      }

      if (!aiAnalysis) {
        const empty = document.createElement("div");
        empty.className = "status";
        empty.textContent = "AI 분석 결과가 아직 없습니다.";
        section.append(empty);
        return section;
      }

      const grid = document.createElement("div");
      grid.className = "ai-analysis-grid";
      grid.append(
        createStaffAnalysisCard(aiAnalysis.staff || {}, aiAnalysis.representativePeople),
        createWarningsAnalysisCard(aiAnalysis.warnings || aiAnalysis.staff?.warnings || [], aiAnalysis.staff?.risk || aiAnalysis.risk),
        createBeverageAnalysisCard(aiAnalysis.beverages || {}),
        createRequiredItemsAnalysisCard(aiAnalysis.items || [])
      );
      section.append(grid);

      if (!parseAiAnalysisJson(aiAnalysisRawText) && aiAnalysisRawText) {
        const fallback = document.createElement("div");
        fallback.className = "ai-analysis-fallback";
        fallback.textContent = aiAnalysisRawText;
        section.append(fallback);
      }
      return section;
    }

    function createStaffAnalysisCard(staff, representativePeople = null) {
      const card = createAnalysisCard("인력 추천");
      const recommended = document.createElement("div");
      recommended.className = "metric";
      recommended.textContent = `${staff.recommended ?? 0}명`;
      const detail = document.createElement("div");
      detail.className = "subtle";
      detail.textContent = `운영 ${staff.operation ?? 0}명 / 세팅 ${staff.setup ?? 0}명`;
      const basisRows = [];
      if (representativePeople) basisRows.push(`대표행사인원: ${Number(representativePeople).toLocaleString("ko-KR")}명 기준`);
      if (Array.isArray(staff.basis)) basisRows.push(...staff.basis);
      if (Array.isArray(staff.reasons)) basisRows.push(...staff.reasons);
      card.append(recommended, detail);
      if (basisRows.length) {
        const basisTitle = document.createElement("div");
        basisTitle.className = "subtle";
        basisTitle.textContent = "근거";
        card.append(basisTitle, createAnalysisList(basisRows.map((basis) => [basis, ""])));
      }
      return card;
    }

    function createWarningsAnalysisCard(warnings, risk) {
      const card = createAnalysisCard("주의사항");
      const riskBadge = document.createElement("span");
      const riskValue = normalizeRiskValue(risk);
      riskBadge.className = `risk-badge risk-${riskValue}`;
      riskBadge.textContent = riskValue;
      card.append(riskBadge, createAnalysisList((warnings || []).map((warning) => [warning, ""])));
      return card;
    }

    function createBeverageAnalysisCard(beverages) {
      const card = createAnalysisCard("음주류 여유준비량");
      const hasAlcohol = beverages.hasAlcohol !== false && (
        Number(beverages.beerBoxes || 0) > 0 ||
        Number(beverages.sojuBoxes || 0) > 0 ||
        Number(beverages.colaBoxes || 0) > 0 ||
        Number(beverages.ciderBoxes || 0) > 0
      );
      if (!hasAlcohol) {
        const empty = document.createElement("div");
        empty.className = "subtle";
        empty.textContent = beverages.message || "음주류 준비 없음";
        card.append(empty);
        return card;
      }
      card.append(createAnalysisList([
        ["맥주", `${beverages.beerBoxes ?? 0}박스`],
        ["소주", `${beverages.sojuBoxes ?? 0}박스`],
        ["콜라", `${beverages.colaBoxes ?? 0}박스`],
        ["사이다", `${beverages.ciderBoxes ?? 0}박스`],
      ]));
      return card;
    }

    function createRequiredRecordsAnalysisCard(records) {
      const card = createAnalysisCard("필요기록");
      const normalizedRecords = Array.isArray(records) ? records : [];
      if (!normalizedRecords.length) {
        const empty = document.createElement("div");
        empty.className = "subtle";
        empty.textContent = "필요기록 없음";
        card.append(empty);
        return card;
      }
      card.append(createAnalysisList(normalizedRecords.map((record) => {
        const date = record.date || record.scheduleDate || "";
        const time = record.time || "";
        const people = Number(record.people || 0) > 0 ? `${Number(record.people).toLocaleString("ko-KR")}명` : "";
        const venue = record.venue || "";
        const content = record.content || "커피브레이크 있음";
        const detail = [date, time, people, venue].filter(Boolean).join(" / ");
        return [content, detail];
      })));
      return card;
    }

    function createRequiredItemsAnalysisCard(items) {
      const card = createAnalysisCard("필요기물");
      const normalizedItems = Array.isArray(items) ? items : [];
      if (!normalizedItems.length) {
        card.append(createAnalysisList([]));
        return card;
      }
      const list = document.createElement("ul");
      list.className = "ai-analysis-list";
      normalizedItems.forEach((item) => {
        const row = document.createElement("li");
        const name = document.createElement("span");
        const children = Array.isArray(item.children) ? item.children : [];
        if (children.length) row.className = "has-children";
        const basisText = item.basis || (Number(item.basePeople || 0) > 0 ? `${Number(item.basePeople).toLocaleString("ko-KR")}명 기준` : "");
        name.textContent = children.length
          ? `${item.name || item.itemName || "기물"}${basisText ? ` / ${basisText}` : ""}`
          : item.name || item.itemName || "기물";
        row.append(name);
        if (!children.length && cleanValue(item.qty ?? item.quantity ?? "")) {
          const qty = document.createElement("strong");
          qty.textContent = `${item.qty ?? item.quantity ?? ""}${item.basis ? ` / ${item.basis}` : ""}`;
          row.append(qty);
        }
        if (children.length) {
          const childList = document.createElement("ul");
          childList.className = "ai-analysis-child-list";
          children.forEach((child) => {
            const childRow = document.createElement("li");
            const childName = document.createElement("span");
            childName.textContent = child.name || child.itemName || "기물";
            const childQty = document.createElement("strong");
            const qtyValue = child.qty ?? child.quantity ?? "";
            const childBasis = child.basis ? ` / ${child.basis}` : "";
            childQty.textContent = cleanValue(qtyValue) ? `${qtyValue}개${childBasis}` : childBasis.replace(/^ \/ /, "");
            childRow.append(childName, childQty);
            childList.append(childRow);
          });
          row.append(childList);
        }
        list.append(row);
      });
      card.append(list);
      return card;
    }

    function createAnalysisCard(titleText) {
      const card = document.createElement("article");
      card.className = "ai-analysis-card";
      const title = document.createElement("h3");
      title.textContent = titleText;
      card.append(title);
      return card;
    }

    function createAnalysisList(rows) {
      const list = document.createElement("ul");
      list.className = "ai-analysis-list";
      const normalizedRows = (rows || []).filter(([label, value]) => cleanValue(label) || cleanValue(value));
      if (!normalizedRows.length) {
        const item = document.createElement("li");
        item.textContent = "확인할 항목이 없습니다.";
        list.append(item);
        return list;
      }
      normalizedRows.forEach(([label, value]) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = label;
        item.append(name);
        if (cleanValue(value)) {
          const qty = document.createElement("strong");
          qty.textContent = value;
          item.append(qty);
        }
        list.append(item);
      });
      return list;
    }

    function normalizeRiskValue(value) {
      const risk = cleanValue(value).toLowerCase();
      return ["low", "medium", "high"].includes(risk) ? risk : "medium";
    }

    return {
      handleChatSubmit,
      requestAiAnalysis,
      createAiAnalysisSection,
      parseAiAnalysisJson,
      createRequiredRecordsAnalysisCard,
    };
  }

  window.BANQUET_ERP_AI_ASSISTANT = {
    createAiAssistant,
  };
})();
