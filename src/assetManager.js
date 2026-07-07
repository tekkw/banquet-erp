/*
 * 역할:
 * - 연회장 자산의 조회, 등록, 수정, 삭제, 이미지 업로드/미리보기/확대보기를 담당한다.
 *
 * 왜 분리했는지:
 * - 자산관리는 행사 캘린더나 이벤트오더 추출과 다른 독립 업무 흐름이다.
 * - 관리자 권한, 이미지 Storage 업로드, 목록 테이블 렌더링이 한곳에 섞이면 UI 수정과 권한 수정이 서로 영향을 준다.
 *
 * 다른 파일과 어떻게 연결되는지:
 * - storage.js의 Supabase 요청 함수를 받아 banquet_assets 테이블과 asset-images Storage를 사용한다.
 * - auth.js의 관리자 권한 판정 함수를 받아 일반 사용자에게는 조회만 허용한다.
 * - 메인 앱은 자산 목록 상태를 AI 분석에 재사용하므로, setAssets 콜백으로 최신 목록을 공유한다.
 *
 * 향후 추가 예정:
 * - 객실 비품, 식음 기자재, 시설 장비처럼 부서별 자산관리 화면을 같은 구조로 확장할 수 있다.
 */
(function registerBanquetErpAssetManager() {
  /*
   * 왜 이 함수를 만들었는지:
   * - 자산관리 DOM, Supabase 함수, 권한 판정을 하나의 컨트롤러로 묶기 위해 만들었다.
   *
   * 왜 여기 있어야 하는지:
   * - 자산관리 화면은 목록, 폼, 이미지 모달, 관리자 권한이 함께 움직이는 하나의 업무 단위다.
   *
   * 실무 설계 이유:
   * - 업무 단위별 컨트롤러를 만들면 나중에 자산관리만 별도 화면이나 탭으로 떼어내도 재사용하기 쉽다.
   */
  function createAssetManager({ elements, deps, state }) {
    const {
      assetPanel,
      assetForm,
      assetNameInput,
      assetFloorInput,
      assetLocationInput,
      assetQuantityInput,
      assetSpecInput,
      assetImageInput,
      assetImagePreview,
      assetSaveButton,
      assetCancelButton,
      assetTableBody,
      imageModal,
      imageModalTitle,
      imageModalImg,
    } = elements;

    const {
      supabaseConfig,
      loggedSupabaseRequest,
      parseSupabaseResponse,
      toNullableInteger,
      setStatus,
      isAdminUser,
    } = deps;

    let editingAssetId = null;
    let editingAssetImageUrl = "";
    let selectedAssetImageFile = null;

    /*
     * 왜 이 함수를 만들었는지:
     * - Supabase에서 자산 목록을 불러와 화면 상태와 AI 분석용 공유 상태를 함께 갱신하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - banquet_assets 테이블 조회는 자산관리 모듈의 데이터 진입점이다.
     *
     * 실무 설계 이유:
     * - 목록 조회와 렌더링을 모듈 안에 두면 새로고침, 저장 후 갱신, 모바일 탭 이동에서 같은 흐름을 재사용할 수 있다.
     */
    async function loadBanquetAssets() {
      assetTableBody.innerHTML = '<tr><td colspan="7">등록된 자산이 없습니다.</td></tr>';
      try {
        const rows = await loggedSupabaseRequest(
          "banquet_assets select",
          "banquet_assets?select=*&order=asset_name.asc"
        );
        state.setAssets(rows || []);
        renderBanquetAssets();
      } catch (error) {
        console.error("banquet_assets load failed:", error);
        assetTableBody.innerHTML = `<tr><td colspan="7">자산 목록을 불러오지 못했습니다. ${error.message || ""}</td></tr>`;
        setStatus(error.message || "연회장 자산을 불러오지 못했습니다.", "warn");
      }
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 관리자/일반 사용자 권한에 따라 자산관리 폼과 안내 문구를 일관되게 표시하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 자산 추가/수정/삭제 권한은 자산관리 화면의 핵심 접근 제어다.
     *
     * 실무 설계 이유:
     * - 권한별 UI 처리를 모듈 안에 두면 관리자가 아닌 사용자에게 실수로 수정 버튼이 노출되는 위험을 줄일 수 있다.
     */
    function applyAssetPermissionState() {
      assetPanel.classList.toggle("readonly", !isAdminUser());
      let note = assetPanel.querySelector(".asset-permission-note");
      if (!isAdminUser()) {
        if (!note) {
          note = document.createElement("div");
          note.className = "asset-permission-note";
          note.textContent = "일반 사용자는 자산 목록 조회만 가능합니다. 추가, 수정, 삭제는 관리자만 사용할 수 있습니다.";
          assetForm.insertAdjacentElement("beforebegin", note);
        }
        resetAssetForm();
      } else if (note) {
        note.remove();
      }
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - Supabase에서 불러온 연회장 자산을 권한 상태에 맞게 목록으로 표시하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 자산 테이블 DOM 생성은 자산관리 모듈의 화면 책임이다.
     *
     * 실무 설계 이유:
     * - 목록 렌더링을 모듈 안에 모으면 이미지 썸네일, 위치 컬럼, 관리자 버튼 변경이 한곳에서 끝난다.
     */
    function renderBanquetAssets() {
      applyAssetPermissionState();
      const banquetAssets = state.getAssets();
      assetTableBody.innerHTML = "";
      if (!banquetAssets.length) {
        assetTableBody.innerHTML = '<tr><td colspan="7">등록된 자산이 없습니다.</td></tr>';
        return;
      }

      banquetAssets.forEach((asset) => {
        const row = document.createElement("tr");
        const imageCell = document.createElement("td");
        if (asset.image_url) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "asset-thumb-button";
          button.addEventListener("click", () => openAssetImageModal(asset));
          const image = document.createElement("img");
          image.className = "asset-thumb";
          image.src = asset.image_url;
          image.alt = `${asset.asset_name || "자산"} 이미지`;
          button.append(image);
          imageCell.append(button);
        } else {
          const empty = document.createElement("span");
          empty.className = "asset-no-image";
          empty.textContent = "이미지 없음";
          imageCell.append(empty);
        }
        row.append(imageCell);
        [
          asset.asset_name || "",
          asset.floor || "",
          asset.location || "",
          asset.quantity ?? "",
          asset.spec || "",
        ].forEach((value, index) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          if (index === 3) cell.className = "number-cell";
          row.append(cell);
        });

        const actionCell = document.createElement("td");
        actionCell.className = "admin-only-cell";
        const actions = document.createElement("div");
        actions.className = "asset-actions";
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "수정";
        editButton.addEventListener("click", () => startEditBanquetAsset(asset));
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger-button";
        deleteButton.textContent = "삭제";
        deleteButton.addEventListener("click", () => deleteBanquetAsset(asset));
        actions.append(editButton, deleteButton);
        actionCell.append(actions);
        row.append(actionCell);
        assetTableBody.append(row);
      });
    }

    function startEditBanquetAsset(asset) {
      if (!isAdminUser()) {
        setStatus("자산 수정은 관리자만 사용할 수 있습니다.", "warn");
        return;
      }
      editingAssetId = asset.id;
      editingAssetImageUrl = asset.image_url || "";
      selectedAssetImageFile = null;
      assetNameInput.value = asset.asset_name || "";
      assetFloorInput.value = asset.floor || "";
      assetLocationInput.value = asset.location || "";
      assetQuantityInput.value = asset.quantity ?? "";
      assetSpecInput.value = asset.spec || "";
      assetImageInput.value = "";
      renderAssetImagePreview(editingAssetImageUrl);
      assetSaveButton.textContent = "저장";
      assetCancelButton.hidden = false;
      assetNameInput.focus();
    }

    function resetAssetForm() {
      editingAssetId = null;
      editingAssetImageUrl = "";
      selectedAssetImageFile = null;
      assetForm.reset();
      renderAssetImagePreview("");
      assetSaveButton.textContent = "등록";
      assetCancelButton.hidden = true;
    }

    function handleAssetImageSelection(event) {
      const file = event.target.files?.[0] || null;
      selectedAssetImageFile = file;
      if (!file) {
        renderAssetImagePreview(editingAssetImageUrl);
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      renderAssetImagePreview(previewUrl, file.name);
    }

    function renderAssetImagePreview(imageUrl, labelText = "") {
      assetImagePreview.innerHTML = "";
      if (!imageUrl) {
        assetImagePreview.textContent = "이미지 없음";
        return;
      }
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "자산 이미지 미리보기";
      const label = document.createElement("span");
      label.textContent = labelText || "기존 이미지";
      assetImagePreview.append(image, label);
    }

    function openAssetImageModal(asset) {
      if (!asset.image_url) return;
      imageModalTitle.textContent = asset.asset_name || "자산 이미지";
      imageModalImg.src = asset.image_url;
      imageModal.classList.add("visible");
    }

    function closeAssetImageModal() {
      imageModal.classList.remove("visible");
      imageModalImg.removeAttribute("src");
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 자산 이미지를 Supabase Storage의 asset-images 버킷에 업로드하고 public URL을 얻기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 자산 이미지 파일명 정책과 버킷 경로는 자산관리 업무에 종속된 저장 규칙이다.
     *
     * 실무 설계 이유:
     * - 이미지 업로드 실패를 자산 저장 오류와 구분해 처리하면 현장에서 문제 원인을 더 빨리 찾을 수 있다.
     */
    async function uploadAssetImage(file, assetId) {
      const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const storagePath = `assets/${assetId || "asset"}_${Date.now()}.${extension}`;
      const encodedPath = encodeURIComponent(storagePath);
      const uploadUrl = `${supabaseConfig.url}/storage/v1/object/${supabaseConfig.assetImageBucket}/${encodedPath}`;
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: file,
      });
      const body = await parseSupabaseResponse(response).catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "자산 이미지 업로드에 실패했습니다. asset-images 버킷이 있는지 확인해주세요.");
      }
      return `${supabaseConfig.url}/storage/v1/object/public/${supabaseConfig.assetImageBucket}/${encodedPath}`;
    }

    /*
     * 왜 이 함수를 만들었는지:
     * - 자산 등록과 수정을 한 폼에서 처리하고, 필요 시 이미지를 함께 업로드하기 위해 만들었다.
     *
     * 왜 여기 있어야 하는지:
     * - 자산 폼 값, 이미지 파일, Supabase 저장 요청이 모두 자산관리 모듈의 책임이다.
     *
     * 실무 설계 이유:
     * - 신규/수정 흐름을 한 함수에 두면 중복을 줄이되, 권한 체크와 오류 처리를 한곳에서 일관되게 적용할 수 있다.
     */
    async function saveBanquetAsset(event) {
      event.preventDefault();
      if (!isAdminUser()) {
        setStatus("자산 등록/수정은 관리자만 사용할 수 있습니다.", "warn");
        return;
      }
      const payload = {
        asset_name: assetNameInput.value.trim(),
        floor: assetFloorInput.value.trim(),
        location: assetLocationInput.value.trim(),
        quantity: toNullableInteger(assetQuantityInput.value),
        spec: assetSpecInput.value.trim(),
        image_url: editingAssetImageUrl || null,
      };
      if (!payload.asset_name) return;

      assetSaveButton.disabled = true;
      try {
        if (editingAssetId) {
          if (selectedAssetImageFile) {
            payload.image_url = await uploadAssetImage(selectedAssetImageFile, editingAssetId);
          }
          await loggedSupabaseRequest(
            "banquet_assets update",
            `banquet_assets?id=eq.${encodeURIComponent(editingAssetId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          );
          setStatus("연회장 자산을 수정했습니다.");
        } else {
          const insertedRows = await loggedSupabaseRequest("banquet_assets insert", "banquet_assets", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          });
          const insertedAsset = insertedRows?.[0];
          if (selectedAssetImageFile && insertedAsset?.id) {
            const imageUrl = await uploadAssetImage(selectedAssetImageFile, insertedAsset.id);
            await loggedSupabaseRequest(
              "banquet_assets image update",
              `banquet_assets?id=eq.${encodeURIComponent(insertedAsset.id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_url: imageUrl }),
              }
            );
          }
          setStatus("연회장 자산을 등록했습니다.");
        }
        resetAssetForm();
        await loadBanquetAssets();
      } catch (error) {
        console.error("banquet_assets save failed:", error);
        setStatus(error.message || "연회장 자산 저장에 실패했습니다.", "error");
      } finally {
        assetSaveButton.disabled = false;
      }
    }

    async function deleteBanquetAsset(asset) {
      if (!isAdminUser()) {
        setStatus("자산 삭제는 관리자만 사용할 수 있습니다.", "warn");
        return;
      }
      if (!window.confirm(`"${asset.asset_name}" 자산을 삭제하시겠습니까?`)) return;
      try {
        await loggedSupabaseRequest(
          "banquet_assets delete",
          `banquet_assets?id=eq.${encodeURIComponent(asset.id)}`,
          { method: "DELETE" }
        );
        setStatus("연회장 자산을 삭제했습니다.");
        if (editingAssetId === asset.id) resetAssetForm();
        await loadBanquetAssets();
      } catch (error) {
        console.error("banquet_assets delete failed:", error);
        setStatus(error.message || "연회장 자산 삭제에 실패했습니다.", "error");
      }
    }

    return {
      loadBanquetAssets,
      applyAssetPermissionState,
      renderBanquetAssets,
      resetAssetForm,
      handleAssetImageSelection,
      closeAssetImageModal,
      saveBanquetAsset,
    };
  }

  window.BANQUET_ERP_ASSET_MANAGER = {
    createAssetManager,
  };
})();
