/*
 * Role:
 * - Provides the first object-based venue floorplan editor.
 * - The background floorplan image is stored once, while doors, pillars, screens,
 *   allowed/blocked areas, tables, stages, and buffet objects are stored as data.
 *
 * Why separated:
 * - Floorplan editing has canvas interaction, object coordinates, preview rendering,
 *   and several DB tables. Keeping it out of venueLayoutManager protects the existing
 *   image upload/list/edit/delete flow.
 *
 * How it connects:
 * - List rows in venueLayoutManager dispatch "banquet:open-floorplan-editor".
 * - This editor reads the selected files/venue_layout_images row, saves data to
 *   venue_floorplans, venue_floorplan_objects, venue_layouts, venue_layout_objects,
 *   and creates PNG previews in files + venue_layout_images.
 */
(function registerBanquetErpFloorplanEditor() {
  function createFloorplanEditor({ elements, deps }) {
    const {
      modal,
      closeButton,
      title,
      subtitle,
      canvas,
      floorplanNameInput,
      actualWidthInput,
      actualHeightInput,
      unitSelect,
      savedLayoutsSelect,
      layoutNameInput,
      layoutTypeInput,
      minPeopleInput,
      maxPeopleInput,
      setupCapacityInput,
      tableCountInput,
      rowCountInput,
      columnCountInput,
      seatsPerTableInput,
      tableTypeInput,
      hasStageInput,
      hasBuffetInput,
      layoutNotesInput,
      selectedObjectPanel,
      zoomInButton,
      zoomOutButton,
      resetViewButton,
      copyObjectButton,
      deleteObjectButton,
      generateSeminarGridButton,
      seminarColumnCountInput,
      seminarRowCountInput,
      seminarHorizontalGapInput,
      seminarVerticalGapInput,
      seminarSeatsPerTableInput,
      saveFloorplanButton,
      saveLayoutButton,
      objectSearchInput,
      objectLibraryList,
      workspaceObjectSearchInput,
      workspaceObjectLibraryList,
      workspaceVenueSelect,
      workspaceSpaceSelect,
      workspaceFloorplanSelect,
      workspaceSavedLayoutSelect,
      workspaceSvg,
      workspaceViewport,
      workspaceBackgroundLayer,
      workspaceObjectLayer,
      workspaceGridLayer,
      workspaceSelectionLayer,
      workspaceGuideLayer,
      workspaceEmptyState,
      workspaceStatusPill,
      workspaceStatusbar,
      workspaceFloorplanInfo,
      workspaceLabelInput,
      workspaceXInput,
      workspaceYInput,
      workspaceWidthInput,
      workspaceHeightInput,
      workspaceRotationInput,
      workspaceSeatCountInput,
      workspaceZIndexInput,
      workspaceOpacityInput,
      workspaceWallStartXInput,
      workspaceWallStartYInput,
      workspaceWallEndXInput,
      workspaceWallEndYInput,
      workspaceLengthInput,
      workspaceLengthUnitSelect,
      workspaceWallAngleInput,
      workspaceThicknessInput,
      workspaceThicknessUnitSelect,
      workspaceBringFrontButton,
      workspaceForwardButton,
      workspaceBackwardButton,
      workspaceSendBackButton,
      workspaceRotate90Button,
      workspaceDuplicateButton,
      workspaceDeleteButton,
      workspaceNameInput,
      workspaceNewButton,
      workspaceSaveButton,
      workspaceSaveAsButton,
      workspacePreviewButton,
      workspaceExportButton,
      workspaceUndoButton,
      workspaceRedoButton,
      workspacePreviewModal,
      workspacePreviewBody,
      workspacePreviewCloseButton,
      workspacePreviewDownloadButton,
      workspaceNewModal,
      workspaceNewNameInput,
      workspaceNewFloorplanSelect,
      workspaceNewCreateButton,
      workspaceNewCancelButton,
      workspaceNewCancelFooterButton,
      workspaceZoomInButton,
      workspaceZoomOutButton,
      workspaceFitButton,
      workspaceActualSizeButton,
      workspaceCenterButton,
      workspaceGridButton,
      workspaceSnapButton,
      workspaceDrawingPresetSelect,
      workspaceDrawingWidthInput,
      workspaceDrawingWidthUnitSelect,
      workspaceDrawingHeightInput,
      workspaceDrawingHeightUnitSelect,
      workspaceApplyDrawingSizeButton,
      workspaceModeBaseButton,
      workspaceModeLayoutButton,
      workspaceSelectToolButton,
      workspaceWallToolButton,
      workspaceRectToolButton,
      workspaceCalibrateToolButton,
      workspaceReferenceOpacityInput,
      workspaceGridSizeSelect,
      workspaceCustomGridControl,
      workspaceCustomGridInput,
      workspaceCustomGridUnitSelect,
      workspaceViewGridInput,
      workspaceViewFloorplanInput,
      workspaceViewDimensionsInput,
      workspaceViewNamesInput,
      workspaceViewCoordsInput,
      workspaceDimensionModeSelect,
      workspaceDimensionUnitSelect,
      workspaceExportDimensionsInput,
      workspaceDimensionVisibilitySelect,
      workspaceDimensionPositionSelect,
      workspaceDimensionLabelInput,
      objectTypeForm,
      objectNameInput,
      objectCategoryInput,
      objectTypeInput,
      objectWidthInput,
      objectHeightInput,
      objectElevationInput,
      objectSeatCountInput,
      objectShapeInput,
      objectCanResizeInput,
      objectCanRotateInput,
      objectIsActiveInput,
      objectMemoInput,
      objectTypeSaveButton,
      objectTypeResetButton,
      objectTypeRefreshButton,
      objectTypeTableBody,
      objectTypeLivePreview,
    } = elements;

    const {
      supabaseConfig,
      loggedSupabaseRequest,
      supabaseErrorFromResponse,
      toNullableInteger,
      setStatus,
      isAdminUser,
      reloadVenueLayouts,
    } = deps;

    const ctx = canvas.getContext("2d");
    const objectLabels = {
      door: "\uBB38",
      wall: "\uBCBD",
      structure_area: "\uAD6C\uC870 \uC601\uC5ED",
      calibration: "\uCD95\uCC99 \uBCF4\uC815",
      pillar: "\uAE30\uB465",
      screen: "\uC2A4\uD06C\uB9B0",
      fixed_wall: "고정벽 / 파티션",
      allowed_area: "\uBC30\uCE58 \uAC00\uB2A5",
      blocked_area: "\uBC30\uCE58 \uAE08\uC9C0",
      seminar_table: "\uC138\uBBF8\uB098 \uD14C\uC774\uBE14",
      round_table: "\uB77C\uC6B4\uB4DC \uD14C\uC774\uBE14",
      holding_table: "\uD640\uB529 \uD14C\uC774\uBE14",
      stage: "\uBB34\uB300",
      buffet_table: "\uBDD4\uD398 \uD14C\uC774\uBE14",
      av_table: "AV \uD14C\uC774\uBE14",
      podium: "\uB2E8\uC0C1",
      chair: "\uC758\uC790",
    };
    const objectStyles = {
      door: { fill: "rgba(37, 99, 235, 0.18)", stroke: "#2563eb" },
      wall: { fill: "rgba(15, 23, 42, 0.82)", stroke: "#0f172a" },
      structure_area: { fill: "rgba(22, 163, 74, 0.12)", stroke: "#16a34a" },
      calibration: { fill: "rgba(212, 175, 55, 0.18)", stroke: "#d4af37" },
      pillar: { fill: "rgba(148, 163, 184, 0.22)", stroke: "#64748b" },
      screen: { fill: "rgba(59, 130, 246, 0.18)", stroke: "#2563eb" },
      fixed_wall: { fill: "rgba(15, 23, 42, 0.72)", stroke: "#0f172a" },
      allowed_area: { fill: "rgba(22, 163, 74, 0.10)", stroke: "#16a34a" },
      blocked_area: { fill: "rgba(239, 68, 68, 0.12)", stroke: "#dc2626" },
      seminar_table: { fill: "rgba(37, 99, 235, 0.16)", stroke: "#2563eb" },
      round_table: { fill: "rgba(212, 175, 55, 0.22)", stroke: "#d4af37" },
      buffet_table: { fill: "rgba(249, 115, 22, 0.16)", stroke: "#f97316" },
      stage: { fill: "rgba(15, 42, 67, 0.12)", stroke: "#102B55" },
      podium: { fill: "rgba(124, 58, 237, 0.15)", stroke: "#7c3aed" },
      chair: { fill: "rgba(100, 116, 139, 0.16)", stroke: "#64748b" },
      av_table: { fill: "rgba(14, 165, 233, 0.16)", stroke: "#0ea5e9" },
      holding_table: { fill: "rgba(71, 85, 105, 0.16)", stroke: "#475569" },
    };
    const svgNs = "http://www.w3.org/2000/svg";
    const WORKSPACE_MIN_SCALE = 0.02;
    const WORKSPACE_MAX_SCALE = 8;
    const WORKSPACE_PAN_SPEED = 1;
    const fixedObjectTypes = new Set(["door", "wall", "fixed_wall", "structure_area", "calibration", "pillar", "screen", "allowed_area", "blocked_area"]);
    const layoutTypeOptions = [
      ["all", "전체"], ["school", "스쿨식"], ["round", "라운드식"], ["buffet", "뷔페식"], ["t_shape", "T-Shape"],
      ["u_shape", "U-Shape"], ["hollow_square", "ㅁ-Shape"], ["custom", "기타"],
    ];
    const floorplanV2EventPanel = document.getElementById("floorplanV2EventPanel"); const libraryPanel = document.getElementById("layoutLibraryPanel"); const libraryGrid = document.getElementById("layoutLibraryGrid");
    const libraryFilters = document.getElementById("layoutLibraryFilters"); const libraryCreateButton = document.getElementById("layoutLibraryCreateButton");
    const workspaceBackLibraryButton = document.getElementById("layoutWorkspaceBackLibraryButton");
    const libraryModal = document.getElementById("layoutLibrarySaveModal"); const libraryForm = document.getElementById("layoutLibrarySaveForm");
    const libraryTypeInput = document.getElementById("layoutLibraryTypeInput"); const libraryNameInput = document.getElementById("layoutLibraryNameInput");
    const libraryMinInput = document.getElementById("layoutLibraryMinInput"); const libraryMaxInput = document.getElementById("layoutLibraryMaxInput");
    const libraryCapacityInput = document.getElementById("layoutLibraryCapacityInput"); const libraryNotesInput = document.getElementById("layoutLibraryNotesInput");
    const librarySpaceInput = document.getElementById("layoutLibrarySpaceInput");
    let libraryFilter = "all"; let libraryObjectsByLayout = new Map(); let libraryModalMode = "save"; let libraryModalForceNew = false; let pendingLayoutInfo = null;
    function isWorkspaceBaseObject(object) {
      return Boolean(object?.metadata?.baseFloorplanObject) || fixedObjectTypes.has(object?.objectType);
    }
    const defaultObjectTypes = [
      { object_name: "\uAE30\uB465", category: "\uACE0\uC815 \uAC1D\uCCB4", object_type: "pillar", default_width_m: 0.8, default_height_m: 0.8, default_seat_count: null, display_shape: "circle", can_resize: true, can_rotate: false, is_active: true },
      { object_name: "\uBB38", category: "\uACE0\uC815 \uAC1D\uCCB4", object_type: "door", default_width_m: 1.2, default_height_m: 0.25, default_seat_count: null, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uC2A4\uD06C\uB9B0", category: "\uACE0\uC815 \uAC1D\uCCB4", object_type: "screen", default_width_m: 4, default_height_m: 0.25, default_seat_count: null, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uBC30\uCE58 \uAC00\uB2A5 \uC601\uC5ED", category: "\uACE0\uC815 \uAC1D\uCCB4", object_type: "allowed_area", default_width_m: 5, default_height_m: 3, default_seat_count: null, display_shape: "area", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uBC30\uCE58 \uAE08\uC9C0 \uC601\uC5ED", category: "\uACE0\uC815 \uAC1D\uCCB4", object_type: "blocked_area", default_width_m: 3, default_height_m: 2, default_seat_count: null, display_shape: "area", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "AV \uD14C\uC774\uBE14", category: "\uC6B4\uC601 \uC7A5\uBE44", object_type: "av_table", default_width_m: 1.8, default_height_m: 0.6, default_seat_count: null, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uC138\uBBF8\uB098 \uD14C\uC774\uBE14 1800x450", category: "\uD14C\uC774\uBE14", object_type: "seminar_table", default_width_m: 1.8, default_height_m: 0.45, default_seat_count: 2, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uC138\uBBF8\uB098 \uD14C\uC774\uBE14 1600x450", category: "\uD14C\uC774\uBE14", object_type: "seminar_table", default_width_m: 1.6, default_height_m: 0.45, default_seat_count: 2, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uB77C\uC6B4\uB4DC \uD14C\uC774\uBE14 1800", category: "\uD14C\uC774\uBE14", object_type: "round_table", default_width_m: 1.8, default_height_m: 1.8, default_seat_count: 10, display_shape: "circle", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uB77C\uC6B4\uB4DC \uD14C\uC774\uBE14 1600", category: "\uD14C\uC774\uBE14", object_type: "round_table", default_width_m: 1.6, default_height_m: 1.6, default_seat_count: 8, display_shape: "circle", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uD640\uB529 \uD14C\uC774\uBE14", category: "\uD14C\uC774\uBE14", object_type: "holding_table", default_width_m: 1.8, default_height_m: 0.75, default_seat_count: null, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uBDD4\uD398 \uD14C\uC774\uBE14", category: "\uC2DD\uC74C", object_type: "buffet_table", default_width_m: 1.8, default_height_m: 0.75, default_seat_count: null, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uBB34\uB300", category: "\uBB34\uB300/\uB2E8\uC0C1", object_type: "stage", default_width_m: 4.8, default_height_m: 2.4, default_seat_count: null, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uB2E8\uC0C1", category: "\uBB34\uB300/\uB2E8\uC0C1", object_type: "podium", default_width_m: 0.65, default_height_m: 0.55, default_seat_count: null, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
      { object_name: "\uC758\uC790", category: "\uC88C\uC11D", object_type: "chair", default_width_m: 0.45, default_height_m: 0.45, default_seat_count: 1, display_shape: "rect", can_resize: true, can_rotate: true, is_active: true },
    ];
    let layoutObjectTypes = [];
    let sourceRow = null;
    let sourceFile = null;
    let objects = [];
    let selectedObjectId = "";
    let dragState = null;
    let view = { x: 0, y: 0, panX: 0, panY: 0, scale: 1 };
    let workspaceVenues = [];
    let workspaceSpaces = [];
    let workspaceFloorplans = [];
    let workspaceLayouts = [];
    let workspaceObjects = [];
    let workspaceSelectedId = "";
    let workspaceSourceRow = null;
    let workspaceSourceFile = null;
    let workspaceFloorplanRecord = null;
    let workspaceOutlinePoints = [];
    let workspaceGeometryOffset = { x: 0, y: 0 };
    let workspaceActiveLayout = null;
    let workspaceDirty = false;
    let workspaceSaveStatus = "";
        let workspaceViewportSize = { width: 1000, height: 720 };
    let workspaceSize = { width: 30000, height: 30000 };
    let workspaceDrawingWidthMm = 30000;
    let workspaceDrawingHeightMm = 30000;
    let workspaceGridSizeMm = 500;
    let workspaceMinorGridSizeMm = 100;
    let workspaceMajorGridSizeMm = 1000;
    let workspaceMeterScale = 1000;
    let workspaceGrid = true;
    let workspaceSnap = true;
    let workspaceShowFloorplan = true;
    let workspaceShowNames = true;
    let workspaceShowCoords = false;
    let workspaceEditMode = "layout";
    let workspaceTool = "select";
    let workspaceDraftShape = null;
    let workspaceDragState = null;
    let workspaceSuppressCanvasClick = false;
    let workspaceLastMoveLogAt = 0;
    let workspaceSpacePressed = false;
    let workspaceUndoStack = [];
    let workspaceRedoStack = [];
    let workspaceReferenceOpacity = 0.4;
    let workspaceDimensionMode = "selected";
    let workspaceDimensionUnit = "m";
    let workspaceIncludeDimensionsInExport = true;

    function bindEvents() {
      window.addEventListener("banquet:open-floorplan-editor", (event) => {
        openEditor(event.detail?.row);
      });
      closeButton.addEventListener("click", closeEditor);
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeEditor();
      });
      zoomInButton.addEventListener("click", () => zoomBy(1.18));
      zoomOutButton.addEventListener("click", () => zoomBy(0.85));
      resetViewButton.addEventListener("click", resetView);
      copyObjectButton.addEventListener("click", copySelectedObject);
      deleteObjectButton.addEventListener("click", deleteSelectedObject);
      saveFloorplanButton.addEventListener("click", saveFloorplanAndFixedObjects);
      saveLayoutButton.addEventListener("click", saveLayoutWithPreview);
      generateSeminarGridButton.addEventListener("click", generateSeminarGrid);
      savedLayoutsSelect.addEventListener("change", () => loadLayoutById(savedLayoutsSelect.value));
      canvas.addEventListener("mousedown", handleCanvasMouseDown);
      canvas.addEventListener("mousemove", handleCanvasMouseMove);
      window.addEventListener("mouseup", handleCanvasMouseUp);
      canvas.addEventListener("wheel", handleCanvasWheel, { passive: false });
      canvas.addEventListener("dragover", (event) => event.preventDefault());
      canvas.addEventListener("drop", handleCanvasDrop);
      objectSearchInput?.addEventListener("input", renderObjectLibrary);
      workspaceObjectSearchInput?.addEventListener("input", renderObjectLibrary);
      bindWorkspaceEvents();
      loadWorkspaceVenues();
      objectTypeForm?.addEventListener("submit", saveLayoutObjectType);
      objectTypeResetButton?.addEventListener("click", resetObjectTypeForm);
      objectTypeRefreshButton?.addEventListener("click", loadLayoutObjectTypes);
      [
        objectNameInput,
        objectCategoryInput,
        objectTypeInput,
        objectWidthInput,
        objectHeightInput,
        objectSeatCountInput,
        objectShapeInput,
      ].forEach((input) => input?.addEventListener("input", renderObjectTypeFormPreview));
      objectShapeInput?.addEventListener("change", renderObjectTypeFormPreview);
      renderObjectTypeFormPreview();
      loadLayoutObjectTypes();
    }

    async function openEditor(row) {
      if (!row) return;
      sourceRow = row;
      sourceFile = Array.isArray(row.files) ? row.files[0] : row.files;
      if (!sourceFile?.public_url) {
        setStatus("편집할 기본 도면 이미지 URL을 찾지 못했습니다.", "warn");
        return;
      }
      modal.hidden = false;
      modal.classList.add("visible");
      title.textContent = "도면 편집";
      subtitle.textContent = [row.venues?.venue_name || row.venue_spaces?.space_name || "장소 미지정", row.layout_type || "기본도면"].join(" / ");
      resetEditorState();
      hydrateLayoutInputsFromSource(row);
      if (!layoutObjectTypes.length) await loadLayoutObjectTypes();
      await loadBackgroundImage(sourceFile.public_url);
      await loadOrCreateFloorplanState();
      await loadSavedLayouts();
      resetView();
      render();
    }

    function closeEditor() {
      modal.classList.remove("visible");
      modal.hidden = true;
    }

    function resetEditorState() {
      floorplanRecord = null;
      savedLayouts = [];
      activeLayout = null;
      floorplanObjects = [];
      layoutObjects = [];
      selectedObjectId = "";
      selectedScope = "";
      savedLayoutsSelect.innerHTML = '<option value="">???덉씠?꾩썐</option>';
      selectedObjectPanel.innerHTML = "<p>?좏깮??媛앹껜媛 ?놁뒿?덈떎.</p>";
    }

    async function loadLayoutObjectTypes() {
      try {
        const rows = await loggedSupabaseRequest(
          "layout_object_types select",
          "layout_object_types?select=*&order=category.asc,sort_order.asc,object_name.asc"
        );
        layoutObjectTypes = normalizeObjectTypeRows(rows?.length ? rows : defaultObjectTypes);
      } catch (error) {
        console.warn("layout_object_types load failed, using local defaults:", error);
        layoutObjectTypes = normalizeObjectTypeRows(defaultObjectTypes);
      }
      renderObjectLibrary();
      renderObjectTypeTable();
    }

    function renderObjectLibrary() {
      renderObjectLibraryList(objectLibraryList, objectSearchInput, "modal");
      renderObjectLibraryList(workspaceObjectLibraryList, workspaceObjectSearchInput, "workspace");
    }

    function renderObjectLibraryList(targetList, searchInput, mode) {
      if (!targetList) return;
      const isModal = mode === "modal";
      const isWorkspace = mode === "workspace";
      const keyword = String(searchInput?.value || "").trim().toLowerCase();
      const rows = layoutObjectTypes
        .filter((item) => item.is_active !== false)
        .filter((item) => {
          if (!keyword) return true;
          return [item.object_name, item.category, item.object_type, item.memo]
            .some((value) => String(value || "").toLowerCase().includes(keyword));
        });
      if (!rows.length) {
        targetList.innerHTML = "<p>\uAC80\uC0C9\uB41C \uC624\uBE0C\uC81D\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>";
        return;
      }
      const groups = rows.reduce((acc, item) => {
        const category = item.category || "\uAE30\uD0C0";
        acc[category] = acc[category] || [];
        acc[category].push(item);
        return acc;
      }, {});
      targetList.innerHTML = Object.entries(groups).map(([category, items]) => {
        const buttons = items.map((item) => {
          const draggable = isModal || isWorkspace ? "true" : "false";
          const title = escapeHtml(item.object_name || objectLabels[item.object_type] || item.object_type);
          const meta = escapeHtml([item.category, buildMasterSizeLabel(item)].filter(Boolean).join(" / "));
          return '<button class="floorplan-library-item" type="button" draggable="' + draggable + '" data-object-type-id="' + escapeAttribute(item.id || "") + '">'
            + renderObjectPreviewSvg(item)
            + '<span>' + title + '</span>'
            + '<small>' + meta + '</small>'
            + '</button>';
        }).join("");
        return '<section class="floorplan-library-category"><strong>' + escapeHtml(category) + '</strong><div>' + buttons + '</div></section>';
      }).join("");
      if (isWorkspace) {
        targetList.querySelectorAll("[data-object-type-id]").forEach((button) => {
          button.addEventListener("click", () => addWorkspaceObjectFromMaster(findObjectType(button.dataset.objectTypeId), null));
          button.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData("text/plain", button.dataset.objectTypeId || "");
            event.dataTransfer.effectAllowed = "copy";
          });
        });
        return;
      }
      if (!isModal) return;
      targetList.querySelectorAll("[data-object-type-id]").forEach((button) => {
        button.addEventListener("click", () => addObjectFromMaster(findObjectType(button.dataset.objectTypeId)));
        button.addEventListener("dragstart", (event) => {
          event.dataTransfer.setData("text/plain", button.dataset.objectTypeId || "");
          event.dataTransfer.effectAllowed = "copy";
        });
      });
    }

    function renderObjectTypeTable() {
      if (!objectTypeTableBody) return;
      objectTypeTableBody.innerHTML = "";
      if (!layoutObjectTypes.length) {
        objectTypeTableBody.innerHTML = '<tr><td colspan="8">\uB4F1\uB85D\uB41C \uC624\uBE0C\uC81D\uD2B8 \uB9C8\uC2A4\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td></tr>';
        return;
      }
      layoutObjectTypes.forEach((item) => {
        const tr = document.createElement("tr");
        const previewCell = document.createElement("td");
        previewCell.className = "object-preview-cell";
        previewCell.innerHTML = renderObjectPreviewSvg(item);
        tr.append(previewCell);
        [
          item.object_name || "-",
          item.category || "-",
          buildMasterSizeLabel(item),
          item.default_seat_count ?? "-",
          shapeLabel(item.display_shape),
          item.is_active === false ? "\uBE44\uD65C\uC131" : "\uC0AC\uC6A9",
        ].forEach((value) => {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        });
        const actionCell = document.createElement("td");
        actionCell.className = "admin-only-cell object-actions-cell";
        const actions = document.createElement("div");
        actions.className = "asset-actions";
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "\uC218\uC815";
        editButton.addEventListener("click", () => startEditObjectType(item));
        const deactivateButton = document.createElement("button");
        deactivateButton.type = "button";
        deactivateButton.className = "danger-button";
        deactivateButton.textContent = item.is_active === false ? "\uC0AC\uC6A9" : "\uBE44\uD65C\uC131";
        deactivateButton.addEventListener("click", () => toggleObjectTypeActive(item));
        actions.append(editButton, deactivateButton);
        actionCell.append(actions);
        tr.append(actionCell);
        objectTypeTableBody.append(tr);
      });
    }

    function bindWorkspaceEvents() {
      workspaceVenueSelect?.addEventListener("change", handleWorkspaceVenueChange);
      workspaceSpaceSelect?.addEventListener("change", handleWorkspaceSpaceChange);
      workspaceFloorplanSelect?.addEventListener("change", handleWorkspaceFloorplanChange);
      workspaceSavedLayoutSelect?.addEventListener("change", () => loadWorkspaceLayoutById(workspaceSavedLayoutSelect.value));
      workspaceNameInput?.addEventListener("input", markWorkspaceDirty);
      workspaceSvg?.addEventListener("click", (event) => {
        if (workspaceSuppressCanvasClick) {
          workspaceSuppressCanvasClick = false;
          return;
        }
        if (workspaceTool !== "select") return;
        if (event.target === workspaceSvg || event.target.id === "layoutWorkspaceGridBg") {
          selectWorkspaceObject("");
        }
      });
      workspaceSvg?.addEventListener("pointerdown", handleWorkspacePointerDown);
      workspaceSvg?.addEventListener("dragover", (event) => event.preventDefault());
      workspaceSvg?.addEventListener("drop", handleWorkspaceDrop);
      window.addEventListener("pointermove", handleWorkspacePointerMove);
      window.addEventListener("pointerup", endWorkspaceDrag);
      window.addEventListener("pointercancel", endWorkspaceDrag);
      workspaceSvg?.addEventListener("wheel", handleWorkspaceWheel, { passive: false });
      workspaceNewButton?.addEventListener("click", openWorkspaceNewLayoutModal);
      workspaceNewCreateButton?.addEventListener("click", createWorkspaceLayoutFromModal);
      workspaceNewCancelButton?.addEventListener("click", closeWorkspaceNewLayoutModal);
      workspaceNewCancelFooterButton?.addEventListener("click", closeWorkspaceNewLayoutModal);
      workspaceNewModal?.addEventListener("click", (event) => {
        if (event.target === workspaceNewModal) closeWorkspaceNewLayoutModal();
      });
      workspaceSaveButton?.addEventListener("click", () => openLayoutInfoModal("save", false));
      workspaceSaveAsButton?.addEventListener("click", () => openLayoutInfoModal("save", true));
      libraryCreateButton?.addEventListener("click", startNewLibraryLayout);
      document.getElementById("floorplanV2EventModeButton")?.addEventListener("click", showLayoutLibrary);
      workspaceBackLibraryButton?.addEventListener("click", showLayoutLibrary);
      libraryFilters?.addEventListener("click", (event) => { const button = event.target.closest("button[data-layout-filter]"); if (!button) return; libraryFilter = button.dataset.layoutFilter; renderLayoutLibrary(); });
      libraryGrid?.addEventListener("click", handleLibraryAction);
      libraryForm?.addEventListener("submit", submitLayoutInfoModal);
      document.getElementById("layoutLibraryModalCancelButton")?.addEventListener("click", closeLayoutInfoModal);
      window.addEventListener("banquet:create-layout-from-floorplan", async (event) => {
        const detail = event.detail || {}; await selectWorkspaceContext(detail.venueId, detail.spaceId, detail.floorplanId); startNewLibraryLayout();
      });
      workspacePreviewButton?.addEventListener("click", showWorkspacePreview);
      workspaceExportButton?.addEventListener("click", exportWorkspacePng);
      workspaceUndoButton?.addEventListener("click", undoWorkspaceChange);
      workspaceRedoButton?.addEventListener("click", redoWorkspaceChange);
      workspacePreviewDownloadButton?.addEventListener("click", exportWorkspacePng);
      workspacePreviewCloseButton?.addEventListener("click", closeWorkspacePreview);
      workspacePreviewModal?.addEventListener("click", (event) => {
        if (event.target === workspacePreviewModal) closeWorkspacePreview();
      });
      workspaceZoomInButton?.addEventListener("click", () => zoomWorkspaceAtCenter(2));
      workspaceZoomOutButton?.addEventListener("click", () => zoomWorkspaceAtCenter(0.5));
      workspaceFitButton?.addEventListener("click", fitWorkspaceToScreen);
      workspaceActualSizeButton?.addEventListener("click", setWorkspaceActualSize);
      workspaceCenterButton?.addEventListener("click", centerWorkspaceView);
      workspaceGridButton?.addEventListener("click", () => {
        workspaceGrid = !workspaceGrid;
        if (workspaceViewGridInput) workspaceViewGridInput.checked = workspaceGrid;
        renderWorkspace();
        updateWorkspaceStatusbar();
      });
      workspaceSnapButton?.addEventListener("click", () => {
        workspaceSnap = !workspaceSnap;
        updateWorkspaceStatusbar();
      });
      workspaceDrawingPresetSelect?.addEventListener("change", applyWorkspaceDrawingPreset);
      workspaceApplyDrawingSizeButton?.addEventListener("click", applyWorkspaceDrawingSizeFromInputs);
      workspaceModeBaseButton?.addEventListener("click", () => setWorkspaceEditMode("base"));
      workspaceModeLayoutButton?.addEventListener("click", () => setWorkspaceEditMode("layout"));
      workspaceSelectToolButton?.addEventListener("click", () => setWorkspaceTool("select"));
      workspaceWallToolButton?.addEventListener("click", () => {
        setWorkspaceEditMode("base");
        setWorkspaceTool("wall");
      });
      workspaceRectToolButton?.addEventListener("click", () => {
        setWorkspaceEditMode("base");
        setWorkspaceTool("rect");
      });
      workspaceCalibrateToolButton?.addEventListener("click", () => {
        setWorkspaceEditMode("base");
        setWorkspaceTool("calibrate");
      });
      workspaceReferenceOpacityInput?.addEventListener("input", () => {
        workspaceReferenceOpacity = clampNumber(Number(workspaceReferenceOpacityInput.value || 40) / 100, 0.1, 1);
        renderWorkspace();
      });
      workspaceGridSizeSelect?.addEventListener("change", () => {
        handleWorkspaceGridSizeChange();
      });
      workspaceCustomGridInput?.addEventListener("change", applyWorkspaceCustomGridSize);
      workspaceCustomGridUnitSelect?.addEventListener("change", convertWorkspaceCustomGridUnit);
      workspaceViewGridInput?.addEventListener("change", () => {
        workspaceGrid = workspaceViewGridInput.checked;
        renderWorkspace();
      });
      workspaceViewFloorplanInput?.addEventListener("change", () => {
        workspaceShowFloorplan = workspaceViewFloorplanInput.checked;
        renderWorkspace();
      });
      workspaceViewDimensionsInput?.addEventListener("change", () => {
        workspaceDimensionMode = workspaceViewDimensionsInput.checked ? (workspaceDimensionMode === "hidden" ? "selected" : workspaceDimensionMode) : "hidden";
        syncWorkspaceDimensionControls();
        renderWorkspace();
      });
      workspaceDimensionModeSelect?.addEventListener("change", () => {
        workspaceDimensionMode = workspaceDimensionModeSelect.value || "selected";
        syncWorkspaceDimensionControls();
        renderWorkspace();
      });
      workspaceDimensionUnitSelect?.addEventListener("change", () => {
        workspaceDimensionUnit = workspaceDimensionUnitSelect.value || "m";
        renderWorkspace();
      });
      workspaceExportDimensionsInput?.addEventListener("change", () => {
        workspaceIncludeDimensionsInExport = workspaceExportDimensionsInput.checked;
      });
      workspaceViewNamesInput?.addEventListener("change", () => {
        workspaceShowNames = workspaceViewNamesInput.checked;
        renderWorkspace();
      });
      workspaceViewCoordsInput?.addEventListener("change", () => {
        workspaceShowCoords = workspaceViewCoordsInput.checked;
        renderWorkspace();
      });
      [
        workspaceLabelInput,
        workspaceXInput,
        workspaceYInput,
        workspaceWidthInput,
        workspaceHeightInput,
        workspaceRotationInput,
        workspaceSeatCountInput,
        workspaceZIndexInput,
        workspaceOpacityInput,
      ].forEach((input) => input?.addEventListener("input", updateSelectedWorkspaceObjectFromInputs));
      [
        workspaceWallStartXInput,
        workspaceWallStartYInput,
        workspaceWallEndXInput,
        workspaceWallEndYInput,
        workspaceLengthInput,
        workspaceWallAngleInput,
        workspaceThicknessInput,
      ].forEach((input) => {
        input?.addEventListener("change", () => updateSelectedWorkspaceWallFromInputs(input));
        input?.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            updateSelectedWorkspaceWallFromInputs(input);
            input.blur();
          }
        });
      });
      workspaceLengthUnitSelect?.addEventListener("change", convertSelectedWorkspaceLengthUnit);
      workspaceThicknessUnitSelect?.addEventListener("change", convertSelectedWorkspaceThicknessUnit);
      [
        workspaceDimensionVisibilitySelect,
        workspaceDimensionPositionSelect,
        workspaceDimensionLabelInput,
      ].forEach((input) => {
        input?.addEventListener("change", updateSelectedWorkspaceDimensionSettings);
        input?.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            updateSelectedWorkspaceDimensionSettings();
            input.blur();
          }
        });
      });
      workspaceBringFrontButton?.addEventListener("click", () => moveWorkspaceLayer("front"));
      workspaceForwardButton?.addEventListener("click", () => moveWorkspaceLayer("forward"));
      workspaceBackwardButton?.addEventListener("click", () => moveWorkspaceLayer("backward"));
      workspaceSendBackButton?.addEventListener("click", () => moveWorkspaceLayer("back"));
      workspaceRotate90Button?.addEventListener("click", rotateWorkspaceObject90);
      workspaceDuplicateButton?.addEventListener("click", duplicateWorkspaceObject);
      workspaceDeleteButton?.addEventListener("click", deleteSelectedWorkspaceObject);
      window.addEventListener("keydown", (event) => {
        if (event.code === "Space") {
          const active = document.activeElement;
          if (!active || !["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) {
            workspaceSpacePressed = true;
            if (workspaceSvg) workspaceSvg.classList.add("is-panning-ready");
            event.preventDefault();
          }
        }
        if (!workspaceSvg || !workspaceSelectedId) return;
        const active = document.activeElement;
        if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          const object = findWorkspaceObject(workspaceSelectedId);
          if (!object || isWorkspaceBaseObject(object)) return;
          event.preventDefault();
          pushWorkspaceHistory();
          const distance = event.shiftKey ? 500 : 100;
          if (event.key === "ArrowLeft") object.x = clampNumber(object.x - distance, 0, workspaceSize.width);
          if (event.key === "ArrowRight") object.x = clampNumber(object.x + distance, 0, workspaceSize.width);
          if (event.key === "ArrowUp") object.y = clampNumber(object.y - distance, 0, workspaceSize.height);
          if (event.key === "ArrowDown") object.y = clampNumber(object.y + distance, 0, workspaceSize.height);
          markWorkspaceDirty();
          renderWorkspace();
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          deleteSelectedWorkspaceObject();
        }
      });
      window.addEventListener("keyup", (event) => {
        if (event.code === "Space") {
          workspaceSpacePressed = false;
          workspaceSvg?.classList.remove("is-panning-ready");
        }
      });
      window.addEventListener("resize", () => {
        updateWorkspaceSvgViewBox();
        centerWorkspaceView();
      });
      if (workspaceReferenceOpacityInput) workspaceReferenceOpacityInput.value = String(Math.round(workspaceReferenceOpacity * 100));
      if (workspaceGridSizeSelect) workspaceGridSizeSelect.value = String(workspaceGridSizeMm);
      syncWorkspaceDimensionControls();
      syncWorkspaceDrawingInputs();
      syncWorkspaceGridInputs();
      setWorkspaceEditMode("layout");
      setWorkspaceTool("select");
      renderWorkspace();
    }

    function setWorkspaceEditMode(mode) {
      workspaceEditMode = mode === "base" ? "base" : "layout";
      workspaceModeBaseButton?.classList.toggle("is-active", workspaceEditMode === "base");
      workspaceModeLayoutButton?.classList.toggle("is-active", workspaceEditMode === "layout");
      if (workspaceEditMode === "layout" && ["wall", "rect", "calibrate"].includes(workspaceTool)) {
        setWorkspaceTool("select");
        return;
      }
      workspaceDraftShape = null;
      renderWorkspace();
      updateWorkspaceStatusbar();
    }

    function setWorkspaceTool(tool) {
      workspaceTool = ["select", "wall", "rect", "calibrate"].includes(tool) ? tool : "select";
      workspaceDraftShape = null;
      workspaceSelectToolButton?.classList.toggle("is-active", workspaceTool === "select");
      workspaceWallToolButton?.classList.toggle("is-active", workspaceTool === "wall");
      workspaceRectToolButton?.classList.toggle("is-active", workspaceTool === "rect");
      workspaceCalibrateToolButton?.classList.toggle("is-active", workspaceTool === "calibrate");
      if (workspaceSvg) {
        workspaceSvg.classList.toggle("is-drawing-tool", workspaceTool !== "select");
      }
      renderWorkspace();
      updateWorkspaceStatusbar();
    }

    function syncWorkspaceDimensionControls() {
      if (workspaceDimensionModeSelect) workspaceDimensionModeSelect.value = workspaceDimensionMode;
      if (workspaceViewDimensionsInput) workspaceViewDimensionsInput.checked = workspaceDimensionMode !== "hidden";
      if (workspaceDimensionUnitSelect) workspaceDimensionUnitSelect.value = workspaceDimensionUnit;
      if (workspaceExportDimensionsInput) workspaceExportDimensionsInput.checked = workspaceIncludeDimensionsInExport;
    }

    function applyWorkspaceDrawingPreset() {
      const value = workspaceDrawingPresetSelect?.value || "custom";
      if (value === "custom") return;
      const [width, height] = value.split("x").map((item) => Number(item));
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      workspaceDrawingWidthMm = Math.max(1000, Math.round(width));
      workspaceDrawingHeightMm = Math.max(1000, Math.round(height));
      syncWorkspaceSizeFromDrawing();
      syncWorkspaceDrawingInputs();
      markWorkspaceDirty();
      fitWorkspaceToScreen();
    }

    function applyWorkspaceDrawingSizeFromInputs() {
      const widthMm = toMillimeters(workspaceDrawingWidthInput?.value, workspaceDrawingWidthUnitSelect?.value || "m");
      const heightMm = toMillimeters(workspaceDrawingHeightInput?.value, workspaceDrawingHeightUnitSelect?.value || "m");
      if (!widthMm || !heightMm || widthMm <= 0 || heightMm <= 0) {
        setStatus("\uB3C4\uBA74 \uAC00\uB85C\uC640 \uC138\uB85C \uD06C\uAE30\uB97C \uC62C\uBC14\uB974\uAC8C \uC785\uB825\uD574\uC8FC\uC138\uC694.", "warn");
        return;
      }
      workspaceDrawingWidthMm = Math.max(1000, Math.round(widthMm));
      workspaceDrawingHeightMm = Math.max(1000, Math.round(heightMm));
      if (workspaceDrawingPresetSelect) workspaceDrawingPresetSelect.value = "custom";
      syncWorkspaceSizeFromDrawing();
      syncWorkspaceDrawingInputs();
      markWorkspaceDirty();
      fitWorkspaceToScreen();
    }

    function syncWorkspaceSizeFromDrawing() {
      workspaceSize.width = workspaceDrawingWidthMm;
      workspaceSize.height = workspaceDrawingHeightMm;
      updateWorkspaceSvgViewBox();
      workspaceSvg?.setAttribute("aria-label", `\uB3C4\uBA74 \uB808\uC774\uC544\uC6C3 \uD3B8\uC9D1\uAE30 ${workspaceSize.width}mm x ${workspaceSize.height}mm`);
      const gridRects = ["#layoutWorkspaceGridBg", "#layoutWorkspaceMajorGridBg"];
      gridRects.forEach((selector) => {
        const rect = workspaceSvg?.querySelector(selector);
        rect?.setAttribute("width", String(workspaceSize.width));
        rect?.setAttribute("height", String(workspaceSize.height));
      });
      workspaceSvg?.querySelectorAll("[data-reference-floorplan]").forEach((image) => {
        image.setAttribute("width", String(workspaceSize.width));
        image.setAttribute("height", String(workspaceSize.height));
      });
      updateWorkspaceGridPattern();
      updateWorkspaceEmptyStateGeometry();
      renderWorkspace();
    }

    function updateWorkspaceSvgViewBox() {
      if (!workspaceSvg) return;
      const rect = workspaceSvg.getBoundingClientRect?.();
      workspaceViewportSize.width = Math.max(1, Math.round(rect?.width || workspaceViewportSize.width || 1200));
      workspaceViewportSize.height = Math.max(1, Math.round(rect?.height || workspaceViewportSize.height || 760));
      workspaceSvg.setAttribute("viewBox", `0 0 ${workspaceViewportSize.width} ${workspaceViewportSize.height}`);
    }

    function updateWorkspaceEmptyStateGeometry() {
      if (!workspaceEmptyState) return;
      const rect = workspaceEmptyState.querySelector("rect");
      const [title, subtitle] = workspaceEmptyState.querySelectorAll("text");
      const width = workspaceSize.width;
      const height = workspaceSize.height;
      const panelWidth = width * 0.78;
      const panelHeight = height * 0.42;
      const panelX = (width - panelWidth) / 2;
      const panelY = (height - panelHeight) / 2;
      if (rect) {
        rect.setAttribute("x", String(panelX));
        rect.setAttribute("y", String(panelY));
        rect.setAttribute("width", String(panelWidth));
        rect.setAttribute("height", String(panelHeight));
        rect.setAttribute("rx", String(Math.max(80, Math.min(width, height) * 0.012)));
        rect.setAttribute("stroke-width", String(Math.max(12, Math.min(width, height) * 0.0015)));
        rect.setAttribute("stroke-dasharray", `${Math.max(70, width * 0.004)} ${Math.max(50, width * 0.003)}`);
      }
      const titleSize = Math.max(320, Math.min(width, height) * 0.028);
      const subtitleSize = Math.max(210, Math.min(width, height) * 0.019);
      if (title) {
        title.setAttribute("x", String(width / 2));
        title.setAttribute("y", String(height / 2 - titleSize * 0.35));
        title.setAttribute("font-size", String(titleSize));
      }
      if (subtitle) {
        subtitle.setAttribute("x", String(width / 2));
        subtitle.setAttribute("y", String(height / 2 + subtitleSize * 1.35));
        subtitle.setAttribute("font-size", String(subtitleSize));
      }
    }

    function syncWorkspaceDrawingInputs() {
      const widthUnit = workspaceDrawingWidthUnitSelect?.value || "m";
      const heightUnit = workspaceDrawingHeightUnitSelect?.value || "m";
      if (workspaceDrawingWidthInput) workspaceDrawingWidthInput.value = formatDecimal(fromMillimeters(workspaceDrawingWidthMm, widthUnit), 3);
      if (workspaceDrawingHeightInput) workspaceDrawingHeightInput.value = formatDecimal(fromMillimeters(workspaceDrawingHeightMm, heightUnit), 3);
      const preset = `${workspaceDrawingWidthMm}x${workspaceDrawingHeightMm}`;
      if (workspaceDrawingPresetSelect && [...workspaceDrawingPresetSelect.options].some((option) => option.value === preset)) {
        workspaceDrawingPresetSelect.value = preset;
      } else if (workspaceDrawingPresetSelect) {
        workspaceDrawingPresetSelect.value = "custom";
      }
    }

    function handleWorkspaceGridSizeChange() {
      const value = workspaceGridSizeSelect?.value || "500";
      if (value === "custom") {
        if (workspaceCustomGridControl) workspaceCustomGridControl.hidden = false;
        applyWorkspaceCustomGridSize();
        return;
      }
      if (workspaceCustomGridControl) workspaceCustomGridControl.hidden = true;
      workspaceGridSizeMm = Math.max(10, Number(value || 500));
      updateWorkspaceGridSizes();
      syncWorkspaceGridInputs();
      renderWorkspace();
    }

    function applyWorkspaceCustomGridSize() {
      const nextGridMm = toMillimeters(workspaceCustomGridInput?.value, workspaceCustomGridUnitSelect?.value || "mm");
      if (!nextGridMm || nextGridMm <= 0) return;
      workspaceGridSizeMm = Math.max(10, Math.round(nextGridMm));
      updateWorkspaceGridSizes();
      syncWorkspaceGridInputs(false);
      renderWorkspace();
    }

    function convertWorkspaceCustomGridUnit() {
      if (!workspaceCustomGridInput) return;
      workspaceCustomGridInput.value = formatDecimal(fromMillimeters(workspaceGridSizeMm, workspaceCustomGridUnitSelect?.value || "mm"), 3);
    }

    function updateWorkspaceGridSizes() {
      workspaceMinorGridSizeMm = Math.min(workspaceGridSizeMm, 100);
      workspaceMajorGridSizeMm = workspaceGridSizeMm <= 1000 ? 1000 : workspaceGridSizeMm;
      updateWorkspaceGridPattern();
      updateWorkspaceStatusbar();
    }

    function syncWorkspaceGridInputs(updateCustomValue = true) {
      if (workspaceGridSizeSelect) {
        const hasOption = [...workspaceGridSizeSelect.options].some((option) => option.value === String(workspaceGridSizeMm));
        workspaceGridSizeSelect.value = hasOption ? String(workspaceGridSizeMm) : "custom";
      }
      if (workspaceCustomGridControl) workspaceCustomGridControl.hidden = workspaceGridSizeSelect?.value !== "custom";
      if (updateCustomValue && workspaceCustomGridInput) {
        workspaceCustomGridInput.value = formatDecimal(fromMillimeters(workspaceGridSizeMm, workspaceCustomGridUnitSelect?.value || "mm"), 3);
      }
    }

    async function loadWorkspaceVenues() {
      if (!workspaceVenueSelect) return;
      setSelectLoading(workspaceVenueSelect, "장소를 불러오는 중입니다.");
      try {
        workspaceVenues = await workspaceSelectWithActiveFallback("venues", "id,venue_name,is_active", "venue_name.asc");
        renderWorkspaceVenueOptions();
      } catch (error) {
        console.error("workspace venues load failed:", error);
        workspaceVenueSelect.innerHTML = '<option value="">장소를 불러오지 못했습니다.</option>';
      }
    }

    async function workspaceSelectWithActiveFallback(table, select, order) {
      const orderQuery = order ? `&order=${order}` : "";
      try {
        return await loggedSupabaseRequest(`${table} active select`, `${table}?select=${select}&is_active=eq.true${orderQuery}`) || [];
      } catch (error) {
        if (!/is_active|schema cache/i.test(error.message || "")) throw error;
        const fallbackSelect = select.split(",").filter((column) => column.trim() !== "is_active").join(",");
        return await loggedSupabaseRequest(`${table} select`, `${table}?select=${fallbackSelect}${orderQuery}`) || [];
      }
    }

    function renderWorkspaceVenueOptions() {
      workspaceVenueSelect.innerHTML = "";
      if (!workspaceVenues.length) {
        workspaceVenueSelect.innerHTML = '<option value="">등록된 장소가 없습니다.</option>';
        return;
      }
      workspaceVenueSelect.append(new Option("장소를 선택하세요", ""));
      workspaceVenues.forEach((venue) => {
        workspaceVenueSelect.append(new Option(venue.venue_name || "이름 없음", venue.id));
      });
    }

    async function handleWorkspaceVenueChange() {
      workspaceSpaces = [];
      workspaceFloorplans = [];
      workspaceLayouts = [];
      workspaceFloorplanRecord = null;
      workspaceActiveLayout = null;
      workspaceSourceRow = null;
      workspaceSourceFile = null;
      resetWorkspaceLayout();
      resetWorkspaceDependentSelects("space");
      const venueId = workspaceVenueSelect?.value || "";
      if (!venueId) return;
      setSelectLoading(workspaceSpaceSelect, "공간을 불러오는 중입니다.");
      try {
        const mappings = await loggedSupabaseRequest(
          "workspace venue_space_mappings select",
          `venue_space_mappings?select=venue_id,space_id,sort_order,venue_spaces(id,space_name,space_code,floor)&venue_id=eq.${encodeURIComponent(venueId)}&order=sort_order.asc`
        ) || [];
        workspaceSpaces = mappings
          .map((mapping) => Array.isArray(mapping.venue_spaces) ? mapping.venue_spaces[0] : mapping.venue_spaces)
          .filter((space) => space?.id);
        renderWorkspaceSpaceOptions();
      } catch (error) {
        console.error("workspace spaces load failed:", error);
        workspaceSpaceSelect.innerHTML = '<option value="">공간을 불러오지 못했습니다.</option>';
      }
    }

    function renderWorkspaceSpaceOptions() {
      workspaceSpaceSelect.innerHTML = "";
      if (!workspaceSpaces.length) {
        workspaceSpaceSelect.innerHTML = '<option value="">연결된 공간이 없습니다.</option>';
        return;
      }
      workspaceSpaceSelect.append(new Option("공간을 선택하세요", ""));
      workspaceSpaces.forEach((space) => {
        const label = [space.space_name, space.floor].filter(Boolean).join(" / ") || "이름 없음";
        workspaceSpaceSelect.append(new Option(label, space.id));
      });
    }

    async function handleWorkspaceSpaceChange() {
      workspaceFloorplans = [];
      workspaceLayouts = [];
      workspaceFloorplanRecord = null;
      workspaceActiveLayout = null;
      workspaceSourceRow = null;
      workspaceSourceFile = null;
      resetWorkspaceLayout();
      resetWorkspaceDependentSelects("floorplan");
      const venueId = workspaceVenueSelect?.value || "";
      const spaceId = workspaceSpaceSelect?.value || "";
      if (!spaceId) return;
      setSelectLoading(workspaceFloorplanSelect, "기본 도면을 불러오는 중입니다.");
      setSelectLoading(workspaceSavedLayoutSelect, "저장된 레이아웃을 불러오는 중입니다.");
      try {
        const [geometryRows, imageRows] = await Promise.all([
          loggedSupabaseRequest(
            "workspace geometry venue_floorplans select",
            `venue_floorplans?select=*&is_active=eq.true&venue_id=eq.${encodeURIComponent(venueId)}&space_id=eq.${encodeURIComponent(spaceId)}&order=updated_at.desc`
          ).catch(() => []),
          loggedSupabaseRequest(
          "workspace venue_layout_images select",
          `venue_layout_images?select=*,files(*),venues(venue_name),venue_spaces(space_name)&is_active=eq.true&venue_id=eq.${encodeURIComponent(venueId)}&space_id=eq.${encodeURIComponent(spaceId)}&order=created_at.desc`
          ).catch(() => []),
        ]);
        workspaceFloorplans = [
          ...(geometryRows || []).map((row) => ({ ...row, _workspaceSourceKind: "geometry" })),
          ...(imageRows || []).filter(isBaseFloorplanRow).map((row) => ({ ...row, _workspaceSourceKind: "image" })),
        ];
        workspaceLayouts = [];
        renderWorkspaceFloorplanOptions();
        renderWorkspaceSavedLayoutOptions();
      } catch (error) {
        console.error("workspace floorplans load failed:", error);
        workspaceFloorplanSelect.innerHTML = '<option value="">기본 도면을 불러오지 못했습니다.</option>';
        workspaceSavedLayoutSelect.innerHTML = '<option value="">저장된 레이아웃을 불러오지 못했습니다.</option>';
      }
    }

    function isBaseFloorplanRow(row) {
      const type = String(row?.layout_type || "").toLowerCase().replace(/\s+/g, "");
      const file = Array.isArray(row?.files) ? row.files[0] : row?.files;
      const name = String(file?.original_filename || "").toLowerCase();
      return type.includes("기본") || type.includes("base") || type.includes("floorplan") || name.includes("기본") || name.includes("floorplan");
    }

    function renderWorkspaceFloorplanOptions() {
      workspaceFloorplanSelect.innerHTML = "";
      if (!workspaceFloorplans.length) {
        workspaceFloorplanSelect.innerHTML = '<option value="">등록된 기본 도면이 없습니다.</option>';
        return;
      }
      workspaceFloorplanSelect.append(new Option("기본 도면을 선택하세요", ""));
      workspaceFloorplans.forEach((row) => {
        const file = Array.isArray(row.files) ? row.files[0] : row.files;
        const label = row._workspaceSourceKind === "geometry"
          ? `${row.floorplan_name || "V2 기본도면"}${row.is_locked ? " · 잠금" : ""}`
          : [row.layout_type || "기본도면", file?.original_filename].filter(Boolean).join(" / ");
        workspaceFloorplanSelect.append(new Option(label, row.id));
      });
    }

    function renderWorkspaceSavedLayoutOptions() {
      workspaceSavedLayoutSelect.innerHTML = "";
      if (!workspaceLayouts.length) {
        workspaceSavedLayoutSelect.innerHTML = '<option value="">저장된 레이아웃 없음</option>';
        return;
      }
      workspaceSavedLayoutSelect.append(new Option("저장된 레이아웃", ""));
      workspaceLayouts.forEach((row) => {
        const label = [row.layout_name || row.layout_type || "레이아웃", row.min_people == null ? "" : `${row.min_people}명~${row.max_people || ""}`].filter(Boolean).join(" / ");
        workspaceSavedLayoutSelect.append(new Option(label, row.id));
      });
    }

    function showLayoutLibrary() {
      floorplanV2EventPanel?.classList.add("library-mode"); floorplanV2EventPanel?.classList.remove("editor-mode"); renderLayoutLibrary();
    }
    function showLayoutEditor() { floorplanV2EventPanel?.classList.remove("library-mode"); floorplanV2EventPanel?.classList.add("editor-mode"); setTimeout(fitWorkspaceToScreen, 0); }
    async function selectWorkspaceContext(venueId, spaceId, floorplanId) {
      if (venueId) { workspaceVenueSelect.value = venueId; await handleWorkspaceVenueChange(); }
      if (spaceId) { workspaceSpaceSelect.value = spaceId; await handleWorkspaceSpaceChange(); }
      if (floorplanId) { workspaceFloorplanSelect.value = floorplanId; await handleWorkspaceFloorplanChange(); }
    }
    function startNewLibraryLayout() {
      if (!workspaceFloorplanRecord?.id) { setStatus("새 레이아웃을 만들 기본 도면을 선택해 주세요.", "warn"); return; }
      resetWorkspaceLayout(); workspaceActiveLayout = null; if (workspaceNameInput) workspaceNameInput.value = ""; showLayoutEditor();
    }
    function typeLabel(type) { return layoutTypeOptions.find(([value]) => value === type)?.[1] || "기타"; }
    async function loadLibraryObjects() {
      libraryObjectsByLayout = new Map(); const ids = workspaceLayouts.map((row) => row.id).filter(Boolean); if (!ids.length) return;
      const rows = await loggedSupabaseRequest("layout library objects", `venue_layout_objects?select=*&layout_id=in.(${ids.join(",")})&is_active=eq.true&order=sort_order.asc`).catch(() => []);
      rows.forEach((row) => { const list = libraryObjectsByLayout.get(row.layout_id) || []; list.push(row); libraryObjectsByLayout.set(row.layout_id, list); });
    }
    function libraryPreview(layout) {
      const objects = libraryObjectsByLayout.get(layout.id) || []; const width = Math.max(1, workspaceDrawingWidthMm); const height = Math.max(1, workspaceDrawingHeightMm);
      const shapes = objects.map((row) => { const m = row.metadata || {}; const w = Number(m.widthMm) || Number(row.width) * width; const h = Number(m.heightMm) || Number(row.height) * height;
        const x = Number.isFinite(Number(m.xMm)) ? Number(m.xMm) : Number(row.x) * width + w / 2; const y = Number.isFinite(Number(m.yMm)) ? Number(m.yMm) : Number(row.y) * height + h / 2;
        const circle = row.object_type === "round_table" || row.object_type === "pillar"; return circle ? `<ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="${h/2}" fill="#d4af3755" stroke="#9a7b16"/>` : `<rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" transform="rotate(${Number(row.rotation)||0} ${x} ${y})" rx="40" fill="#2563eb33" stroke="#2563eb"/>`; }).join("");
      const outline = workspaceOutlinePoints.length ? `<polygon points="${workspaceOutlinePoints.map((p)=>`${p.x},${p.y}`).join(" ")}" fill="#f8fafc" stroke="#0f2a43" stroke-width="40"/>` : "";
      const fixed = workspaceObjects.filter(isWorkspaceBaseObject).map((object) => { const w=object.widthM*1000; const h=object.heightM*1000; const x=object.x; const y=object.y; const circle=getObjectDisplayShape(object)==="circle";
        return circle ? `<ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="${h/2}" fill="#64748b55" stroke="#475569"/>` : `<rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" transform="rotate(${object.rotation||0} ${x} ${y})" fill="#64748b44" stroke="#475569"/>`; }).join("");
      return `<svg viewBox="0 0 ${width} ${height}" aria-label="${escapeAttribute(layout.layout_name)} 미리보기">${outline}${fixed}${shapes}</svg>`;
    }
    function objectSummary(layoutId) {
      const counts = new Map(); (libraryObjectsByLayout.get(layoutId) || []).forEach((row) => counts.set(row.label || objectLabels[row.object_type] || row.object_type, (counts.get(row.label || objectLabels[row.object_type] || row.object_type) || 0) + 1));
      return [...counts.entries()].map(([name,count]) => `${name} × ${count}`).join(" · ") || "배치 기물 없음";
    }
    function renderLayoutLibrary() {
      if (!libraryFilters || !libraryGrid) return;
      libraryFilters.innerHTML = layoutTypeOptions.map(([value,label]) => `<button type="button" data-layout-filter="${value}" class="${libraryFilter===value?"active":""}">${label}</button>`).join("");
      const rows = workspaceLayouts.filter((row) => libraryFilter === "all" || row.layout_type === libraryFilter);
      libraryGrid.innerHTML = rows.length ? rows.map((row) => `<article class="layout-library-card" data-layout-id="${row.id}">${libraryPreview(row)}<h3>${escapeHtml(row.layout_name || "이름 없는 레이아웃")}</h3><p>${typeLabel(row.layout_type)}</p><p class="layout-library-card-meta">권장 ${row.min_people ?? "-"}~${row.max_people ?? "-"}명 · 최대 ${row.setup_capacity ?? "-"}명</p><p class="layout-library-card-meta">${escapeHtml(objectSummary(row.id))}</p><div class="layout-library-card-actions"><button data-action="open">열기</button><button data-action="edit">편집</button><button data-action="info">정보 수정</button><button data-action="duplicate">복제</button><button data-action="delete" class="danger-button">삭제</button></div></article>`).join("") : "<p>이 분류에 저장된 레이아웃이 없습니다.</p>";
    }
    async function handleLibraryAction(event) {
      const button = event.target.closest("button[data-action]"); const card = event.target.closest("[data-layout-id]"); if (!card) return;
      const layout = workspaceLayouts.find((row) => row.id === card.dataset.layoutId); if (!layout) return;
      const action = button?.dataset.action || "open";
      if (["open","edit"].includes(action)) { workspaceSavedLayoutSelect.value = layout.id; await loadWorkspaceLayoutById(layout.id); showLayoutEditor(); return; }
      if (action === "info") { workspaceActiveLayout = layout; openLayoutInfoModal("info", false); return; }
      if (action === "duplicate") { await duplicateLibraryLayout(layout); return; }
      if (action === "delete") await deleteLibraryLayout(layout);
    }
    function nullableNumber(input) { return input.value === "" ? null : Number(input.value); }
    function openLayoutInfoModal(mode, forceNew) {
      if (!workspaceFloorplanRecord?.id) { setStatus("기본 도면을 먼저 선택해 주세요.", "warn"); return; }
      libraryModalMode = mode; libraryModalForceNew = forceNew; const row = mode === "info" ? workspaceActiveLayout : workspaceActiveLayout;
      librarySpaceInput.value = workspaceSpaceSelect?.selectedOptions?.[0]?.textContent || ""; libraryTypeInput.value = row?.layout_type || "";
      libraryNameInput.value = forceNew ? `${row?.layout_name || workspaceNameInput?.value || "새 레이아웃"} - 복사본` : row?.layout_name || workspaceNameInput?.value || "";
      libraryMinInput.value = row?.min_people ?? ""; libraryMaxInput.value = row?.max_people ?? ""; libraryCapacityInput.value = row?.setup_capacity ?? ""; libraryNotesInput.value = row?.layout_notes || "";
      libraryModal.hidden = false; libraryNameInput.focus();
    }
    function closeLayoutInfoModal() { libraryModal.hidden = true; }
    async function submitLayoutInfoModal(event) {
      event.preventDefault(); if (!libraryTypeInput.value || !libraryNameInput.value.trim()) return;
      const info = { layout_type: libraryTypeInput.value, layout_name: libraryNameInput.value.trim(), min_people: nullableNumber(libraryMinInput), max_people: nullableNumber(libraryMaxInput), setup_capacity: nullableNumber(libraryCapacityInput), layout_notes: libraryNotesInput.value.trim() || null };
      if (libraryModalMode === "info" && workspaceActiveLayout?.id) {
        const rows = await loggedSupabaseRequest("layout library info update", `venue_layouts?id=eq.${encodeURIComponent(workspaceActiveLayout.id)}&select=*`, { method:"PATCH", headers:{"Content-Type":"application/json",Prefer:"return=representation"}, body:JSON.stringify(info) });
        workspaceActiveLayout = rows?.[0] || workspaceActiveLayout; closeLayoutInfoModal(); await loadWorkspaceSavedLayouts(); return;
      }
      pendingLayoutInfo = info; if (workspaceNameInput) workspaceNameInput.value = info.layout_name; closeLayoutInfoModal(); await saveWorkspaceLayout(libraryModalForceNew);
    }
    function cloneObjectPayload(row, layoutId) { return { layout_id:layoutId, object_type:row.object_type, label:row.label, x:row.x, y:row.y, width:row.width, height:row.height, rotation:row.rotation, seat_count:row.seat_count, style:row.style||{}, metadata:row.metadata||{}, sort_order:row.sort_order||0, is_active:true, object_type_id:row.object_type_id||null, memo:row.memo||"", is_locked:Boolean(row.is_locked) }; }
    async function duplicateLibraryLayout(layout) {
      const { id, created_at, updated_at, ...copy } = layout; copy.layout_name = `${layout.layout_name} - 복사본`; copy.is_active = true;
      const rows = await loggedSupabaseRequest("layout library duplicate", "venue_layouts?select=*", {method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(copy)}); const duplicate = rows?.[0]; if (!duplicate?.id) return;
      const objects = libraryObjectsByLayout.get(layout.id) || []; if (objects.length) await loggedSupabaseRequest("layout library duplicate objects", "venue_layout_objects", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(objects.map((row)=>cloneObjectPayload(row,duplicate.id)))});
      await loadWorkspaceSavedLayouts();
    }
    async function deleteLibraryLayout(layout) {
      if (!window.confirm(`레이아웃 '${layout.layout_name}'만 삭제하시겠습니까?`)) return;
      await loggedSupabaseRequest("layout library objects deactivate", `venue_layout_objects?layout_id=eq.${encodeURIComponent(layout.id)}`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_active:false})});
      await loggedSupabaseRequest("layout library deactivate", `venue_layouts?id=eq.${encodeURIComponent(layout.id)}`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_active:false})}); await loadWorkspaceSavedLayouts();
    }

    async function handleWorkspaceFloorplanChange() {
      const row = workspaceFloorplans.find((item) => String(item.id) === String(workspaceFloorplanSelect?.value || ""));
      workspaceSourceRow = row || null;
      workspaceSourceFile = Array.isArray(row?.files) ? row.files[0] : row?.files;
      workspaceFloorplanRecord = row?._workspaceSourceKind === "geometry" ? row : null;
      workspaceActiveLayout = null;
      workspaceLayouts = [];
      resetWorkspaceLayout();
      renderWorkspaceBackground(row);
      if (!row || (row._workspaceSourceKind !== "geometry" && !workspaceSourceFile?.id)) {
        renderWorkspaceSavedLayoutOptions();
        return;
      }
      await loadWorkspaceFloorplanState();
      await loadWorkspaceSavedLayouts();
      updateWorkspaceStatus("저장되지 않음");
      setTimeout(fitWorkspaceToScreen, 0);
    }

    function renderWorkspaceBackground(row) {
      if (!workspaceBackgroundLayer) return;
      workspaceBackgroundLayer.innerHTML = "";
      workspaceOutlinePoints = [];
      workspaceGeometryOffset = { x: 0, y: 0 };
      if (row?._workspaceSourceKind === "geometry") {
        workspaceGrid = true;
        workspaceShowFloorplan = true;
        if (workspaceViewGridInput) workspaceViewGridInput.checked = true;
        if (workspaceViewFloorplanInput) workspaceViewFloorplanInput.checked = true;
        renderWorkspace();
        return;
      }
      const file = Array.isArray(row?.files) ? row.files[0] : row?.files;
      if (!file?.public_url) {
        workspaceGrid = true;
        if (workspaceViewGridInput) workspaceViewGridInput.checked = true;
        renderWorkspace();
        return;
      }
      workspaceGrid = false;
      workspaceShowFloorplan = true;
      if (workspaceViewGridInput) workspaceViewGridInput.checked = false;
      if (workspaceViewFloorplanInput) workspaceViewFloorplanInput.checked = true;
      const image = document.createElementNS(svgNs, "image");
      image.setAttribute("href", file.public_url);
      image.setAttribute("x", "0");
      image.setAttribute("y", "0");
      image.setAttribute("width", String(workspaceSize.width));
      image.setAttribute("height", String(workspaceSize.height));
      image.setAttribute("preserveAspectRatio", "xMidYMid meet");
      image.setAttribute("pointer-events", "none");
      image.setAttribute("opacity", String(workspaceReferenceOpacity));
      image.dataset.referenceFloorplan = "true";
      workspaceBackgroundLayer.append(image);
      renderWorkspace();
      setTimeout(fitWorkspaceToScreen, 0);
    }

    function applyWorkspaceHallOutline(outline) {
      const points = Array.isArray(outline?.metadata?.points) ? outline.metadata.points : [];
      const validPoints = points
        .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      workspaceOutlinePoints = validPoints;
      if (!validPoints.length || !workspaceBackgroundLayer) return;
      const xs = validPoints.map((point) => point.x);
      const ys = validPoints.map((point) => point.y);
      const minX = Math.min(...xs); const minY = Math.min(...ys);
      const maxX = Math.max(...xs); const maxY = Math.max(...ys);
      workspaceGeometryOffset = { x: -minX, y: -minY };
      workspaceDrawingWidthMm = Math.max(1000, maxX - minX);
      workspaceDrawingHeightMm = Math.max(1000, maxY - minY);
      syncWorkspaceSizeFromDrawing();
      syncWorkspaceDrawingInputs();
      const polygon = document.createElementNS(svgNs, "polygon");
      polygon.dataset.referenceFloorplan = "true";
      polygon.setAttribute("points", validPoints.map((point) => `${point.x + workspaceGeometryOffset.x},${point.y + workspaceGeometryOffset.y}`).join(" "));
      polygon.setAttribute("fill", outline?.style?.fill || "rgba(212,175,55,0.06)");
      polygon.setAttribute("stroke", outline?.style?.stroke || "#0f2a43");
      polygon.setAttribute("stroke-width", String(outline?.style?.strokeWidthPx || 2.5));
      polygon.setAttribute("vector-effect", "non-scaling-stroke");
      polygon.setAttribute("stroke-linejoin", "round");
      polygon.setAttribute("pointer-events", "none");
      workspaceBackgroundLayer.append(polygon);
    }

    async function loadWorkspaceFloorplanState() {
      const isGeometryFloorplan = workspaceSourceRow?._workspaceSourceKind === "geometry";
      if (!isGeometryFloorplan && !workspaceSourceFile?.id) return;
      if (!isGeometryFloorplan) {
        workspaceFloorplanRecord = await loggedSupabaseRequest(
          "workspace venue_floorplans select",
          `venue_floorplans?select=*&file_id=eq.${encodeURIComponent(workspaceSourceFile.id)}&is_active=eq.true&limit=1`
        ).then((rows) => rows?.[0] || null).catch(() => null);
      }
      applyWorkspaceFloorplanSettings(workspaceFloorplanRecord || workspaceSourceRow);

      if (!workspaceFloorplanRecord?.id) {
        workspaceObjects = workspaceObjects.filter((object) => !isWorkspaceBaseObject(object));
        renderWorkspace();
        return;
      }

      const floorplanRows = await loggedSupabaseRequest(
        "workspace venue_floorplan_objects select",
        `venue_floorplan_objects?select=*&floorplan_id=eq.${encodeURIComponent(workspaceFloorplanRecord.id)}&is_active=eq.true&order=sort_order.asc`
      ).catch(() => []);
      const outline = (floorplanRows || []).find((row) => row.object_type === "hall_outline" && row.metadata?.unit === "mm");
      applyWorkspaceHallOutline(outline);
      const fixedObjects = (floorplanRows || [])
        .filter((row) => row.object_type !== "hall_outline")
        .map(dbObjectToWorkspaceObject)
        .map((object) => ({ ...object, locked: true, metadata: { ...(object.metadata || {}), baseFloorplanObject: true } }));
      workspaceCalibration = null;
      fixedObjects.filter((object) => object.objectType === "calibration").forEach(applyWorkspaceCalibrationFromObject);
      workspaceObjects = [
        ...fixedObjects,
        ...workspaceObjects.filter((object) => !isWorkspaceBaseObject(object)),
      ];
      renderWorkspace();
    }

    async function loadWorkspaceSavedLayouts() {
      if (!workspaceFloorplanRecord?.id) {
        workspaceLayouts = [];
        renderWorkspaceSavedLayoutOptions();
        return;
      }
      workspaceLayouts = await loggedSupabaseRequest(
        "workspace venue_layouts select",
        `venue_layouts?select=*&floorplan_id=eq.${encodeURIComponent(workspaceFloorplanRecord.id)}&is_active=eq.true&order=updated_at.desc`
      ).catch(() => []);
      renderWorkspaceSavedLayoutOptions();
      await loadLibraryObjects();
      renderLayoutLibrary();
    }

    async function loadWorkspaceLayoutById(layoutId) {
      workspaceActiveLayout = workspaceLayouts.find((layout) => String(layout.id) === String(layoutId || "")) || null;
      if (workspaceNameInput) workspaceNameInput.value = workspaceActiveLayout?.layout_name || "";
      const fixedObjects = workspaceObjects.filter(isWorkspaceBaseObject);
      if (!workspaceActiveLayout?.id) {
        workspaceObjects = fixedObjects;
        workspaceSelectedId = "";
        workspaceDirty = false;
        updateWorkspaceStatus("??λ릺吏 ?딆쓬");
        renderWorkspace();
        return;
      }
      const layoutRows = await loggedSupabaseRequest(
        "workspace venue_layout_objects select",
        `venue_layout_objects?select=*&layout_id=eq.${encodeURIComponent(workspaceActiveLayout.id)}&is_active=eq.true&order=sort_order.asc`
      ).catch(() => []);
      workspaceObjects = [
        ...fixedObjects,
        ...(layoutRows || []).map(dbObjectToWorkspaceObject),
      ];
      workspaceSelectedId = "";
      workspaceDirty = false;
      updateWorkspaceStatus("??λ맖");
      renderWorkspace();
    }

    async function saveWorkspaceLayout(forceNew) {
      if (isAdminUser && !isAdminUser()) {
        setStatus("?꾨㈃ ?덉씠?꾩썐 ??μ? 愿由ъ옄留??ъ슜?????덉뒿?덈떎.", "warn");
        return;
      }
      if (!workspaceSourceRow || (!workspaceFloorplanRecord?.id && !workspaceSourceFile?.id)) {
        setStatus("저장할 기본 도면을 먼저 선택해주세요.", "warn");
        return;
      }
      const layoutName = workspaceNameInput?.value?.trim() || workspaceActiveLayout?.layout_name || "";
      if (!layoutName) {
        setStatus("저장할 레이아웃명을 입력해주세요.", "warn");
        workspaceNameInput?.focus();
        return;
      }
      workspaceSaveButton.disabled = true;
      workspaceSaveAsButton.disabled = true;
      updateWorkspaceStatus("저장 중");
      try {
        const fixedObjects = workspaceObjects.filter(isWorkspaceBaseObject);
        const layoutOnlyObjects = workspaceObjects.filter((object) => !isWorkspaceBaseObject(object));
        if (workspaceSourceRow?._workspaceSourceKind !== "geometry") {
          workspaceFloorplanRecord = await upsertWorkspaceFloorplan();
          await replaceObjects("venue_floorplan_objects", "floorplan_id", workspaceFloorplanRecord.id, fixedObjects.map(workspaceObjectToDbShape));
        }
        const layoutPayload = buildWorkspaceLayoutPayload(layoutName);
        const layoutRows = (!forceNew && workspaceActiveLayout?.id)
          ? await loggedSupabaseRequest("workspace venue_layouts update", `venue_layouts?id=eq.${encodeURIComponent(workspaceActiveLayout.id)}&select=*`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Prefer: "return=representation" },
              body: JSON.stringify(layoutPayload),
            })
          : await loggedSupabaseRequest("workspace venue_layouts insert", "venue_layouts?select=*", {
              method: "POST",
              headers: { "Content-Type": "application/json", Prefer: "return=representation" },
              body: JSON.stringify(layoutPayload),
            });
        workspaceActiveLayout = layoutRows?.[0];
        if (!workspaceActiveLayout?.id) throw new Error("레이아웃 저장 결과를 확인하지 못했습니다.");
        await replaceObjects("venue_layout_objects", "layout_id", workspaceActiveLayout.id, layoutOnlyObjects.map(workspaceObjectToDbShape));
        try {
          const previewFile = await createWorkspacePreviewFile(layoutName);
          const venueLayoutImage = await upsertWorkspaceVenueLayoutImage(previewFile.id, workspaceActiveLayout.venue_layout_image_id);
          if (venueLayoutImage?.id && venueLayoutImage.id !== workspaceActiveLayout.venue_layout_image_id) {
            await loggedSupabaseRequest("workspace venue_layouts preview link update", `venue_layouts?id=eq.${encodeURIComponent(workspaceActiveLayout.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ venue_layout_image_id: venueLayoutImage.id, preview_file_id: previewFile.id }),
            });
            workspaceActiveLayout.venue_layout_image_id = venueLayoutImage.id;
            workspaceActiveLayout.preview_file_id = previewFile.id;
          }
          await syncWorkspacePreviewFileLinks(previewFile.id, workspaceActiveLayout.id, venueLayoutImage?.id);
        } catch (previewError) {
          console.warn("workspace preview save failed:", previewError);
          setStatus("醫뚰몴 ?곗씠?곕뒗 ??λ릱吏留?PNG 誘몃━蹂닿린 ??μ? ?ㅽ뙣?덉뒿?덈떎.", "warn");
        }
        await loadWorkspaceSavedLayouts();
        workspaceSavedLayoutSelect.value = workspaceActiveLayout.id;
        workspaceDirty = false;
        pendingLayoutInfo = null;
        resetWorkspaceHistory();
        updateWorkspaceStatus("??λ맖");
        await reloadVenueLayouts?.();
        setStatus("?꾨㈃ ?덉씠?꾩썐 媛앹껜瑜???ν뻽?듬땲??");
      } catch (error) {
        console.error("workspace layout save failed:", error);
        updateWorkspaceStatus("????ㅽ뙣");
        setStatus(error.message || "?꾨㈃ ?덉씠?꾩썐 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.", "error");
      } finally {
        workspaceSaveButton.disabled = false;
        workspaceSaveAsButton.disabled = false;
      }
    }

    async function upsertWorkspaceFloorplan() {
      const settings = buildWorkspaceFloorplanSettings();
      const payload = {
        file_id: workspaceSourceFile.id,
        venue_id: workspaceSourceRow.venue_id || workspaceVenueSelect?.value || null,
        space_id: workspaceSourceRow.space_id || workspaceSpaceSelect?.value || null,
        floorplan_name: buildWorkspaceFloorplanName(),
        actual_width: workspaceDrawingWidthMm / 1000,
        actual_height: workspaceDrawingHeightMm / 1000,
        unit: "m",
        notes: JSON.stringify(settings),
      };
      const rows = workspaceFloorplanRecord?.id
        ? await loggedSupabaseRequest("workspace venue_floorplans update", `venue_floorplans?id=eq.${encodeURIComponent(workspaceFloorplanRecord.id)}&select=*`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          })
        : await loggedSupabaseRequest("workspace venue_floorplans insert", "venue_floorplans?select=*", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          });
      if (!rows?.[0]?.id) throw new Error("\uAE30\uBCF8 \uB3C4\uBA74 \uC800\uC7A5 \uACB0\uACFC\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      return rows[0];
    }

    function buildWorkspaceFloorplanName() {
      const fileName = workspaceSourceFile?.original_filename || "\uAE30\uBCF8 \uB3C4\uBA74";
      return fileName.replace(/\.[^.]+$/, "") || "\uAE30\uBCF8 \uB3C4\uBA74";
    }

    function buildWorkspaceFloorplanSettings() {
      return {
        coordinate_unit: "mm",
        drawing_width_mm: workspaceDrawingWidthMm,
        drawing_height_mm: workspaceDrawingHeightMm,
        minor_grid_size_mm: workspaceMinorGridSizeMm,
        major_grid_size_mm: workspaceMajorGridSizeMm,
        grid_size_mm: workspaceGridSizeMm,
        source_notes: workspaceSourceRow?.layout_notes || null,
      };
    }

    function applyWorkspaceFloorplanSettings(row) {
      const settings = parseWorkspaceFloorplanSettings(row?.notes);
      const actualWidthMm = Number(row?.actual_width || 0) > 0 ? Math.round(Number(row.actual_width) * 1000) : 0;
      const actualHeightMm = Number(row?.actual_height || 0) > 0 ? Math.round(Number(row.actual_height) * 1000) : 0;
      workspaceDrawingWidthMm = Math.max(1000, Number(settings.drawing_width_mm || actualWidthMm || 30000));
      workspaceDrawingHeightMm = Math.max(1000, Number(settings.drawing_height_mm || actualHeightMm || 30000));
      workspaceGridSizeMm = Math.max(10, Number(settings.grid_size_mm || settings.minor_grid_size_mm || workspaceGridSizeMm || 500));
      workspaceMinorGridSizeMm = Math.max(10, Number(settings.minor_grid_size_mm || Math.min(workspaceGridSizeMm, 100)));
      workspaceMajorGridSizeMm = Math.max(workspaceGridSizeMm, Number(settings.major_grid_size_mm || (workspaceGridSizeMm <= 1000 ? 1000 : workspaceGridSizeMm)));
      syncWorkspaceSizeFromDrawing();
      syncWorkspaceDrawingInputs();
      syncWorkspaceGridInputs();
    }

    function parseWorkspaceFloorplanSettings(notes) {
      if (!notes || typeof notes !== "string") return {};
      try {
        const parsed = JSON.parse(notes);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }

    function buildWorkspaceLayoutPayload(layoutName) {
      const layoutOnlyObjects = workspaceObjects.filter((object) => !isWorkspaceBaseObject(object));
      const info = pendingLayoutInfo || {};
      return {
        floorplan_id: workspaceFloorplanRecord.id,
        venue_id: workspaceSourceRow.venue_id || workspaceVenueSelect?.value || null,
        space_id: workspaceSourceRow.space_id || workspaceSpaceSelect?.value || null,
        layout_name: info.layout_name || layoutName,
        layout_type: info.layout_type || workspaceActiveLayout?.layout_type || inferWorkspaceLayoutType(layoutName),
        min_people: info.min_people ?? workspaceActiveLayout?.min_people ?? null,
        max_people: info.max_people ?? workspaceActiveLayout?.max_people ?? null,
        setup_capacity: info.setup_capacity ?? workspaceActiveLayout?.setup_capacity ?? (layoutOnlyObjects.reduce((sum, object) => sum + Number(object.seatCount || 0), 0) || null),
        table_type: workspaceSourceRow.table_type || null,
        table_count: layoutOnlyObjects.filter((object) => /table/.test(object.objectType)).length || workspaceSourceRow.table_count || null,
        row_count: workspaceSourceRow.row_count ?? null,
        column_count: workspaceSourceRow.column_count ?? null,
        seats_per_table: workspaceSourceRow.seats_per_table ?? null,
        has_stage: workspaceObjects.some((object) => object.objectType === "stage") || Boolean(workspaceSourceRow.has_stage),
        has_buffet: workspaceObjects.some((object) => object.objectType === "buffet_table") || Boolean(workspaceSourceRow.has_buffet),
        layout_notes: info.layout_notes ?? workspaceActiveLayout?.layout_notes ?? null,
      };
    }

    function inferWorkspaceLayoutType(layoutName) {
      const text = `${layoutName || ""} ${workspaceSourceRow?.layout_type || ""}`.toLowerCase();
      if (/세미나|seminar/.test(text)) return "세미나";
      if (/라운드|round/.test(text)) return "라운드";
      if (/뷔페|buffet/.test(text)) return "뷔페";
      if (/u자|u-shape|u shape/.test(text)) return "U자";
      return workspaceSourceRow?.layout_type && !isBaseFloorplanRow(workspaceSourceRow) ? workspaceSourceRow.layout_type : "레이아웃";
    }

    function workspaceObjectToDbShape(object) {
      if (["wall", "calibration"].includes(object.objectType)) {
        syncWorkspaceLineObjectFromMetadata(object);
      }
      const width = Math.max(0.001, object.widthM * workspaceMeterScale / workspaceSize.width);
      const height = Math.max(0.001, object.heightM * workspaceMeterScale / workspaceSize.height);
      return {
        object_type: object.objectType,
        label: object.label,
        x: clamp01((object.x - (object.widthM * workspaceMeterScale) / 2) / workspaceSize.width),
        y: clamp01((object.y - (object.heightM * workspaceMeterScale) / 2) / workspaceSize.height),
        width: Math.min(1, width),
        height: Math.min(1, height),
        rotation: Number(object.rotation || 0),
        seat_count: object.seatCount || null,
        object_type_id: isUuid(object.masterObjectId) ? object.masterObjectId : null,
        memo: object.memo || "",
        is_locked: Boolean(object.locked),
        display_shape: object.displayShape || null,
        can_resize: true,
        can_rotate: true,
        metadata: {
          ...(object.metadata || {}),
          geometryVersion: 2,
          unit: "mm",
          coordinateAnchor: "center",
          xMm: Math.round(object.x),
          yMm: Math.round(object.y),
          widthMm: Math.round(object.widthM * 1000),
          heightMm: Math.round(object.heightM * 1000),
          object_type_id: object.masterObjectId || null,
          default_width_m: object.widthM,
          default_height_m: object.heightM,
          opacity: getWorkspaceObjectOpacity(object),
          length_mm: ["wall", "calibration"].includes(object.objectType) ? getWallLengthMm(object) : object.metadata?.length_mm || drawingDistanceToMillimeters(object.widthM * workspaceMeterScale),
          thickness_mm: object.metadata?.thickness_mm || Math.round(object.heightM * 1000),
        },
      };
    }

    function dbObjectToWorkspaceObject(row) {
      const widthM = Math.max(0.1, Number(row.metadata?.widthMm) / 1000 || Number(row.metadata?.default_width_m) || (Number(row.width || 0.05) * workspaceSize.width / workspaceMeterScale));
      const heightM = Math.max(0.1, Number(row.metadata?.heightMm) / 1000 || Number(row.metadata?.default_height_m) || (Number(row.height || 0.05) * workspaceSize.height / workspaceMeterScale));
      const widthPx = widthM * workspaceMeterScale;
      const heightPx = heightM * workspaceMeterScale;
      const object = {
        instanceId: row.id || (crypto.randomUUID ? crypto.randomUUID() : `object_${Date.now()}_${Math.random().toString(16).slice(2)}`),
        masterObjectId: row.object_type_id || row.metadata?.object_type_id || "",
        objectType: row.object_type,
        label: row.label || objectLabels[row.object_type] || row.object_type,
        x: clampNumber(Number.isFinite(Number(row.metadata?.xMm)) ? Number(row.metadata.xMm) : Number(row.x || 0) * workspaceSize.width + widthPx / 2, 0, workspaceSize.width),
        y: clampNumber(Number.isFinite(Number(row.metadata?.yMm)) ? Number(row.metadata.yMm) : Number(row.y || 0) * workspaceSize.height + heightPx / 2, 0, workspaceSize.height),
        widthM,
        heightM,
        rotation: Number(row.rotation || 0),
        seatCount: Number(row.seat_count || row.metadata?.seat_count || 0),
        zIndex: Number(row.sort_order || 0),
        locked: Boolean(row.is_locked),
        opacity: Number.isFinite(Number(row.metadata?.opacity)) ? Number(row.metadata.opacity) : undefined,
        metadata: row.metadata || {},
      };
      return ["wall", "calibration"].includes(object.objectType) ? syncWorkspaceLineObjectFromMetadata(object) : object;
    }

    function showWorkspacePreviewNotice() {
      setStatus("誘몃━蹂닿린? PNG ?대낫?닿린???ㅼ쓬 ?④퀎?먯꽌 ??λ맂 醫뚰몴 ?곗씠?곕? 湲곗??쇰줈 ?곌껐?⑸땲??", "warn");
    }

    function showWorkspacePreview() {
      if (!workspacePreviewModal || !workspacePreviewBody || !workspaceSvg) return;
      const clone = buildWorkspacePreviewSvgClone(workspaceIncludeDimensionsInExport);
      if (!clone) {
        setStatus("誘몃━蹂닿린濡??쒖떆???꾨㈃???놁뒿?덈떎.", "warn");
        return;
      }
      workspacePreviewBody.innerHTML = "";
      workspacePreviewBody.append(clone);
      workspacePreviewModal.hidden = false;
      workspacePreviewModal.classList.add("visible");
      setStatus("?꾨㈃ ?덉씠?꾩썐 誘몃━蹂닿린瑜??댁뿀?듬땲??");
    }

    function closeWorkspacePreview() {
      if (!workspacePreviewModal) return;
      workspacePreviewModal.classList.remove("visible");
      workspacePreviewModal.hidden = true;
      if (workspacePreviewBody) workspacePreviewBody.innerHTML = "";
    }

    function buildWorkspacePreviewSvgClone(includeDimensions = true) {
      if (!workspaceSvg) return null;
      const previousSelectedId = workspaceSelectedId;
      const previousScale = view.scale;
      const previousViewX = view.panX;
      const previousViewY = view.panY;
      const previousDimensionMode = workspaceDimensionMode;
      workspaceSelectedId = "";
      view.scale = 1;
      view.panX = 0;
      view.panY = 0;
      workspaceDimensionMode = includeDimensions ? "all" : "hidden";
      renderWorkspace();
      const clone = workspaceSvg.cloneNode(true);
      workspaceSelectedId = previousSelectedId;
      view.scale = previousScale;
      view.panX = previousViewX;
      view.panY = previousViewY;
      workspaceDimensionMode = previousDimensionMode;
      renderWorkspace();

      clone.removeAttribute("id");
      clone.classList.add("layout-workspace-preview-svg");
      clone.setAttribute("xmlns", svgNs);
      const exportSize = getWorkspaceExportPixelSize();
      clone.setAttribute("viewBox", `0 0 ${workspaceSize.width} ${workspaceSize.height}`);
      clone.setAttribute("width", String(exportSize.width));
      clone.setAttribute("height", String(exportSize.height));
      clone.querySelector("#layoutWorkspaceEmptyState")?.remove();
      clone.querySelectorAll("[id]").forEach((node) => {
        if (node.id === "layoutEditorGridPattern") return;
        node.removeAttribute("id");
      });
      clone.querySelectorAll(".selected").forEach((node) => node.classList.remove("selected"));
      clone.querySelectorAll(".layout-workspace-object").forEach((node) => {
        node.removeAttribute("data-instance-id");
        node.style.cursor = "default";
      });
      return clone;
    }

    async function exportWorkspacePng() {
      const clone = buildWorkspacePreviewSvgClone(workspaceIncludeDimensionsInExport);
      if (!clone) {
        setStatus("PNG濡??대낫???꾨㈃???놁뒿?덈떎.", "warn");
        return;
      }
      setStatus("PNG ?대?吏瑜??앹꽦?섎뒗 以묒엯?덈떎.");
      try {
        const svgText = new XMLSerializer().serializeToString(clone);
        const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        const image = await loadImageFromObjectUrl(url);
        URL.revokeObjectURL(url);

        const canvas = document.createElement("canvas");
        const exportSize = getWorkspaceExportPixelSize();
        canvas.width = exportSize.width;
        canvas.height = exportSize.height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
        if (!pngBlob) throw new Error("PNG ?뚯씪???앹꽦?섏? 紐삵뻽?듬땲??");
        const downloadUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = buildWorkspaceExportFileName();
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(downloadUrl);
        setStatus("PNG ?대?吏瑜??대낫?덉뒿?덈떎.");
      } catch (error) {
        console.error("workspace png export failed:", error);
        setStatus(error.message || "PNG ?대낫?닿린???ㅽ뙣?덉뒿?덈떎.", "error");
      }
    }

    function loadImageFromObjectUrl(url) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("?꾨㈃ ?대?吏瑜?PNG濡?蹂?섑븯吏 紐삵뻽?듬땲?? 諛곌꼍 ?대?吏 ?묎렐 沅뚰븳???뺤씤?댁＜?몄슂."));
        image.src = url;
      });
    }

    function getWorkspaceExportPixelSize(maxSize = 2400) {
      const ratio = Math.min(maxSize / workspaceSize.width, maxSize / workspaceSize.height, 1);
      return {
        width: Math.max(1, Math.round(workspaceSize.width * ratio)),
        height: Math.max(1, Math.round(workspaceSize.height * ratio)),
      };
    }

    function buildWorkspaceExportFileName() {
      const base = workspaceActiveLayout?.layout_name
        || workspaceSourceFile?.original_filename?.replace(/\.[^.]+$/, "")
        || "venue_layout";
      const safeName = String(base)
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
      return `${safeName || "venue_layout"}_${new Date().toISOString().slice(0, 10)}.png`;
    }

    async function createWorkspacePreviewFile(layoutName) {
      const blob = await renderWorkspacePreviewBlob();
      const bucket = supabaseConfig.venueLayoutBucket || "venue-layouts";
      const safeName = makeSafeStorageName(layoutName || workspaceSourceFile?.original_filename || "layout");
      const storagePath = `layout-previews/${Date.now()}_${safeName}.png`;
      const uploadUrl = `${supabaseConfig.url}/storage/v1/object/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
          "Content-Type": "image/png",
          "x-upsert": "false",
        },
        body: blob,
      });
      if (!response.ok) throw await supabaseErrorFromResponse(response, "PNG 誘몃━蹂닿린 ?낅줈?쒖뿉 ?ㅽ뙣?덉뒿?덈떎.");
      const publicUrl = `${supabaseConfig.url}/storage/v1/object/public/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
      const fileRows = await loggedSupabaseRequest("workspace files insert preview", "files?select=*", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          bucket,
          storage_path: storagePath,
          public_url: publicUrl,
          original_filename: `${safeName}.png`,
          file_type: "image",
          mime_type: "image/png",
          file_size: blob.size,
          description: workspaceSourceRow?.layout_notes || null,
        }),
      });
      if (!fileRows?.[0]?.id) throw new Error("PNG 誘몃━蹂닿린 ?뚯씪 ?뺣낫瑜???ν븯吏 紐삵뻽?듬땲??");
      return fileRows[0];
    }

    async function renderWorkspacePreviewBlob() {
      const clone = buildWorkspacePreviewSvgClone();
      if (!clone) throw new Error("PNG 誘몃━蹂닿린濡?蹂?섑븷 ?꾨㈃???놁뒿?덈떎.");
      const svgText = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      try {
        const image = await loadImageFromObjectUrl(url);
        const canvas = document.createElement("canvas");
        const exportSize = getWorkspaceExportPixelSize();
        canvas.width = exportSize.width;
        canvas.height = exportSize.height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 誘몃━蹂닿린瑜??앹꽦?섏? 紐삵뻽?듬땲??")), "image/png", 0.92);
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    async function upsertWorkspaceVenueLayoutImage(fileId, existingId) {
      const layoutOnlyObjects = workspaceObjects.filter((object) => !isWorkspaceBaseObject(object));
      const payload = {
        file_id: fileId,
        venue_id: workspaceSourceRow?.venue_id || workspaceVenueSelect?.value || null,
        space_id: workspaceSourceRow?.space_id || workspaceSpaceSelect?.value || null,
        layout_type: workspaceActiveLayout?.layout_type || inferWorkspaceLayoutType(workspaceActiveLayout?.layout_name),
        min_people: workspaceActiveLayout?.min_people ?? workspaceSourceRow?.min_people ?? null,
        max_people: workspaceActiveLayout?.max_people ?? workspaceSourceRow?.max_people ?? null,
        table_type: workspaceActiveLayout?.table_type || workspaceSourceRow?.table_type || null,
        table_count: workspaceActiveLayout?.table_count || layoutOnlyObjects.filter((object) => /table/.test(object.objectType)).length || null,
        setup_capacity: workspaceActiveLayout?.setup_capacity || layoutOnlyObjects.reduce((sum, object) => sum + Number(object.seatCount || 0), 0) || null,
        column_count: workspaceActiveLayout?.column_count ?? workspaceSourceRow?.column_count ?? null,
        row_count: workspaceActiveLayout?.row_count ?? workspaceSourceRow?.row_count ?? null,
        seats_per_table: workspaceActiveLayout?.seats_per_table ?? workspaceSourceRow?.seats_per_table ?? null,
        base_table_count: workspaceActiveLayout?.table_count || null,
        extra_table_count: 0,
        has_stage: workspaceObjects.some((object) => object.objectType === "stage") || Boolean(workspaceSourceRow?.has_stage),
        has_buffet: workspaceObjects.some((object) => object.objectType === "buffet_table") || Boolean(workspaceSourceRow?.has_buffet),
        is_verified: true,
        verified_by: "floorplan_editor",
        verified_at: new Date().toISOString(),
        layout_notes: workspaceActiveLayout?.layout_notes || workspaceSourceRow?.layout_notes || null,
        source_type: "floorplan_editor",
        source_id: workspaceActiveLayout?.id || null,
      };
      const rows = existingId
        ? await loggedSupabaseRequest("workspace venue_layout_images update preview", `venue_layout_images?id=eq.${encodeURIComponent(existingId)}&select=*`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          })
        : await loggedSupabaseRequest("workspace venue_layout_images insert preview", "venue_layout_images?select=*", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          });
      return rows?.[0] || null;
    }

    async function syncWorkspacePreviewFileLinks(fileId, layoutId, venueLayoutImageId) {
      const venueId = workspaceSourceRow?.venue_id || workspaceVenueSelect?.value || null;
      const spaceId = workspaceSourceRow?.space_id || workspaceSpaceSelect?.value || null;
      const links = [
        venueId ? { file_id: fileId, entity_type: "venue", entity_id: venueId, link_type: "layout_preview" } : null,
        spaceId ? { file_id: fileId, entity_type: "venue_space", entity_id: spaceId, link_type: "layout_preview" } : null,
        layoutId ? { file_id: fileId, entity_type: "venue_layout", entity_id: layoutId, link_type: "preview" } : null,
        venueLayoutImageId ? { file_id: fileId, entity_type: "venue_layout_image", entity_id: venueLayoutImageId, link_type: "primary_file" } : null,
      ].filter(Boolean);
      if (!links.length) return;
      await loggedSupabaseRequest("workspace file_links insert preview", "file_links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify(links),
      });
    }

    function makeSafeStorageName(name) {
      return String(name || "layout")
        .replace(/\.[^.]+$/, "")
        .normalize("NFKD")
        .replace(/[^\w.-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase() || "layout";
    }

    function resetWorkspaceDependentSelects(scope) {
      if (scope === "space") {
        workspaceSpaceSelect.innerHTML = '<option value="">怨듦컙???좏깮?섏꽭??/option>';
      }
      if (scope === "space" || scope === "floorplan") {
        workspaceFloorplanSelect.innerHTML = '<option value="">湲곕낯 ?꾨㈃???좏깮?섏꽭??/option>';
        workspaceSavedLayoutSelect.innerHTML = '<option value="">??λ맂 ?덉씠?꾩썐</option>';
      }
    }

    function setSelectLoading(select, message) {
      if (!select) return;
      select.innerHTML = "";
      select.append(new Option(message, ""));
    }

    function addWorkspaceObjectFromMaster(master, point) {
      if (!master) return;
      pushWorkspaceHistory();
      const center = point || { x: workspaceSize.width / 2, y: workspaceSize.height / 2 };
      const object = {
        instanceId: crypto.randomUUID ? crypto.randomUUID() : `object_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        masterObjectId: master.id || "",
        objectType: master.object_type || "object",
        label: master.object_name || objectLabels[master.object_type] || master.object_type || "?ㅻ툕?앺듃",
        displayShape: master.display_shape || getObjectDisplayShape(master),
        x: clampNumber(center.x, 0, workspaceSize.width),
        y: clampNumber(center.y, 0, workspaceSize.height),
        widthM: Math.max(0.1, Number(master.default_width_m || 1)),
        heightM: Math.max(0.1, Number(master.default_height_m || 1)),
        rotation: 0,
        seatCount: Number(master.default_seat_count || 0),
        zIndex: getWorkspaceMaxZIndex() + 1,
        locked: false,
      };
      workspaceObjects.push(object);
      selectWorkspaceObject(object.instanceId);
      markWorkspaceDirty();
      renderWorkspace();
    }

    function handleWorkspaceDrop(event) {
      event.preventDefault();
      const master = findObjectType(event.dataTransfer.getData("text/plain"));
      if (!master) return;
      addWorkspaceObjectFromMaster(master, getWorkspaceSvgPoint(event));
    }

    function handleWorkspacePointerDown(event) {
      if (!workspaceSvg) return;
      const pointerHit = getWorkspacePointerHit(event);
      if (event.button === 1 || workspaceSpacePressed) {
        event.preventDefault();
        workspaceDragState = {
          mode: "pan",
          clientX: event.clientX,
          clientY: event.clientY,
          viewX: view.panX,
          viewY: view.panY,
        };
        workspaceSvg.classList.add("is-panning");
        workspaceSvg.setPointerCapture?.(event.pointerId);
        logWorkspacePointerDown(event, pointerHit, "pan");
        return;
      }
      if (event.button !== 0) return;
      logWorkspacePointerDown(event, pointerHit, null);
      const hitObject = pointerHit?.object || findWorkspaceObjectAtPoint(getWorkspaceSvgPoint(event));
      if (hitObject && canWorkspaceEditObject(hitObject)) {
        beginWorkspaceObjectMove(event, hitObject);
        return;
      }
      if (workspaceTool === "wall" || workspaceTool === "calibrate") {
        event.preventDefault();
        const point = getWorkspaceSnappedPoint(event);
        if (!workspaceDraftShape) {
          workspaceDraftShape = { type: workspaceTool, start: point, end: point };
          workspaceSvg.setPointerCapture?.(event.pointerId);
          renderWorkspace();
          return;
        }
        workspaceDraftShape.end = constrainWorkspacePoint(workspaceDraftShape.start, point, event.shiftKey);
        finishWorkspaceLineDraft(workspaceTool);
        workspaceSvg.releasePointerCapture?.(event.pointerId);
        return;
      }
      if (workspaceTool === "rect") {
        event.preventDefault();
        const point = getWorkspaceSnappedPoint(event);
        workspaceDraftShape = { type: "rect", start: point, end: point };
        workspaceDragState = { mode: "draw-rect" };
        workspaceSvg.setPointerCapture?.(event.pointerId);
        renderWorkspace();
      }
    }

    function getWorkspacePointerHit(event) {
      const target = event?.target;
      const handle = target?.closest?.(".layout-workspace-handle");
      if (handle?.classList?.contains("resize-handle")) {
        return { type: "resize-handle", object: findWorkspaceObject(workspaceSelectedId) || null, target };
      }
      if (handle?.classList?.contains("rotate-handle")) {
        return { type: "rotation-handle", object: findWorkspaceObject(workspaceSelectedId) || null, target };
      }
      const objectNode = target?.closest?.(".layout-workspace-object");
      if (objectNode?.dataset?.instanceId) {
        return { type: "object", object: findWorkspaceObject(objectNode.dataset.instanceId) || null, target };
      }
      if (target?.closest?.("#layoutWorkspaceSelectionLayer")) {
        return { type: "selection-overlay", object: findWorkspaceObjectAtPoint(getWorkspaceSvgPoint(event)), target };
      }
      const object = findWorkspaceObjectAtPoint(getWorkspaceSvgPoint(event));
      if (object) return { type: "object", object, target };
      return { type: "canvas", object: null, target };
    }

    function logWorkspacePointerDown(event, hit, dragMode) {
      console.log("pointerdown hit:", hit);
      console.log({
        currentTool: workspaceTool,
        selectedObjectId: workspaceSelectedId,
        pointerId: event.pointerId,
        button: event.button,
        hitType: hit?.type,
        hitObjectId: hit?.object?.instanceId || null,
        hitObjectLabel: hit?.object?.label || null,
        dragMode,
      });
    }

    function getWorkspaceSvgPoint(event) {
      return screenToWorld(event);
    }

    function getWorkspaceRawSvgPoint(event) {
      const point = workspaceSvg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const matrix = workspaceSvg.getScreenCTM();
      if (!matrix) return { x: workspaceSize.width / 2, y: workspaceSize.height / 2 };
      return point.matrixTransform(matrix.inverse());
    }

    function screenToWorld(eventOrX, maybeY) {
      if (!workspaceSvg) return { x: workspaceSize.width / 2, y: workspaceSize.height / 2 };
      const rawPoint = typeof eventOrX === "number"
        ? getWorkspaceRawSvgPoint({ clientX: eventOrX, clientY: maybeY })
        : getWorkspaceRawSvgPoint(eventOrX);
      return svgPointToWorld(rawPoint);
    }

    function svgPointToWorld(point) {
      const scale = Math.max(view.scale || 1, WORKSPACE_MIN_SCALE);
      return {
        x: clampNumber((Number(point?.x || 0) - view.panX) / scale, 0, workspaceSize.width),
        y: clampNumber((Number(point?.y || 0) - view.panY) / scale, 0, workspaceSize.height),
      };
    }

    function worldToScreen(point) {
      return {
        x: Number(point?.x || 0) * view.scale + view.panX,
        y: Number(point?.y || 0) * view.scale + view.panY,
      };
    }

    function renderWorkspace() {
      if (!workspaceObjectLayer) return;
      updateWorkspaceSvgViewBox();
      workspaceObjectLayer.innerHTML = "";
      if (workspaceSelectionLayer) workspaceSelectionLayer.innerHTML = "";
      if (workspaceGuideLayer) workspaceGuideLayer.innerHTML = "";
      workspaceViewport?.setAttribute("transform", `translate(${view.panX} ${view.panY}) scale(${view.scale})`);
      updateWorkspaceGridPattern();
      const gridBg = document.querySelector("#layoutWorkspaceGridBg");
      const majorGridBg = document.querySelector("#layoutWorkspaceMajorGridBg");
      if (gridBg) gridBg.style.display = workspaceGrid && view.scale > 0.75 ? "" : "none";
      if (majorGridBg) majorGridBg.style.display = workspaceGrid ? "" : "none";
      if (workspaceGridLayer) workspaceGridLayer.style.display = workspaceGrid ? "" : "none";
      if (workspaceBackgroundLayer) workspaceBackgroundLayer.style.display = workspaceShowFloorplan ? "" : "none";
      workspaceBackgroundLayer?.querySelectorAll("[data-reference-floorplan]").forEach((node) => {
        node.setAttribute("opacity", String(workspaceReferenceOpacity));
      });
      if (workspaceEmptyState) {
        workspaceEmptyState.style.display = workspaceObjects.length || workspaceBackgroundLayer?.children.length ? "none" : "";
      }
      ensureWorkspaceRenderLayers();
      workspaceObjects
        .slice()
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
        .forEach((object) => getWorkspaceRenderLayer(object).append(renderWorkspaceObject(object)));
      renderWorkspaceGuide();
      renderWorkspaceDimensions();
      renderWorkspaceSelection();
      renderWorkspaceProperties();
      updateWorkspaceFloorplanInfo();
      updateWorkspaceStatusbar();
    }

    function ensureWorkspaceRenderLayers() {
      ["building", "fixed_facility", "event_setup", "ai_recommendation"].forEach((layerName) => {
        if (!workspaceObjectLayer.querySelector(`[data-workspace-layer="${layerName}"]`)) {
          const layer = document.createElementNS(svgNs, "g");
          layer.dataset.workspaceLayer = layerName;
          workspaceObjectLayer.append(layer);
        }
      });
    }

    function getWorkspaceRenderLayer(object) {
      const layerName = getWorkspaceObjectLayerName(object);
      let layer = workspaceObjectLayer.querySelector(`[data-workspace-layer="${layerName}"]`);
      if (!layer) {
        layer = document.createElementNS(svgNs, "g");
        layer.dataset.workspaceLayer = layerName;
        workspaceObjectLayer.append(layer);
      }
      return layer;
    }

    function getWorkspaceObjectLayerName(object) {
      if (["door", "wall", "fixed_wall", "structure_area", "calibration", "pillar", "allowed_area", "blocked_area"].includes(object.objectType)) return "building";
      if (["screen", "stage"].includes(object.objectType)) return "fixed_facility";
      if (/^ai_/.test(object.objectType || "")) return "ai_recommendation";
      return "event_setup";
    }

    function renderWorkspaceGuide() {
      if (!workspaceGuideLayer || !workspaceDraftShape?.start || !workspaceDraftShape?.end) return;
      const { start, end, type } = workspaceDraftShape;
      if (type === "rect") {
        const box = getDraftBox(start, end);
        const rect = document.createElementNS(svgNs, "rect");
        rect.setAttribute("x", String(box.x));
        rect.setAttribute("y", String(box.y));
        rect.setAttribute("width", String(box.width));
        rect.setAttribute("height", String(box.height));
        rect.setAttribute("fill", "rgba(22, 163, 74, 0.12)");
        rect.setAttribute("stroke", "#16a34a");
        rect.setAttribute("stroke-width", "2");
        rect.setAttribute("stroke-dasharray", "8 6");
        rect.setAttribute("pointer-events", "none");
        workspaceGuideLayer.append(rect);
        return;
      }
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("x1", String(start.x));
      line.setAttribute("y1", String(start.y));
      line.setAttribute("x2", String(end.x));
      line.setAttribute("y2", String(end.y));
      line.setAttribute("stroke", type === "calibrate" ? "#d4af37" : "#0f172a");
      line.setAttribute("stroke-width", type === "calibrate" ? "4" : "8");
      line.setAttribute("stroke-dasharray", type === "calibrate" ? "10 7" : "none");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("pointer-events", "none");
      workspaceGuideLayer.append(line);
    }

    function renderWorkspaceDimensions() {
      if (!workspaceGuideLayer || workspaceDimensionMode === "hidden") return;
      workspaceObjects
        .filter((object) => shouldRenderWorkspaceDimension(object))
        .forEach((object) => workspaceGuideLayer.append(createWorkspaceDimensionNode(object)));
    }

    function shouldRenderWorkspaceDimension(object) {
      if (!isDimensionTargetObject(object)) return false;
      const metadata = migrateLegacyWallMetadata(object);
      if (metadata.dimension_visibility === "hide") return false;
      if (metadata.dimension_visibility === "show") return true;
      if (workspaceDimensionMode === "all") return true;
      return workspaceDimensionMode === "selected" && object.instanceId === workspaceSelectedId;
    }

    function isDimensionTargetObject(object) {
      if (!object) return false;
      return ["wall", "calibration"].includes(object.objectType) || getObjectDisplayShape(object) === "line";
    }

    function createWorkspaceDimensionNode(object) {
      syncWorkspaceLineObjectFromMetadata(object);
      const metadata = migrateLegacyWallMetadata(object);
      const start = workspaceMillimetersToPoint({ x: metadata.start_x_mm, y: metadata.start_y_mm });
      const end = workspaceMillimetersToPoint({ x: metadata.end_x_mm, y: metadata.end_y_mm });
      const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const placement = resolveWorkspaceDimensionPlacement(metadata.dimension_position, dx, dy);
      const scale = Math.max(view.scale || 1, WORKSPACE_MIN_SCALE);
      const offset = Math.max(10, 22 / scale);
      const x = middle.x + placement.x * offset;
      const y = middle.y + placement.y * offset;
      const fontSize = 14 / scale;
      const label = metadata.dimension_label || formatWorkspaceDimensionLength(getWallLengthMm(object), metadata.dimension_unit || workspaceDimensionUnit);

      const group = document.createElementNS(svgNs, "g");
      group.classList.add("layout-workspace-dimension");
      group.dataset.instanceId = object.instanceId;
      group.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        editWorkspaceDimensionFromPrompt(object.instanceId);
      });
      const dimLine = document.createElementNS(svgNs, "line");
      dimLine.setAttribute("x1", String(start.x + placement.x * offset));
      dimLine.setAttribute("y1", String(start.y + placement.y * offset));
      dimLine.setAttribute("x2", String(end.x + placement.x * offset));
      dimLine.setAttribute("y2", String(end.y + placement.y * offset));
      dimLine.setAttribute("stroke", "#102B55");
      dimLine.setAttribute("stroke-width", String(Math.max(1 / scale, 0.5)));
      dimLine.setAttribute("stroke-linecap", "round");
      dimLine.setAttribute("opacity", "0.75");
      dimLine.setAttribute("pointer-events", "none");
      group.append(dimLine);

      const labelGroup = document.createElementNS(svgNs, "g");
      labelGroup.setAttribute("transform", `translate(${x} ${y})`);
      const bgWidth = Math.max(52 / scale, (label.length * 7.5 + 16) / scale);
      const bgHeight = 24 / scale;
      const background = document.createElementNS(svgNs, "rect");
      background.setAttribute("x", String(-bgWidth / 2));
      background.setAttribute("y", String(-bgHeight / 2));
      background.setAttribute("width", String(bgWidth));
      background.setAttribute("height", String(bgHeight));
      background.setAttribute("rx", String(6 / scale));
      background.setAttribute("fill", "rgba(255,255,255,0.88)");
      background.setAttribute("stroke", "rgba(16,43,85,0.18)");
      background.setAttribute("stroke-width", String(1 / scale));
      const text = document.createElementNS(svgNs, "text");
      text.textContent = label;
      text.setAttribute("x", "0");
      text.setAttribute("y", "0");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", String(fontSize));
      text.setAttribute("font-weight", "900");
      text.setAttribute("fill", "#102B55");
      text.setAttribute("paint-order", "stroke");
      text.setAttribute("stroke", "#fff");
      text.setAttribute("stroke-width", String(3 / scale));
      labelGroup.append(background, text);
      group.append(labelGroup);
      return group;
    }

    function resolveWorkspaceDimensionPlacement(position, dx, dy) {
      const normalized = position || "auto";
      if (normalized === "above") return { x: 0, y: -1 };
      if (normalized === "below") return { x: 0, y: 1 };
      if (normalized === "left") return { x: -1, y: 0 };
      if (normalized === "right") return { x: 1, y: 0 };
      return Math.abs(dx) >= Math.abs(dy) ? { x: 0, y: -1 } : { x: -1, y: 0 };
    }

    function formatWorkspaceDimensionLength(lengthMm, unit = workspaceDimensionUnit) {
      if (unit === "mm") return `${Math.round(lengthMm)} mm`;
      if (unit === "cm") return `${formatDecimal(lengthMm / 10, 1)} cm`;
      return `${formatDecimal(lengthMm / 1000, 2)} m`;
    }

    function editWorkspaceDimensionFromPrompt(instanceId) {
      const object = findWorkspaceObject(instanceId);
      if (!object || !isDimensionTargetObject(object)) return;
      const metadata = migrateLegacyWallMetadata(object);
      const currentLabel = metadata.dimension_label || formatWorkspaceDimensionLength(getWallLengthMm(object), metadata.dimension_unit || workspaceDimensionUnit);
      const nextValue = window.prompt("移섏닔 臾멸뎄 ?먮뒗 ?ㅼ젣 湲몄씠瑜??낅젰?섏꽭?? ?? 15.00 m", currentLabel);
      if (nextValue === null) return;
      applyWorkspaceDimensionInput(object, nextValue);
    }

    function applyWorkspaceDimensionInput(object, value) {
      const text = String(value || "").trim();
      if (!text) return;
      pushWorkspaceHistory();
      const parsedLength = parseDimensionLengthToMm(text);
      if (parsedLength !== null && parsedLength > 0) {
        updateWallLength(object, parsedLength);
        const metadata = migrateLegacyWallMetadata(object);
        metadata.dimension_label = "";
        metadata.dimension_unit = workspaceDimensionUnit;
        object.metadata = metadata;
      } else {
        const metadata = migrateLegacyWallMetadata(object);
        metadata.dimension_label = text;
        object.metadata = metadata;
      }
      markWorkspaceDirty();
      renderWorkspace();
    }

    function parseDimensionLengthToMm(value) {
      const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/i);
      if (!match) return null;
      return toMillimeters(match[1], (match[2] || workspaceDimensionUnit || "m").toLowerCase());
    }

    function renderWorkspaceObject(object) {
      if (["wall", "calibration"].includes(object.objectType)) syncWorkspaceLineObjectFromMetadata(object);
      const group = document.createElementNS(svgNs, "g");
      const selected = object.instanceId === workspaceSelectedId;
      const width = object.widthM * workspaceMeterScale;
      const height = object.heightM * workspaceMeterScale;
      const x = -width / 2;
      const y = -height / 2;
      group.classList.add("layout-workspace-object");
      if (selected) group.classList.add("selected");
      group.setAttribute("transform", `translate(${object.x} ${object.y}) rotate(${object.rotation || 0})`);
      group.setAttribute("opacity", String(getWorkspaceObjectOpacity(object)));
      group.dataset.instanceId = object.instanceId;
      if (isWorkspaceBaseObject(object)) {
        group.dataset.baseFloorplanObject = "true";
        group.setAttribute("pointer-events", "none");
      } else {
        group.addEventListener("click", (event) => {
          event.stopPropagation();
          selectWorkspaceObject(object.instanceId);
        });
        group.addEventListener("pointerdown", (event) => startWorkspaceDrag(event, object.instanceId));
      }
      if (!isWorkspaceBaseObject(object)) group.append(createWorkspaceObjectHitArea(object, x, y, width, height));
      group.append(createWorkspaceObjectShape(object, x, y, width, height));
      return group;
    }

    function findWorkspaceObjectAtPoint(point) {
      const tolerance = Math.max(8 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE), 4);
      return workspaceObjects
        .slice()
        .sort((a, b) => Number(b.zIndex || 0) - Number(a.zIndex || 0))
        .find((object) => isWorkspacePointInsideObject(point, object, tolerance)) || null;
    }

    function isWorkspacePointInsideObject(point, object, tolerance = 0) {
      if (!point || !object) return false;
      const width = Math.max(1, Number(object.widthM || 0) * workspaceMeterScale);
      const height = Math.max(1, Number(object.heightM || 0) * workspaceMeterScale);
      const local = rotateWorkspacePoint(point, object, -Number(object.rotation || 0));
      const shape = getObjectDisplayShape(object);
      if ((shape === "circle" || shape === "ellipse") && !["door", "wall", "calibration"].includes(object.objectType)) {
        const rx = width / 2 + tolerance;
        const ry = height / 2 + tolerance;
        if (!rx || !ry) return false;
        return ((local.x * local.x) / (rx * rx)) + ((local.y * local.y) / (ry * ry)) <= 1;
      }
      return Math.abs(local.x) <= width / 2 + tolerance && Math.abs(local.y) <= height / 2 + tolerance;
    }

    function rotateWorkspacePoint(point, object, degrees) {
      const angle = Number(degrees || 0) * Math.PI / 180;
      const dx = Number(point.x || 0) - Number(object.x || 0);
      const dy = Number(point.y || 0) - Number(object.y || 0);
      return {
        x: dx * Math.cos(angle) - dy * Math.sin(angle),
        y: dx * Math.sin(angle) + dy * Math.cos(angle),
      };
    }

    function renderWorkspaceSelection() {
      if (!workspaceSelectionLayer || !workspaceSelectedId) return;
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object) return;
      const width = object.widthM * workspaceMeterScale;
      const height = object.heightM * workspaceMeterScale;
      const x = -width / 2;
      const y = -height / 2;
      const screenStroke = Math.max(1.5 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE), 1);
      const group = document.createElementNS(svgNs, "g");
      group.setAttribute("transform", `translate(${object.x} ${object.y}) rotate(${object.rotation || 0})`);
      const box = document.createElementNS(svgNs, "rect");
      box.setAttribute("x", String(x));
      box.setAttribute("y", String(y));
      box.setAttribute("width", String(width));
      box.setAttribute("height", String(height));
      box.setAttribute("rx", "6");
      box.setAttribute("fill", "none");
      box.setAttribute("stroke", "#d4af37");
      box.setAttribute("stroke-width", String(screenStroke));
      box.setAttribute("stroke-dasharray", `${8 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)} ${5 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)}`);
      box.setAttribute("pointer-events", "none");
      group.append(box);
      group.append(createWorkspaceResizeHandle(object, width, height));
      group.append(createWorkspaceRotateHandle(object, height));
      workspaceSelectionLayer.append(group);
    }

    function createWorkspaceResizeHandle(object, width, height) {
      const handleSize = 14 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE);
      const handle = document.createElementNS(svgNs, "rect");
      handle.classList.add("layout-workspace-handle", "resize-handle");
      handle.setAttribute("x", String(width / 2 - handleSize / 2));
      handle.setAttribute("y", String(height / 2 - handleSize / 2));
      handle.setAttribute("width", String(handleSize));
      handle.setAttribute("height", String(handleSize));
      handle.setAttribute("rx", String(3 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)));
      handle.setAttribute("fill", "#d4af37");
      handle.setAttribute("stroke", "#102B55");
      handle.setAttribute("stroke-width", String(2 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)));
      handle.addEventListener("pointerdown", (event) => startWorkspaceResize(event, object.instanceId));
      return handle;
    }

    function createWorkspaceRotateHandle(object, height) {
      const scale = Math.max(view.scale || 1, WORKSPACE_MIN_SCALE);
      const group = document.createElementNS(svgNs, "g");
      group.classList.add("layout-workspace-handle", "rotate-handle");
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", String(-height / 2 - 5 / scale));
      line.setAttribute("x2", "0");
      line.setAttribute("y2", String(-height / 2 - 28 / scale));
      line.setAttribute("stroke", "#102B55");
      line.setAttribute("stroke-width", String(2 / scale));
      const circle = document.createElementNS(svgNs, "circle");
      circle.setAttribute("cx", "0");
      circle.setAttribute("cy", String(-height / 2 - 34 / scale));
      circle.setAttribute("r", String(8 / scale));
      circle.setAttribute("fill", "#fff");
      circle.setAttribute("stroke", "#d4af37");
      circle.setAttribute("stroke-width", String(3 / scale));
      group.append(line, circle);
      group.addEventListener("pointerdown", (event) => startWorkspaceRotate(event, object.instanceId));
      return group;
    }

    function createWorkspaceObjectHitArea(object, x, y, width, height) {
      const tolerance = Math.max(8 / Math.max(view.scale || 1, 0.05), 4);
      const shape = getObjectDisplayShape(object);
      if ((shape === "circle" || shape === "ellipse") && !["door", "wall", "calibration"].includes(object.objectType)) {
        const ellipse = document.createElementNS(svgNs, "ellipse");
        ellipse.setAttribute("cx", "0");
        ellipse.setAttribute("cy", "0");
        ellipse.setAttribute("rx", String(width / 2 + tolerance));
        ellipse.setAttribute("ry", String(height / 2 + tolerance));
        ellipse.setAttribute("fill", "transparent");
        ellipse.setAttribute("pointer-events", "all");
        return ellipse;
      }

      const hitRect = document.createElementNS(svgNs, "rect");
      hitRect.setAttribute("x", String(x - tolerance));
      hitRect.setAttribute("y", String(y - tolerance));
      hitRect.setAttribute("width", String(Math.max(width, tolerance * 2) + tolerance * 2));
      hitRect.setAttribute("height", String(Math.max(height, tolerance * 2) + tolerance * 2));
      hitRect.setAttribute("rx", "6");
      hitRect.setAttribute("fill", "transparent");
      hitRect.setAttribute("pointer-events", "all");
      return hitRect;
    }

    function createWorkspaceObjectShape(object, x, y, width, height, options = {}) {
      const group = document.createElementNS(svgNs, "g");
      const style = objectStyles[object.objectType] || { fill: "rgba(15,42,67,.14)", stroke: "#0f2a43" };
      const shape = getObjectDisplayShape(object);
      const common = (node) => {
        node.setAttribute("fill", style.fill);
        node.setAttribute("stroke", style.stroke);
        node.setAttribute("stroke-width", object.objectType === "stage" ? "4" : "2");
        return node;
      };
      if ((shape === "circle" || shape === "ellipse") && !["door", "wall", "calibration"].includes(object.objectType)) {
        const circle = common(document.createElementNS(svgNs, "ellipse"));
        circle.setAttribute("cx", "0");
        circle.setAttribute("cy", "0");
        circle.setAttribute("rx", String(width / 2));
        circle.setAttribute("ry", String(height / 2));
        group.append(circle);
      } else if (object.objectType === "door") {
        const rect = common(document.createElementNS(svgNs, "rect"));
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y + height - 8));
        rect.setAttribute("width", String(width));
        rect.setAttribute("height", "8");
        rect.setAttribute("rx", "2");
        const arc = document.createElementNS(svgNs, "path");
        arc.setAttribute("d", `M ${x + 8} ${y + height - 8} A ${Math.max(width * 0.7, 20)} ${Math.max(width * 0.7, 20)} 0 0 1 ${x + width - 6} ${y + 10}`);
        arc.setAttribute("fill", "none");
        arc.setAttribute("stroke", style.stroke);
        arc.setAttribute("stroke-width", "2");
        group.append(rect, arc);
      } else if (shape === "line" || object.objectType === "wall") {
        const rect = common(document.createElementNS(svgNs, "rect"));
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y + height / 2 - Math.max(height, 4) / 2));
        rect.setAttribute("width", String(width));
        rect.setAttribute("height", String(Math.max(height, 4)));
        rect.setAttribute("rx", "2");
        group.append(rect);
      } else if (object.objectType === "calibration") {
        const line = document.createElementNS(svgNs, "line");
        line.setAttribute("x1", String(x));
        line.setAttribute("y1", "0");
        line.setAttribute("x2", String(x + width));
        line.setAttribute("y2", "0");
        line.setAttribute("stroke", style.stroke);
        line.setAttribute("stroke-width", "4");
        line.setAttribute("stroke-dasharray", "10 7");
        const start = document.createElementNS(svgNs, "circle");
        start.setAttribute("cx", String(x));
        start.setAttribute("cy", "0");
        start.setAttribute("r", "6");
        start.setAttribute("fill", "#fff");
        start.setAttribute("stroke", style.stroke);
        start.setAttribute("stroke-width", "3");
        const end = start.cloneNode(false);
        end.setAttribute("cx", String(x + width));
        group.append(line, start, end);
      } else {
        const rect = common(document.createElementNS(svgNs, "rect"));
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(width));
        rect.setAttribute("height", String(height));
        rect.setAttribute("rx", shape === "area" || object.objectType === "blocked_area" || object.objectType === "allowed_area" ? "10" : "5");
        if (shape === "area" || object.objectType === "allowed_area" || object.objectType === "blocked_area") {
          rect.setAttribute("stroke-dasharray", "8 6");
        }
        group.append(rect);
        if (object.objectType === "blocked_area") {
          const slash = document.createElementNS(svgNs, "path");
          slash.setAttribute("d", `M ${x + 8} ${y + height - 8} L ${x + width - 8} ${y + 8}`);
          slash.setAttribute("stroke", style.stroke);
          slash.setAttribute("stroke-width", "3");
          slash.setAttribute("opacity", ".45");
          group.append(slash);
        }
      }
      const label = ["buffet_table", "av_table", "podium"].includes(object.objectType)
        ? ({ buffet_table: "BUFFET", av_table: "AV", podium: "P" }[object.objectType])
        : object.label;
      const showNames = options.showNames ?? workspaceShowNames;
      if (showNames) {
        const text = document.createElementNS(svgNs, "text");
        text.textContent = label || "";
        text.setAttribute("x", "0");
        text.setAttribute("y", "5");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "14");
        text.setAttribute("font-weight", "800");
        text.setAttribute("fill", "#102B55");
        text.setAttribute("pointer-events", "none");
        group.append(text);
      }
      if (object.objectType === "seminar_table") {
        [-width / 4, width / 4].forEach((cx) => {
          const seat = document.createElementNS(svgNs, "circle");
          seat.setAttribute("cx", String(cx));
          seat.setAttribute("cy", String(height / 2 + 7));
          seat.setAttribute("r", "4");
          seat.setAttribute("fill", "#94a3b8");
          group.append(seat);
        });
      }
      return group;
    }

    function getObjectDisplayShape(object) {
      const explicitShape = object?.displayShape || object?.display_shape || object?.metadata?.display_shape || "";
      if (explicitShape) return explicitShape;
      const type = object?.objectType || object?.object_type || "";
      if (type === "round_table" || type === "pillar") return "circle";
      if (type === "allowed_area" || type === "blocked_area") return "area";
      if (type === "wall" || type === "calibration") return "line";
      return "rect";
    }

    function startWorkspaceDrag(event, instanceId) {
      event.preventDefault();
      event.stopPropagation();
      const pointerHit = getWorkspacePointerHit(event);
      if (event.button === 1 || workspaceSpacePressed) {
        workspaceDragState = {
          mode: "pan",
          clientX: event.clientX,
          clientY: event.clientY,
          viewX: view.panX,
          viewY: view.panY,
        };
        workspaceSvg?.classList.add("is-panning");
        captureWorkspacePointer(event);
        logWorkspacePointerDown(event, pointerHit, "pan");
        return;
      }
      if (event.button !== 0) return;
      const object = findWorkspaceObject(instanceId);
      if (!object || !canWorkspaceEditObject(object)) return;
      logWorkspacePointerDown(event, { ...pointerHit, type: pointerHit?.type || "object", object }, "move");
      beginWorkspaceObjectMove(event, object);
    }

    function beginWorkspaceObjectMove(event, object) {
      if (!object || !canWorkspaceEditObject(object)) return;
      event.preventDefault();
      event.stopPropagation();
      workspaceSuppressCanvasClick = true;
      workspaceSelectedId = object.instanceId;
      renderWorkspaceProperties();
      updateWorkspaceStatusbar();
      pushWorkspaceHistory();
      const point = getWorkspaceSvgPoint(event);
      workspaceDragState = {
        mode: "move",
        instanceId: object.instanceId,
        startObjectX: object.x,
        startObjectY: object.y,
        startPointerX: point.x,
        startPointerY: point.y,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startCenter: { x: object.x, y: object.y },
        startMetadata: JSON.parse(JSON.stringify(object.metadata || {})),
        moved: false,
      };
      captureWorkspacePointer(event);
    }

    function startWorkspaceResize(event, instanceId) {
      event.preventDefault();
      event.stopPropagation();
      const object = findWorkspaceObject(instanceId);
      if (!object || object.locked || !canWorkspaceEditObject(object)) return;
      logWorkspacePointerDown(event, { type: "resize-handle", object, target: event.target }, "resize");
      workspaceSelectedId = instanceId;
      renderWorkspaceProperties();
      updateWorkspaceStatusbar();
      pushWorkspaceHistory();
      const point = getWorkspaceSvgPoint(event);
      workspaceDragState = {
        mode: "resize",
        instanceId,
        startX: point.x,
        startY: point.y,
        startWidthM: object.widthM,
        startHeightM: object.heightM,
      };
      captureWorkspacePointer(event);
    }

    function startWorkspaceRotate(event, instanceId) {
      event.preventDefault();
      event.stopPropagation();
      const object = findWorkspaceObject(instanceId);
      if (!object || object.locked || !canWorkspaceEditObject(object)) return;
      logWorkspacePointerDown(event, { type: "rotation-handle", object, target: event.target }, "rotate");
      workspaceSelectedId = instanceId;
      renderWorkspaceProperties();
      updateWorkspaceStatusbar();
      pushWorkspaceHistory();
      workspaceDragState = {
        mode: "rotate",
        instanceId,
      };
      captureWorkspacePointer(event);
    }

    function captureWorkspacePointer(event) {
      try {
        if (event?.pointerId !== undefined) event?.currentTarget?.setPointerCapture?.(event.pointerId);
        if (event?.pointerId !== undefined) workspaceSvg?.setPointerCapture?.(event.pointerId);
      } catch (error) {
        console.warn("workspace pointer capture failed", error);
      }
    }

    function releaseWorkspacePointer(event) {
      try {
        if (event?.pointerId !== undefined) workspaceSvg?.releasePointerCapture?.(event.pointerId);
      } catch (error) {
        console.warn("workspace pointer release failed", error);
      }
    }

    function handleWorkspacePointerMove(event) {
      updateWorkspaceCursorStatus(event);
      if (!workspaceDragState && workspaceDraftShape && (workspaceDraftShape.type === "wall" || workspaceDraftShape.type === "calibrate")) {
        workspaceDraftShape.end = constrainWorkspacePoint(workspaceDraftShape.start, getWorkspaceSnappedPoint(event), event.shiftKey);
        renderWorkspace();
        return;
      }
      if (!workspaceDragState) return;
      if (workspaceDraftShape && workspaceDragState.mode === "draw-rect") {
        workspaceDraftShape.end = getWorkspaceSnappedPoint(event);
        renderWorkspace();
        return;
      }
      if (workspaceDragState.mode === "pan") {
        view.panX = workspaceDragState.viewX + (event.clientX - workspaceDragState.clientX) * WORKSPACE_PAN_SPEED;
        view.panY = workspaceDragState.viewY + (event.clientY - workspaceDragState.clientY) * WORKSPACE_PAN_SPEED;
        logWorkspacePointerMove(event, { dxWorld: 0, dyWorld: 0 });
        renderWorkspace();
        return;
      }
      const object = findWorkspaceObject(workspaceDragState.instanceId);
      if (!object || object.locked || !canWorkspaceEditObject(object)) return;
      const point = getWorkspaceSvgPoint(event);
      if (workspaceDragState.mode === "resize") {
        const nextWidth = workspaceDragState.startWidthM + ((point.x - workspaceDragState.startX) / workspaceMeterScale);
        const nextHeight = workspaceDragState.startHeightM + ((point.y - workspaceDragState.startY) / workspaceMeterScale);
        if (["wall", "calibration"].includes(object.objectType)) {
          const nextLengthMm = Math.max(1, drawingDistanceToMillimeters(Math.max(0.01, nextWidth) * workspaceMeterScale));
          updateWallLength(object, nextLengthMm);
          const nextThicknessMm = Math.max(1, Math.round(Math.max(0.01, nextHeight) * 1000));
          object.metadata = { ...(object.metadata || {}), thickness_mm: nextThicknessMm };
          object.heightM = nextThicknessMm / 1000;
        } else {
          object.widthM = Math.max(0.1, roundNumber(nextWidth));
          object.heightM = Math.max(0.1, roundNumber(nextHeight));
        }
      } else if (workspaceDragState.mode === "rotate") {
        const angle = Math.atan2(point.y - object.y, point.x - object.x) * 180 / Math.PI + 90;
        if (["wall", "calibration"].includes(object.objectType)) {
          updateWallAngle(object, angle);
        } else {
          object.rotation = normalizeDegrees(Math.round(angle));
        }
      } else {
        const dxPx = event.clientX - Number(workspaceDragState.startClientX || event.clientX);
        const dyPx = event.clientY - Number(workspaceDragState.startClientY || event.clientY);
        const deltaX = dxPx / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE);
        const deltaY = dyPx / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE);
        const nextCenter = applyWorkspaceSnapPoint({
          x: clampNumber(workspaceDragState.startObjectX + deltaX, 0, workspaceSize.width),
          y: clampNumber(workspaceDragState.startObjectY + deltaY, 0, workspaceSize.height),
        });
        logWorkspacePointerMove(event, { dxWorld: deltaX, dyWorld: deltaY, nextCenter });
        if (["wall", "calibration"].includes(object.objectType)) {
          const startMetadata = migrateLegacyWallMetadata({ ...object, metadata: workspaceDragState.startMetadata });
          const startCenterMm = workspacePointToMillimeters(workspaceDragState.startCenter);
          const nextCenterMm = workspacePointToMillimeters(nextCenter);
          const deltaX = nextCenterMm.x - startCenterMm.x;
          const deltaY = nextCenterMm.y - startCenterMm.y;
          object.metadata = {
            ...startMetadata,
            start_x_mm: Math.round(Number(startMetadata.start_x_mm || 0) + deltaX),
            start_y_mm: Math.round(Number(startMetadata.start_y_mm || 0) + deltaY),
            end_x_mm: Math.round(Number(startMetadata.end_x_mm || 0) + deltaX),
            end_y_mm: Math.round(Number(startMetadata.end_y_mm || 0) + deltaY),
          };
          syncWorkspaceLineObjectFromMetadata(object);
        } else {
          object.x = nextCenter.x;
          object.y = nextCenter.y;
        }
        workspaceDragState.moved = true;
      }
      markWorkspaceDirty();
      renderWorkspace();
    }

    function logWorkspacePointerMove(event, extra = {}) {
      if (!workspaceDragState) return;
      const now = Date.now();
      if (now - workspaceLastMoveLogAt < 120) return;
      workspaceLastMoveLogAt = now;
      const dxPx = event.clientX - Number(workspaceDragState.startClientX ?? workspaceDragState.clientX ?? event.clientX);
      const dyPx = event.clientY - Number(workspaceDragState.startClientY ?? workspaceDragState.clientY ?? event.clientY);
      console.log("pointermove", {
        dragMode: workspaceDragState.mode,
        dxPx,
        dyPx,
        scale: view.scale,
        dxWorld: extra.dxWorld ?? (dxPx / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)),
        dyWorld: extra.dyWorld ?? (dyPx / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)),
        selectedObjectId: workspaceSelectedId,
        objectId: workspaceDragState.instanceId || null,
        nextCenter: extra.nextCenter || null,
      });
    }

    function endWorkspaceDrag(event) {
      if (workspaceDragState) {
        console.log("pointerup", {
          dragMode: workspaceDragState.mode,
          selectedObjectId: workspaceSelectedId,
          objectId: workspaceDragState.instanceId || null,
          moved: Boolean(workspaceDragState.moved),
        });
      }
      if (workspaceDragState?.mode === "draw-rect" && workspaceDraftShape?.type === "rect") {
        finishWorkspaceRectDraft();
      }
      workspaceDragState = null;
      workspaceSvg?.classList.remove("is-panning");
      releaseWorkspacePointer(event);
    }

    function handleWorkspaceWheel(event) {
      event.preventDefault();
      zoomWorkspaceAtPoint(event, event.deltaY < 0 ? 1.1 : 1 / 1.1);
    }

    function finishWorkspaceLineDraft(type) {
      if (!workspaceDraftShape?.start || !workspaceDraftShape?.end) return;
      const start = workspaceDraftShape.start;
      const end = workspaceDraftShape.end;
      const length = distanceBetweenPoints(start, end);
      if (length < 6) {
        workspaceDraftShape = null;
        renderWorkspace();
        return;
      }
      pushWorkspaceHistory();
      const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
      const lengthM = drawingUnitsToMeters(length);
      let calibrationLengthMm = drawingDistanceToMillimeters(length);
      const startMm = workspacePointToMillimeters(start);
      const endMm = workspacePointToMillimeters(end);
      if (type === "calibrate") {
        const currentMeters = Math.max(0.01, Math.round((calibrationLengthMm / 1000) * 100) / 100);
        const enteredMeters = window.prompt("선택한 기준선의 실제 길이를 m 단위로 입력하세요.", String(currentMeters));
        const numericMeters = Number(enteredMeters);
        if (!Number.isFinite(numericMeters) || numericMeters <= 0) {
          workspaceDraftShape = null;
          renderWorkspace();
          return;
        }
        calibrationLengthMm = Math.round(numericMeters * 1000);
      }
      const object = {
        instanceId: crypto.randomUUID ? crypto.randomUUID() : `object_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        masterObjectId: "",
        objectType: type === "calibrate" ? "calibration" : "wall",
        label: type === "calibrate" ? "축척 보정" : "벽",
        x: clampNumber(center.x, 0, workspaceSize.width),
        y: clampNumber(center.y, 0, workspaceSize.height),
        widthM: Math.max(0.05, lengthM),
        heightM: type === "calibrate" ? 0.05 : 0.15,
        rotation: normalizeDegrees(angle),
        seatCount: 0,
        zIndex: getWorkspaceMaxZIndex() + 1,
        locked: type === "calibrate",
        opacity: 1,
        metadata: {
          layer_type: "building",
          start_x: start.x,
          start_y: start.y,
          end_x: end.x,
          end_y: end.y,
          start_x_mm: startMm.x,
          start_y_mm: startMm.y,
          end_x_mm: endMm.x,
          end_y_mm: endMm.y,
          length_mm: calibrationLengthMm,
          thickness_mm: type === "calibrate" ? 50 : 150,
          dimension_visibility: "inherit",
          dimension_position: "auto",
          dimension_label: "",
          dimension_unit: workspaceDimensionUnit,
        },
      };
      syncWorkspaceLineObjectFromMetadata(object);
      workspaceObjects.push(object);
      if (type === "calibrate") {
        applyWorkspaceCalibrationFromObject(object);
      }
      workspaceDraftShape = null;
      selectWorkspaceObject(object.instanceId);
      markWorkspaceDirty();
      renderWorkspace();
    }

    function finishWorkspaceRectDraft() {
      if (!workspaceDraftShape?.start || !workspaceDraftShape?.end) return;
      const box = getDraftBox(workspaceDraftShape.start, workspaceDraftShape.end);
      if (box.width < 8 || box.height < 8) {
        workspaceDraftShape = null;
        renderWorkspace();
        return;
      }
      pushWorkspaceHistory();
      const object = {
        instanceId: crypto.randomUUID ? crypto.randomUUID() : `object_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        masterObjectId: "",
        objectType: "structure_area",
        label: "援ъ“ ?곸뿭",
        x: clampNumber(box.x + box.width / 2, 0, workspaceSize.width),
        y: clampNumber(box.y + box.height / 2, 0, workspaceSize.height),
        widthM: Math.max(0.1, drawingUnitsToMeters(box.width)),
        heightM: Math.max(0.1, drawingUnitsToMeters(box.height)),
        rotation: 0,
        seatCount: 0,
        zIndex: getWorkspaceMaxZIndex() + 1,
        locked: false,
        opacity: 0.22,
        metadata: {
          layer_type: "building",
          start_x: box.x,
          start_y: box.y,
          end_x: box.x + box.width,
          end_y: box.y + box.height,
          width_mm: drawingDistanceToMillimeters(box.width),
          height_mm: drawingDistanceToMillimeters(box.height),
        },
      };
      workspaceObjects.push(object);
      workspaceDraftShape = null;
      selectWorkspaceObject(object.instanceId);
      markWorkspaceDirty();
      renderWorkspace();
    }

    function selectWorkspaceObject(instanceId) {
      workspaceSelectedId = instanceId || "";
      renderWorkspace();
    }

    function canWorkspaceEditObject(object) {
      if (!object) return false;
      return !object.locked && !isWorkspaceBaseObject(object);
    }

    function renderWorkspaceProperties() {
      const object = findWorkspaceObject(workspaceSelectedId);
      const wallInputs = [
        workspaceWallStartXInput,
        workspaceWallStartYInput,
        workspaceWallEndXInput,
        workspaceWallEndYInput,
        workspaceLengthInput,
        workspaceLengthUnitSelect,
        workspaceWallAngleInput,
        workspaceThicknessInput,
        workspaceThicknessUnitSelect,
        workspaceDimensionVisibilitySelect,
        workspaceDimensionPositionSelect,
        workspaceDimensionLabelInput,
      ];
      const inputs = [workspaceLabelInput, workspaceXInput, workspaceYInput, workspaceWidthInput, workspaceHeightInput, workspaceRotationInput, workspaceSeatCountInput, workspaceZIndexInput, workspaceOpacityInput, ...wallInputs];
      const buttons = [workspaceBringFrontButton, workspaceForwardButton, workspaceBackwardButton, workspaceSendBackButton, workspaceRotate90Button, workspaceDuplicateButton, workspaceDeleteButton];
      inputs.concat(buttons).forEach((el) => {
        if (el) el.disabled = !object;
      });
      if (!object) {
        if (workspaceLabelInput) workspaceLabelInput.value = "";
        if (workspaceXInput) workspaceXInput.value = "";
        if (workspaceYInput) workspaceYInput.value = "";
        if (workspaceWidthInput) workspaceWidthInput.value = "";
        if (workspaceHeightInput) workspaceHeightInput.value = "";
        if (workspaceRotationInput) workspaceRotationInput.value = "";
        if (workspaceSeatCountInput) workspaceSeatCountInput.value = "";
        if (workspaceZIndexInput) workspaceZIndexInput.value = "";
        if (workspaceOpacityInput) workspaceOpacityInput.value = "";
        if (workspaceWallStartXInput) workspaceWallStartXInput.value = "";
        if (workspaceWallStartYInput) workspaceWallStartYInput.value = "";
        if (workspaceWallEndXInput) workspaceWallEndXInput.value = "";
        if (workspaceWallEndYInput) workspaceWallEndYInput.value = "";
        if (workspaceLengthInput) workspaceLengthInput.value = "";
        if (workspaceWallAngleInput) workspaceWallAngleInput.value = "";
        if (workspaceThicknessInput) workspaceThicknessInput.value = "";
        if (workspaceDimensionVisibilitySelect) workspaceDimensionVisibilitySelect.value = "inherit";
        if (workspaceDimensionPositionSelect) workspaceDimensionPositionSelect.value = "auto";
        if (workspaceDimensionLabelInput) workspaceDimensionLabelInput.value = "";
        return;
      }
      if (isWorkspaceBaseObject(object)) {
        inputs.concat(buttons).forEach((el) => { if (el) el.disabled = true; });
      }
      const isWallLike = ["wall", "calibration"].includes(object.objectType);
      [workspaceXInput, workspaceYInput, workspaceWidthInput, workspaceHeightInput, workspaceRotationInput].forEach((input) => {
        if (input && isWallLike) input.disabled = true;
      });
      workspaceLabelInput.value = object.label || "";
      workspaceXInput.value = roundNumber(object.x);
      workspaceYInput.value = roundNumber(object.y);
      workspaceWidthInput.value = roundNumber(object.widthM);
      workspaceHeightInput.value = roundNumber(object.heightM);
      workspaceRotationInput.value = Math.round(object.rotation || 0);
      workspaceSeatCountInput.value = object.seatCount || 0;
      workspaceZIndexInput.value = object.zIndex || 0;
      if (workspaceOpacityInput) workspaceOpacityInput.value = Math.round(getWorkspaceObjectOpacity(object) * 100);
      wallInputs.forEach((input) => {
        if (input) input.disabled = !isWallLike;
      });
      if (isWallLike) {
        const metadata = migrateLegacyWallMetadata(object);
        const lengthUnit = workspaceLengthUnitSelect?.value || "m";
        const thicknessUnit = workspaceThicknessUnitSelect?.value || "mm";
        if (workspaceWallStartXInput) workspaceWallStartXInput.value = Math.round(metadata.start_x_mm || 0);
        if (workspaceWallStartYInput) workspaceWallStartYInput.value = Math.round(metadata.start_y_mm || 0);
        if (workspaceWallEndXInput) workspaceWallEndXInput.value = Math.round(metadata.end_x_mm || 0);
        if (workspaceWallEndYInput) workspaceWallEndYInput.value = Math.round(metadata.end_y_mm || 0);
        if (workspaceLengthInput) workspaceLengthInput.value = formatDecimal(fromMillimeters(getWallLengthMm(object), lengthUnit), 3);
        if (workspaceWallAngleInput) workspaceWallAngleInput.value = formatDecimal(getWallAngleDegrees(object), 3);
        if (workspaceThicknessInput) workspaceThicknessInput.value = formatDecimal(fromMillimeters(metadata.thickness_mm || Math.round(object.heightM * 1000), thicknessUnit), 3);
        if (workspaceDimensionVisibilitySelect) workspaceDimensionVisibilitySelect.value = metadata.dimension_visibility || "inherit";
        if (workspaceDimensionPositionSelect) workspaceDimensionPositionSelect.value = metadata.dimension_position || "auto";
        if (workspaceDimensionLabelInput) workspaceDimensionLabelInput.value = metadata.dimension_label || "";
      } else {
        if (workspaceWallStartXInput) workspaceWallStartXInput.value = "";
        if (workspaceWallStartYInput) workspaceWallStartYInput.value = "";
        if (workspaceWallEndXInput) workspaceWallEndXInput.value = "";
        if (workspaceWallEndYInput) workspaceWallEndYInput.value = "";
        if (workspaceLengthInput) workspaceLengthInput.value = "";
        if (workspaceWallAngleInput) workspaceWallAngleInput.value = "";
        if (workspaceThicknessInput) workspaceThicknessInput.value = "";
        if (workspaceDimensionVisibilitySelect) workspaceDimensionVisibilitySelect.value = "inherit";
        if (workspaceDimensionPositionSelect) workspaceDimensionPositionSelect.value = "auto";
        if (workspaceDimensionLabelInput) workspaceDimensionLabelInput.value = "";
      }
    }

    function updateSelectedWorkspaceObjectFromInputs() {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object) return;
      pushWorkspaceHistory();
      object.label = workspaceLabelInput.value.trim() || object.label;
      object.x = clampNumber(toWorkspaceNumber(workspaceXInput.value, object.x), 0, workspaceSize.width);
      object.y = clampNumber(toWorkspaceNumber(workspaceYInput.value, object.y), 0, workspaceSize.height);
      object.widthM = Math.max(0.1, toWorkspaceNumber(workspaceWidthInput.value, object.widthM));
      object.heightM = Math.max(0.1, toWorkspaceNumber(workspaceHeightInput.value, object.heightM));
      object.rotation = normalizeDegrees(toWorkspaceNumber(workspaceRotationInput.value, object.rotation || 0));
      object.seatCount = Math.max(0, Math.round(toWorkspaceNumber(workspaceSeatCountInput.value, object.seatCount || 0)));
      object.zIndex = Math.round(toWorkspaceNumber(workspaceZIndexInput.value, object.zIndex || 0));
      if (workspaceOpacityInput) {
        object.opacity = clampNumber(toWorkspaceNumber(workspaceOpacityInput.value, getWorkspaceObjectOpacity(object) * 100) / 100, 0, 1);
        object.metadata = { ...(object.metadata || {}), opacity: object.opacity };
      }
      markWorkspaceDirty();
      renderWorkspace();
    }

    function updateSelectedWorkspaceWallFromInputs(sourceInput = null) {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object || !["wall", "calibration"].includes(object.objectType)) return;
      const previous = JSON.stringify(object.metadata || {});
      pushWorkspaceHistory();
      const metadata = migrateLegacyWallMetadata(object);
      const startX = parseDecimalInput(workspaceWallStartXInput?.value);
      const startY = parseDecimalInput(workspaceWallStartYInput?.value);
      const endX = parseDecimalInput(workspaceWallEndXInput?.value);
      const endY = parseDecimalInput(workspaceWallEndYInput?.value);
      if (Number.isFinite(startX)) metadata.start_x_mm = Math.round(startX);
      if (Number.isFinite(startY)) metadata.start_y_mm = Math.round(startY);
      if (Number.isFinite(endX)) metadata.end_x_mm = Math.round(endX);
      if (Number.isFinite(endY)) metadata.end_y_mm = Math.round(endY);
      object.metadata = metadata;

      const isLengthSource = sourceInput === workspaceLengthInput;
      const isAngleSource = sourceInput === workspaceWallAngleInput;
      const isThicknessSource = sourceInput === workspaceThicknessInput;

      const lengthMm = isLengthSource ? toMillimeters(workspaceLengthInput?.value, workspaceLengthUnitSelect?.value || "m") : null;
      if (lengthMm !== null && lengthMm > 0) {
        updateWallLength(object, lengthMm);
      }

      const angle = isAngleSource ? parseDecimalInput(workspaceWallAngleInput?.value) : NaN;
      if (Number.isFinite(angle)) {
        updateWallAngle(object, angle);
      }

      const thicknessMm = isThicknessSource ? toMillimeters(workspaceThicknessInput?.value, workspaceThicknessUnitSelect?.value || "mm") : null;
      if (thicknessMm !== null && thicknessMm > 0) {
        object.metadata = { ...(object.metadata || {}), thickness_mm: Math.round(thicknessMm) };
        object.heightM = Math.max(0.01, Math.round(thicknessMm) / 1000);
      }

      syncWorkspaceLineObjectFromMetadata(object);
      if (object.objectType === "calibration") applyWorkspaceCalibrationFromObject(object);
      if (previous !== JSON.stringify(object.metadata || {})) {
        markWorkspaceDirty();
        renderWorkspace();
      } else {
        workspaceUndoStack.pop();
        updateWorkspaceHistoryButtons();
      }
    }

    function convertSelectedWorkspaceLengthUnit() {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object || !workspaceLengthInput || !["wall", "calibration"].includes(object.objectType)) return;
      workspaceLengthInput.value = formatDecimal(fromMillimeters(getWallLengthMm(object), workspaceLengthUnitSelect?.value || "m"), 3);
    }

    function convertSelectedWorkspaceThicknessUnit() {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object || !workspaceThicknessInput || !["wall", "calibration"].includes(object.objectType)) return;
      const metadata = migrateLegacyWallMetadata(object);
      workspaceThicknessInput.value = formatDecimal(fromMillimeters(metadata.thickness_mm || 150, workspaceThicknessUnitSelect?.value || "mm"), 3);
    }

    function updateSelectedWorkspaceDimensionSettings() {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object || !isDimensionTargetObject(object)) return;
      pushWorkspaceHistory();
      const metadata = migrateLegacyWallMetadata(object);
      metadata.dimension_visibility = workspaceDimensionVisibilitySelect?.value || "inherit";
      metadata.dimension_position = workspaceDimensionPositionSelect?.value || "auto";
      const labelValue = workspaceDimensionLabelInput?.value?.trim() || "";
      const parsedLength = parseDimensionLengthToMm(labelValue);
      if (parsedLength !== null && parsedLength > 0) {
        updateWallLength(object, parsedLength);
        Object.assign(metadata, migrateLegacyWallMetadata(object));
        metadata.dimension_label = "";
      } else {
        metadata.dimension_label = labelValue;
      }
      metadata.dimension_unit = workspaceDimensionUnit;
      object.metadata = metadata;
      markWorkspaceDirty();
      renderWorkspace();
    }

    function moveWorkspaceLayer(mode) {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object) return;
      pushWorkspaceHistory();
      if (mode === "front") object.zIndex = getWorkspaceMaxZIndex() + 1;
      if (mode === "forward") object.zIndex += 1;
      if (mode === "backward") object.zIndex -= 1;
      if (mode === "back") object.zIndex = getWorkspaceMinZIndex() - 1;
      markWorkspaceDirty();
      renderWorkspace();
    }

    function duplicateWorkspaceObject() {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object || isWorkspaceBaseObject(object)) return;
      pushWorkspaceHistory();
      const copy = {
        ...object,
        instanceId: crypto.randomUUID ? crypto.randomUUID() : `object_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        x: clampNumber(object.x + 200, 0, workspaceSize.width),
        y: clampNumber(object.y + 200, 0, workspaceSize.height),
        zIndex: getWorkspaceMaxZIndex() + 1,
      };
      workspaceObjects.push(copy);
      workspaceSelectedId = copy.instanceId;
      markWorkspaceDirty();
      renderWorkspace();
    }

    function rotateWorkspaceObject90() {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object || isWorkspaceBaseObject(object)) return;
      pushWorkspaceHistory();
      object.rotation = normalizeDegrees(Number(object.rotation || 0) + 90);
      markWorkspaceDirty();
      renderWorkspace();
    }

    function deleteSelectedWorkspaceObject() {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object || isWorkspaceBaseObject(object)) return;
      pushWorkspaceHistory();
      workspaceObjects = workspaceObjects.filter((object) => object.instanceId !== workspaceSelectedId);
      workspaceSelectedId = "";
      markWorkspaceDirty();
      renderWorkspace();
    }

    function resetWorkspaceLayout() {
      workspaceObjects = [];
      workspaceSelectedId = "";
      workspaceActiveLayout = null;
      workspaceDirty = false;
      updateWorkspaceStatus("??λ릺吏 ?딆쓬");
      resetWorkspaceHistory();
      renderWorkspace();
    }

    function openWorkspaceNewLayoutModal() {
      if (!workspaceNewModal) {
        createWorkspaceNewLayout("???덉씠?꾩썐", Boolean(workspaceSourceRow), workspaceSourceRow?.id || "");
        return;
      }
      if (workspaceNewNameInput) workspaceNewNameInput.value = workspaceActiveLayout?.layout_name || "???덉씠?꾩썐";
      renderWorkspaceNewFloorplanOptions();
      workspaceNewModal.hidden = false;
      workspaceNewModal.classList.add("visible");
      workspaceNewNameInput?.focus();
    }

    function closeWorkspaceNewLayoutModal() {
      if (!workspaceNewModal) return;
      workspaceNewModal.classList.remove("visible");
      workspaceNewModal.hidden = true;
    }

    function renderWorkspaceNewFloorplanOptions() {
      if (!workspaceNewFloorplanSelect) return;
      workspaceNewFloorplanSelect.innerHTML = "";
      if (!workspaceFloorplans.length) {
        workspaceNewFloorplanSelect.append(new Option("?좏깮 媛?ν븳 湲곕낯 ?꾨㈃ ?놁쓬", ""));
        return;
      }
      workspaceFloorplans.forEach((row) => {
        const file = Array.isArray(row.files) ? row.files[0] : row.files;
        const label = [row.layout_type || "湲곕낯 ?꾨㈃", file?.original_filename].filter(Boolean).join(" / ");
        workspaceNewFloorplanSelect.append(new Option(label, row.id));
      });
      workspaceNewFloorplanSelect.value = workspaceSourceRow?.id || workspaceFloorplans[0]?.id || "";
    }

    async function createWorkspaceLayoutFromModal() {
      const mode = workspaceNewModal?.querySelector('input[name="layoutWorkspaceNewMode"]:checked')?.value || "floorplan";
      const layoutName = workspaceNewNameInput?.value?.trim() || "???덉씠?꾩썐";
      const floorplanId = workspaceNewFloorplanSelect?.value || workspaceSourceRow?.id || "";
      await createWorkspaceNewLayout(layoutName, mode === "floorplan", floorplanId);
      closeWorkspaceNewLayoutModal();
    }

    async function createWorkspaceNewLayout(layoutName, useCurrentFloorplan, floorplanId) {
      if (floorplanId && String(workspaceFloorplanSelect?.value || "") !== String(floorplanId)) {
        workspaceFloorplanSelect.value = floorplanId;
        await handleWorkspaceFloorplanChange();
      }
      pushWorkspaceHistory();
      workspaceObjects = useCurrentFloorplan
        ? workspaceObjects.filter(isWorkspaceBaseObject)
        : [];
      workspaceShowFloorplan = useCurrentFloorplan;
      workspaceGrid = !useCurrentFloorplan;
      if (workspaceViewFloorplanInput) workspaceViewFloorplanInput.checked = workspaceShowFloorplan;
      if (workspaceViewGridInput) workspaceViewGridInput.checked = workspaceGrid;
      workspaceSelectedId = "";
      workspaceActiveLayout = layoutName ? { layout_name: layoutName.trim() || "???덉씠?꾩썐" } : null;
      if (workspaceNameInput) workspaceNameInput.value = workspaceActiveLayout?.layout_name || "";
      if (workspaceSavedLayoutSelect) workspaceSavedLayoutSelect.value = "";
      workspaceDirty = false;
      updateWorkspaceStatus("??λ릺吏 ?딆쓬");
      renderWorkspace();
    }

    function setWorkspaceScale(nextScale) {
      view.scale = clampNumber(nextScale, WORKSPACE_MIN_SCALE, WORKSPACE_MAX_SCALE);
      renderWorkspace();
    }

    function zoomWorkspaceAtCenter(factor) {
      updateWorkspaceSvgViewBox();
      if (!workspaceSvg) {
        setWorkspaceScale(view.scale * factor);
        return;
      }
      zoomWorkspaceAtSvgPoint({ x: workspaceViewportSize.width / 2, y: workspaceViewportSize.height / 2 }, factor);
    }

    function zoomWorkspaceAtPoint(event, factor) {
      updateWorkspaceSvgViewBox();
      const anchor = getWorkspaceRawSvgPoint(event);
      zoomWorkspaceAtSvgPoint(anchor, factor);
    }

    function zoomWorkspaceAtSvgPoint(anchor, factor) {
      const oldScale = view.scale;
      const nextScale = clampNumber(oldScale * factor, WORKSPACE_MIN_SCALE, WORKSPACE_MAX_SCALE);
      const worldX = (anchor.x - view.panX) / oldScale;
      const worldY = (anchor.y - view.panY) / oldScale;
      view.scale = nextScale;
      view.panX = anchor.x - worldX * nextScale;
      view.panY = anchor.y - worldY * nextScale;
      renderWorkspace();
    }

    function fitWorkspaceToScreen() {
      updateWorkspaceSvgViewBox();
      const canvasWidth = workspaceViewportSize.width;
      const canvasHeight = workspaceViewportSize.height;
      if (!canvasWidth || !canvasHeight) {
        setWorkspaceActualSize();
        return;
      }
      const scaleX = canvasWidth / workspaceSize.width;
      const scaleY = canvasHeight / workspaceSize.height;
      view.scale = clampNumber(Math.min(scaleX, scaleY) * 0.92, WORKSPACE_MIN_SCALE, WORKSPACE_MAX_SCALE);
      view.panX = (canvasWidth - workspaceSize.width * view.scale) / 2;
      view.panY = (canvasHeight - workspaceSize.height * view.scale) / 2;
      renderWorkspace();
    }

    function setWorkspaceActualSize() {
      view.scale = 1;
      centerWorkspaceView();
    }

    function centerWorkspaceView() {
      updateWorkspaceSvgViewBox();
      view.panX = (workspaceViewportSize.width - workspaceSize.width * view.scale) / 2;
      view.panY = (workspaceViewportSize.height - workspaceSize.height * view.scale) / 2;
      renderWorkspace();
    }

    function markWorkspaceDirty() {
      workspaceDirty = true;
      updateWorkspaceStatus("\uBCC0\uACBD\uC0AC\uD56D \uC788\uC74C");
    }

    function updateWorkspaceStatus(label) {
      workspaceSaveStatus = label;
      if (workspaceStatusPill) workspaceStatusPill.textContent = `\uC0C1\uD0DC: ${label}`;
      const saveStatus = workspaceStatusbar?.querySelector('[data-layout-status="save"]');
      if (saveStatus) saveStatus.textContent = `\uC0C1\uD0DC: ${label}`;
    }

    function updateWorkspaceStatusbar() {
      const selected = workspaceStatusbar?.querySelector('[data-layout-status="selected"]');
      const zoom = workspaceStatusbar?.querySelector('[data-layout-status="zoom"]');
      const grid = workspaceStatusbar?.querySelector('[data-layout-status="grid"]');
      const snap = workspaceStatusbar?.querySelector('[data-layout-status="snap"]');
      const count = workspaceStatusbar?.querySelector('[data-layout-status="count"]');
      const object = findWorkspaceObject(workspaceSelectedId);
      if (selected) selected.textContent = `\uC120\uD0DD: ${object?.label || "\uC5C6\uC74C"}`;
      if (zoom) zoom.textContent = `\uBC30\uC728: ${Math.round(view.scale * 100)}%`;
      if (grid) grid.textContent = `\uACA9\uC790: ${workspaceGrid ? String(workspaceGridSizeMm) + "mm" : "\uB044\uAE30"}`;
      if (snap) snap.textContent = `\uC2A4\uB0C5: ${workspaceSnap ? "\uC0AC\uC6A9" : "\uB044\uAE30"}`;
      if (count) count.textContent = `\uC624\uBE0C\uC81D\uD2B8: ${workspaceObjects.length}\uAC1C`;
      updateWorkspaceHistoryButtons();
      if (!workspaceDirty) updateWorkspaceStatus(workspaceSaveStatus || "\uC800\uC7A5\uB418\uC9C0 \uC54A\uC74C");
    }

    function updateWorkspaceCursorStatus(event) {
      const cursor = workspaceStatusbar?.querySelector('[data-layout-status="cursor"]');
      if (!cursor || !event) return;
      const point = getWorkspaceSvgPoint(event);
      const mm = workspacePointToMillimeters(point);
      cursor.textContent = `\uB9C8\uC6B0\uC2A4: X ${mm.x} / Y ${mm.y}`;
    }

    function workspacePointToMillimeters(point) {
      return {
        x: Math.round(Number(point?.x || 0)),
        y: Math.round(Number(point?.y || 0)),
      };
    }

    function updateWorkspaceFloorplanInfo() {
      if (!workspaceFloorplanInfo) return;
      const venueName = workspaceSourceRow?.venues?.venue_name || workspaceVenues.find((venue) => venue.id === workspaceVenueSelect?.value)?.venue_name || "\uB3C4\uBA74 \uC120\uD0DD \uC5C6\uC74C";
      const spaceName = workspaceSourceRow?.venue_spaces?.space_name || workspaceSpaces.find((space) => space.id === workspaceSpaceSelect?.value)?.space_name || "";
      const sizeLabel = `${formatMmAsMeters(workspaceDrawingWidthMm)} x ${formatMmAsMeters(workspaceDrawingHeightMm)}`;
      const mmLabel = `${workspaceDrawingWidthMm}mm x ${workspaceDrawingHeightMm}mm`;
      workspaceFloorplanInfo.innerHTML = `
        <span>\uB3C4\uBA74: ${escapeHtml([venueName, spaceName].filter(Boolean).join(" / "))}</span>
        <span>\uD06C\uAE30: ${escapeHtml(sizeLabel)}</span>
        <span>${escapeHtml(mmLabel)}</span>
        <span>\uACA9\uC790: ${workspaceGridSizeMm}mm</span>
        <span>\uBC30\uC728: ${Math.round(view.scale * 100)}%</span>
      `;
    }

    function formatMmAsMeters(valueMm) {
      return `${formatDecimal(Number(valueMm || 0) / 1000, 2)}m`;
    }

    function pushWorkspaceHistory() {
      workspaceUndoStack.push({
        objects: cloneWorkspaceObjects(),
        selectedId: workspaceSelectedId,
        activeLayoutId: workspaceActiveLayout?.id || "",
      });
      if (workspaceUndoStack.length > 60) workspaceUndoStack.shift();
      workspaceRedoStack = [];
      updateWorkspaceHistoryButtons();
    }

    function undoWorkspaceChange() {
      if (!workspaceUndoStack.length) return;
      workspaceRedoStack.push({
        objects: cloneWorkspaceObjects(),
        selectedId: workspaceSelectedId,
        activeLayoutId: workspaceActiveLayout?.id || "",
      });
      restoreWorkspaceSnapshot(workspaceUndoStack.pop());
    }

    function redoWorkspaceChange() {
      if (!workspaceRedoStack.length) return;
      workspaceUndoStack.push({
        objects: cloneWorkspaceObjects(),
        selectedId: workspaceSelectedId,
        activeLayoutId: workspaceActiveLayout?.id || "",
      });
      restoreWorkspaceSnapshot(workspaceRedoStack.pop());
    }

    function restoreWorkspaceSnapshot(snapshot) {
      workspaceObjects = JSON.parse(JSON.stringify(snapshot?.objects || []));
      workspaceSelectedId = snapshot?.selectedId || "";
      workspaceDirty = true;
      updateWorkspaceStatus("蹂寃쎌궗???덉쓬");
      renderWorkspace();
      updateWorkspaceHistoryButtons();
    }

    function cloneWorkspaceObjects() {
      return JSON.parse(JSON.stringify(workspaceObjects || []));
    }

    function resetWorkspaceHistory() {
      workspaceUndoStack = [];
      workspaceRedoStack = [];
      updateWorkspaceHistoryButtons();
    }

    function updateWorkspaceHistoryButtons() {
      if (workspaceUndoButton) workspaceUndoButton.disabled = !workspaceUndoStack.length;
      if (workspaceRedoButton) workspaceRedoButton.disabled = !workspaceRedoStack.length;
    }

    function findWorkspaceObject(instanceId) {
      return workspaceObjects.find((object) => object.instanceId === instanceId) || null;
    }

    function getWorkspaceMaxZIndex() {
      return workspaceObjects.reduce((max, object) => Math.max(max, Number(object.zIndex || 0)), 0);
    }

    function getWorkspaceMinZIndex() {
      return workspaceObjects.reduce((min, object) => Math.min(min, Number(object.zIndex || 0)), 0);
    }

    function applyWorkspaceSnap(value) {
      const unit = getWorkspaceGridDrawingUnit();
      return workspaceSnap && workspaceGrid ? Math.round(value / unit) * unit : value;
    }

    function getWorkspaceSnappedPoint(event) {
      const point = getWorkspaceSvgPoint(event);
      if (!workspaceSnap || !workspaceGrid) return point;
      const mm = workspacePointToMillimeters(point);
      const snappedMm = {
        x: snapToGrid(mm.x, workspaceGridSizeMm),
        y: snapToGrid(mm.y, workspaceGridSizeMm),
      };
      return workspaceMillimetersToPoint(snappedMm);
    }

    function constrainWorkspacePoint(start, point, shiftKey) {
      if (!shiftKey) return point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (!distance) return point;
      const angle = Math.atan2(dy, dx);
      const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      return {
        x: clampNumber(start.x + Math.cos(snappedAngle) * distance, 0, workspaceSize.width),
        y: clampNumber(start.y + Math.sin(snappedAngle) * distance, 0, workspaceSize.height),
      };
    }

    function getDraftBox(start, end) {
      return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
    }

    function distanceBetweenPoints(a, b) {
      return Math.sqrt(Math.pow((b?.x || 0) - (a?.x || 0), 2) + Math.pow((b?.y || 0) - (a?.y || 0), 2));
    }

    function drawingUnitsToMeters(distance) {
      return drawingDistanceToMillimeters(distance) / 1000;
    }

    function drawingDistanceToMillimeters(distance) {
      return Math.round(Number(distance || 0));
    }

    function workspaceMillimetersToPoint(pointMm) {
      return {
        x: clampNumber(Number(pointMm.x || 0), 0, workspaceSize.width),
        y: clampNumber(Number(pointMm.y || 0), 0, workspaceSize.height),
      };
    }

    function snapToGrid(valueMm, gridSizeMm) {
      const grid = Math.max(1, Number(gridSizeMm || 1));
      return Math.round(Number(valueMm || 0) / grid) * grid;
    }

    function toMillimeters(value, unit) {
      const numberValue = parseDecimalInput(value);
      if (!Number.isFinite(numberValue)) return null;
      if (unit === "m") return Math.round(numberValue * 1000);
      if (unit === "cm") return Math.round(numberValue * 10);
      if (unit === "mm") return Math.round(numberValue);
      return null;
    }

    function fromMillimeters(valueMm, unit) {
      const value = Number(valueMm || 0);
      if (unit === "m") return value / 1000;
      if (unit === "cm") return value / 10;
      return value;
    }

    function parseDecimalInput(value) {
      if (typeof value !== "string" && typeof value !== "number") return NaN;
      const normalized = String(value).trim();
      if (!normalized || normalized === "." || normalized === "-" || normalized === "-.") return NaN;
      const number = Number.parseFloat(normalized.startsWith(".") ? `0${normalized}` : normalized);
      return Number.isFinite(number) ? number : NaN;
    }

    function formatDecimal(value, digits = 3) {
      if (!Number.isFinite(Number(value))) return "";
      return Number(value).toFixed(digits).replace(/\.?0+$/, "");
    }

    function getWallLengthMm(wall) {
      const metadata = migrateLegacyWallMetadata(wall);
      const dx = Number(metadata.end_x_mm || 0) - Number(metadata.start_x_mm || 0);
      const dy = Number(metadata.end_y_mm || 0) - Number(metadata.start_y_mm || 0);
      return Math.round(Math.hypot(dx, dy));
    }

    function getWallAngleDegrees(wall) {
      const metadata = migrateLegacyWallMetadata(wall);
      const dx = Number(metadata.end_x_mm || 0) - Number(metadata.start_x_mm || 0);
      const dy = Number(metadata.end_y_mm || 0) - Number(metadata.start_y_mm || 0);
      return normalizeDegrees(Math.atan2(dy, dx) * (180 / Math.PI));
    }

    function migrateLegacyWallMetadata(object) {
      const metadata = { ...(object?.metadata || {}) };
      if (Number.isFinite(Number(metadata.start_x_mm)) && Number.isFinite(Number(metadata.end_x_mm))) return metadata;
      const startPoint = Number.isFinite(Number(metadata.start_x)) && Number.isFinite(Number(metadata.start_y))
        ? workspacePointToMillimeters({ x: Number(metadata.start_x), y: Number(metadata.start_y) })
        : workspacePointToMillimeters({ x: Number(object?.x || 0), y: Number(object?.y || 0) });
      const lengthMm = Number(metadata.length_mm || metadata.length || drawingDistanceToMillimeters(Number(object?.widthM || 0) * workspaceMeterScale));
      const angle = Number(object?.rotation || metadata.rotation || 0) * Math.PI / 180;
      metadata.start_x_mm = Math.round(Number(metadata.start_x_mm ?? startPoint.x));
      metadata.start_y_mm = Math.round(Number(metadata.start_y_mm ?? startPoint.y));
      metadata.end_x_mm = Math.round(Number(metadata.end_x_mm ?? metadata.start_x_mm + Math.cos(angle) * lengthMm));
      metadata.end_y_mm = Math.round(Number(metadata.end_y_mm ?? metadata.start_y_mm + Math.sin(angle) * lengthMm));
      metadata.thickness_mm = Math.round(Number(metadata.thickness_mm || Number(object?.heightM || 0.15) * 1000 || 150));
      return metadata;
    }

    function syncWorkspaceLineObjectFromMetadata(object) {
      if (!["wall", "calibration"].includes(object?.objectType)) return object;
      const metadata = migrateLegacyWallMetadata(object);
      const start = workspaceMillimetersToPoint({ x: metadata.start_x_mm, y: metadata.start_y_mm });
      const end = workspaceMillimetersToPoint({ x: metadata.end_x_mm, y: metadata.end_y_mm });
      const drawingLength = distanceBetweenPoints(start, end);
      object.metadata = metadata;
      object.x = clampNumber((start.x + end.x) / 2, 0, workspaceSize.width);
      object.y = clampNumber((start.y + end.y) / 2, 0, workspaceSize.height);
      object.widthM = Math.max(0.01, drawingLength / workspaceMeterScale);
      object.heightM = Math.max(0.01, Number(metadata.thickness_mm || 150) / 1000);
      object.rotation = getWallAngleDegrees(object);
      return object;
    }

    function updateWallLength(object, nextLengthMm) {
      const metadata = migrateLegacyWallMetadata(object);
      const length = getWallLengthMm({ metadata });
      const angle = length > 0
        ? Math.atan2(metadata.end_y_mm - metadata.start_y_mm, metadata.end_x_mm - metadata.start_x_mm)
        : 0;
      metadata.end_x_mm = Math.round(metadata.start_x_mm + Math.cos(angle) * nextLengthMm);
      metadata.end_y_mm = Math.round(metadata.start_y_mm + Math.sin(angle) * nextLengthMm);
      object.metadata = metadata;
      return syncWorkspaceLineObjectFromMetadata(object);
    }

    function updateWallAngle(object, angleDegrees) {
      const metadata = migrateLegacyWallMetadata(object);
      const length = getWallLengthMm({ metadata });
      const radians = normalizeDegrees(angleDegrees) * Math.PI / 180;
      metadata.end_x_mm = Math.round(metadata.start_x_mm + Math.cos(radians) * length);
      metadata.end_y_mm = Math.round(metadata.start_y_mm + Math.sin(radians) * length);
      object.metadata = metadata;
      return syncWorkspaceLineObjectFromMetadata(object);
    }

    function getWorkspaceGridDrawingUnit() {
      return Math.max(1, Number(workspaceGridSizeMm || 500));
    }

    function updateWorkspaceGridPattern() {
      const pattern = workspaceSvg?.querySelector("#layoutEditorGridPattern");
      const majorPattern = workspaceSvg?.querySelector("#layoutEditorMajorGridPattern");
      const gridPath = pattern?.querySelector("path");
      const majorGridPath = majorPattern?.querySelector("path");
      if (!pattern || !gridPath || !majorPattern || !majorGridPath) return;
      const unit = Math.max(1, workspaceMinorGridSizeMm || getWorkspaceGridDrawingUnit());
      const majorUnit = Math.max(unit, workspaceMajorGridSizeMm || 1000);
      pattern.setAttribute("width", String(unit));
      pattern.setAttribute("height", String(unit));
      gridPath.setAttribute("d", `M ${unit} 0 L 0 0 0 ${unit}`);
      majorPattern.setAttribute("width", String(majorUnit));
      majorPattern.setAttribute("height", String(majorUnit));
      majorGridPath.setAttribute("d", `M ${majorUnit} 0 L 0 0 0 ${majorUnit}`);
    }

    function getWorkspaceObjectOpacity(object) {
      if (Number.isFinite(Number(object?.opacity))) return clampNumber(Number(object.opacity), 0, 1);
      if (Number.isFinite(Number(object?.metadata?.opacity))) return clampNumber(Number(object.metadata.opacity), 0, 1);
      if (["allowed_area", "blocked_area", "structure_area"].includes(object?.objectType)) return 0.24;
      return 1;
    }

    function applyWorkspaceCalibrationFromObject(object) {
      const length = Number(object?.metadata?.length_mm || 0);
      const start = { x: Number(object?.metadata?.start_x || 0), y: Number(object?.metadata?.start_y || 0) };
      const end = { x: Number(object?.metadata?.end_x || 0), y: Number(object?.metadata?.end_y || 0) };
      const drawingDistance = distanceBetweenPoints(start, end);
      if (!length || !drawingDistance) return;
      workspaceCalibration = {
        objectId: object.instanceId,
        actualLengthMm: length,
        mmPerUnit: length / drawingDistance,
      };
    }

    function clampNumber(value, min, max) {
      const number = Number(value);
      if (!Number.isFinite(number)) return min;
      return Math.min(max, Math.max(min, number));
    }

    function toWorkspaceNumber(value, fallback) {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    }

    function normalizeDegrees(value) {
      const degrees = Number(value) || 0;
      return ((degrees % 360) + 360) % 360;
    }

    function roundNumber(value) {
      return Math.round(Number(value || 0) * 100) / 100;
    }

    function renderObjectTypeFormPreview() {
      if (!objectTypeLivePreview) return;
      const previewItem = {
        object_name: objectNameInput?.value?.trim() || "\uBBF8\uB9AC\uBCF4\uAE30",
        category: objectCategoryInput?.value?.trim() || "\uC624\uBE0C\uC81D\uD2B8",
        object_type: objectTypeInput?.value?.trim() || "object",
        default_width_m: toNullableNumber(objectWidthInput?.value) || 1,
        default_height_m: toNullableNumber(objectHeightInput?.value) || 1,
        default_seat_count: toNullableInteger(objectSeatCountInput?.value),
        display_shape: objectShapeInput?.value || "rect",
      };
      objectTypeLivePreview.innerHTML = renderObjectPreviewSvg(previewItem)
        + '<span>' + escapeHtml(previewItem.object_name) + '</span>'
        + '<small>' + escapeHtml([previewItem.category, shapeLabel(previewItem.display_shape)].filter(Boolean).join(" / ")) + '</small>';
    }

    async function saveLayoutObjectType(event) {
      event.preventDefault();
      if (isAdminUser && !isAdminUser()) {
        setStatus("\uC624\uBE0C\uC81D\uD2B8 \uB9C8\uC2A4\uD130 \uB4F1\uB85D\uACFC \uC218\uC815\uC740 \uAD00\uB9AC\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", "warn");
        return;
      }
      const payload = {
        object_name: objectNameInput.value.trim(),
        category: objectCategoryInput.value.trim() || "\uAE30\uD0C0",
        object_type: objectTypeInput.value.trim(),
        default_width_m: toNullableNumber(objectWidthInput.value),
        default_height_m: toNullableNumber(objectHeightInput.value),
        default_elevation_m: toNullableNumber(objectElevationInput.value),
        default_seat_count: toNullableInteger(objectSeatCountInput.value),
        display_shape: objectShapeInput.value || "rect",
        can_resize: objectCanResizeInput.checked,
        can_rotate: objectCanRotateInput.checked,
        is_active: objectIsActiveInput.checked,
        memo: objectMemoInput.value.trim() || null,
      };
      if (!payload.object_name || !payload.object_type) {
        setStatus("\uC624\uBE0C\uC81D\uD2B8\uBA85\uACFC object_type\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.", "warn");
        return;
      }
      objectTypeSaveButton.disabled = true;
      try {
        const rows = editingObjectTypeId
          ? await loggedSupabaseRequest("layout_object_types update", "layout_object_types?id=eq." + encodeURIComponent(editingObjectTypeId) + "&select=*", {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Prefer: "return=representation" },
              body: JSON.stringify(payload),
            })
          : await loggedSupabaseRequest("layout_object_types insert", "layout_object_types?select=*", {
              method: "POST",
              headers: { "Content-Type": "application/json", Prefer: "return=representation" },
              body: JSON.stringify(payload),
            });
        if (!rows?.[0]?.id) throw new Error("\uC624\uBE0C\uC81D\uD2B8 \uB9C8\uC2A4\uD130 \uC800\uC7A5 \uACB0\uACFC\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
        resetObjectTypeForm();
        await loadLayoutObjectTypes();
        setStatus("\uC624\uBE0C\uC81D\uD2B8 \uB9C8\uC2A4\uD130\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
      } catch (error) {
        console.error("layout_object_types save failed:", error);
        setStatus(error.message || "\uC624\uBE0C\uC81D\uD2B8 \uB9C8\uC2A4\uD130 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", "error");
      } finally {
        objectTypeSaveButton.disabled = false;
      }
    }

    function startEditObjectType(item) {
      editingObjectTypeId = isUuid(item.id) ? item.id : "";
      objectNameInput.value = item.object_name || "";
      objectCategoryInput.value = item.category || "";
      objectTypeInput.value = item.object_type || "";
      objectWidthInput.value = item.default_width_m ?? "";
      objectHeightInput.value = item.default_height_m ?? "";
      objectElevationInput.value = item.default_elevation_m ?? "";
      objectSeatCountInput.value = item.default_seat_count ?? "";
      objectShapeInput.value = item.display_shape || "rect";
      objectCanResizeInput.checked = item.can_resize !== false;
      objectCanRotateInput.checked = item.can_rotate !== false;
      objectIsActiveInput.checked = item.is_active !== false;
      objectMemoInput.value = item.memo || "";
      objectTypeSaveButton.textContent = "\uB9C8\uC2A4\uD130 \uC218\uC815 \uC800\uC7A5";
      objectTypeResetButton.textContent = "\uCDE8\uC18C";
      renderObjectTypeFormPreview();
      objectTypeForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function resetObjectTypeForm() {
      editingObjectTypeId = "";
      objectTypeForm?.reset();
      if (objectCanResizeInput) objectCanResizeInput.checked = true;
      if (objectCanRotateInput) objectCanRotateInput.checked = true;
      if (objectIsActiveInput) objectIsActiveInput.checked = true;
      if (objectShapeInput) objectShapeInput.value = "rect";
      if (objectTypeSaveButton) objectTypeSaveButton.textContent = "\uB9C8\uC2A4\uD130 \uB4F1\uB85D";
      if (objectTypeResetButton) objectTypeResetButton.textContent = "\uCD08\uAE30\uD654";
      renderObjectTypeFormPreview();
    }

    async function toggleObjectTypeActive(item) {
      if (!isUuid(item.id)) {
        setStatus("DB\uC5D0 \uC800\uC7A5\uB41C \uC624\uBE0C\uC81D\uD2B8 \uB9C8\uC2A4\uD130\uB9CC \uC0C1\uD0DC\uB97C \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", "warn");
        return;
      }
      try {
        await loggedSupabaseRequest("layout_object_types active update", "layout_object_types?id=eq." + encodeURIComponent(item.id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: item.is_active === false }),
        });
        await loadLayoutObjectTypes();
      } catch (error) {
        console.error("layout_object_types active update failed:", error);
        setStatus(error.message || "\uC624\uBE0C\uC81D\uD2B8 \uB9C8\uC2A4\uD130 \uC0C1\uD0DC \uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", "error");
      }
    }

    function hydrateLayoutInputsFromSource(row) {
      const fileName = sourceFile?.original_filename || "湲곕낯?꾨㈃";
      floorplanNameInput.value = row.layout_type === "湲곕낯?꾨㈃" ? fileName.replace(/\.[^.]+$/, "") : `${fileName.replace(/\.[^.]+$/, "")} 湲곕낯?꾨㈃`;
      actualWidthInput.value = row.actual_width ?? "";
      actualHeightInput.value = row.actual_height ?? "";
      unitSelect.value = "m";
      layoutNameInput.value = row.layout_type && row.layout_type !== "湲곕낯?꾨㈃" ? `${row.layout_type} ?덉씠?꾩썐` : "";
      layoutTypeInput.value = row.layout_type === "湲곕낯?꾨㈃" ? "" : row.layout_type || "";
      minPeopleInput.value = row.min_people ?? "";
      maxPeopleInput.value = row.max_people ?? "";
      setupCapacityInput.value = row.setup_capacity ?? "";
      tableTypeInput.value = row.table_type ?? "";
      tableCountInput.value = row.table_count ?? "";
      rowCountInput.value = row.row_count ?? "";
      columnCountInput.value = row.column_count ?? "";
      seatsPerTableInput.value = row.seats_per_table ?? "";
      hasStageInput.checked = Boolean(row.has_stage);
      hasBuffetInput.checked = Boolean(row.has_buffet);
      layoutNotesInput.value = row.layout_notes || "";
      seminarColumnCountInput.value = row.column_count ?? "";
      seminarRowCountInput.value = row.row_count ?? "";
      seminarSeatsPerTableInput.value = row.seats_per_table ?? "";
      seminarHorizontalGapInput.value = "0.015";
      seminarVerticalGapInput.value = "0.03";
    }

    async function loadBackgroundImage(url) {
      backgroundImage = await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      }).catch((error) => {
        console.error("floorplan image load failed:", error);
        setStatus("?꾨㈃ ?대?吏瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??", "error");
        return null;
      });
    }

    async function loadOrCreateFloorplanState() {
      const rows = await loggedSupabaseRequest(
        "venue_floorplans select",
        `venue_floorplans?select=*&file_id=eq.${encodeURIComponent(sourceFile.id)}&is_active=eq.true&limit=1`
      ).catch(() => []);
      floorplanRecord = rows?.[0] || null;
      if (floorplanRecord) {
        floorplanNameInput.value = floorplanRecord.floorplan_name || floorplanNameInput.value;
        actualWidthInput.value = floorplanRecord.actual_width ?? "";
        actualHeightInput.value = floorplanRecord.actual_height ?? "";
        unitSelect.value = floorplanRecord.unit || "m";
        floorplanObjects = await loggedSupabaseRequest(
          "venue_floorplan_objects select",
          `venue_floorplan_objects?select=*&floorplan_id=eq.${encodeURIComponent(floorplanRecord.id)}&is_active=eq.true&order=sort_order.asc`
        ).then((rows) => (rows || []).map(dbObjectToCanvasObject)).catch(() => []);
      }
    }

    async function loadSavedLayouts() {
      if (!floorplanRecord?.id) return;
      savedLayouts = await loggedSupabaseRequest(
        "venue_layouts select",
        `venue_layouts?select=*&floorplan_id=eq.${encodeURIComponent(floorplanRecord.id)}&is_active=eq.true&order=updated_at.desc`
      ).catch(() => []);
      savedLayoutsSelect.innerHTML = '<option value="">???덉씠?꾩썐</option>';
      savedLayouts.forEach((layout) => {
        const option = document.createElement("option");
        option.value = layout.id;
        option.textContent = layout.layout_name || layout.layout_type || "?덉씠?꾩썐";
        savedLayoutsSelect.append(option);
      });
    }

    async function loadLayoutById(layoutId) {
      activeLayout = savedLayouts.find((layout) => layout.id === layoutId) || null;
      if (!activeLayout) {
        layoutObjects = [];
        selectedObjectId = "";
        selectedScope = "";
        renderSelectedObjectPanel();
        render();
        return;
      }
      layoutNameInput.value = activeLayout.layout_name || "";
      layoutTypeInput.value = activeLayout.layout_type || "";
      minPeopleInput.value = activeLayout.min_people ?? "";
      maxPeopleInput.value = activeLayout.max_people ?? "";
      setupCapacityInput.value = activeLayout.setup_capacity ?? "";
      tableTypeInput.value = activeLayout.table_type ?? "";
      tableCountInput.value = activeLayout.table_count ?? "";
      rowCountInput.value = activeLayout.row_count ?? "";
      columnCountInput.value = activeLayout.column_count ?? "";
      seatsPerTableInput.value = activeLayout.seats_per_table ?? "";
      hasStageInput.checked = Boolean(activeLayout.has_stage);
      hasBuffetInput.checked = Boolean(activeLayout.has_buffet);
      layoutNotesInput.value = activeLayout.layout_notes || "";
      layoutObjects = await loggedSupabaseRequest(
        "venue_layout_objects select",
        `venue_layout_objects?select=*&layout_id=eq.${encodeURIComponent(activeLayout.id)}&is_active=eq.true&order=sort_order.asc`
      ).then((rows) => (rows || []).map(dbObjectToCanvasObject)).catch(() => []);
      selectedObjectId = "";
      selectedScope = "";
      renderSelectedObjectPanel();
      render();
    }

    function dbObjectToCanvasObject(row) {
      return {
        id: row.id || makeId(),
        object_type: row.object_type,
        label: row.label || objectLabels[row.object_type] || row.object_type,
        x: Number(row.x),
        y: Number(row.y),
        width: Number(row.width),
        height: Number(row.height),
        rotation: Number(row.rotation || 0),
        seat_count: row.seat_count ?? row.metadata?.seat_count ?? null,
        object_type_id: row.object_type_id || row.metadata?.object_type_id || null,
        display_shape: row.metadata?.display_shape || null,
        can_resize: row.metadata?.can_resize !== false,
        can_rotate: row.metadata?.can_rotate !== false,
        memo: row.memo || row.metadata?.memo || "",
        is_locked: Boolean(row.is_locked),
        metadata: row.metadata || {},
      };
    }

    function addObject(scope, objectType) {
      const isRound = objectType === "round_table";
      const isArea = objectType === "allowed_area" || objectType === "blocked_area";
      const object = {
        id: makeId(),
        object_type: objectType,
        label: objectLabels[objectType] || objectType,
        x: 0.44,
        y: 0.42,
        width: isArea ? 0.28 : isRound ? 0.055 : 0.09,
        height: isArea ? 0.18 : isRound ? 0.055 : 0.035,
        rotation: 0,
        seat_count: objectType === "seminar_table" ? toNumber(seatsPerTableInput.value) || 2 : null,
        metadata: {},
      };
      if (scope === "floorplan") floorplanObjects.push(object);
      else layoutObjects.push(object);
      selectedObjectId = object.id;
      selectedScope = scope;
      renderSelectedObjectPanel();
      render();
    }

    function handleCanvasDrop(event) {
      event.preventDefault();
      const master = findObjectType(event.dataTransfer.getData("text/plain"));
      if (!master) return;
      addObjectFromMaster(master, eventToNormalizedPoint(event));
    }

    function addObjectFromMaster(master, point = null) {
      if (!master) return;
      const scope = fixedObjectTypes.has(master.object_type) ? "floorplan" : "layout";
      const size = masterSizeToNormalized(master);
      const object = {
        id: makeId(),
        object_type_id: isUuid(master.id) ? master.id : null,
        object_type: master.object_type,
        label: master.object_name || objectLabels[master.object_type] || master.object_type,
        x: clamp01((point?.x ?? 0.5) - size.width / 2),
        y: clamp01((point?.y ?? 0.45) - size.height / 2),
        width: size.width,
        height: size.height,
        rotation: 0,
        seat_count: master.default_seat_count ?? null,
        display_shape: master.display_shape || "rect",
        can_resize: master.can_resize !== false,
        can_rotate: master.can_rotate !== false,
        memo: master.memo || "",
        is_locked: false,
        metadata: {
          object_type_id: master.id || null,
          master_source_id: master.id || null,
          master_name: master.object_name || null,
          default_width_m: master.default_width_m ?? null,
          default_height_m: master.default_height_m ?? null,
          default_elevation_m: master.default_elevation_m ?? null,
          display_shape: master.display_shape || "rect",
          can_resize: master.can_resize !== false,
          can_rotate: master.can_rotate !== false,
        },
      };
      if (scope === "floorplan") floorplanObjects.push(object);
      else layoutObjects.push(object);
      selectedObjectId = object.id;
      selectedScope = scope;
      renderSelectedObjectPanel();
      render();
    }

    function masterSizeToNormalized(master) {
      const actualWidth = toNullableNumber(actualWidthInput.value);
      const actualHeight = toNullableNumber(actualHeightInput.value);
      const fallback = getFallbackNormalizedSize(master.object_type, master.display_shape);
      return {
        width: actualWidth && master.default_width_m ? Math.min(0.95, Math.max(0.005, Number(master.default_width_m) / actualWidth)) : fallback.width,
        height: actualHeight && master.default_height_m ? Math.min(0.95, Math.max(0.005, Number(master.default_height_m) / actualHeight)) : fallback.height,
      };
    }

    function getFallbackNormalizedSize(objectType, shape) {
      if (objectType === "allowed_area" || objectType === "blocked_area" || shape === "area") return { width: 0.28, height: 0.18 };
      if (objectType === "round_table" || objectType === "pillar" || shape === "circle") return { width: 0.055, height: 0.055 };
      if (objectType === "chair") return { width: 0.026, height: 0.026 };
      if (objectType === "stage") return { width: 0.18, height: 0.1 };
      return { width: 0.09, height: 0.035 };
    }

    function generateSeminarGrid() {
      const columns = Math.max(1, toNumber(seminarColumnCountInput.value) || 1);
      const rows = Math.max(1, toNumber(seminarRowCountInput.value) || 1);
      const hGap = Math.max(0.002, Number(seminarHorizontalGapInput.value) || 0.015);
      const vGap = Math.max(0.002, Number(seminarVerticalGapInput.value) || 0.03);
      const seats = Math.max(1, toNumber(seminarSeatsPerTableInput.value) || 2);
      const master = layoutObjectTypes.find((item) => item.is_active !== false && item.object_type === "seminar_table") || null;
      const size = master ? masterSizeToNormalized(master) : { width: 0.075, height: 0.028 };
      const tableWidth = size.width;
      const tableHeight = size.height;
      const totalWidth = columns * tableWidth + (columns - 1) * hGap;
      const totalHeight = rows * tableHeight + (rows - 1) * vGap;
      const startX = Math.max(0.03, (1 - totalWidth) / 2);
      const startY = Math.max(0.08, (1 - totalHeight) / 2);
      const newObjects = [];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          newObjects.push({
            id: makeId(),
            object_type: "seminar_table",
            object_type_id: isUuid(master?.id) ? master.id : null,
            label: `${master?.object_name || "세미나 테이블"} ${row + 1}-${column + 1}`,
            x: clamp01(startX + column * (tableWidth + hGap)),
            y: clamp01(startY + row * (tableHeight + vGap)),
            width: tableWidth,
            height: tableHeight,
            rotation: 0,
            seat_count: seats,
            display_shape: master?.display_shape || "rect",
            can_resize: master?.can_resize !== false,
            can_rotate: master?.can_rotate !== false,
            memo: master?.memo || "",
            is_locked: false,
            metadata: {
              row: row + 1,
              column: column + 1,
              object_type_id: isUuid(master?.id) ? master.id : null,
              master_source_id: master?.id || null,
              master_name: master?.object_name || null,
              default_width_m: master?.default_width_m ?? null,
              default_height_m: master?.default_height_m ?? null,
              display_shape: master?.display_shape || "rect",
              can_resize: master?.can_resize !== false,
              can_rotate: master?.can_rotate !== false,
            },
          });
        }
      }
      layoutObjects.push(...newObjects);
      columnCountInput.value = columns;
      rowCountInput.value = rows;
      seatsPerTableInput.value = seats;
      tableCountInput.value = columns * rows;
      setupCapacityInput.value = columns * rows * seats;
      tableTypeInput.value = tableTypeInput.value || "세미나 테이블";
      layoutTypeInput.value = layoutTypeInput.value || "세미나";
      selectedObjectId = newObjects[0]?.id || "";
      selectedScope = "layout";
      renderSelectedObjectPanel();
      render();
    }

    function handleCanvasMouseDown(event) {
      const point = eventToNormalizedPoint(event);
      const hit = findObjectAt(point.x, point.y);
      if (hit) {
        selectedObjectId = hit.object.id;
        selectedScope = hit.scope;
        dragState = hit.object.is_locked ? null : { mode: "object", startX: point.x, startY: point.y, originalX: hit.object.x, originalY: hit.object.y };
        renderSelectedObjectPanel();
      } else {
        selectedObjectId = "";
        selectedScope = "";
        dragState = { mode: "pan", clientX: event.clientX, clientY: event.clientY, x: view.x, y: view.y };
        renderSelectedObjectPanel();
      }
      render();
    }

    function handleCanvasMouseMove(event) {
      if (!dragState) return;
      if (dragState.mode === "object") {
        const point = eventToNormalizedPoint(event);
        const object = getSelectedObject();
        if (!object) return;
        object.x = clamp01(dragState.originalX + point.x - dragState.startX);
        object.y = clamp01(dragState.originalY + point.y - dragState.startY);
        renderSelectedObjectPanel(false);
      } else {
        view.x = dragState.x + event.clientX - dragState.clientX;
        view.y = dragState.y + event.clientY - dragState.clientY;
      }
      render();
    }

    function handleCanvasMouseUp() {
      dragState = null;
    }

    function handleCanvasWheel(event) {
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? 0.9 : 1.1);
    }

    function findObjectAt(x, y) {
      const all = [
        ...layoutObjects.map((object) => ({ scope: "layout", object })),
        ...floorplanObjects.map((object) => ({ scope: "floorplan", object })),
      ];
      for (let index = all.length - 1; index >= 0; index -= 1) {
        const item = all[index];
        if (
          x >= item.object.x &&
          x <= item.object.x + item.object.width &&
          y >= item.object.y &&
          y <= item.object.y + item.object.height
        ) return item;
      }
      return null;
    }

    function eventToNormalizedPoint(event) {
      const rect = canvas.getBoundingClientRect();
      const imageSize = getImageSize();
      const worldX = (event.clientX - rect.left - view.x) / view.scale;
      const worldY = (event.clientY - rect.top - view.y) / view.scale;
      return {
        x: clamp01(worldX / imageSize.width),
        y: clamp01(worldY / imageSize.height),
      };
    }

    function resetView() {
      const imageSize = getImageSize();
      const scale = Math.min(canvas.width / imageSize.width, canvas.height / imageSize.height) * 0.95;
      view.scale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      view.x = (canvas.width - imageSize.width * view.scale) / 2;
      view.y = (canvas.height - imageSize.height * view.scale) / 2;
      render();
    }

    function zoomBy(factor) {
      view.scale = Math.min(8, Math.max(0.1, view.scale * factor));
      render();
    }

    function getImageSize() {
      return {
        width: backgroundImage?.naturalWidth || 1200,
        height: backgroundImage?.naturalHeight || 760,
      };
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(view.x, view.y);
      ctx.scale(view.scale, view.scale);
      const imageSize = getImageSize();
      if (backgroundImage) ctx.drawImage(backgroundImage, 0, 0, imageSize.width, imageSize.height);
      drawObjects(ctx, floorplanObjects, "floorplan", imageSize);
      drawObjects(ctx, layoutObjects, "layout", imageSize);
      ctx.restore();
    }

    function drawObjects(targetCtx, objects, scope, imageSize) {
      objects.forEach((object) => {
        const x = object.x * imageSize.width;
        const y = object.y * imageSize.height;
        const width = object.width * imageSize.width;
        const height = object.height * imageSize.height;
        const style = objectStyles[object.object_type] || { fill: "rgba(15,42,67,.14)", stroke: "#0f2a43" };
        const shape = object.display_shape || object.metadata?.display_shape || (object.object_type === "round_table" || object.object_type === "pillar" ? "circle" : "rect");
        targetCtx.save();
        targetCtx.translate(x + width / 2, y + height / 2);
        targetCtx.rotate((Number(object.rotation || 0) * Math.PI) / 180);
        targetCtx.beginPath();
        if (shape === "circle" || shape === "ellipse") {
          targetCtx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
        } else if (shape === "line") {
          targetCtx.moveTo(-width / 2, 0);
          targetCtx.lineTo(width / 2, 0);
        } else {
          targetCtx.rect(-width / 2, -height / 2, width, height);
        }
        targetCtx.fillStyle = style.fill;
        targetCtx.strokeStyle = object.id === selectedObjectId && scope === selectedScope ? "#d4af37" : style.stroke;
        targetCtx.lineWidth = object.id === selectedObjectId && scope === selectedScope ? 4 / view.scale : 2 / view.scale;
        if (object.is_locked) targetCtx.setLineDash([8 / view.scale, 5 / view.scale]);
        targetCtx.fill();
        targetCtx.stroke();
        targetCtx.fillStyle = "#0f2a43";
        targetCtx.font = `${Math.max(10, 15 / view.scale)}px sans-serif`;
        targetCtx.textAlign = "center";
        targetCtx.textBaseline = "middle";
        targetCtx.fillText(object.label || objectLabels[object.object_type] || object.object_type, 0, 0);
        targetCtx.restore();
      });
    }

    function renderSelectedObjectPanel(preserveFocus = true) {
      const object = getSelectedObject();
      if (!object) {
        selectedObjectPanel.innerHTML = "<p>?좏깮??媛앹껜媛 ?놁뒿?덈떎.</p>";
        return;
      }
      const activeName = preserveFocus ? document.activeElement?.dataset?.selectedProp : "";
      const canResize = object.can_resize !== false;
      const canRotate = object.can_rotate !== false;
      selectedObjectPanel.innerHTML = `
        <label>?대쫫<input data-selected-prop="label" value="${escapeAttribute(object.label || "")}"></label>
        <div class="floorplan-two-col">
          <label>X<input data-selected-prop="x" type="number" min="0" max="1" step="0.001" value="${roundValue(object.x)}"></label>
          <label>Y<input data-selected-prop="y" type="number" min="0" max="1" step="0.001" value="${roundValue(object.y)}"></label>
          <label>媛濡?input data-selected-prop="width" type="number" min="0.001" max="1" step="0.001" value="${roundValue(object.width)}" ${canResize ? "" : "disabled"}></label>
          <label>?몃줈<input data-selected-prop="height" type="number" min="0.001" max="1" step="0.001" value="${roundValue(object.height)}" ${canResize ? "" : "disabled"}></label>
          <label>?뚯쟾<input data-selected-prop="rotation" type="number" step="1" value="${roundValue(object.rotation || 0)}" ${canRotate ? "" : "disabled"}></label>
          <label>李⑹꽍<input data-selected-prop="seat_count" type="number" min="0" step="1" value="${object.seat_count ?? ""}"></label>
        </div>
        <label>硫붾え<textarea data-selected-prop="memo" rows="2">${escapeHtml(object.memo || "")}</textarea></label>
        <label class="inline-check"><input data-selected-prop="is_locked" type="checkbox" ${object.is_locked ? "checked" : ""}> ?좉툑</label>
        <div class="floorplan-selected-actions">
          <button type="button" data-selected-action="copy">蹂듭궗</button>
          <button type="button" class="danger-button" data-selected-action="delete">??젣</button>
        </div>
      `;
      selectedObjectPanel.querySelectorAll("[data-selected-prop]").forEach((input) => {
        input.addEventListener("input", updateSelectedObjectFromPanel);
        input.addEventListener("change", updateSelectedObjectFromPanel);
        if (input.dataset.selectedProp === activeName) input.focus();
      });
      selectedObjectPanel.querySelector('[data-selected-action="copy"]')?.addEventListener("click", copySelectedObject);
      selectedObjectPanel.querySelector('[data-selected-action="delete"]')?.addEventListener("click", deleteSelectedObject);
    }

    function updateSelectedObjectFromPanel(event) {
      const object = getSelectedObject();
      if (!object) return;
      const prop = event.target.dataset.selectedProp;
      const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      if (prop === "label") object.label = value;
      else if (prop === "memo") object.memo = value;
      else if (prop === "is_locked") object.is_locked = Boolean(value);
      else if (prop === "seat_count") object.seat_count = toNullableInteger(value);
      else object[prop] = prop === "rotation" ? Number(value) || 0 : clamp01(Number(value) || 0);
      if (prop === "width" || prop === "height") object[prop] = Math.max(0.001, object[prop]);
      render();
    }

    function getSelectedObject() {
      const list = selectedScope === "floorplan" ? floorplanObjects : layoutObjects;
      return list.find((object) => object.id === selectedObjectId) || null;
    }

    function copySelectedObject() {
      const object = getSelectedObject();
      if (!object) return;
      const copy = {
        ...object,
        id: makeId(),
        x: clamp01(object.x + 0.025),
        y: clamp01(object.y + 0.025),
        metadata: { ...(object.metadata || {}) },
      };
      if (selectedScope === "floorplan") floorplanObjects.push(copy);
      else layoutObjects.push(copy);
      selectedObjectId = copy.id;
      renderSelectedObjectPanel();
      render();
    }

    function deleteSelectedObject() {
      if (!selectedObjectId) return;
      if (selectedScope === "floorplan") floorplanObjects = floorplanObjects.filter((object) => object.id !== selectedObjectId);
      else layoutObjects = layoutObjects.filter((object) => object.id !== selectedObjectId);
      selectedObjectId = "";
      selectedScope = "";
      renderSelectedObjectPanel();
      render();
    }

    async function saveFloorplanAndFixedObjects() {
      if (!sourceFile?.id) return;
      saveFloorplanButton.disabled = true;
      try {
        floorplanRecord = await upsertFloorplan();
        await replaceObjects("venue_floorplan_objects", "floorplan_id", floorplanRecord.id, floorplanObjects);
        setStatus("湲곕낯?꾨㈃怨?怨좎젙 媛앹껜瑜???ν뻽?듬땲??");
      } catch (error) {
        console.error("floorplan save failed:", error);
        setStatus(error.message || "湲곕낯?꾨㈃ ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.", "error");
      } finally {
        saveFloorplanButton.disabled = false;
      }
    }

    async function saveLayoutWithPreview() {
      saveLayoutButton.disabled = true;
      try {
        floorplanRecord = await upsertFloorplan();
        await replaceObjects("venue_floorplan_objects", "floorplan_id", floorplanRecord.id, floorplanObjects);
        const previewFile = await createPreviewFile();
        const layoutPayload = buildLayoutPayload(previewFile.id);
        const layoutRows = activeLayout?.id
          ? await loggedSupabaseRequest("venue_layouts update", `venue_layouts?id=eq.${encodeURIComponent(activeLayout.id)}&select=*`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Prefer: "return=representation" },
              body: JSON.stringify(layoutPayload),
            })
          : await loggedSupabaseRequest("venue_layouts insert", "venue_layouts?select=*", {
              method: "POST",
              headers: { "Content-Type": "application/json", Prefer: "return=representation" },
              body: JSON.stringify(layoutPayload),
            });
        activeLayout = layoutRows?.[0];
        if (!activeLayout?.id) throw new Error("?덉씠?꾩썐 ???寃곌낵瑜??뺤씤?섏? 紐삵뻽?듬땲??");
        await replaceObjects("venue_layout_objects", "layout_id", activeLayout.id, layoutObjects);
        const venueLayoutImage = await upsertVenueLayoutImage(previewFile.id, activeLayout.venue_layout_image_id);
        if (venueLayoutImage?.id && venueLayoutImage.id !== activeLayout.venue_layout_image_id) {
          await loggedSupabaseRequest("venue_layouts preview link update", `venue_layouts?id=eq.${encodeURIComponent(activeLayout.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ venue_layout_image_id: venueLayoutImage.id }),
          });
        }
        await syncPreviewFileLinks(previewFile.id, activeLayout.id, venueLayoutImage?.id);
        await loadSavedLayouts();
        savedLayoutsSelect.value = activeLayout.id;
        await reloadVenueLayouts?.();
        setStatus("?덉씠?꾩썐 媛앹껜? PNG 誘몃━蹂닿린瑜???ν뻽?듬땲??");
      } catch (error) {
        console.error("layout save failed:", error);
        setStatus(error.message || "?덉씠?꾩썐 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.", "error");
      } finally {
        saveLayoutButton.disabled = false;
      }
    }

    async function upsertFloorplan() {
      const payload = {
        file_id: sourceFile.id,
        venue_id: sourceRow.venue_id || null,
        space_id: sourceRow.space_id || null,
        floorplan_name: floorplanNameInput.value.trim() || "湲곕낯?꾨㈃",
        actual_width: toNullableNumber(actualWidthInput.value),
        actual_height: toNullableNumber(actualHeightInput.value),
        unit: unitSelect.value || "m",
        notes: sourceRow.layout_notes || null,
      };
      const rows = floorplanRecord?.id
        ? await loggedSupabaseRequest("venue_floorplans update", `venue_floorplans?id=eq.${encodeURIComponent(floorplanRecord.id)}&select=*`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          })
        : await loggedSupabaseRequest("venue_floorplans insert", "venue_floorplans?select=*", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          });
      if (!rows?.[0]?.id) throw new Error("湲곕낯?꾨㈃ ???寃곌낵瑜??뺤씤?섏? 紐삵뻽?듬땲??");
      return rows[0];
    }

    async function replaceObjects(table, parentColumn, parentId, objects) {
      await loggedSupabaseRequest(`${table} delete`, `${table}?${parentColumn}=eq.${encodeURIComponent(parentId)}`, { method: "DELETE" });
      const rows = objects.map((object, index) => ({
        [parentColumn]: parentId,
        object_type: object.object_type,
        label: object.label || objectLabels[object.object_type] || object.object_type,
        object_type_id: isUuid(object.object_type_id || object.metadata?.object_type_id) ? (object.object_type_id || object.metadata?.object_type_id) : null,
        x: roundValue(object.x),
        y: roundValue(object.y),
        width: roundValue(object.width),
        height: roundValue(object.height),
        rotation: Number(object.rotation || 0),
        seat_count: table === "venue_layout_objects" ? object.seat_count ?? null : undefined,
        memo: object.memo || null,
        is_locked: Boolean(object.is_locked),
        metadata: {
          ...(object.metadata || {}),
          object_type_id: object.object_type_id || object.metadata?.object_type_id || null,
          display_shape: object.display_shape || object.metadata?.display_shape || null,
          can_resize: object.can_resize !== false,
          can_rotate: object.can_rotate !== false,
          memo: object.memo || null,
        },
        sort_order: index,
      })).map((row) => {
        Object.keys(row).forEach((key) => row[key] === undefined && delete row[key]);
        return row;
      });
      if (!rows.length) return;
      await loggedSupabaseRequest(`${table} insert`, table, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
    }

    function buildLayoutPayload(previewFileId) {
      return {
        floorplan_id: floorplanRecord.id,
        preview_file_id: previewFileId,
        venue_id: sourceRow.venue_id || null,
        space_id: sourceRow.space_id || null,
        layout_name: layoutNameInput.value.trim() || `${layoutTypeInput.value || "?덉씠?꾩썐"} ${setupCapacityInput.value || ""}`.trim(),
        layout_type: layoutTypeInput.value.trim() || "?덉씠?꾩썐",
        min_people: toNullableInteger(minPeopleInput.value),
        max_people: toNullableInteger(maxPeopleInput.value),
        setup_capacity: toNullableInteger(setupCapacityInput.value),
        table_type: tableTypeInput.value.trim() || null,
        table_count: toNullableInteger(tableCountInput.value) || layoutObjects.filter((object) => /table/.test(object.object_type)).length || null,
        row_count: toNullableInteger(rowCountInput.value),
        column_count: toNullableInteger(columnCountInput.value),
        seats_per_table: toNullableInteger(seatsPerTableInput.value),
        has_stage: hasStageInput.checked || layoutObjects.some((object) => object.object_type === "stage"),
        has_buffet: hasBuffetInput.checked || layoutObjects.some((object) => object.object_type === "buffet_table"),
        layout_notes: layoutNotesInput.value.trim() || null,
      };
    }

    async function createPreviewFile() {
      const blob = await renderPreviewBlob();
      const bucket = supabaseConfig.venueLayoutBucket || "venue-layouts";
      const safeName = (layoutNameInput.value || layoutTypeInput.value || "layout").replace(/[^\w가-힣-]+/g, "_").replace(/_+/g, "_");
      const storagePath = `layout-previews/${Date.now()}_${safeName}.png`;
      const uploadUrl = `${supabaseConfig.url}/storage/v1/object/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
          "Content-Type": "image/png",
          "x-upsert": "false",
        },
        body: blob,
      });
      if (!response.ok) throw await supabaseErrorFromResponse(response, "PNG 誘몃━蹂닿린 ?낅줈?쒖뿉 ?ㅽ뙣?덉뒿?덈떎.");
      const publicUrl = `${supabaseConfig.url}/storage/v1/object/public/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
      const fileRows = await loggedSupabaseRequest("files insert floorplan preview", "files?select=*", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          bucket,
          storage_path: storagePath,
          public_url: publicUrl,
          original_filename: `${safeName}.png`,
          file_type: "image",
          mime_type: "image/png",
          file_size: blob.size,
          description: layoutNotesInput.value.trim() || null,
        }),
      });
      if (!fileRows?.[0]?.id) throw new Error("PNG 誘몃━蹂닿린 ?뚯씪 ?뺣낫瑜???ν븯吏 紐삵뻽?듬땲??");
      return fileRows[0];
    }

    function renderPreviewBlob() {
      const imageSize = getImageSize();
      const maxWidth = 1400;
      const scale = Math.min(1, maxWidth / imageSize.width);
      const preview = document.createElement("canvas");
      preview.width = Math.max(1, Math.round(imageSize.width * scale));
      preview.height = Math.max(1, Math.round(imageSize.height * scale));
      const previewCtx = preview.getContext("2d");
      previewCtx.fillStyle = "#fff";
      previewCtx.fillRect(0, 0, preview.width, preview.height);
      if (backgroundImage) previewCtx.drawImage(backgroundImage, 0, 0, preview.width, preview.height);
      previewCtx.save();
      previewCtx.scale(scale, scale);
      drawObjects(previewCtx, floorplanObjects, "floorplan", imageSize);
      drawObjects(previewCtx, layoutObjects, "layout", imageSize);
      previewCtx.restore();
      return new Promise((resolve, reject) => {
        preview.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 誘몃━蹂닿린瑜??앹꽦?섏? 紐삵뻽?듬땲??")), "image/png", 0.92);
      });
    }

    async function upsertVenueLayoutImage(fileId, existingId) {
      const payload = {
        file_id: fileId,
        venue_id: sourceRow.venue_id || null,
        space_id: sourceRow.space_id || null,
        layout_type: layoutTypeInput.value.trim() || "?덉씠?꾩썐",
        min_people: toNullableInteger(minPeopleInput.value),
        max_people: toNullableInteger(maxPeopleInput.value),
        table_type: tableTypeInput.value.trim() || null,
        table_count: toNullableInteger(tableCountInput.value) || layoutObjects.filter((object) => /table/.test(object.object_type)).length || null,
        setup_capacity: toNullableInteger(setupCapacityInput.value),
        column_count: toNullableInteger(columnCountInput.value),
        row_count: toNullableInteger(rowCountInput.value),
        seats_per_table: toNullableInteger(seatsPerTableInput.value),
        base_table_count: toNullableInteger(tableCountInput.value) || null,
        extra_table_count: 0,
        has_stage: hasStageInput.checked || layoutObjects.some((object) => object.object_type === "stage"),
        has_buffet: hasBuffetInput.checked || layoutObjects.some((object) => object.object_type === "buffet_table"),
        is_verified: true,
        verified_by: "floorplan_editor",
        verified_at: new Date().toISOString(),
        layout_notes: layoutNotesInput.value.trim() || null,
        source_type: "floorplan_editor",
        source_id: activeLayout?.id || null,
      };
      const rows = existingId
        ? await loggedSupabaseRequest("venue_layout_images update preview", `venue_layout_images?id=eq.${encodeURIComponent(existingId)}&select=*`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          })
        : await loggedSupabaseRequest("venue_layout_images insert preview", "venue_layout_images?select=*", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify(payload),
          });
      return rows?.[0] || null;
    }

    async function syncPreviewFileLinks(fileId, layoutId, venueLayoutImageId) {
      const links = [
        sourceRow.venue_id ? { file_id: fileId, entity_type: "venue", entity_id: sourceRow.venue_id, link_type: "layout_preview" } : null,
        sourceRow.space_id ? { file_id: fileId, entity_type: "venue_space", entity_id: sourceRow.space_id, link_type: "layout_preview" } : null,
        { file_id: fileId, entity_type: "venue_layout", entity_id: layoutId, link_type: "preview" },
        venueLayoutImageId ? { file_id: fileId, entity_type: "venue_layout_image", entity_id: venueLayoutImageId, link_type: "primary_file" } : null,
      ].filter(Boolean);
      if (!links.length) return;
      await loggedSupabaseRequest("file_links insert floorplan preview", "file_links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify(links),
      });
    }

    function makeId() {
      return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function clamp01(value) {
      return Math.max(0, Math.min(1, Number(value) || 0));
    }

    function roundValue(value) {
      return Math.round((Number(value) || 0) * 10000) / 10000;
    }

    function toNumber(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    }

    function toNullableNumber(value) {
      if (value === "" || value === null || value === undefined) return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }

    function findObjectType(id) {
      if (!id) return null;
      return layoutObjectTypes.find((item) => String(item.id || "") === String(id)) || null;
    }

    function normalizeObjectTypeRows(rows) {
      return (rows || []).map((row, index) => ({
        ...row,
        id: row.id || `local_${row.object_type || "object"}_${index}`,
      }));
    }

    function isUuid(value) {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
    }

    function buildMasterSizeLabel(item) {
      const width = item.default_width_m == null ? "" : String(item.default_width_m) + "m";
      const height = item.default_height_m == null ? "" : String(item.default_height_m) + "m";
      const size = [width, height].filter(Boolean).join(" x ");
      const seats = item.default_seat_count == null ? "" : String(item.default_seat_count) + "\uC11D";
      return [size, seats].filter(Boolean).join(" / ") || "-";
    }

    function shapeLabel(shape) {
      return {
        rect: "\uC0AC\uAC01\uD615",
        circle: "\uC6D0\uD615",
        ellipse: "\uD0C0\uC6D0\uD615",
        line: "\uC120",
        area: "\uC601\uC5ED",
      }[shape] || shape || "-";
    }

    function renderObjectPreviewSvg(item) {
      const type = item.object_type || "object";
      const widthM = Math.max(0.1, Number(item.default_width_m || 1));
      const heightM = Math.max(0.1, Number(item.default_height_m || 1));
      const ratio = Math.max(0.2, Math.min(5, widthM / Math.max(0.1, heightM)));
      let drawWidth = ratio >= 1 ? 56 : Math.max(18, 56 * ratio);
      let drawHeight = ratio >= 1 ? Math.max(14, 38 / ratio) : 38;
      drawWidth = Math.min(64, Math.max(16, drawWidth));
      drawHeight = Math.min(44, Math.max(12, drawHeight));
      const previewObject = {
        objectType: type,
        displayShape: item.display_shape || getObjectDisplayShape(item),
        label: item.object_name || objectLabels[type] || type,
        seatCount: Number(item.default_seat_count || 0),
      };
      const symbol = createWorkspaceObjectShape(previewObject, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight, { showNames: true });
      symbol.setAttribute("transform", "translate(40 28)");
      const body = new XMLSerializer().serializeToString(symbol);
      const label = escapeAttribute(item.object_name || objectLabels[type] || type);
      return '<svg class="object-preview-svg" viewBox="0 0 80 56" role="img" aria-label="' + label + '">' + body + '</svg>';
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function escapeAttribute(value) {
      return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    }

    return {
      bindEvents,
      openEditor,
    };
  }

  window.BANQUET_ERP_FLOORPLAN_EDITOR = {
    createFloorplanEditor,
  };
})();

