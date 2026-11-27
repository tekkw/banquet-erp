(function registerSettingManualManager(global) {
  "use strict";

  const BUCKET = "setting-manuals";
  const ENTITY_TYPE = "setting_manual";
  const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const normalizeSearch = (value) => String(value || "").toLowerCase().replace(/\s+/g, "").trim();
  const splitList = (value) => [...new Set(String(value || "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
  const isImage = (file) => String(file?.mime_type || "").startsWith("image/");
  const publicUrl = (config, file) => file?.public_url || `${config.url}/storage/v1/object/public/${encodeURIComponent(file?.bucket || BUCKET)}/${String(file?.storage_path || "").split("/").map(encodeURIComponent).join("/")}`;

  function createSettingManualManager({ root, deps }) {
    const { supabaseConfig, request, headers, currentUser, isAdminUser, setStatus = () => {} } = deps;
    let categories = [];
    let manuals = [];
    let links = [];
    let files = [];
    let selectedManualId = "";
    let editingManualId = "";
    let pendingFiles = [];
    let categoryFilter = "all";
    let searchText = "";

    const fileMap = () => new Map(files.map((file) => [String(file.id), file]));
    const categoryMap = () => new Map(categories.map((row) => [String(row.id), row]));
    const manualFiles = (manualId) => {
      const byId = fileMap();
      return links.filter((row) => String(row.entity_id) === String(manualId)).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((link) => ({ ...byId.get(String(link.file_id)), link })).filter((row) => row.id);
    };
    const displayDate = (value) => value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value)) : "-";

    function renderShell() {
      if (!root) return;
      root.innerHTML = `
        <header class="setting-manual-header"><div><span class="eyebrow">Operations knowledge</span><h1>세팅 매뉴얼</h1><p>현장에서 사용하는 실제 세팅 사진과 설명을 관리합니다.</p></div>${isAdminUser() ? '<button type="button" class="primary-button" data-manual-new>+ 신규 매뉴얼 등록</button>' : ""}</header>
        <section class="setting-manual-toolbar"><label>매뉴얼 검색<input type="search" data-manual-search placeholder="제목, 키워드, 설명 검색"></label><label>카테고리<select data-manual-category-filter><option value="all">전체</option></select></label>${isAdminUser() ? '<button type="button" data-category-manage>카테고리 관리</button>' : ""}</section>
        <p class="setting-manual-status" data-manual-status aria-live="polite"></p>
        <div class="setting-manual-layout"><section class="setting-manual-list" data-manual-list></section><aside class="setting-manual-detail" data-manual-detail><p>매뉴얼을 선택하세요.</p></aside></div>
        <dialog class="setting-manual-dialog" data-manual-dialog></dialog>
        <dialog class="setting-manual-dialog setting-category-dialog" data-category-dialog></dialog>
        <dialog class="setting-manual-viewer" data-manual-viewer><button type="button" data-viewer-close aria-label="닫기">×</button><img alt="세팅 매뉴얼 확대 이미지" data-viewer-image></dialog>`;
      bindStaticEvents();
      renderFilters();
      renderList();
      renderDetail();
    }

    function setMessage(message, error = false) {
      const node = root?.querySelector("[data-manual-status]");
      if (node) { node.textContent = message || ""; node.classList.toggle("error", error); }
      setStatus(message || "");
    }

    function renderFilters() {
      const select = root?.querySelector("[data-manual-category-filter]");
      if (!select) return;
      select.innerHTML = `<option value="all">전체</option>${categories.filter((row) => row.is_active).map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`).join("")}`;
      select.value = categoryFilter;
    }

    function filteredManuals() {
      const term = normalizeSearch(searchText);
      return manuals.filter((manual) => categoryFilter === "all" || String(manual.category_id) === categoryFilter).filter((manual) => {
        if (!term) return true;
        return normalizeSearch([manual.title, manual.description, manual.instructions, ...(manual.keywords || []), ...(manual.applicable_venues || [])].join(" ")).includes(term);
      });
    }

    function renderList() {
      const list = root?.querySelector("[data-manual-list]");
      if (!list) return;
      const categoryById = categoryMap();
      const rows = filteredManuals();
      list.innerHTML = rows.map((manual) => {
        const linked = manualFiles(manual.id); const primary = linked.find((file) => file.link?.link_type === "primary") || linked.find(isImage) || linked[0];
        const preview = primary && isImage(primary) ? `<img src="${escapeHtml(publicUrl(supabaseConfig, primary))}" alt="${escapeHtml(manual.title)} 대표 이미지" loading="lazy">` : '<span class="setting-manual-placeholder">MANUAL</span>';
        return `<button type="button" class="setting-manual-card ${String(selectedManualId) === String(manual.id) ? "selected" : ""}" data-manual-id="${escapeHtml(manual.id)}"><span class="setting-manual-thumb">${preview}</span><span class="setting-manual-card-copy"><strong>${escapeHtml(manual.title)}</strong><small>${escapeHtml(categoryById.get(String(manual.category_id))?.name || "미분류")} · 이미지 ${linked.filter(isImage).length}개</small><span>${escapeHtml(manual.description || manual.instructions || "설명 없음")}</span><small>${escapeHtml(displayDate(manual.updated_at))} · ${escapeHtml(manual.status)}</small></span></button>`;
      }).join("") || '<p class="setting-manual-empty">조건에 맞는 매뉴얼이 없습니다.</p>';
      list.querySelectorAll("[data-manual-id]").forEach((button) => button.onclick = () => { selectedManualId = button.dataset.manualId; renderList(); renderDetail(); });
    }

    function renderDetail() {
      const detail = root?.querySelector("[data-manual-detail]");
      if (!detail) return;
      const manual = manuals.find((row) => String(row.id) === String(selectedManualId));
      if (!manual) { detail.innerHTML = "<p>매뉴얼을 선택하세요.</p>"; return; }
      const linked = manualFiles(manual.id); const images = linked.filter(isImage); const docs = linked.filter((file) => !isImage(file)); const category = categoryMap().get(String(manual.category_id));
      detail.innerHTML = `<header><div><span>${escapeHtml(category?.name || "미분류")}</span><h2>${escapeHtml(manual.title)}</h2></div>${isAdminUser() ? `<div><button type="button" data-manual-edit>수정</button><button type="button" data-manual-disable>${manual.status === "INACTIVE" ? "활성화" : "비활성"}</button></div>` : ""}</header>
        ${images.length ? `<div class="setting-manual-gallery">${images.map((file) => `<button type="button" data-manual-image="${escapeHtml(publicUrl(supabaseConfig, file))}"><img src="${escapeHtml(publicUrl(supabaseConfig, file))}" alt="${escapeHtml(file.description || file.original_filename || manual.title)}"><small>${escapeHtml(file.description || file.original_filename || "")}</small></button>`).join("")}</div>` : ""}
        ${manual.description ? `<section><h3>소개</h3><p>${escapeHtml(manual.description)}</p></section>` : ""}
        ${manual.instructions ? `<section><h3>세팅 방법</h3><p>${escapeHtml(manual.instructions)}</p></section>` : ""}
        ${manual.precautions ? `<section><h3>주의사항</h3><p>${escapeHtml(manual.precautions)}</p></section>` : ""}
        ${(manual.keywords || []).length ? `<section><h3>검색 키워드</h3><p>${manual.keywords.map(escapeHtml).join(" · ")}</p></section>` : ""}
        ${docs.length ? `<section><h3>첨부자료</h3>${docs.map((file) => `<a href="${escapeHtml(publicUrl(supabaseConfig, file))}" target="_blank" rel="noopener">${escapeHtml(file.original_filename || "첨부자료 열기")}</a>`).join("")}</section>` : ""}`;
      detail.querySelector("[data-manual-edit]")?.addEventListener("click", () => openManualDialog(manual));
      detail.querySelector("[data-manual-disable]")?.addEventListener("click", () => toggleManualStatus(manual));
      detail.querySelectorAll("[data-manual-image]").forEach((button) => button.onclick = () => openViewer(button.dataset.manualImage));
    }

    function bindStaticEvents() {
      root.querySelector("[data-manual-new]")?.addEventListener("click", () => openManualDialog());
      root.querySelector("[data-category-manage]")?.addEventListener("click", openCategoryDialog);
      root.querySelector("[data-manual-search]").oninput = (event) => { searchText = event.target.value; renderList(); };
      root.querySelector("[data-manual-category-filter]").onchange = (event) => { categoryFilter = event.target.value; renderList(); };
      const viewer = root.querySelector("[data-manual-viewer]");
      root.querySelector("[data-viewer-close]").onclick = () => viewer.close();
      viewer.addEventListener("click", (event) => { if (event.target === viewer) viewer.close(); });
    }

    function openViewer(url) { const viewer = root.querySelector("[data-manual-viewer]"); viewer.querySelector("img").src = url; viewer.showModal(); }

    function openManualDialog(manual = null) {
      if (!isAdminUser()) return;
      editingManualId = manual?.id || ""; pendingFiles = [];
      const dialog = root.querySelector("[data-manual-dialog]");
      const existing = manual ? manualFiles(manual.id) : [];
      dialog.innerHTML = `<form data-manual-form><header><div><span class="eyebrow">Setting manual</span><h2>${manual ? "매뉴얼 수정" : "신규 매뉴얼 등록"}</h2></div><button type="button" data-dialog-close>×</button></header><div class="setting-manual-form-grid"><label>제목<input name="title" required value="${escapeHtml(manual?.title || "")}"></label><label>카테고리<select name="categoryId" required>${categories.filter((row) => row.is_active).map((row) => `<option value="${escapeHtml(row.id)}" ${String(row.id) === String(manual?.category_id) ? "selected" : ""}>${escapeHtml(row.name)}</option>`).join("")}</select></label><label class="wide">간단한 설명<textarea name="description" rows="2">${escapeHtml(manual?.description || "")}</textarea></label><label class="wide">세팅 방법 및 설명<textarea name="instructions" rows="7">${escapeHtml(manual?.instructions || "")}</textarea></label><label class="wide">주의사항<textarea name="precautions" rows="3">${escapeHtml(manual?.precautions || "")}</textarea></label><label class="wide">검색 키워드 및 유사 표현<input name="keywords" value="${escapeHtml((manual?.keywords || []).join(", "))}" placeholder="커피브레이크, 커피 브레이크, Coffee Break"></label><label class="wide">적용 행사장<input name="venues" value="${escapeHtml((manual?.applicable_venues || []).join(", "))}" placeholder="선택 사항"></label><label>상태<select name="status"><option value="DRAFT" ${manual?.status === "DRAFT" ? "selected" : ""}>초안</option><option value="PUBLISHED" ${manual?.status === "PUBLISHED" ? "selected" : ""}>공개</option><option value="INACTIVE" ${manual?.status === "INACTIVE" ? "selected" : ""}>비활성</option></select></label><label>이미지 및 PDF<input name="files" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple></label></div><section class="setting-manual-file-editor" data-file-editor>${existing.map((file, index) => `<div data-existing-file="${escapeHtml(file.id)}"><span>${escapeHtml(file.original_filename)}</span><label>대표 <input type="radio" name="primaryExisting" value="${escapeHtml(file.id)}" ${file.link?.link_type === "primary" || (!existing.some((entry) => entry.link?.link_type === "primary") && index === 0) ? "checked" : ""}></label><button type="button" data-file-up>↑</button><button type="button" data-file-down>↓</button><button type="button" data-file-remove>제거</button></div>`).join("")}</section><p class="setting-manual-form-error" data-form-error></p><footer><button type="button" data-dialog-close>취소</button><button type="submit" class="primary-button">저장</button></footer></form>`;
      bindFileEditor(dialog);
      dialog.querySelector('[name="files"]').onchange = (event) => { pendingFiles = [...event.target.files]; renderPendingFiles(dialog); };
      dialog.querySelectorAll("[data-dialog-close]").forEach((button) => button.onclick = () => dialog.close());
      dialog.querySelector("form").onsubmit = saveManual;
      dialog.showModal();
    }

    function renderPendingFiles(dialog) {
      dialog.querySelectorAll("[data-pending-file]").forEach((node) => node.remove());
      const editor = dialog.querySelector("[data-file-editor]");
      pendingFiles.forEach((file, index) => editor.insertAdjacentHTML("beforeend", `<div data-pending-file="${index}"><span>${escapeHtml(file.name)}</span><small>새 파일</small><button type="button" data-pending-remove>제거</button></div>`));
      editor.querySelectorAll("[data-pending-remove]").forEach((button) => button.onclick = () => { pendingFiles.splice(Number(button.closest("[data-pending-file]").dataset.pendingFile), 1); renderPendingFiles(dialog); });
    }

    function bindFileEditor(dialog) {
      dialog.querySelectorAll("[data-existing-file]").forEach((row) => {
        row.querySelector("[data-file-remove]").onclick = () => row.dataset.removed = row.dataset.removed === "true" ? "false" : "true";
        row.querySelector("[data-file-up]").onclick = () => row.previousElementSibling?.before(row);
        row.querySelector("[data-file-down]").onclick = () => row.nextElementSibling?.after(row);
      });
    }

    async function uploadFile(manualId, file, sortOrder, linkType = "attachment") {
      if (!ACCEPTED_TYPES.has(file.type)) throw new Error(`${file.name}: 지원하지 않는 파일 형식입니다.`);
      const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
      const storagePath = `${manualId}/${crypto.randomUUID()}.${extension || "bin"}`;
      const response = await fetch(`${supabaseConfig.url}/storage/v1/object/${BUCKET}/${storagePath.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { ...headers(), "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (!response.ok) { const body = await response.text(); throw new Error(`파일 업로드 실패: ${body || response.status}`); }
      const inserted = await request("files?select=*", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ bucket: BUCKET, storage_path: storagePath, public_url: `${supabaseConfig.url}/storage/v1/object/public/${BUCKET}/${storagePath}`, original_filename: file.name, file_type: file.type === "application/pdf" ? "pdf" : "image", mime_type: file.type, file_size: file.size, uploaded_by: currentUser()?.id || "" }) });
      const row = inserted?.[0]; if (!row?.id) throw new Error("업로드 파일 메타데이터 저장 결과를 확인하지 못했습니다.");
      await request("file_links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_id: row.id, entity_type: ENTITY_TYPE, entity_id: manualId, link_type: linkType, sort_order: sortOrder }) });
      return row;
    }

    async function saveManual(event) {
      event.preventDefault();
      const form = event.currentTarget; const errorNode = form.querySelector("[data-form-error]"); errorNode.textContent = "";
      const data = Object.fromEntries(new FormData(form)); const existingRows = [...form.querySelectorAll("[data-existing-file]")];
      const hasExisting = existingRows.some((row) => row.dataset.removed !== "true");
      if (!String(data.description || "").trim() && !String(data.instructions || "").trim() && !hasExisting && !pendingFiles.length) { errorNode.textContent = "설명 또는 첨부자료 중 하나 이상이 필요합니다."; return; }
      const payload = { category_id: data.categoryId, title: String(data.title || "").trim(), description: String(data.description || "").trim() || null, instructions: String(data.instructions || "").trim() || null, precautions: String(data.precautions || "").trim() || null, keywords: splitList(data.keywords), applicable_venues: splitList(data.venues), status: data.status, created_by: currentUser()?.id || "" };
      try {
        setMessage("매뉴얼을 저장하고 있습니다...");
        let manualId = editingManualId;
        if (manualId) await request(`setting_manuals?id=eq.${encodeURIComponent(manualId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) });
        else { const inserted = await request("setting_manuals?select=*", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) }); manualId = inserted?.[0]?.id; }
        if (!manualId) throw new Error("매뉴얼 저장 결과를 확인하지 못했습니다.");
        const removed = existingRows.filter((row) => row.dataset.removed === "true").map((row) => row.dataset.existingFile);
        for (const fileId of removed) await request(`file_links?entity_type=eq.${ENTITY_TYPE}&entity_id=eq.${manualId}&file_id=eq.${fileId}`, { method: "DELETE" });
        const kept = existingRows.filter((row) => row.dataset.removed !== "true");
        for (let index = 0; index < kept.length; index += 1) await request(`file_links?entity_type=eq.${ENTITY_TYPE}&entity_id=eq.${manualId}&file_id=eq.${kept[index].dataset.existingFile}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: index, link_type: data.primaryExisting === kept[index].dataset.existingFile ? "primary" : "attachment" }) });
        const hasPrimary = kept.some((row) => data.primaryExisting === row.dataset.existingFile);
        for (let index = 0; index < pendingFiles.length; index += 1) await uploadFile(manualId, pendingFiles[index], kept.length + index, !hasPrimary && index === 0 ? "primary" : "attachment");
        await load();
        const verified = manuals.find((row) => String(row.id) === String(manualId)); if (!verified || verified.title !== payload.title) throw new Error("저장 후 재조회 검증에 실패했습니다.");
        selectedManualId = manualId; root.querySelector("[data-manual-dialog]").close(); renderList(); renderDetail(); setMessage(`${payload.title} 매뉴얼을 저장했습니다.`);
        global.dispatchEvent(new CustomEvent("banquet:setting-manuals-updated", { detail: { manualId } }));
      } catch (error) { console.error("setting manual save failed", { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint }); errorNode.textContent = error.message || "매뉴얼을 저장하지 못했습니다."; setMessage(errorNode.textContent, true); }
    }

    async function toggleManualStatus(manual) {
      if (!isAdminUser()) return;
      const status = manual.status === "INACTIVE" ? "DRAFT" : "INACTIVE";
      try { await request(`setting_manuals?id=eq.${encodeURIComponent(manual.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ status }) }); await load(); selectedManualId = manual.id; renderList(); renderDetail(); setMessage(status === "INACTIVE" ? "매뉴얼을 비활성화했습니다." : "매뉴얼을 초안으로 복원했습니다."); } catch (error) { setMessage(error.message || "상태를 변경하지 못했습니다.", true); }
    }

    function openCategoryDialog() {
      if (!isAdminUser()) return;
      const dialog = root.querySelector("[data-category-dialog]");
      dialog.innerHTML = `<form data-category-form><header><h2>카테고리 관리</h2><button type="button" data-category-close>×</button></header><div data-category-list>${categories.map((row) => `<div data-category-id="${escapeHtml(row.id)}"><input value="${escapeHtml(row.name)}"><input value="${escapeHtml(row.description || "")}" placeholder="설명"><input type="number" value="${Number(row.sort_order || 0)}"><label><input type="checkbox" ${row.is_active ? "checked" : ""}>사용</label><button type="button" data-category-save>저장</button></div>`).join("")}</div><footer><input name="newName" placeholder="새 카테고리 이름"><button type="submit" class="primary-button">추가</button></footer></form>`;
      dialog.querySelector("[data-category-close]").onclick = () => dialog.close();
      dialog.querySelectorAll("[data-category-save]").forEach((button) => button.onclick = async () => { const row = button.closest("[data-category-id]"); const inputs = row.querySelectorAll("input"); await request(`setting_manual_categories?id=eq.${encodeURIComponent(row.dataset.categoryId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: inputs[0].value.trim(), description: inputs[1].value.trim() || null, sort_order: Number(inputs[2].value || 0), is_active: inputs[3].checked }) }); await load(); openCategoryDialog(); });
      dialog.querySelector("form").onsubmit = async (event) => { event.preventDefault(); const name = new FormData(event.currentTarget).get("newName")?.trim(); if (!name) return; await request("setting_manual_categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, sort_order: categories.length * 10 + 10 }) }); await load(); openCategoryDialog(); };
      dialog.showModal();
    }

    async function load() {
      if (!root) return;
      // The manager is created before local-login hydration. Rebuild the shell
      // on entry so admin controls reflect the current authenticated role.
      renderShell();
      try {
        setMessage("세팅 매뉴얼을 불러오는 중입니다...");
        const statusFilter = isAdminUser() ? "" : "&status=eq.PUBLISHED";
        [categories, manuals, links] = await Promise.all([
          request(`setting_manual_categories?select=*&order=sort_order.asc,name.asc${isAdminUser() ? "" : "&is_active=eq.true"}`),
          request(`setting_manuals?select=*&order=updated_at.desc${statusFilter}`),
          request(`file_links?select=*&entity_type=eq.${ENTITY_TYPE}&order=sort_order.asc,created_at.asc`),
        ]);
        const ids = [...new Set((links || []).map((row) => row.file_id).filter(Boolean))];
        files = ids.length ? await request(`files?select=*&id=in.(${ids.map(encodeURIComponent).join(",")})`) : [];
        if (selectedManualId && !manuals.some((row) => String(row.id) === String(selectedManualId))) selectedManualId = "";
        renderFilters(); renderList(); renderDetail(); setMessage(`${manuals.length}개의 매뉴얼을 불러왔습니다.`);
      } catch (error) { console.error("setting manual load failed", error); setMessage(error.message || "세팅 매뉴얼을 불러오지 못했습니다.", true); }
    }

    renderShell();
    return Object.freeze({ load, render: () => { renderList(); renderDetail(); }, search(query) { searchText = query || ""; renderList(); return filteredManuals(); }, getManual: (id) => manuals.find((row) => String(row.id) === String(id)) || null, getFiles: manualFiles });
  }

  global.BANQUET_ERP_SETTING_MANUALS = Object.freeze({ createSettingManualManager, normalizeSearch });
})(window);
