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
    const {
      chatInput,
      chatMessages,
      chatSendButton,
      interviewPanel,
      aiPageMessages,
      aiPageChatForm,
      aiPageChatInput,
      aiPageChatSendButton,
      aiPageAttachmentInput,
      aiPageAttachmentPreview,
      aiConversationList,
      aiConversationMoreButton,
      aiChatModePanel,
      aiInterviewModePanel,
      aiDirectTeachModePanel,
      aiModeButtons,
      aiReferenceStats,
      aiKnowledgeStats,
      aiLearningStats,
    } = elements;
    const { supabaseConfig, parseSupabaseResponse, supabaseRequest, cleanValue, normalizeMealTypes } = deps;

    let aiAnalysis = null;
    let aiAnalysisRawText = "";
    let aiAnalysisLoading = false;
    let aiAnalysisError = "";
    let currentInterview = null;
    let interviewAnalysis = null;
    let interviewError = "";
    let interviewSuccess = "";
    let interviewLoading = false;
    let interviewEditingAnswer = false;
    let interviewEditingKnowledge = false;
    let isSavingKnowledge = false;
    let followUpRegistered = false;
    let interviewQuestionCandidates = [];
    let interviewQuestionLoading = false;
    let interviewQuestionError = "";
    let eventOrderReviewResult = null;
    let isReviewSaving = false;
    let pendingInterviewCount = 0;
    let directTeachAnswer = "";
    let directTeachInterview = null;
    let directTeachAnalysis = null;
    let directTeachError = "";
    let directTeachSuccess = "";
    let directTeachLoading = false;
    let directTeachEditingKnowledge = false;
    let directTeachSaving = false;
    const deferredInterviewIds = new Set();
    let aiPageInitialized = false;
    let aiPageMode = "chat";
    let activeConversationId = "";
    let aiConversations = [];
    let aiReferenceLoading = false;
    let aiReferenceData = null;
    let aiPendingAttachments = [];

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

    function initializeAiAssistantPage(mode = aiPageMode) {
      if (!aiPageInitialized) {
        startNewAiConversation();
        aiPageInitialized = true;
      }
      setAiPageMode(mode);
      renderConversationList();
      loadAiReferenceStats();
      if (mode === "interview") loadCurrentInterview();
      if (mode === "teach") renderDirectTeachPanel();
      if (aiPageChatInput && mode === "chat") aiPageChatInput.focus();
    }

    function setAiPageMode(mode = "chat") {
      aiPageMode = ["chat", "interview", "teach"].includes(mode) ? mode : "chat";
      aiModeButtons?.forEach((button) => {
        button.classList.toggle("active", button.dataset.aiMode === aiPageMode);
      });
      aiChatModePanel?.classList.toggle("active", aiPageMode === "chat");
      aiInterviewModePanel?.classList.toggle("active", aiPageMode === "interview");
      aiDirectTeachModePanel?.classList.toggle("active", aiPageMode === "teach");
    }

    function startNewAiConversation() {
      const id = `ai-conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      aiConversations = [
        {
          id,
          title: "새 대화",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [{
            type: "assistant",
            text: "안녕하세요. 저장된 행사, 자산, 공간 정보와 공식 지식을 기준으로 답변합니다.",
          }],
        },
        ...aiConversations,
      ];
      activeConversationId = id;
      renderAiPageMessages();
      renderConversationList();
    }

    function getActiveConversation() {
      return aiConversations.find((conversation) => conversation.id === activeConversationId) || null;
    }

    function renderAiPageMessages() {
      if (!aiPageMessages) return;
      const conversation = getActiveConversation();
      aiPageMessages.innerHTML = "";
      (conversation?.messages || []).forEach((message) => {
        aiPageMessages.append(createAiPageMessage(message.type, message.text, message.meta));
      });
      aiPageMessages.scrollTop = aiPageMessages.scrollHeight;
    }

    function createAiPageMessage(type, text, meta = {}) {
      const row = document.createElement("div");
      row.className = `ai-page-message ${type}`;
      if (type === "assistant") {
        const avatar = document.createElement("span");
        avatar.className = "ai-message-avatar";
        avatar.textContent = "AI";
        row.append(avatar);
      }
      const bubble = document.createElement("div");
      bubble.className = "ai-page-bubble";
      if (meta?.attachments?.length) {
        bubble.append(renderMessageAttachments(meta.attachments));
      }
      bubble.append(renderStructuredAiText(text));
      if (meta?.saveSuggestion) {
        bubble.append(createSaveSuggestionCard(meta.saveSuggestion));
      }
      if (meta?.error) row.classList.add("error");
      row.append(bubble);
      return row;
    }

    function createSaveSuggestionCard(suggestion) {
      const card = document.createElement("div");
      card.className = `ai-save-suggestion-card ${suggestion.status || "pending"}`;

      const statusText = {
        saving: "저장 중...",
        saved: "저장 완료",
        dismissed: "제외됨",
        error: "저장 실패",
      }[suggestion.status] || "저장 제안";

      const header = document.createElement("div");
      header.className = "ai-save-suggestion-header";
      header.innerHTML = `
        <span>${escapeHtml(statusText)}</span>
        <strong>${escapeHtml(suggestion.title || "운영 기록으로 저장할까요?")}</strong>
      `;
      card.append(header);

      const body = document.createElement("p");
      body.textContent = suggestion.description || "이 대화 내용은 운영 이력으로 남겨두면 다음 AI 답변에 활용할 수 있습니다.";
      card.append(body);

      if (suggestion.errorMessage) {
        const error = document.createElement("p");
        error.className = "ai-save-suggestion-error";
        error.textContent = suggestion.errorMessage;
        card.append(error);
      }

      if (suggestion.status === "saved") {
        const saved = document.createElement("p");
        saved.className = "ai-save-suggestion-success";
        saved.textContent = `${suggestion.tableLabel || suggestion.table}에 저장했습니다.`;
        card.append(saved);
        return card;
      }

      if (suggestion.status === "dismissed") return card;

      const actions = document.createElement("div");
      actions.className = "ai-save-suggestion-actions";

      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "btn-primary compact";
      saveButton.textContent = suggestion.status === "saving" ? "저장 중..." : "저장";
      saveButton.disabled = suggestion.status === "saving";
      saveButton.addEventListener("click", () => saveOperationalSuggestion(suggestion.id));
      actions.append(saveButton);

      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.className = "btn-secondary compact";
      dismissButton.textContent = "저장하지 않음";
      dismissButton.disabled = suggestion.status === "saving";
      dismissButton.addEventListener("click", () => dismissOperationalSuggestion(suggestion.id));
      actions.append(dismissButton);

      card.append(actions);
      return card;
    }

    function renderStructuredAiText(text) {
      const wrap = document.createElement("div");
      wrap.className = "ai-answer-content";
      const lines = cleanValue(text).split("\n").filter(Boolean);
      if (!lines.length) {
        const empty = document.createElement("p");
        empty.textContent = "답변을 생성하지 못했습니다.";
        wrap.append(empty);
        return wrap;
      }
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (/^[-•]\s+/.test(trimmed)) {
          const item = document.createElement("div");
          item.className = "ai-answer-list-item";
          item.textContent = trimmed.replace(/^[-•]\s+/, "");
          wrap.append(item);
        } else if (/추천|요약|체크리스트|근거|상세/.test(trimmed) && trimmed.length < 40) {
          const title = document.createElement("strong");
          title.textContent = trimmed;
          wrap.append(title);
        } else {
          const p = document.createElement("p");
          p.textContent = trimmed;
          wrap.append(p);
        }
      });
      return wrap;
    }

    function renderConversationList() {
      if (!aiConversationList) return;
      aiConversationList.innerHTML = "";
      const visibleConversations = aiConversations.filter((conversation) => !conversation.isHidden);
      const groups = groupConversationsByDate(visibleConversations);
      Object.entries(groups).forEach(([label, conversations]) => {
        const group = document.createElement("section");
        group.className = "ai-conversation-group";
        const title = document.createElement("h4");
        title.textContent = label;
        group.append(title);
        conversations.slice(0, 8).forEach((conversation) => {
          const item = document.createElement("div");
          item.className = `ai-conversation-item${conversation.id === activeConversationId ? " active" : ""}`;
          item.setAttribute("role", "button");
          item.tabIndex = 0;
          item.innerHTML = `
            <span class="ai-conversation-text">
              <strong>${escapeHtml(conversation.title || "새 대화")}</strong>
              <small>${formatConversationTime(conversation.updatedAt)}</small>
            </span>
            <button class="ai-conversation-hide" type="button" aria-label="대화 숨기기">⋯</button>
          `;
          item.addEventListener("click", () => {
            activeConversationId = conversation.id;
            renderAiPageMessages();
            renderConversationList();
          });
          item.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            activeConversationId = conversation.id;
            renderAiPageMessages();
            renderConversationList();
          });
          item.querySelector(".ai-conversation-hide")?.addEventListener("click", (event) => {
            event.stopPropagation();
            hideConversation(conversation.id);
          });
          group.append(item);
        });
        aiConversationList.append(group);
      });
      if (aiConversationMoreButton) aiConversationMoreButton.hidden = visibleConversations.length <= 8;
    }

    function hideConversation(conversationId) {
      if (!window.confirm("이 대화를 목록에서 숨기시겠습니까?")) return;
      const conversation = aiConversations.find((item) => item.id === conversationId);
      if (!conversation) return;
      conversation.isHidden = true;
      if (activeConversationId === conversationId) {
        activeConversationId = aiConversations.find((item) => !item.isHidden)?.id || "";
        if (!activeConversationId) startNewAiConversation();
      }
      renderAiPageMessages();
      renderConversationList();
    }

    function groupConversationsByDate(conversations) {
      const todayKey = new Date().toDateString();
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      return conversations.reduce((groups, conversation) => {
        const date = new Date(conversation.updatedAt || conversation.createdAt || Date.now());
        const key = date.toDateString() === todayKey ? "오늘" : (date.getTime() >= weekAgo ? "이번 주" : "이전");
        if (!groups[key]) groups[key] = [];
        groups[key].push(conversation);
        return groups;
      }, {});
    }

    function formatConversationTime(value) {
      const date = new Date(value || Date.now());
      return date.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function generateConversationTitle(question) {
      const text = cleanValue(question).replace(/\s+/g, " ").trim();
      if (!text) return "새 대화";

      const compact = text.replace(/\s+/g, "");
      const venueMatch = text.match(/(카프리\s*[ⅠⅡⅢI]{1,3}|카프리\s*\d|부라노\s*[ⅠⅡⅢI]{1,3}|부라노\s*\d|컨벤션\s*[AB]|피렌체|페스타|올리비아)/i);
      const assetMatch = text.match(/([가-힣A-Za-z0-9+ ]{2,18}(?:테이블|의자|이젤|스탠드|냉온수기|마이크|포디움|단상|잔|기물))/i);

      if (/오늘/.test(text) && /(행사|일정|요약|정리)/.test(text)) return "오늘 행사 요약";
      if (/내일/.test(text) && /(인력|배치|직원|스태프)/.test(text)) return "내일 인력 추천";
      if (assetMatch && /(재고|수량|몇|있어|확인)/.test(text)) return limitConversationTitle(`${assetMatch[1].trim()} 재고`);
      if (venueMatch && /(몇\s*명|수용|가능|세미나|배치)/.test(text)) return limitConversationTitle(`${normalizeTitleVenue(venueMatch[1])} 수용인원`);
      if (/(인력|직원|스태프|배치)/.test(text)) return "인력 추천";
      if (/(비슷|유사|과거)/.test(text)) return "유사 행사 조회";
      if (/(자산|재고|기물|장비)/.test(text)) return "자산 재고 확인";
      if (/(캘린더|일정)/.test(text)) return "행사 일정 조회";
      if (/(공간|장소|행사장|레이아웃)/.test(text)) return "공간 운영 문의";

      const cleaned = text
        .replace(/[?？!.,]/g, "")
        .replace(/(알려줘|정리해줘|해줘|가능해|되나요|인가요|있어|좀|주세요)$/g, "")
        .trim();
      return limitConversationTitle(cleaned || compact || "새 대화");
    }

    function normalizeTitleVenue(value) {
      return cleanValue(value)
        .replace(/\s+/g, "")
        .replace(/Ⅰ/g, "1")
        .replace(/Ⅱ/g, "2")
        .replace(/Ⅲ/g, "3")
        .replace(/III/gi, "3")
        .replace(/II/gi, "2")
        .replace(/I/gi, "1");
    }

    function limitConversationTitle(value) {
      const title = cleanValue(value).replace(/\s+/g, " ").trim() || "새 대화";
      return title.length > 18 ? `${title.slice(0, 18)}...` : title;
    }

    async function handleAiPageChatSubmit(event) {
      event.preventDefault();
      const rawQuestion = aiPageChatInput.value.trim();
      const attachmentsToSend = [...aiPendingAttachments];
      const question = rawQuestion || (attachmentsToSend.length ? "이 이미지와 첨부 자료의 내용을 자세히 확인하고, 보이는 정보와 판단 가능한 내용을 설명해주세요." : "");
      if (!question) return;
      if (!getActiveConversation()) startNewAiConversation();
      const conversation = getActiveConversation();
      const userMessage = {
        type: "user",
        text: question,
        meta: { attachments: attachmentsToSend.map((attachment) => ({ ...attachment, file: undefined })) },
      };
      conversation.messages.push(userMessage);
      if (!conversation.title || conversation.title === "새 대화") {
        conversation.title = generateConversationTitle(question);
      }
      conversation.updatedAt = new Date().toISOString();
      aiPageChatInput.value = "";
      aiPendingAttachments = [];
      renderAiAttachmentPreview();
      aiPageChatSendButton.disabled = true;
      conversation.messages.push({ type: "assistant", text: "답변을 생성하는 중입니다..." });
      renderAiPageMessages();
      renderConversationList();
      try {
        const uploadedAttachments = attachmentsToSend.length
          ? await uploadAiAttachments(conversation.id, attachmentsToSend)
          : [];
        userMessage.meta.attachments = uploadedAttachments;
        if (uploadedAttachments.length) {
          conversation.messages[conversation.messages.length - 1] = {
            type: "assistant",
            text: "첨부 파일을 업로드했습니다. 이미지를 분석하는 중입니다...",
          };
          renderAiPageMessages();
        }
        const response = await fetch(supabaseConfig.functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${supabaseConfig.anonKey}`,
          },
          body: JSON.stringify({ question, attachments: uploadedAttachments }),
        });
        const body = await parseSupabaseResponse(response);
        if (!response.ok) throw new Error(body.message || "AI 답변 생성에 실패했습니다.");
        conversation.messages[conversation.messages.length - 1] = {
          type: "assistant",
          text: body.answer || body.message || "답변을 생성하지 못했습니다.",
        };
        const assistantMessage = conversation.messages[conversation.messages.length - 1];
        assistantMessage.meta = {
          saveSuggestion: detectOperationalSaveSuggestion(question, assistantMessage.text),
        };
      } catch (error) {
        console.error(error);
        conversation.messages[conversation.messages.length - 1] = {
          type: "assistant",
          text: error.message || "AI 답변 생성에 실패했습니다.",
          meta: { error: true },
        };
      } finally {
        conversation.updatedAt = new Date().toISOString();
        aiPageChatSendButton.disabled = false;
        renderAiPageMessages();
        renderConversationList();
        aiPageChatInput.focus();
      }
    }

    function handleAiPageInputKeydown(event) {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      if (aiPageChatSendButton.disabled) return;
      aiPageChatForm?.requestSubmit();
    }

    function openAiAttachmentPicker() {
      aiPageAttachmentInput?.click();
    }

    function showAiAttachmentList() {
      if (!aiPendingAttachments.length) {
        window.alert("첨부한 자료가 없습니다.");
        return;
      }
      const names = aiPendingAttachments.map((item, index) => `${index + 1}. ${item.file.name} (${formatFileSize(item.file.size)})`);
      window.alert(names.join("\n"));
    }

    async function handleAiAttachmentSelect(event) {
      const files = Array.from(event.target?.files || []);
      if (!files.length) return;
      const availableSlots = Math.max(0, 5 - aiPendingAttachments.length);
      if (!availableSlots) {
        window.alert("파일은 한 번에 최대 5개까지 첨부할 수 있습니다.");
        aiPageAttachmentInput.value = "";
        return;
      }

      for (const file of files.slice(0, availableSlots)) {
        const validationMessage = validateAiAttachment(file);
        if (validationMessage) {
          window.alert(validationMessage);
          continue;
        }
        aiPendingAttachments.push(await createPendingAttachment(file));
      }

      if (files.length > availableSlots) {
        window.alert("파일은 한 번에 최대 5개까지 첨부할 수 있습니다.");
      }
      aiPageAttachmentInput.value = "";
      renderAiAttachmentPreview();
    }

    function validateAiAttachment(file) {
      const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);
      const extension = getFileExtension(file.name);
      const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "pdf", "txt"]);
      if (!allowedTypes.has(file.type) && !allowedExtensions.has(extension)) return "지원하지 않는 파일 형식입니다.";
      if (file.size > 10 * 1024 * 1024) return "파일은 10MB 이하만 첨부할 수 있습니다.";
      return "";
    }

    async function createPendingAttachment(file) {
      const attachment = {
        id: `attach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        name: file.name,
        mimeType: file.type || guessMimeType(file.name),
        size: file.size,
        type: getAttachmentType(file),
        previewUrl: "",
        dataUrl: "",
        textContent: "",
      };
      if (attachment.type === "image") {
        attachment.dataUrl = await readFileAsDataUrl(file);
        attachment.previewUrl = attachment.dataUrl;
      } else if (attachment.type === "text") {
        attachment.textContent = (await readFileAsText(file)).slice(0, 12000);
      }
      return attachment;
    }

    function renderAiAttachmentPreview() {
      if (!aiPageAttachmentPreview) return;
      aiPageAttachmentPreview.innerHTML = "";
      aiPageAttachmentPreview.hidden = !aiPendingAttachments.length;
      aiPendingAttachments.forEach((attachment) => {
        const item = document.createElement("div");
        item.className = `ai-attachment-chip ${attachment.type}`;
        const preview = attachment.type === "image" && attachment.previewUrl
          ? `<img src="${attachment.previewUrl}" alt="">`
          : `<span class="ai-attachment-file-icon">${attachment.type === "pdf" ? "PDF" : "TXT"}</span>`;
        item.innerHTML = `
          ${preview}
          <span class="ai-attachment-name">${escapeHtml(attachment.name)}</span>
          <small>${formatFileSize(attachment.size)}</small>
          <button type="button" aria-label="첨부 제거">×</button>
        `;
        item.querySelector("button")?.addEventListener("click", () => {
          aiPendingAttachments = aiPendingAttachments.filter((candidate) => candidate.id !== attachment.id);
          renderAiAttachmentPreview();
        });
        aiPageAttachmentPreview.append(item);
      });
    }

    function renderMessageAttachments(attachments = []) {
      const wrap = document.createElement("div");
      wrap.className = "ai-message-attachments";
      attachments.forEach((attachment) => {
        const item = document.createElement("div");
        item.className = `ai-message-attachment ${attachment.type || "file"}`;
        const preview = attachment.type === "image" && attachment.dataUrl
          ? `<img src="${attachment.dataUrl}" alt="">`
          : `<span class="ai-attachment-file-icon">${escapeHtml((attachment.type || "file").toUpperCase())}</span>`;
        item.innerHTML = `${preview}<span>${escapeHtml(attachment.name || attachment.originalFilename || "첨부 파일")}</span>`;
        wrap.append(item);
      });
      return wrap;
    }

    async function uploadAiAttachments(conversationId, attachments) {
      const uploaded = [];
      for (const attachment of attachments) {
        const storagePath = buildAiAttachmentStoragePath(conversationId, attachment.file.name);
        const bucket = supabaseConfig.chatAttachmentBucket || "ai-chat-attachments";
        const uploadUrl = `${supabaseConfig.url}/storage/v1/object/${bucket}/${encodeURIComponent(storagePath)}`;
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${supabaseConfig.anonKey}`,
            "Content-Type": attachment.mimeType || "application/octet-stream",
            "x-upsert": "false",
          },
          body: attachment.file,
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(body || "첨부 파일 업로드에 실패했습니다.");
        }
        const uploadedAttachment = {
          id: attachment.id,
          name: attachment.name,
          originalFilename: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          type: attachment.type,
          storageBucket: bucket,
          storagePath,
          dataUrl: attachment.type === "image" ? attachment.dataUrl : "",
          textContent: attachment.type === "text" ? attachment.textContent : "",
        };
        await saveAiAttachmentMetadata(conversationId, uploadedAttachment);
        uploaded.push(uploadedAttachment);
      }
      return uploaded;
    }

    async function saveAiAttachmentMetadata(conversationId, attachment) {
      try {
        await supabaseRequest("ai_chat_attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversationId,
            storage_bucket: attachment.storageBucket,
            storage_path: attachment.storagePath,
            original_filename: attachment.originalFilename,
            mime_type: attachment.mimeType,
            file_size: attachment.size,
            attachment_type: attachment.type,
          }),
        });
      } catch (error) {
        console.warn("AI attachment metadata save skipped:", error);
      }
    }

    function buildAiAttachmentStoragePath(conversationId, filename) {
      const safeName = sanitizeStorageFilename(filename);
      const uniqueId = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return `anonymous/${conversationId}/${uniqueId}-${safeName}`;
    }

    function sanitizeStorageFilename(filename) {
      const extension = getFileExtension(filename);
      const baseName = cleanValue(filename).replace(/\.[^/.]+$/, "") || "attachment";
      const safeBaseName = baseName
        .normalize("NFKD")
        .replace(/[^\w가-힣-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 80) || "attachment";
      return extension ? `${safeBaseName}.${extension}` : safeBaseName;
    }

    function getAttachmentType(fileOrAttachment) {
      const mimeType = fileOrAttachment.type || fileOrAttachment.mimeType || "";
      const extension = getFileExtension(fileOrAttachment.name || fileOrAttachment.originalFilename || "");
      if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension)) return "image";
      if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
      if (mimeType === "text/plain" || extension === "txt") return "text";
      return "file";
    }

    function getFileExtension(filename) {
      return cleanValue(filename).split(".").pop()?.toLowerCase() || "";
    }

    function guessMimeType(filename) {
      const extension = getFileExtension(filename);
      if (["jpg", "jpeg"].includes(extension)) return "image/jpeg";
      if (extension === "png") return "image/png";
      if (extension === "webp") return "image/webp";
      if (extension === "pdf") return "application/pdf";
      if (extension === "txt") return "text/plain";
      return "application/octet-stream";
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("파일을 읽지 못했습니다."));
        reader.readAsDataURL(file);
      });
    }

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("파일을 읽지 못했습니다."));
        reader.readAsText(file, "utf-8");
      });
    }

    function formatFileSize(size) {
      if (!Number.isFinite(Number(size))) return "";
      if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
      if (size >= 1024) return `${Math.round(size / 1024)}KB`;
      return `${size}B`;
    }

    function detectOperationalSaveSuggestion(question, answer = "") {
      const sourceText = cleanValue(question);
      const compact = sourceText.toLowerCase().replace(/\s+/g, "");
      const base = {
        id: `save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        question: cleanValue(question),
        answer: cleanValue(answer),
        status: "pending",
      };

      if (/(파손|분실|고장|클레임|불만|사고|문제|컴플레인|민원)/i.test(sourceText)) {
        return {
          ...base,
          type: "incident",
          table: "event_incidents",
          tableLabel: "문제/클레임 이력",
          title: "문제 또는 클레임으로 저장",
          description: "행사 운영 중 발생한 문제, 클레임, 사고 이력으로 저장할 수 있습니다.",
        };
      }

      if (/(입고|출고|이동|반납|파손|분실|수량조정|재고조정|asset|자산)/i.test(sourceText)) {
        return {
          ...base,
          type: "asset_transaction",
          table: "asset_transactions",
          tableLabel: "자산 이동 이력",
          title: "자산 이력으로 저장",
          description: "자산 입고, 출고, 이동, 반납, 파손, 분실 이력으로 저장할 수 있습니다.",
        };
      }

      if (/(인력|직원|스태프|staff|부족|충분|투입|배치)/i.test(sourceText)) {
        return {
          ...base,
          type: "staff_result",
          table: "event_staff_results",
          tableLabel: "인력 운영 결과",
          title: "인력 운영 결과로 저장",
          description: "AI 추천 인력과 실제 운영 피드백을 비교하는 자료로 저장할 수 있습니다.",
        };
      }

      if (/(추천|AI추천|추천값|실제결과|평가|피드백|맞았|틀렸|과다|부족)/i.test(sourceText)) {
        return {
          ...base,
          type: "recommendation_feedback",
          table: "ai_recommendation_feedback",
          tableLabel: "AI 추천 피드백",
          title: "AI 추천 피드백으로 저장",
          description: "AI 추천값과 실제 결과의 차이를 학습 피드백으로 저장할 수 있습니다.",
        };
      }

      if (/(운영결과|행사결과|회고|리뷰|실제운영|정산후|마감)/i.test(sourceText)) {
        return {
          ...base,
          type: "operation_result",
          table: "event_operation_results",
          tableLabel: "행사 운영 결과",
          title: "행사 운영 결과로 저장",
          description: "행사 계획과 실제 운영 결과를 비교하는 기록으로 저장할 수 있습니다.",
        };
      }

      if (/(지식|규칙|노하우|기준|변경|수정|폐기|대체)/i.test(sourceText) && compact.includes("저장")) {
        return {
          ...base,
          type: "knowledge_version",
          table: "ai_knowledge_versions",
          tableLabel: "지식 변경 이력",
          title: "지식 변경 이력으로 저장",
          description: "운영 지식의 생성, 수정, 승인, 폐기 이력으로 저장할 수 있습니다.",
        };
      }

      return null;
    }

    function findSaveSuggestion(suggestionId) {
      const conversation = getActiveConversation();
      if (!conversation) return null;
      for (const message of conversation.messages) {
        const suggestion = message.meta?.saveSuggestion;
        if (suggestion?.id === suggestionId) return suggestion;
      }
      return null;
    }

    function dismissOperationalSuggestion(suggestionId) {
      const suggestion = findSaveSuggestion(suggestionId);
      if (!suggestion || suggestion.status === "saving") return;
      suggestion.status = "dismissed";
      renderAiPageMessages();
    }

    async function saveOperationalSuggestion(suggestionId) {
      const suggestion = findSaveSuggestion(suggestionId);
      if (!suggestion || suggestion.status === "saving" || suggestion.status === "saved") return;
      suggestion.status = "saving";
      suggestion.errorMessage = "";
      renderAiPageMessages();
      try {
        const payload = buildOperationalSuggestionPayload(suggestion);
        const rows = await supabaseRequest(suggestion.table, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(payload),
        });
        suggestion.status = "saved";
        suggestion.savedRow = Array.isArray(rows) ? rows[0] : rows;
      } catch (error) {
        console.error("AI save suggestion failed:", error);
        suggestion.status = "error";
        suggestion.errorMessage = error.message || "저장에 실패했습니다.";
      } finally {
        renderAiPageMessages();
      }
    }

    function buildOperationalSuggestionPayload(suggestion) {
      const question = cleanValue(suggestion.question);
      const answer = cleanValue(suggestion.answer);
      const title = truncateText(question.replace(/\s+/g, " "), 80) || "AI 대화 기반 운영 기록";
      const now = new Date().toISOString();

      switch (suggestion.type) {
        case "incident":
          return {
            title,
            description: question,
            action_taken: answer || null,
            severity: guessIncidentSeverity(question),
            status: "open",
            occurred_at: now,
          };
        case "asset_transaction":
          return {
            transaction_type: guessAssetTransactionType(question),
            note: question,
            reason: answer || null,
            occurred_at: now,
          };
        case "staff_result":
          return {
            recommendation_snapshot: {},
            feedback: question,
            result_note: answer || null,
          };
        case "recommendation_feedback":
          return {
            recommendation_type: guessRecommendationType(question),
            recommended_value: { question },
            actual_value: answer ? { answer } : {},
            feedback_text: question,
          };
        case "operation_result":
          return {
            operation_summary: question,
            manager_review: answer || null,
            result_status: "draft",
          };
        case "knowledge_version":
          return {
            change_type: "updated",
            natural_language: question,
            change_reason: answer || null,
          };
        default:
          return { note: question };
      }
    }

    function guessIncidentSeverity(text) {
      if (/(중대|심각|환불|안전|사고|부상|critical)/i.test(text)) return "high";
      if (/(경미|가벼|단순)/i.test(text)) return "low";
      return "medium";
    }

    function guessAssetTransactionType(text) {
      if (/입고/i.test(text)) return "in";
      if (/출고/i.test(text)) return "out";
      if (/이동/i.test(text)) return "move";
      if (/반납/i.test(text)) return "return";
      if (/파손|고장/i.test(text)) return "damage";
      if (/분실/i.test(text)) return "loss";
      return "adjustment";
    }

    function guessRecommendationType(text) {
      if (/인력|staff|스태프/i.test(text)) return "staffing";
      if (/기물|장비|물품|item/i.test(text)) return "items";
      if (/음주|주류|맥주|소주|beverage/i.test(text)) return "beverage";
      if (/레이아웃|세팅|layout/i.test(text)) return "layout";
      if (/운영|동선|진행/i.test(text)) return "operation";
      return "other";
    }

    function truncateText(value, maxLength) {
      const text = cleanValue(value);
      if (text.length <= maxLength) return text;
      return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
    }

    async function loadAiReferenceStats() {
      if (!aiReferenceStats || aiReferenceLoading) return;
      aiReferenceLoading = true;
      renderAiReferenceLoading();
      try {
        const [
          eventOrders,
          assets,
          venueSpaces,
          notes,
          knowledge,
          interviews,
        ] = await Promise.all([
          safeSelectRows("event_orders", "select=id"),
          safeSelectRows("banquet_assets", "select=id,quantity"),
          safeSelectRows("venue_spaces", "select=id"),
          safeSelectRows("event_notes", "select=id&note_type=eq.internal_memo"),
          safeSelectRows("ai_knowledge", "select=id,category,subject,predicate,object,value,natural_language,object_value,explanation,confidence,confirmed_at,updated_at&status=eq.approved&order=updated_at.desc&limit=50"),
          safeSelectRows("ai_interviews", "select=id,status,updated_at&status=eq.confirmed"),
        ]);

        const assetQuantity = (assets.rows || []).reduce((sum, asset) => {
          const quantity = Number(asset.quantity || 0);
          return Number.isFinite(quantity) ? sum + quantity : sum;
        }, 0);
        const latestKnowledgeDate = (knowledge.rows || [])
          .map((item) => item.confirmed_at || item.updated_at)
          .filter(Boolean)
          .sort()
          .at(-1);
        aiReferenceData = {
          eventOrders,
          assets: { ...assets, count: assetQuantity || assets.count },
          venueSpaces,
          notes,
          knowledge,
          interviews,
          latestKnowledgeDate,
        };
        renderAiReferenceStats();
      } finally {
        aiReferenceLoading = false;
      }
    }

    async function safeSelectRows(table, query) {
      try {
        const rows = await supabaseRequest(`${table}?${query}`);
        return { rows: rows || [], count: (rows || []).length, connected: true };
      } catch (error) {
        console.warn(`${table} count unavailable`, error);
        return { rows: [], count: 0, connected: false };
      }
    }

    function renderAiReferenceLoading() {
      if (aiReferenceStats) aiReferenceStats.innerHTML = '<div class="ai-reference-empty">참조 데이터를 불러오는 중입니다.</div>';
      if (aiKnowledgeStats) aiKnowledgeStats.innerHTML = '<div class="ai-reference-empty">지식 베이스를 불러오는 중입니다.</div>';
      if (aiLearningStats) aiLearningStats.innerHTML = '<div class="ai-reference-empty">학습 현황을 불러오는 중입니다.</div>';
    }

    function renderAiReferenceStats() {
      if (!aiReferenceData) return;
      if (aiReferenceStats) {
        aiReferenceStats.innerHTML = "";
        [
          ["이벤트 오더", aiReferenceData.eventOrders, "문서"],
          ["과거 행사 데이터", aiReferenceData.eventOrders, "건"],
          ["자산 재고", aiReferenceData.assets, "개"],
          ["공간 정보", aiReferenceData.venueSpaces, "개"],
          ["내부 메모", aiReferenceData.notes, "건"],
        ].forEach(([label, data, unit]) => {
          aiReferenceStats.append(createReferenceRow(label, data, unit));
        });
      }

      if (aiKnowledgeStats) {
        aiKnowledgeStats.innerHTML = "";
        const categoryCounts = countBy(aiReferenceData.knowledge.rows || [], "category");
        const rows = [
          ["운영 매뉴얼", categoryCounts.operation_manual || categoryCounts.manual || 0],
          ["인력 배치 기준", categoryCounts.staffing || categoryCounts.staff || 0],
          ["기물 추천 규칙", categoryCounts.recommend_item || categoryCounts.item || 0],
          ["음주류 계산 기준", categoryCounts.beverage || 0],
          ["FAQ", categoryCounts.faq || 0],
        ];
        rows.forEach(([label, count]) => {
          const row = document.createElement("div");
          row.className = "ai-knowledge-summary-row";
          row.innerHTML = `<span>${label}</span><strong>${Number(count).toLocaleString("ko-KR")}개</strong>`;
          aiKnowledgeStats.append(row);
        });
        (aiReferenceData.knowledge.rows || []).slice(0, 8).forEach((item) => {
          const row = document.createElement("div");
          row.className = "ai-knowledge-summary-row ai-knowledge-summary-card";
          const title = item.subject || "대상 미정";
          const detail = item.natural_language || item.explanation || item.value || item.object || item.object_value || item.predicate || "";
          row.innerHTML = `
            <span>${escapeHtml(title)}</span>
            <strong>${escapeHtml(item.category || "knowledge")}</strong>
            <small>${escapeHtml(detail)}</small>
          `;
          aiKnowledgeStats.append(row);
        });
      }

      if (aiLearningStats) {
        const knowledgeCount = aiReferenceData.knowledge.count || 0;
        const interviewCount = aiReferenceData.interviews.count || 0;
        const latest = aiReferenceData.latestKnowledgeDate
          ? new Date(aiReferenceData.latestKnowledgeDate).toLocaleDateString("ko-KR")
          : "없음";
        aiLearningStats.innerHTML = `
          <div><span>학습한 지식</span><strong>${knowledgeCount.toLocaleString("ko-KR")}개</strong></div>
          <div><span>학습한 인터뷰</span><strong>${interviewCount.toLocaleString("ko-KR")}개</strong></div>
          <div><span>지식 베이스 진행률</span><strong>준비 중</strong></div>
          <div><span>최근 업데이트</span><strong>${latest}</strong></div>
        `;
      }
    }

    function createReferenceRow(label, data, unit) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ai-reference-row";
      const countText = data.connected === false ? "연결 예정" : `${Number(data.count || 0).toLocaleString("ko-KR")}${unit}`;
      row.innerHTML = `<span class="ai-reference-icon">•</span><span>${label}</span><strong>${countText}</strong>`;
      return row;
    }

    function countBy(rows, key) {
      return (rows || []).reduce((counts, row) => {
        const value = cleanValue(row[key]) || "uncategorized";
        counts[value] = (counts[value] || 0) + 1;
        return counts;
      }, {});
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

    async function loadCurrentInterview(options = {}) {
      if (!interviewPanel || !supabaseRequest) return;
      const preserveMessage = Boolean(options.preserveMessage);
      interviewLoading = true;
      renderInterviewPanel();
      try {
        const rows = await supabaseRequest("ai_interviews?select=*&status=eq.pending&order=created_at.asc&limit=50");
        pendingInterviewCount = Array.isArray(rows) ? rows.length : 0;
        currentInterview = sortPendingInterviews(rows || []).find((row) => !deferredInterviewIds.has(row.id)) || null;
        interviewAnalysis = null;
        interviewError = "";
        if (!preserveMessage) interviewSuccess = "";
        interviewEditingAnswer = false;
        interviewEditingKnowledge = false;
        isSavingKnowledge = false;
        followUpRegistered = false;
      } catch (error) {
        console.error("ai_interviews load failed:", error);
        interviewError = error.message || "인터뷰 질문을 불러오지 못했습니다.";
      } finally {
        interviewLoading = false;
        callbacks.onPendingQuestionsChange?.();
        renderInterviewPanel();
      }
    }

    function renderInterviewPanel() {
      const targetPanel = aiInterviewModePanel || interviewPanel;
      if (!targetPanel) return;
      targetPanel.innerHTML = "";
      const header = document.createElement("div");
      header.className = "ai-interview-header";
      header.innerHTML = "<strong>AI 학습 인터뷰</strong><span>운영 지식을 확인 후 공식 지식으로 저장합니다.</span>";
      targetPanel.append(header);
      if (interviewSuccess) {
        targetPanel.append(createInterviewStatus(interviewSuccess, "success"));
      }

      if (interviewLoading) {
        targetPanel.append(createInterviewStatus("인터뷰 질문을 불러오는 중입니다."));
        return;
      }

      if (pendingInterviewCount > 0) {
        targetPanel.append(createInterviewStatus(`대기 중인 AI 학습 질문 ${pendingInterviewCount}건이 있습니다.`, "warn"));
      }

      const pendingReviewCount = getPendingPostReviewCountHint();
      if (pendingReviewCount > 0) {
        targetPanel.append(createInterviewStatus(`작성하지 않은 행사 회고가 ${pendingReviewCount}건 있습니다.`, "warn"));
      }

      if (interviewError && !currentInterview) {
        targetPanel.append(createInterviewStatus(interviewError, "error"));
        const retry = createInterviewButton("다시 불러오기", "secondary-button", loadCurrentInterview);
        targetPanel.append(retry);
        return;
      }

      if (!currentInterview) {
        targetPanel.append(createInterviewStatus("대기 중인 학습 질문이 없습니다."));
        const generateWrap = document.createElement("div");
        generateWrap.className = "ai-question-generator";
        const intro = document.createElement("p");
        intro.textContent = "공식 지식을 바탕으로 다음 학습 질문 후보를 만들 수 있습니다.";
        const generateButton = createInterviewButton(
          interviewQuestionLoading ? "질문 생성 중..." : "새 질문 생성",
          "primary-button",
          generateInterviewQuestionCandidates
        );
        generateButton.disabled = interviewQuestionLoading;
        generateWrap.append(intro, generateButton);
        if (interviewQuestionError) {
          generateWrap.append(createInterviewStatus(interviewQuestionError, "error"));
        }
        if (interviewQuestionCandidates.length) {
          generateWrap.append(createInterviewQuestionCandidateList());
        }
        targetPanel.append(generateWrap);
        return;
      }

      const questionCard = document.createElement("article");
      questionCard.className = "ai-interview-question-card";
      const category = cleanValue(currentInterview.category);
      const reason = cleanValue(currentInterview.question_reason);
      const badges = getInterviewBadges(currentInterview).map((badge) => `<span>${escapeHtml(badge)}</span>`).join("");
      questionCard.innerHTML = `
        <div class="ai-interview-meta">${category || "미분류"}</div>
        ${badges ? `<div class="ai-interview-badges">${badges}</div>` : ""}
        <h3>${escapeHtml(currentInterview.question || "질문 내용이 없습니다.")}</h3>
        ${reason ? `<p>${escapeHtml(reason)}</p>` : ""}
      `;
      targetPanel.append(questionCard);

      if (!interviewAnalysis || interviewEditingAnswer) {
        targetPanel.append(createInterviewAnswerForm());
      }

      if (interviewError && currentInterview) {
        const errorWrap = document.createElement("div");
        errorWrap.className = "ai-interview-error-wrap";
        errorWrap.append(createInterviewStatus(interviewError, "error"));
        errorWrap.append(createInterviewButton("다시 분석", "secondary-button", () => analyzeInterviewAnswer(currentInterview.answer || "")));
        targetPanel.append(errorWrap);
      }

      if (interviewAnalysis && !interviewEditingAnswer) {
        targetPanel.append(createInterviewConfirmationCard());
      }
    }

    function renderDirectTeachPanel() {
      const panel = aiDirectTeachModePanel;
      if (!panel) return;
      panel.innerHTML = "";

      const header = document.createElement("div");
      header.className = "ai-interview-header";
      header.innerHTML = "<strong>직접 가르치기</strong><span>호텔 운영 노하우를 자연어로 설명하면 AI가 구조화해서 공식 지식 후보로 정리합니다.</span>";
      panel.append(header);

      if (directTeachSuccess) panel.append(createInterviewStatus(directTeachSuccess, "success"));
      if (directTeachError) panel.append(createInterviewStatus(directTeachError, "error"));
      if (directTeachLoading) {
        panel.append(createInterviewStatus("AI가 설명을 읽고 운영 지식으로 정리하는 중입니다."));
      }

      if (!directTeachAnalysis) {
        panel.append(createDirectTeachForm());
        return;
      }

      panel.append(createDirectTeachConfirmationCard());
    }

    function createDirectTeachForm() {
      const form = document.createElement("form");
      form.className = "ai-direct-teach-form ai-interview-answer-form";

      const guide = document.createElement("div");
      guide.className = "ai-direct-teach-guide";
      guide.innerHTML = `
        <strong>예시</strong>
        <p>부라노1은 세미나 기준 3열 8줄까지 가능하고, 다과가 있으면 3열 7줄이 적당합니다.</p>
      `;

      const textarea = document.createElement("textarea");
      textarea.rows = 8;
      textarea.placeholder = "알려주고 싶은 운영 노하우를 자유롭게 입력해주세요.";
      textarea.value = directTeachAnswer;
      textarea.addEventListener("input", () => {
        directTeachAnswer = textarea.value;
      });

      const actions = document.createElement("div");
      actions.className = "ai-interview-actions";
      const submit = createInterviewButton(directTeachLoading ? "분석 중..." : "AI에게 가르치기", "primary-button", () => {});
      submit.type = "submit";
      submit.disabled = directTeachLoading || directTeachSaving;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await submitDirectTeaching(textarea.value);
      });
      actions.append(submit);
      form.append(guide, textarea, actions);
      return form;
    }

    async function submitDirectTeaching(rawAnswer) {
      const answer = cleanValue(rawAnswer);
      if (!answer) {
        directTeachError = "가르칠 내용을 입력해주세요.";
        renderDirectTeachPanel();
        return;
      }
      directTeachLoading = true;
      directTeachError = "";
      directTeachSuccess = "";
      directTeachAnalysis = null;
      directTeachAnswer = answer;
      renderDirectTeachPanel();
      try {
        const now = new Date().toISOString();
        const rows = await supabaseRequest("ai_interviews", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({
            category: "direct_teaching",
            question: "직접 가르치기",
            question_reason: "사용자가 직접 입력한 호텔 운영 노하우",
            answer,
            status: "answered",
            answered_at: now,
            created_at: now,
          }),
        });
        directTeachInterview = rows?.[0] || {
          id: "",
          category: "direct_teaching",
          question: "직접 가르치기",
          question_reason: "사용자가 직접 입력한 호텔 운영 노하우",
          answer,
          status: "answered",
        };
        directTeachAnalysis = await requestKnowledgeAnalysisForInterview(directTeachInterview, answer);
      } catch (error) {
        console.error("direct teaching analysis failed:", error);
        directTeachError = error.message || "직접 가르치기 분석에 실패했습니다.";
      } finally {
        directTeachLoading = false;
        renderDirectTeachPanel();
        scrollDirectTeachResultToTop();
      }
    }

    function createDirectTeachConfirmationCard() {
      const card = document.createElement("article");
      card.className = "ai-knowledge-confirm-card ai-direct-teach-result";
      const title = document.createElement("div");
      title.className = "ai-knowledge-confirm-title";
      title.innerHTML = "<h3>AI가 아래와 같이 이해했습니다.</h3><p>내용이 정확한지 확인해 주세요.</p>";
      card.append(title);

      const guide = document.createElement("section");
      guide.className = "ai-direct-teach-section";
      guide.innerHTML = `
        <strong>직접 가르치기 안내</strong>
        <p>원문은 그대로 보존하고, 아래 구조화 결과만 공식 지식 후보로 저장합니다. 운영 DB 반영은 자동으로 하지 않습니다.</p>
      `;
      card.append(guide);

      const original = document.createElement("div");
      original.className = "ai-knowledge-summary ai-direct-teach-section";
      original.innerHTML = `<strong>원문</strong><p>${escapeHtml(directTeachAnswer || directTeachInterview?.answer || "")}</p>`;
      card.append(original);

      const summary = document.createElement("div");
      summary.className = "ai-knowledge-summary ai-direct-teach-section";
      summary.innerHTML = `<strong>요약</strong><p>${escapeHtml(directTeachAnalysis.summary || "요약 내용이 없습니다.")}</p>`;
      card.append(summary);

      const knowledgeCount = document.createElement("div");
      knowledgeCount.className = "ai-direct-teach-count";
      knowledgeCount.innerHTML = `<strong>추출된 지식</strong><span>${getDirectTeachKnowledgeItems().length.toLocaleString("ko-KR")}개</span>`;
      card.append(knowledgeCount);

      const knowledgeList = document.createElement("div");
      knowledgeList.className = "ai-knowledge-list";
      getDirectTeachKnowledgeItems().forEach((item, index) => {
        knowledgeList.append(directTeachEditingKnowledge ? createKnowledgeEditRow(item, index, getDirectTeachKnowledgeItems) : createKnowledgeViewRow(item));
      });
      if (!getDirectTeachKnowledgeItems().length) {
        knowledgeList.append(createInterviewStatus("공식 지식으로 저장할 후보가 없습니다.", "warn"));
      }
      card.append(knowledgeList);

      if (cleanValue(directTeachAnalysis.follow_up_question)) {
        const followUp = document.createElement("div");
        followUp.className = "ai-follow-up-question ai-direct-teach-section";
        followUp.innerHTML = `<strong>AI 재질문</strong><p>${escapeHtml(directTeachAnalysis.follow_up_question)}</p>`;
        card.append(followUp);
      }

      const review = document.createElement("div");
      review.className = "ai-direct-teach-section";
      review.innerHTML = "<strong>검토 및 수정</strong><p>틀린 항목이 있으면 내용 수정을 눌러 category, subject, predicate, value, 설명을 고친 뒤 저장해주세요.</p>";
      card.append(review);

      const actions = document.createElement("div");
      actions.className = "ai-interview-actions sticky-actions";
      actions.append(
        createInterviewButton("다시 작성", "secondary-button", () => {
          if (directTeachSaving) return;
          directTeachAnalysis = null;
          directTeachError = "";
          renderDirectTeachPanel();
        }),
        createInterviewButton(directTeachEditingKnowledge ? "수정 완료" : "내용 수정", "secondary-button", () => {
          if (directTeachSaving) return;
          directTeachEditingKnowledge = !directTeachEditingKnowledge;
          renderDirectTeachPanel();
        })
      );
      if (cleanValue(directTeachAnalysis.follow_up_question)) {
        actions.append(createInterviewButton("추가 답변하기", "secondary-button", () => {
          if (directTeachSaving) return;
          directTeachAnswer = `${directTeachAnswer}\n\n추가 질문: ${directTeachAnalysis.follow_up_question}\n답변: `;
          directTeachAnalysis = null;
          directTeachError = "";
          renderDirectTeachPanel();
        }));
      }
      const confirm = createInterviewButton(directTeachSaving ? "저장 중..." : "맞습니다", "primary-button", confirmDirectTeachKnowledge);
      confirm.disabled = directTeachSaving;
      actions.append(confirm);
      card.append(actions);
      return card;
    }

    function scrollDirectTeachResultToTop() {
      requestAnimationFrame(() => {
        const scrollHost = aiDirectTeachModePanel?.closest(".ai-main-scroll") || aiDirectTeachModePanel;
        if (scrollHost) scrollHost.scrollTop = 0;
      });
    }

    function getDirectTeachKnowledgeItems() {
      if (!directTeachAnalysis) return [];
      if (!Array.isArray(directTeachAnalysis.knowledge)) directTeachAnalysis.knowledge = [];
      return directTeachAnalysis.knowledge;
    }

    async function confirmDirectTeachKnowledge() {
      if (directTeachSaving) return;
      const knowledge = getDirectTeachKnowledgeItems().filter((item) => cleanValue(item.subject) && cleanValue(item.predicate));
      if (!directTeachInterview?.id || !knowledge.length) {
        directTeachError = "저장할 지식 후보가 없습니다.";
        renderDirectTeachPanel();
        return;
      }
      directTeachSaving = true;
      directTeachError = "";
      renderDirectTeachPanel();
      const now = new Date().toISOString();
      try {
        const existingKeys = await fetchExistingKnowledgeKeys(directTeachInterview.id);
        const rowsToInsert = knowledge
          .filter((item) => !existingKeys.has(buildKnowledgeDuplicateKey(item)))
          .map((item) => buildKnowledgeInsertRow(item, {
            category: "direct_teaching",
            interviewId: directTeachInterview.id,
            entityType: directTeachInterview.entity_type,
            entityId: directTeachInterview.entity_id,
            originalAnswer: directTeachAnswer || directTeachInterview.answer || "",
            approvedAt: now,
          }));
        if (rowsToInsert.length) {
          const insertedKnowledge = await supabaseRequest("ai_knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(rowsToInsert),
          });
          if (!Array.isArray(insertedKnowledge) || insertedKnowledge.length !== rowsToInsert.length) {
            throw new Error("ai_knowledge 저장 결과를 확인하지 못했습니다.");
          }
        }
        await supabaseRequest(`ai_interviews?id=eq.${encodeURIComponent(directTeachInterview.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ status: "confirmed", updated_at: now }),
        });
        directTeachSuccess = "승인한 지식이 ai_knowledge에 저장되었습니다.";
        directTeachAnswer = "";
        directTeachInterview = null;
        directTeachAnalysis = null;
        directTeachEditingKnowledge = false;
        loadAiReferenceStats();
      } catch (error) {
        console.error("direct teaching knowledge confirm failed:", error);
        directTeachError = error.message || "공식 지식 저장에 실패했습니다.";
      } finally {
        directTeachSaving = false;
        renderDirectTeachPanel();
      }
    }

    function createInterviewAnswerForm() {
      const form = document.createElement("form");
      form.className = "ai-interview-answer-form";
      const textarea = document.createElement("textarea");
      textarea.rows = 4;
      textarea.placeholder = "질문에 자유롭게 답변해주세요.";
      textarea.value = currentInterview?.answer || "";
      const actions = document.createElement("div");
      actions.className = "ai-interview-actions";
      const saveButton = document.createElement("button");
      saveButton.type = "submit";
      saveButton.className = "primary-button";
      saveButton.textContent = isReviewSaving ? "저장 중..." : "답변 저장";
      saveButton.disabled = isReviewSaving;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await saveInterviewAnswer(textarea.value);
      });
      actions.append(saveButton);
      if (isPostEventReviewInterview(currentInterview)) {
        const noIssueButton = createInterviewButton(
          isReviewSaving ? "저장 중..." : "특이사항 없음",
          "secondary-button",
          () => saveInterviewAnswer("특이사항 없음")
        );
        noIssueButton.disabled = isReviewSaving;
        const laterButton = createInterviewButton("나중에", "secondary-button", () => {
          if (currentInterview?.id) deferredInterviewIds.add(currentInterview.id);
          currentInterview = null;
          interviewAnalysis = null;
          loadCurrentInterview({ preserveMessage: true });
        });
        laterButton.disabled = isReviewSaving;
        actions.append(noIssueButton, laterButton);
      }
      form.append(textarea, actions);
      return form;
    }

    function createInterviewConfirmationCard() {
      const card = document.createElement("article");
      card.className = "ai-knowledge-confirm-card";
      const title = document.createElement("div");
      title.className = "ai-knowledge-confirm-title";
      title.innerHTML = "<h3>AI가 아래와 같이 이해했습니다.</h3><p>내용이 정확한지 확인해 주세요.</p>";
      card.append(title);

      const summary = document.createElement("div");
      summary.className = "ai-knowledge-summary";
      summary.innerHTML = `<strong>요약</strong><p>${escapeHtml(interviewAnalysis.summary || "요약 내용이 없습니다.")}</p>`;
      card.append(summary);

      const knowledgeList = document.createElement("div");
      knowledgeList.className = "ai-knowledge-list";
      getInterviewKnowledgeItems().forEach((item, index) => {
        knowledgeList.append(interviewEditingKnowledge ? createKnowledgeEditRow(item, index, getInterviewKnowledgeItems) : createKnowledgeViewRow(item));
      });
      if (!getInterviewKnowledgeItems().length) {
        knowledgeList.append(createInterviewStatus("공식 지식으로 저장할 후보가 없습니다.", "warn"));
      }
      card.append(knowledgeList);

      if (cleanValue(interviewAnalysis.follow_up_question)) {
        const followUp = document.createElement("div");
        followUp.className = "ai-follow-up-question";
        followUp.innerHTML = `<strong>추가 확인 질문</strong><p>${escapeHtml(interviewAnalysis.follow_up_question)}</p>`;
        card.append(followUp);
      }

      const actions = document.createElement("div");
      actions.className = "ai-interview-actions sticky-actions";
      const confirmButton = createInterviewButton(
        isSavingKnowledge ? "저장 중..." : "맞습니다",
        "primary-button",
        confirmInterviewKnowledge
      );
      confirmButton.disabled = isSavingKnowledge;
      actions.append(
        createInterviewButton("다시 작성", "secondary-button", () => {
          if (isSavingKnowledge) return;
          interviewEditingAnswer = true;
          interviewError = "";
          renderInterviewPanel();
        }),
        createInterviewButton(interviewEditingKnowledge ? "수정 완료" : "내용 수정", "secondary-button", () => {
          if (isSavingKnowledge) return;
          interviewEditingKnowledge = !interviewEditingKnowledge;
          renderInterviewPanel();
        }),
        confirmButton
      );
      card.append(actions);

      if (currentInterview?.status === "confirmed" && cleanValue(interviewAnalysis.follow_up_question)) {
        const followActions = document.createElement("div");
        followActions.className = "ai-interview-actions";
        const button = createInterviewButton(
          followUpRegistered ? "다음 질문 등록 완료" : "다음 질문으로 등록",
          "secondary-button",
          registerFollowUpQuestion
        );
        button.disabled = followUpRegistered;
        followActions.append(button);
        card.append(followActions);
      }
      return card;
    }

    function createKnowledgeViewRow(item) {
      const row = document.createElement("article");
      const confidence = Number(item.confidence);
      row.className = "ai-knowledge-row";
      row.innerHTML = `
        <div class="ai-knowledge-row-header">
          <strong>${escapeHtml(item.subject || "대상 미정")}</strong>
          <span>검토 전</span>
        </div>
        <p class="ai-knowledge-main">${escapeHtml(item.natural_language || item.explanation || item.value || item.object || item.object_value || "설명 내용이 없습니다.")}</p>
        <dl>
          <div><dt>분류</dt><dd>${escapeHtml(item.category || currentInterview?.category || "")}</dd></div>
          <div><dt>관계</dt><dd>${escapeHtml(item.predicate || "")}</dd></div>
          <div><dt>대상</dt><dd>${escapeHtml(item.object ?? item.object_value ?? "")}</dd></div>
          <div><dt>값</dt><dd>${escapeHtml(item.value ?? item.object_value ?? "")}</dd></div>
          <div><dt>신뢰도</dt><dd>${Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "0%"}</dd></div>
        </dl>
        ${cleanValue(item.reason) ? `<p class="subtle">${escapeHtml(item.reason)}</p>` : ""}
      `;
      return row;
    }

    function createKnowledgeEditRow(item, index, getItems = getInterviewKnowledgeItems) {
      const row = document.createElement("article");
      row.className = "ai-knowledge-row edit-mode";
      [
        ["category", "category"],
        ["subject", "subject"],
        ["predicate", "predicate"],
        ["object", "object"],
        ["value", "value"],
        ["natural_language", "natural_language"],
        ["object_value", "object_value"],
        ["explanation", "explanation"],
        ["reason", "reason"],
      ].forEach(([key, label]) => {
        const field = document.createElement("label");
        field.textContent = label;
        const input = key === "natural_language" || key === "explanation" || key === "reason" ? document.createElement("textarea") : document.createElement("input");
        input.value = item[key] ?? "";
        input.addEventListener("input", () => {
          getItems()[index][key] = input.value;
        });
        field.append(input);
        row.append(field);
      });
      return row;
    }
    async function saveInterviewAnswer(rawAnswer) {
      const answer = cleanValue(rawAnswer);
      if (!currentInterview?.id || !answer) {
        interviewError = "답변을 입력해주세요.";
        renderInterviewPanel();
        return;
      }
      if (isPostEventReviewInterview(currentInterview)) {
        await savePostEventReviewAnswer(answer);
        return;
      }
      interviewLoading = true;
      interviewError = "";
      renderInterviewPanel();
      try {
        const rows = await supabaseRequest(`ai_interviews?id=eq.${encodeURIComponent(currentInterview.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({
            answer,
            status: "answered",
            answered_at: new Date().toISOString(),
          }),
        });
        currentInterview = rows?.[0] || { ...currentInterview, answer, status: "answered" };
        interviewEditingAnswer = false;
        await analyzeInterviewAnswer(answer);
      } catch (error) {
        console.error("ai_interviews answer save failed:", error);
        interviewError = error.message || "인터뷰 답변 저장에 실패했습니다.";
      } finally {
        interviewLoading = false;
        renderInterviewPanel();
      }
    }

    async function savePostEventReviewAnswer(answer) {
      if (isReviewSaving) return;
      if (!currentInterview?.id || !currentInterview.entity_id) {
        interviewError = "행사 회고를 연결할 행사 정보를 찾지 못했습니다.";
        renderInterviewPanel();
        return;
      }
      isReviewSaving = true;
      interviewError = "";
      renderInterviewPanel();
      const now = new Date().toISOString();
      try {
        await supabaseRequest("event_notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_order_id: currentInterview.entity_id,
            note_type: "post_event_review",
            content: answer,
            created_at: now,
          }),
        });
        await supabaseRequest(`ai_interviews?id=eq.${encodeURIComponent(currentInterview.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({
            answer,
            status: "confirmed",
            answered_at: now,
            updated_at: now,
          }),
        });
        interviewSuccess = "행사 회고가 저장되었습니다. 해당 행사의 내부 메모에 원문 그대로 추가했습니다.";
        currentInterview = null;
        interviewAnalysis = null;
        await loadCurrentInterview({ preserveMessage: true });
      } catch (error) {
        console.error("post event review save failed:", error);
        interviewError = "행사 메모 저장에 실패했습니다. 다시 시도해주세요.";
        isReviewSaving = false;
        renderInterviewPanel();
        return;
      } finally {
        isReviewSaving = false;
        renderInterviewPanel();
      }
    }

    async function analyzeInterviewAnswer(answer) {
      if (!currentInterview?.id) return;
      interviewLoading = true;
      interviewError = "";
      renderInterviewPanel();
      try {
        interviewAnalysis = await requestKnowledgeAnalysisForInterview(currentInterview, answer);
      } catch (error) {
        console.error("interview analysis failed:", error);
        interviewError = error.message || "인터뷰 답변 분석에 실패했습니다.";
      } finally {
        interviewLoading = false;
        renderInterviewPanel();
      }
    }

    async function requestKnowledgeAnalysisForInterview(interview, answer) {
      const response = await fetch(supabaseConfig.functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
        },
        body: JSON.stringify({
          mode: "interview_knowledge_analysis",
          interview: {
            id: interview.id,
            category: interview.category,
            question: interview.question,
            question_reason: interview.question_reason,
            answer,
            entity_type: interview.entity_type,
            entity_id: interview.entity_id,
            source_type: interview.source_type,
            source_id: interview.source_id,
          },
        }),
      });
      const body = await parseSupabaseResponse(response);
      if (!response.ok) throw new Error(body.message || "인터뷰 답변 분석에 실패했습니다.");
      const parsed = body.analysis || parseAiAnalysisJson(body.answer || body.rawText || "");
      if (!parsed || !Array.isArray(parsed.knowledge)) {
        throw new Error("AI 분석 결과가 올바른 JSON 형식이 아닙니다.");
      }
      return normalizeInterviewAnalysis(parsed);
    }

    function normalizeInterviewAnalysis(value) {
      const analysis = value || {};
      return {
        summary: cleanValue(analysis.summary),
        knowledge: (Array.isArray(analysis.knowledge) ? analysis.knowledge : []).map((item) => ({
          category: cleanValue(item.category || currentInterview?.category),
          subject: cleanValue(item.subject),
          predicate: cleanValue(item.predicate),
          object: cleanValue(item.object ?? item.object_value),
          value: cleanValue(item.value ?? item.object_value),
          object_value: cleanValue(item.object_value ?? item.object ?? item.value),
          natural_language: cleanValue(item.natural_language ?? item.explanation),
          explanation: cleanValue(item.explanation ?? item.natural_language),
          reason: cleanValue(item.reason),
          confidence: Math.max(0, Math.min(1, Number(item.confidence || 0.8))),
        })),
        needs_follow_up: Boolean(analysis.needs_follow_up),
        follow_up_question: cleanValue(analysis.follow_up_question),
      };
    }

    function buildKnowledgeInsertRow(item, context) {
      const value = cleanValue(item.value || item.object_value || item.object);
      const object = cleanValue(item.object || item.object_value || item.value);
      const naturalLanguage = cleanValue(item.natural_language || item.explanation || value);
      return {
        category: cleanValue(item.category) || context.category || "operation",
        subject: cleanValue(item.subject),
        predicate: cleanValue(item.predicate),
        object,
        value,
        natural_language: naturalLanguage,
        object_value: cleanValue(item.object_value || value || object),
        explanation: cleanValue(item.explanation || naturalLanguage),
        reason: cleanValue(item.reason) || null,
        source_interview_id: context.interviewId,
        entity_type: cleanValue(item.entity_type || context.entityType) || null,
        entity_id: cleanValue(item.entity_id || context.entityId) || null,
        confidence: item.confidence ?? 0.8,
        status: "approved",
        original_answer: context.originalAnswer || "",
        confirmed_at: context.approvedAt,
        updated_at: context.approvedAt,
      };
    }

    async function fetchExistingKnowledgeKeys(sourceInterviewId) {
      const rows = await supabaseRequest(
        `ai_knowledge?select=subject,predicate,object,value,object_value&source_interview_id=eq.${encodeURIComponent(sourceInterviewId)}`
      );
      return new Set((rows || []).map((item) => buildKnowledgeDuplicateKey(item)));
    }

    function getInterviewKnowledgeItems() {
      if (!interviewAnalysis) return [];
      if (!Array.isArray(interviewAnalysis.knowledge)) interviewAnalysis.knowledge = [];
      return interviewAnalysis.knowledge;
    }

    async function confirmInterviewKnowledge() {
      if (isSavingKnowledge) return;
      const knowledge = getInterviewKnowledgeItems().filter((item) => cleanValue(item.subject) && cleanValue(item.predicate));
      if (!currentInterview?.id || !knowledge.length) {
        interviewError = "저장할 지식 후보가 없습니다.";
        renderInterviewPanel();
        return;
      }
      const confirmedInterviewId = currentInterview.id;
      isSavingKnowledge = true;
      interviewError = "";
      interviewSuccess = "";
      renderInterviewPanel();
      const now = new Date().toISOString();
      try {
        const existingKeys = await fetchExistingKnowledgeKeys(confirmedInterviewId);
        const rowsToInsert = knowledge
          .filter((item) => !existingKeys.has(buildKnowledgeDuplicateKey(item)))
          .map((item) => buildKnowledgeInsertRow(item, {
            category: currentInterview.category,
            interviewId: confirmedInterviewId,
            entityType: currentInterview.entity_type,
            entityId: currentInterview.entity_id,
            originalAnswer: currentInterview.answer || "",
            approvedAt: now,
          }));

        if (rowsToInsert.length) {
          const insertedKnowledge = await supabaseRequest("ai_knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(rowsToInsert),
          });
          if (!Array.isArray(insertedKnowledge) || insertedKnowledge.length !== rowsToInsert.length) {
            throw new Error("ai_knowledge 저장 결과를 확인하지 못했습니다.");
          }
        }

        await supabaseRequest(`ai_interviews?id=eq.${encodeURIComponent(confirmedInterviewId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ status: "confirmed", updated_at: now }),
        });

        interviewSuccess = "승인한 지식이 ai_knowledge에 저장되었습니다.";
        interviewAnalysis = null;
        interviewEditingAnswer = false;
        interviewEditingKnowledge = false;
        currentInterview = null;
        await loadCurrentInterview({ preserveMessage: true });
      } catch (error) {
        console.error("ai_knowledge confirm failed:", error);
        interviewError = error.message || "공식 지식 저장에 실패했습니다.";
        isSavingKnowledge = false;
        interviewLoading = false;
        renderInterviewPanel();
        return;
      } finally {
        isSavingKnowledge = false;
        interviewLoading = false;
        renderInterviewPanel();
      }
    }

    function buildKnowledgeDuplicateKey(item) {
      return [
        cleanValue(item.subject),
        cleanValue(item.predicate),
        cleanValue(item.object || item.value || item.object_value),
      ].join("||");
    }

    async function registerFollowUpQuestion() {
      const question = cleanValue(interviewAnalysis?.follow_up_question);
      if (!question || !currentInterview) return;
      try {
        await supabaseRequest("ai_interviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: currentInterview.category,
            question,
            question_reason: "이전 인터뷰 답변에서 추가 확인이 필요함",
            status: "pending",
            entity_type: currentInterview.entity_type || null,
            entity_id: currentInterview.entity_id || null,
          }),
        });
        followUpRegistered = true;
        renderInterviewPanel();
      } catch (error) {
        console.error("follow-up interview insert failed:", error);
        interviewError = error.message || "다음 질문 등록에 실패했습니다.";
        renderInterviewPanel();
      }
    }

    async function generateInterviewQuestionCandidates() {
      if (interviewQuestionLoading) return;
      interviewQuestionLoading = true;
      interviewQuestionError = "";
      interviewQuestionCandidates = [];
      renderInterviewPanel();
      try {
        const response = await fetch(supabaseConfig.functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${supabaseConfig.anonKey}`,
          },
          body: JSON.stringify({ mode: "generate_interview_questions" }),
        });
        const body = await parseSupabaseResponse(response);
        if (!response.ok) throw new Error(body.message || "질문 후보 생성에 실패했습니다.");
        const questions = Array.isArray(body.questions) ? body.questions : [];
        interviewQuestionCandidates = dedupeQuestionCandidates(questions).slice(0, 3);
        if (!interviewQuestionCandidates.length) {
          interviewQuestionError = "새로 제안할 질문 후보가 없습니다.";
        }
      } catch (error) {
        console.error("interview question generation failed:", error);
        interviewQuestionError = error.message || "질문 후보 생성에 실패했습니다.";
      } finally {
        interviewQuestionLoading = false;
        renderInterviewPanel();
      }
    }

    function createInterviewQuestionCandidateList() {
      const list = document.createElement("div");
      list.className = "ai-question-candidate-list";
      interviewQuestionCandidates.forEach((candidate, index) => {
        const card = document.createElement("article");
        card.className = `ai-question-candidate priority-${cleanValue(candidate.priority || "medium").toLowerCase()}`;
        card.innerHTML = `
          <div class="ai-interview-meta">${escapeHtml(candidate.category || "미분류")} · ${escapeHtml(candidate.priority || "medium")}</div>
          <h3>${escapeHtml(candidate.question || "")}</h3>
          <p>${escapeHtml(candidate.reason || "")}</p>
        `;
        const actions = document.createElement("div");
        actions.className = "ai-interview-actions";
        actions.append(
          createInterviewButton("이 질문 등록", "primary-button", () => registerGeneratedQuestion(candidate, index)),
          createInterviewButton("제외", "secondary-button", () => removeGeneratedQuestion(index)),
          createInterviewButton("나중에", "secondary-button", () => removeGeneratedQuestion(index))
        );
        card.append(actions);
        list.append(card);
      });
      return list;
    }

    async function registerGeneratedQuestion(candidate, index) {
      const question = cleanValue(candidate.question);
      if (!question) return;
      try {
        await supabaseRequest("ai_interviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: cleanValue(candidate.category) || "general",
            question,
            question_reason: cleanValue(candidate.reason),
            status: "pending",
            created_at: new Date().toISOString(),
          }),
        });
        interviewSuccess = "새 학습 질문이 등록되었습니다.";
        interviewQuestionCandidates = interviewQuestionCandidates.filter((_, itemIndex) => itemIndex !== index);
        await loadCurrentInterview({ preserveMessage: true });
      } catch (error) {
        console.error("generated interview insert failed:", error);
        interviewQuestionError = error.message || "질문 등록에 실패했습니다.";
        renderInterviewPanel();
      }
    }

    async function analyzeEventOrderForKnowledgeGaps(eventOrderId) {
      const id = cleanValue(eventOrderId);
      if (!id) return { ok: false, questions: [], message: "행사 ID가 없습니다." };
      const payload = { mode: "analyze_event_order_knowledge_gaps", eventOrderId: id };
      console.log("event order knowledge gap request payload:", payload);
      try {
        const response = await fetch(supabaseConfig.functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${supabaseConfig.anonKey}`,
          },
          body: JSON.stringify(payload),
        });
        const body = await parseSupabaseResponse(response);
        console.log("Edge Function status:", response.status);
        console.log("Edge Function response:", {
          ok: response.ok,
          status: response.status,
          body,
        });
        if (!response.ok) throw new Error(body.message || "AI 이벤트오더 검토에 실패했습니다.");
        eventOrderReviewResult = { ok: true, questions: body.questions || [], message: body.message || "" };
        return eventOrderReviewResult;
      } catch (error) {
        console.error("event order knowledge gap analysis failed:", error);
        eventOrderReviewResult = { ok: false, questions: [], message: error.message || "AI 검토에 실패했습니다." };
        return eventOrderReviewResult;
      }
    }

    async function createPostEventReviewQuestions() {
      try {
        const response = await fetch(supabaseConfig.functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseConfig.anonKey,
            Authorization: `Bearer ${supabaseConfig.anonKey}`,
          },
          body: JSON.stringify({ mode: "create_post_event_review_questions" }),
        });
        const body = await parseSupabaseResponse(response);
        if (!response.ok) throw new Error(body.message || "행사 회고 질문 생성에 실패했습니다.");
        if (Number(body.created || 0) > 0) {
          interviewSuccess = `새 행사 회고 질문 ${body.created}건이 등록되었습니다.`;
        }
        return body;
      } catch (error) {
        console.error("post event review question creation failed:", error);
        return { created: 0, message: error.message || "행사 회고 질문 생성에 실패했습니다." };
      }
    }

    function removeGeneratedQuestion(index) {
      interviewQuestionCandidates = interviewQuestionCandidates.filter((_, itemIndex) => itemIndex !== index);
      renderInterviewPanel();
    }

    function dedupeQuestionCandidates(candidates) {
      const seen = new Set();
      return (candidates || []).filter((candidate) => {
        const key = normalizeQuestionText(candidate.question);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function normalizeQuestionText(value) {
      return cleanValue(value).toLowerCase().replace(/\s+/g, "").replace(/[?？!.。,:;'"“”‘’()[\]{}<>]/g, "");
    }

    function sortPendingInterviews(rows) {
      const priorityRank = (row) => {
        if (row.category === "post_event_review") return 0;
        if (row.source_type === "event_order" && row.priority === "high") return 1;
        if (row.source_type === "event_order") return 2;
        return 3;
      };
      return [...(rows || [])].sort((a, b) => {
        const rankDiff = priorityRank(a) - priorityRank(b);
        if (rankDiff) return rankDiff;
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      });
    }

    function isPostEventReviewInterview(interview) {
      return cleanValue(interview?.category) === "post_event_review";
    }

    function getInterviewBadges(interview) {
      const badges = [];
      if (isPostEventReviewInterview(interview)) badges.push("행사 회고", "어제 종료");
      const category = cleanValue(interview?.category);
      const reason = cleanValue(interview?.question_reason);
      if (interview?.source_type === "event_order") badges.push("이벤트오더");
      if (category.startsWith("learning_") || reason.includes("Learning Question")) badges.push("Learning Question");
      if (category === "venue_mapping" || reason.includes("Verification Question")) badges.push("Verification Question");
      if (category === "direct_teaching") badges.push("직접 가르치기");
      if (interview?.event_name) badges.push(interview.event_name);
      return badges;
    }

    function getPendingPostReviewCountHint() {
      return isPostEventReviewInterview(currentInterview) ? 1 : 0;
    }

    function createInterviewStatus(message, type = "") {
      const status = document.createElement("div");
      status.className = `status${type ? ` ${type}` : ""}`;
      status.textContent = message;
      return status;
    }

    function createInterviewButton(text, className, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.textContent = text;
      button.addEventListener("click", onClick);
      return button;
    }

    function escapeHtml(value) {
      return cleanValue(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    return {
      handleChatSubmit,
      handleAiPageChatSubmit,
      handleAiPageInputKeydown,
      handleAiAttachmentSelect,
      openAiAttachmentPicker,
      showAiAttachmentList,
      startNewAiConversation,
      initializeAiAssistantPage,
      loadAiReferenceStats,
      requestAiAnalysis,
      createAiAnalysisSection,
      parseAiAnalysisJson,
      createRequiredRecordsAnalysisCard,
      loadCurrentInterview,
      analyzeEventOrderForKnowledgeGaps,
      createPostEventReviewQuestions,
    };
  }

  window.BANQUET_ERP_AI_ASSISTANT = {
    createAiAssistant,
  };
})();
