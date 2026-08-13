/*
 * 역할:
 * - 연회장 기본 도면과 검증된 레이아웃 이미지를 등록, 조회, 표시한다.
 *
 * 왜 분리했는지:
 * - 레이아웃 이미지는 자산 이미지와 비슷해 보이지만, AI 레이아웃 추천을 위한 조건 데이터가 함께 필요하다.
 * - 자산관리 코드와 섞이면 asset-images와 venue-layouts 저장 규칙이 뒤섞인다.
 *
 * 다른 파일과의 연결:
 * - constants.js의 Supabase 설정과 storage.js의 공통 요청 함수를 사용한다.
 * - files, file_links, venue_layout_images 테이블과 venue-layouts Storage 버킷을 사용한다.
 *
 * 향후 추가 예정:
 * - 이 데이터는 이벤트오더의 장소, 인원, 레이아웃 유형을 기준으로 가장 유사한 검증 레이아웃을 찾는 AI 추천에 연결한다.
 */
(function registerBanquetErpVenueLayoutManager() {
  function createVenueLayoutManager({ elements, deps }) {
    const {
      panel,
      form,
      fileInput,
      preview,
      venueSelect,
      spaceSelect,
      layoutTypeInput,
      minPeopleInput,
      maxPeopleInput,
      tableTypeInput,
      tableCountInput,
      setupCapacityInput,
      columnCountInput,
      rowCountInput,
      seatsPerTableInput,
      baseTableCountInput,
      extraTableCountInput,
      capacityRuleInput,
      hasStageInput,
      hasBuffetInput,
      isVerifiedInput,
      notesInput,
      saveButton,
      resetButton,
      refreshButton,
      tableBody,
    } = elements;

    const {
      supabaseConfig,
      loggedSupabaseRequest,
      supabaseHeaders,
      parseSupabaseResponse,
      supabaseErrorFromResponse,
      toNullableInteger,
      escapeHtml,
      setStatus,
      isAdminUser,
    } = deps;

    let selectedFile = null;
    let editingLayoutId = null;
    let editingFileId = null;
    let editingStorageBucket = "";
    let editingStoragePath = "";
    let venueRows = [];
    let spaceRows = [];
    let layoutRows = [];

    function applyPermissionState() {
      panel.classList.toggle("readonly", !isAdminUser());
      let note = panel.querySelector(".venue-layout-permission-note");
      if (!isAdminUser()) {
        if (!note) {
          note = document.createElement("div");
          note.className = "asset-permission-note venue-layout-permission-note";
          note.textContent = "일반 사용자는 도면과 레이아웃 이미지 조회만 가능합니다. 등록은 관리자만 사용할 수 있습니다.";
          form.insertAdjacentElement("beforebegin", note);
        }
      } else if (note) {
        note.remove();
      }
    }

    async function loadVenueLayoutReferences() {
      const [venues, spaces] = await Promise.all([
        loggedSupabaseRequest("venues select", "venues?select=id,venue_name&order=venue_name.asc"),
        loggedSupabaseRequest("venue_spaces select", "venue_spaces?select=id,space_name&order=space_name.asc"),
      ]);
      venueRows = venues || [];
      spaceRows = spaces || [];
      renderReferenceOptions();
    }

    function renderReferenceOptions() {
      venueSelect.innerHTML = '<option value="">행사장 선택 없음</option>';
      venueRows.forEach((venue) => {
        const option = document.createElement("option");
        option.value = venue.id;
        option.textContent = venue.venue_name || "이름 없음";
        venueSelect.append(option);
      });

      spaceSelect.innerHTML = '<option value="">공간단위 선택 없음</option>';
      spaceRows.forEach((space) => {
        const option = document.createElement("option");
        option.value = space.id;
        option.textContent = space.space_name || "이름 없음";
        spaceSelect.append(option);
      });
    }

    async function loadVenueLayoutImages() {
      tableBody.innerHTML = '<tr><td colspan="11">도면/레이아웃 이미지를 불러오는 중입니다.</td></tr>';
      applyPermissionState();
      try {
        if (!venueRows.length && !spaceRows.length) {
          await loadVenueLayoutReferences();
        }

        layoutRows = await loggedSupabaseRequest(
          "venue_layout_images select",
          "venue_layout_images?select=*,files(*),venues(venue_name),venue_spaces(space_name)&order=created_at.desc"
        ) || [];
        renderVenueLayoutImages();
      } catch (error) {
        console.error("venue_layout_images load failed:", error);
        tableBody.innerHTML = `<tr><td colspan="11">도면/레이아웃 이미지를 불러오지 못했습니다. ${escapeHtml(error.message || "")}</td></tr>`;
      }
    }

    function renderVenueLayoutImages() {
      applyPermissionState();
      tableBody.innerHTML = "";
      if (!layoutRows.length) {
        tableBody.innerHTML = '<tr><td colspan="11">등록된 도면 또는 레이아웃 이미지가 없습니다.</td></tr>';
        return;
      }

      layoutRows.forEach((row) => {
        const tr = document.createElement("tr");
        const file = Array.isArray(row.files) ? row.files[0] : row.files;
        const venueName = row.venues?.venue_name || "";
        const spaceName = row.venue_spaces?.space_name || "";
        const peopleRange = [
          row.min_people == null ? "" : `${row.min_people}명`,
          row.max_people == null ? "" : `${row.max_people}명`,
        ].filter(Boolean).join(" ~ ");
        const layoutGrid = [
          row.column_count == null ? "" : `${row.column_count}열`,
          row.row_count == null ? "" : `${row.row_count}줄`,
        ].filter(Boolean).join(" x ");
        const operationSummary = [
          row.setup_capacity == null ? "" : `${row.setup_capacity}석`,
          row.seats_per_table == null ? "" : `테이블당 ${row.seats_per_table}명`,
        ].filter(Boolean).join(" / ");
        const tableSummary = [
          row.base_table_count == null ? "" : `기본 ${row.base_table_count}`,
          row.extra_table_count ? `추가 ${row.extra_table_count}` : "",
        ].filter(Boolean).join(" + ");

        const imageCell = document.createElement("td");
        if (file?.public_url) {
          const link = document.createElement("a");
          link.href = file.public_url;
          link.target = "_blank";
          link.rel = "noopener";
          link.className = "venue-layout-thumb-link";
          if ((file.mime_type || "").startsWith("image/")) {
            const image = document.createElement("img");
            image.className = "asset-thumb venue-layout-thumb";
            image.src = file.public_url;
            image.alt = file.original_filename || "레이아웃 이미지";
            link.append(image);
          } else {
            link.textContent = "파일 보기";
          }
          imageCell.append(link);
        } else {
          imageCell.textContent = "파일 없음";
        }
        tr.append(imageCell);

        [
          venueName || spaceName || "장소 미지정",
          row.layout_type || "",
          peopleRange || "-",
          row.table_type || "-",
          row.table_count ?? "-",
          operationSummary || "-",
          [layoutGrid, tableSummary].filter(Boolean).join(" / ") || "-",
          row.is_verified ? "검증됨" : "미검증",
          [row.capacity_rule, row.layout_notes || file?.description || ""].filter(Boolean).join("\n"),
        ].forEach((value, index) => {
          const td = document.createElement("td");
          td.textContent = value;
          if (index === 4 || index === 5) td.className = "number-cell";
          tr.append(td);
        });

        const actionCell = document.createElement("td");
        actionCell.className = "admin-only-cell";
        const actions = document.createElement("div");
        actions.className = "asset-actions venue-layout-actions";
        const floorplanButton = document.createElement("button");
        floorplanButton.type = "button";
        floorplanButton.textContent = "도면 편집";
        floorplanButton.addEventListener("click", () => {
          window.dispatchEvent(new CustomEvent("banquet:open-floorplan-editor", { detail: { row } }));
        });
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "수정";
        editButton.addEventListener("click", () => startEditVenueLayoutImage(row));
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger-button";
        deleteButton.textContent = "삭제";
        deleteButton.addEventListener("click", () => deleteVenueLayoutImage(row));
        actions.append(floorplanButton, editButton, deleteButton);
        actionCell.append(actions);
        tr.append(actionCell);

        tableBody.append(tr);
      });
    }

    function startEditVenueLayoutImage(row) {
      if (!isAdminUser()) {
        setStatus("도면/레이아웃 이미지 수정은 관리자만 사용할 수 있습니다.", "warn");
        return;
      }
      const file = Array.isArray(row.files) ? row.files[0] : row.files;
      editingLayoutId = row.id || null;
      editingFileId = row.file_id || file?.id || null;
      editingStorageBucket = file?.bucket || "";
      editingStoragePath = file?.storage_path || "";
      selectedFile = null;
      fileInput.value = "";
      venueSelect.value = row.venue_id || "";
      spaceSelect.value = row.space_id || "";
      layoutTypeInput.value = row.layout_type || "";
      minPeopleInput.value = row.min_people ?? "";
      maxPeopleInput.value = row.max_people ?? "";
      tableTypeInput.value = row.table_type || "";
      tableCountInput.value = row.table_count ?? "";
      setupCapacityInput.value = row.setup_capacity ?? "";
      columnCountInput.value = row.column_count ?? "";
      rowCountInput.value = row.row_count ?? "";
      seatsPerTableInput.value = row.seats_per_table ?? "";
      baseTableCountInput.value = row.base_table_count ?? "";
      extraTableCountInput.value = row.extra_table_count ?? "";
      capacityRuleInput.value = row.capacity_rule || "";
      hasStageInput.checked = Boolean(row.has_stage);
      hasBuffetInput.checked = Boolean(row.has_buffet);
      isVerifiedInput.checked = Boolean(row.is_verified);
      notesInput.value = row.layout_notes || file?.description || "";
      renderExistingFilePreview(file);
      saveButton.textContent = "수정 저장";
      resetButton.textContent = "취소";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderExistingFilePreview(file) {
      preview.innerHTML = "";
      if (!file?.public_url) {
        preview.textContent = "기존 파일 없음";
        return;
      }
      if ((file.mime_type || "").startsWith("image/")) {
        const image = document.createElement("img");
        image.src = file.public_url;
        image.alt = file.original_filename || "기존 레이아웃 이미지";
        preview.append(image);
      } else {
        preview.textContent = file.original_filename || "기존 파일";
      }
    }

    function handleFileSelection(event) {
      selectedFile = event.target.files?.[0] || null;
      renderPreview();
    }

    function renderPreview() {
      preview.innerHTML = "";
      if (!selectedFile) {
        preview.textContent = "파일 없음";
        return;
      }
      if (selectedFile.type.startsWith("image/")) {
        const image = document.createElement("img");
        image.src = URL.createObjectURL(selectedFile);
        image.alt = selectedFile.name;
        preview.append(image);
      } else {
        preview.textContent = selectedFile.name;
      }
    }

    function safeFileName(name) {
      const extensionMatch = name.match(/(\.[a-z0-9]+)$/i);
      const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
      const baseName = extension ? name.slice(0, -extension.length) : name;
      const safeBase = baseName
        .normalize("NFKD")
        .replace(/[^\w.-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase() || "layout";
      return `${safeBase}${extension}`;
    }

    function buildPublicUrl(bucket, storagePath) {
      const encodedPath = String(storagePath).split("/").map(encodeURIComponent).join("/");
      return `${supabaseConfig.url}/storage/v1/object/public/${bucket}/${encodedPath}`;
    }

    async function uploadVenueLayoutFile(file) {
      const bucket = supabaseConfig.venueLayoutBucket || "venue-layouts";
      const storagePath = `layouts/${Date.now()}_${safeFileName(file.name)}`;
      const uploadUrl = `${supabaseConfig.url}/storage/v1/object/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      });

      if (!response.ok) {
        throw await supabaseErrorFromResponse(response, "레이아웃 이미지 업로드에 실패했습니다.");
      }

      return {
        bucket,
        storagePath,
        publicUrl: buildPublicUrl(bucket, storagePath),
      };
    }

    async function saveVenueLayoutImage(event) {
      event.preventDefault();
      if (!isAdminUser()) {
        setStatus("도면/레이아웃 이미지는 관리자만 등록할 수 있습니다.", "warn");
        return;
      }
      if (!selectedFile && !editingLayoutId) {
        setStatus("등록할 도면 또는 레이아웃 이미지 파일을 선택해주세요.", "warn");
        return;
      }
      if (!venueSelect.value && !spaceSelect.value) {
        setStatus("행사장 또는 실제 공간단위 중 하나를 선택해주세요.", "warn");
        return;
      }
      if (!layoutTypeInput.value.trim()) {
        setStatus("레이아웃 유형을 입력해주세요.", "warn");
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = "저장 중...";

      try {
        let fileRecord = null;
        if (selectedFile) {
          const upload = await uploadVenueLayoutFile(selectedFile);
          const fileRows = await loggedSupabaseRequest("files insert", "files?select=*", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              bucket: upload.bucket,
              storage_path: upload.storagePath,
              public_url: upload.publicUrl,
              original_filename: selectedFile.name,
              file_type: selectedFile.type === "application/pdf" ? "pdf" : "image",
              mime_type: selectedFile.type || null,
              file_size: selectedFile.size || null,
              description: notesInput.value.trim() || null,
            }),
          });
          fileRecord = fileRows?.[0] || null;
          if (!fileRecord?.id) throw new Error("파일 메타데이터 저장 결과를 확인하지 못했습니다.");
        } else if (editingFileId) {
          const updatedFileRows = await loggedSupabaseRequest("files update", `files?id=eq.${encodeURIComponent(editingFileId)}&select=*`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              description: notesInput.value.trim() || null,
            }),
          });
          fileRecord = updatedFileRows?.[0] || { id: editingFileId };
        }

        const layoutPayload = {
          venue_id: venueSelect.value || null,
          space_id: spaceSelect.value || null,
          layout_type: layoutTypeInput.value.trim(),
          min_people: toNullableInteger(minPeopleInput.value),
          max_people: toNullableInteger(maxPeopleInput.value),
          table_type: tableTypeInput.value.trim() || null,
          table_count: toNullableInteger(tableCountInput.value),
          setup_capacity: toNullableInteger(setupCapacityInput.value),
          column_count: toNullableInteger(columnCountInput.value),
          row_count: toNullableInteger(rowCountInput.value),
          seats_per_table: toNullableInteger(seatsPerTableInput.value),
          base_table_count: toNullableInteger(baseTableCountInput.value),
          extra_table_count: toNullableInteger(extraTableCountInput.value) || 0,
          capacity_rule: capacityRuleInput.value.trim() || null,
          has_stage: hasStageInput.checked,
          has_buffet: hasBuffetInput.checked,
          is_verified: isVerifiedInput.checked,
          verified_by: isVerifiedInput.checked ? "banquet_erp" : null,
          verified_at: isVerifiedInput.checked ? new Date().toISOString() : null,
          layout_notes: notesInput.value.trim() || null,
          source_type: "manual_upload",
        };
        if (fileRecord?.id) layoutPayload.file_id = fileRecord.id;

        let layoutRecord = null;
        if (editingLayoutId) {
          const updatedLayoutRows = await loggedSupabaseRequest("venue_layout_images update", `venue_layout_images?id=eq.${encodeURIComponent(editingLayoutId)}&select=*`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify(layoutPayload),
          });
          layoutRecord = updatedLayoutRows?.[0] || { id: editingLayoutId };
        } else {
          const layoutRows = await loggedSupabaseRequest("venue_layout_images insert", "venue_layout_images?select=*", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify(layoutPayload),
          });
          layoutRecord = layoutRows?.[0] || null;
        }

        if (!layoutRecord?.id) throw new Error("레이아웃 이미지 저장 결과를 확인하지 못했습니다.");

        if (fileRecord?.id) {
          await syncFileLinks(fileRecord.id, layoutRecord.id);
        }

        if (editingLayoutId && selectedFile && editingFileId && editingFileId !== fileRecord?.id) {
          await deleteStoredFile(editingStorageBucket, editingStoragePath, editingFileId, { ignoreErrors: true });
        }

        setStatus(editingLayoutId ? "도면/레이아웃 이미지를 수정했습니다." : "도면/레이아웃 이미지를 등록했습니다.");
        resetForm();
        await loadVenueLayoutImages();
      } catch (error) {
        console.error("venue layout image save failed:", error);
        setStatus(error.message || "도면/레이아웃 이미지 저장에 실패했습니다.", "error");
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = editingLayoutId ? "수정 저장" : "등록";
      }
    }

    async function syncFileLinks(fileId, layoutId) {
      await loggedSupabaseRequest(
        "file_links delete for file",
        `file_links?file_id=eq.${encodeURIComponent(fileId)}`,
        { method: "DELETE" }
      );
      const linkRows = [];
      if (venueSelect.value) {
        linkRows.push({
          file_id: fileId,
          entity_type: "venue",
          entity_id: venueSelect.value,
          link_type: "layout_image",
        });
      }
      if (spaceSelect.value) {
        linkRows.push({
          file_id: fileId,
          entity_type: "venue_space",
          entity_id: spaceSelect.value,
          link_type: "layout_image",
        });
      }
      linkRows.push({
        file_id: fileId,
        entity_type: "venue_layout_image",
        entity_id: layoutId,
        link_type: "primary_file",
      });
      await loggedSupabaseRequest("file_links insert", "file_links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkRows),
      });
    }

    async function deleteVenueLayoutImage(row) {
      if (!isAdminUser()) {
        setStatus("도면/레이아웃 이미지 삭제는 관리자만 사용할 수 있습니다.", "warn");
        return;
      }
      const file = Array.isArray(row.files) ? row.files[0] : row.files;
      const label = [row.venues?.venue_name || row.venue_spaces?.space_name || "장소 미지정", row.layout_type || "레이아웃"].join(" / ");
      if (!window.confirm(`"${label}" 도면/레이아웃 이미지를 삭제하시겠습니까?`)) return;

      try {
        await loggedSupabaseRequest(
          "venue_layout_images delete",
          `venue_layout_images?id=eq.${encodeURIComponent(row.id)}`,
          { method: "DELETE" }
        );
        if (file?.id) {
          await deleteStoredFile(file.bucket, file.storage_path, file.id, { ignoreErrors: false });
        }
        setStatus("도면/레이아웃 이미지를 삭제했습니다.");
        await loadVenueLayoutImages();
      } catch (error) {
        console.error("venue layout image delete failed:", error);
        setStatus(error.message || "도면/레이아웃 이미지 삭제에 실패했습니다.", "error");
      }
    }

    async function deleteStoredFile(bucket, storagePath, fileId, options = {}) {
      const { ignoreErrors = false } = options;
      try {
        if (bucket && storagePath) {
          const deleteUrl = `${supabaseConfig.url}/storage/v1/object/${bucket}/${String(storagePath).split("/").map(encodeURIComponent).join("/")}`;
          const response = await fetch(deleteUrl, {
            method: "DELETE",
            headers: {
              apikey: supabaseConfig.anonKey,
              Authorization: `Bearer ${supabaseConfig.anonKey}`,
            },
          });
          if (!response.ok && response.status !== 404) {
            throw await supabaseErrorFromResponse(response, "Storage 파일 삭제에 실패했습니다.");
          }
        }
        if (fileId) {
          await loggedSupabaseRequest(
            "files delete",
            `files?id=eq.${encodeURIComponent(fileId)}`,
            { method: "DELETE" }
          );
        }
      } catch (error) {
        if (!ignoreErrors) throw error;
        console.warn("stored file cleanup skipped:", error);
      }
    }

    function resetForm() {
      selectedFile = null;
      editingLayoutId = null;
      editingFileId = null;
      editingStorageBucket = "";
      editingStoragePath = "";
      form.reset();
      renderPreview();
      saveButton.textContent = "등록";
      resetButton.textContent = "초기화";
    }

    function bindEvents() {
      fileInput.addEventListener("change", handleFileSelection);
      form.addEventListener("submit", saveVenueLayoutImage);
      resetButton.addEventListener("click", resetForm);
      refreshButton.addEventListener("click", loadVenueLayoutImages);
    }

    return {
      bindEvents,
      loadVenueLayoutImages,
      loadVenueLayoutReferences,
    };
  }

  window.BANQUET_ERP_VENUE_LAYOUT_MANAGER = {
    createVenueLayoutManager,
  };
})();

