/* Floorplan Editor V2, phase 1: real-world millimeter hall outlines. */
(function registerBaseFloorplanWizard() {
  const svgNs = "http://www.w3.org/2000/svg";
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  const directions = {
    right: { dx: 1, dy: 0 }, down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 }, up: { dx: 0, dy: -1 },
  };

  function samePoint(a, b) { return Boolean(a && b && a.x === b.x && a.y === b.y); }
  function toMillimeters(meters) {
    const value = Number(meters);
    return Number.isFinite(value) ? Math.round(value * 1000) : NaN;
  }
  function rectanglePoints(widthMm, heightMm) {
    const width = Math.round(Number(widthMm));
    const height = Math.round(Number(heightMm));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [{ x: 0, y: 0 }];
    return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }, { x: 0, y: 0 }];
  }
  function addWall(points, direction, lengthMm) {
    const vector = directions[direction];
    const length = Math.round(Number(lengthMm));
    const next = (points || []).map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    if (!vector || !Number.isFinite(length) || length <= 0 || isClosed(next)) return next;
    const last = next.at(-1) || { x: 0, y: 0 };
    next.push({ x: last.x + vector.dx * length, y: last.y + vector.dy * length });
    return next;
  }
  function isClosed(points) { return Array.isArray(points) && points.length >= 4 && samePoint(points[0], points.at(-1)); }
  function isAxisAligned(a, b) { return a.x === b.x || a.y === b.y; }
  function between(value, start, end) { return value >= Math.min(start, end) && value <= Math.max(start, end); }
  function segmentIntersection(a, b, c, d) {
    const abVertical = a.x === b.x;
    const cdVertical = c.x === d.x;
    if (!isAxisAligned(a, b) || !isAxisAligned(c, d)) return false;
    if (abVertical && cdVertical) {
      return a.x === c.x && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
    }
    if (!abVertical && !cdVertical) {
      return a.y === c.y && Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
    }
    const verticalStart = abVertical ? a : c;
    const verticalEnd = abVertical ? b : d;
    const horizontalStart = abVertical ? c : a;
    const horizontalEnd = abVertical ? d : b;
    return between(verticalStart.x, horizontalStart.x, horizontalEnd.x)
      && between(horizontalStart.y, verticalStart.y, verticalEnd.y);
  }
  function collinearOverlapLength(a, b, c, d) {
    if (a.x === b.x && c.x === d.x && a.x === c.x) {
      return Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
    }
    if (a.y === b.y && c.y === d.y && a.y === c.y) {
      return Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
    }
    return 0;
  }
  function hasSelfIntersection(points) {
    const segmentCount = Math.max(0, (points || []).length - 1);
    for (let left = 0; left < segmentCount; left += 1) {
      for (let right = left + 1; right < segmentCount; right += 1) {
        const adjacent = right === left + 1 || (left === 0 && right === segmentCount - 1 && isClosed(points));
        if (adjacent) {
          if (collinearOverlapLength(points[left], points[left + 1], points[right], points[right + 1]) > 0) return true;
          continue;
        }
        if (segmentIntersection(points[left], points[left + 1], points[right], points[right + 1])) return true;
      }
    }
    return false;
  }
  function boundsOf(points) {
    const usable = (points || []).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    if (!usable.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    const xs = usable.map((point) => point.x);
    const ys = usable.map((point) => point.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }
  function polygonArea(points) {
    if (!isClosed(points)) return 0;
    let twiceArea = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      twiceArea += points[index].x * points[index + 1].y - points[index + 1].x * points[index].y;
    }
    return Math.abs(twiceArea) / 2;
  }
  function validate(points) {
    if (!Array.isArray(points) || points.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) {
      return { valid: false, code: "invalid_coordinate", message: "좌표 값이 올바르지 않습니다." };
    }
    if (!isClosed(points)) return { valid: false, code: "open", message: "외곽선이 닫히지 않았습니다." };
    for (let index = 0; index < points.length - 1; index += 1) {
      if (samePoint(points[index], points[index + 1])) return { valid: false, code: "zero_length", message: "길이가 0인 벽이 있습니다." };
      if (!isAxisAligned(points[index], points[index + 1])) return { valid: false, code: "not_orthogonal", message: "모든 벽은 수평 또는 수직이어야 합니다." };
    }
    if (hasSelfIntersection(points)) return { valid: false, code: "self_intersection", message: "외곽선이 자기 자신과 교차하거나 겹칩니다." };
    const bounds = boundsOf(points);
    if (bounds.width <= 0 || bounds.height <= 0 || polygonArea(points) <= 0) {
      return { valid: false, code: "zero_area", message: "면적이 있는 외곽선을 만들어 주세요." };
    }
    return { valid: true, code: "valid", message: "외곽선이 정상적으로 닫혔습니다." };
  }
  function autoClose(points) {
    const source = (points || []).map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    if (isClosed(source) || source.length < 3 || hasSelfIntersection(source)) return source;
    const start = source[0]; const last = source.at(-1); const candidates = [];
    if (start.x === last.x || start.y === last.y) candidates.push([...source, { ...start }]);
    else {
      candidates.push([...source, { x: start.x, y: last.y }, { ...start }]);
      candidates.push([...source, { x: last.x, y: start.y }, { ...start }]);
    }
    return candidates.find((candidate) => validate(candidate).valid) || source;
  }
  function viewBoxFor(points, zoom = 1) {
    const bounds = boundsOf(points);
    const geometryWidth = Math.max(bounds.width, 1000);
    const geometryHeight = Math.max(bounds.height, 1000);
    const padding = Math.max(500, Math.max(geometryWidth, geometryHeight) * 0.12);
    const safeZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoom) || 1));
    const width = (geometryWidth + padding * 2) / safeZoom;
    const height = (geometryHeight + padding * 2) / safeZoom;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    return { x: centerX - width / 2, y: centerY - height / 2, width, height, zoom: safeZoom };
  }
  function isFloorplanEditingLocked(floorplan, lockChecked) {
    return Boolean(floorplan?.id && floorplan.is_locked && lockChecked);
  }

  function createController() {
    const byId = (id) => document.getElementById(id);
    const baseModeButton = byId("floorplanV2BaseModeButton");
    if (!baseModeButton) return null;
    const eventModeButton = byId("floorplanV2EventModeButton");
    const basePanel = byId("floorplanV2BasePanel"); const eventPanel = byId("floorplanV2EventPanel");
    const venueSelect = byId("floorplanV2VenueSelect"); const spaceSelect = byId("floorplanV2SpaceSelect");
    const savedSelect = byId("floorplanV2SavedSelect"); const wizard = byId("floorplanV2Wizard");
    const wizardTitle = byId("floorplanV2WizardTitle"); const empty = byId("floorplanV2Empty");
    const rectangleFields = byId("floorplanV2RectangleFields"); const polygonFields = byId("floorplanV2PolygonFields");
    const preview = byId("floorplanV2Preview"); const wallList = byId("floorplanV2WallList");
    const validation = byId("floorplanV2Validation"); const saveButton = byId("floorplanV2SaveButton");
    const lockedInput = byId("floorplanV2LockedInput"); const lockStatus = byId("floorplanV2LockStatus");
    const zoomStatus = byId("floorplanV2ZoomStatus"); const nameInput = byId("floorplanV2NameInput");
    const methodInputs = [...document.querySelectorAll('input[name="floorplanV2Method"]')];
    const geometryControls = [...methodInputs, byId("floorplanV2WidthInput"), byId("floorplanV2HeightInput"),
      byId("floorplanV2BuildRectangleButton"), byId("floorplanV2LengthInput"), byId("floorplanV2AddWallButton"),
      byId("floorplanV2AutoCloseButton"), byId("floorplanV2UndoWallButton"), byId("floorplanV2ResetButton"),
      ...byId("floorplanV2Directions").querySelectorAll("button")].filter(Boolean);
    const storage = window.BANQUET_ERP_STORAGE.createStorageService({ supabaseConfig: window.BANQUET_ERP_CONSTANTS.supabaseConfig });
    let venues = []; let spaces = []; let savedFloorplans = [];
    let currentFloorplan = null; let currentOutline = null;
    let points = [{ x: 0, y: 0 }]; let selectedDirection = "right"; let method = "rectangle"; let viewZoom = 1;
    let transientMessage = "";

    function setMode(nextMode) {
      const base = nextMode === "base";
      basePanel.hidden = !base; eventPanel.hidden = base;
      baseModeButton.classList.toggle("active", base); eventModeButton.classList.toggle("active", !base);
      baseModeButton.setAttribute("aria-selected", String(base)); eventModeButton.setAttribute("aria-selected", String(!base));
    }
    async function initialize() {
      bindEvents(); setMode("base");
      try {
        [venues, spaces] = await Promise.all([
          storage.supabaseRequest("venues?select=id,venue_name&is_active=eq.true&order=venue_name.asc"),
          storage.supabaseRequest("venue_spaces?select=id,space_name,floor&is_active=eq.true&order=space_name.asc"),
        ]);
        renderVenueOptions();
      } catch (error) { showMessage(error.message || "장소 정보를 불러오지 못했습니다.", "error"); }
      render();
    }
    function bindEvents() {
      baseModeButton.addEventListener("click", () => setMode("base")); eventModeButton.addEventListener("click", () => setMode("event"));
      byId("floorplanV2NewButton").addEventListener("click", openWizard); byId("floorplanV2CancelButton").addEventListener("click", closeWizard);
      byId("floorplanV2BuildRectangleButton").addEventListener("click", buildRectangle); byId("floorplanV2AddWallButton").addEventListener("click", addCurrentWall);
      byId("floorplanV2AutoCloseButton").addEventListener("click", closeOutlineAutomatically); byId("floorplanV2UndoWallButton").addEventListener("click", undoWall);
      byId("floorplanV2ResetButton").addEventListener("click", resetGeometry);
      byId("floorplanV2ZoomInButton").addEventListener("click", () => setZoom(viewZoom * 1.25));
      byId("floorplanV2ZoomOutButton").addEventListener("click", () => setZoom(viewZoom / 1.25));
      byId("floorplanV2FitButton").addEventListener("click", () => setZoom(1)); saveButton.addEventListener("click", save);
      venueSelect.addEventListener("change", handleVenueChange); spaceSelect.addEventListener("change", handleSpaceChange);
      savedSelect.addEventListener("change", loadSelected);
      nameInput.addEventListener("input", () => { transientMessage = ""; renderState(); });
      lockedInput.addEventListener("change", () => { transientMessage = ""; render(); });
      methodInputs.forEach((input) => input.addEventListener("change", (event) => { if (!isEditingLocked()) { method = event.target.value; resetGeometry(); } }));
      byId("floorplanV2Directions").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
        if (isEditingLocked()) return;
        selectedDirection = button.dataset.direction;
        byId("floorplanV2Directions").querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
      }));
    }
    function showMessage(message, type = "") {
      transientMessage = message; validation.textContent = message;
      validation.className = `floorplan-v2-validation${type ? ` ${type}` : ""}`;
    }
    function renderVenueOptions() {
      venueSelect.innerHTML = '<option value="">장소를 선택하세요</option>';
      venues.forEach((venue) => venueSelect.append(new Option(venue.venue_name, venue.id))); renderSpaceOptions();
    }
    function renderSpaceOptions() {
      const previousSpaceId = spaceSelect.value;
      spaceSelect.innerHTML = '<option value="">공간을 선택하세요</option>';
      spaces.forEach((space) => spaceSelect.append(new Option([space.space_name, space.floor].filter(Boolean).join(" / "), space.id)));
      if ([...spaceSelect.options].some((option) => option.value === previousSpaceId)) spaceSelect.value = previousSpaceId;
    }
    function handleVenueChange() {
      currentFloorplan = null; currentOutline = null; savedFloorplans = []; transientMessage = ""; renderSpaceOptions();
      savedSelect.innerHTML = '<option value="">저장된 기본 도면</option>'; renderState();
    }
    function handleSpaceChange() { currentFloorplan = null; currentOutline = null; transientMessage = ""; loadSaved(); renderState(); }
    function setMethod(nextMethod) {
      method = nextMethod === "orthogonal_polygon" ? "orthogonal_polygon" : "rectangle";
      methodInputs.forEach((input) => { input.checked = input.value === method; });
      rectangleFields.hidden = method !== "rectangle"; polygonFields.hidden = method !== "orthogonal_polygon";
    }
    function openWizard() {
      currentFloorplan = null; currentOutline = null; savedSelect.value = ""; nameInput.value = ""; lockedInput.checked = false;
      wizardTitle.textContent = "새 기본 도면"; setMethod("rectangle"); wizard.hidden = false; empty.hidden = true; resetGeometry(); nameInput.focus();
    }
    function closeWizard() { wizard.hidden = true; empty.hidden = false; transientMessage = ""; }
    function isEditingLocked() { return isFloorplanEditingLocked(currentFloorplan, lockedInput.checked); }
    function resetGeometry() {
      if (isEditingLocked()) return;
      points = [{ x: 0, y: 0 }]; viewZoom = 1; transientMessage = ""; render();
    }
    function buildRectangle() {
      if (isEditingLocked()) return;
      points = rectanglePoints(toMillimeters(byId("floorplanV2WidthInput").value), toMillimeters(byId("floorplanV2HeightInput").value));
      viewZoom = 1; transientMessage = ""; render();
    }
    function addCurrentWall() {
      if (isEditingLocked()) return;
      const lengthMm = toMillimeters(byId("floorplanV2LengthInput").value);
      if (!Number.isFinite(lengthMm) || lengthMm <= 0) { showMessage("0보다 큰 실제 벽 길이를 입력해 주세요.", "error"); return; }
      points = addWall(points, selectedDirection, lengthMm); viewZoom = 1; transientMessage = ""; render();
    }
    function closeOutlineAutomatically() {
      if (isEditingLocked()) return;
      const closed = autoClose(points);
      if (!isClosed(closed)) { showMessage("현재 외곽선은 교차 없이 자동 완성할 수 없습니다. 마지막 벽을 취소하고 다시 시도해 주세요.", "error"); return; }
      points = closed; viewZoom = 1; transientMessage = ""; render();
    }
    function undoWall() {
      if (isEditingLocked() || points.length <= 1) return;
      points = points.slice(0, -1); viewZoom = 1; transientMessage = ""; render();
    }
    function setZoom(nextZoom) { viewZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom) || 1)); renderPreview(); renderState(); }
    function render() { setMethod(method); renderPreview(); renderWalls(); renderState(); }
    function renderState() {
      const result = validate(points); const locked = isEditingLocked();
      geometryControls.forEach((control) => { control.disabled = locked; }); nameInput.disabled = locked;
      lockStatus.textContent = locked ? "잠김 · 잠금 해제 후 편집" : lockedInput.checked ? "저장 시 잠금" : "편집 가능";
      lockStatus.classList.toggle("locked", locked || lockedInput.checked);
      if (!transientMessage) {
        validation.textContent = locked ? "잠긴 기본 도면입니다. 편집하려면 잠금을 해제하세요." : result.message;
        validation.className = `floorplan-v2-validation${result.valid ? " success" : ""}${locked ? " locked" : ""}`;
      }
      saveButton.disabled = locked || !result.valid || !venueSelect.value || !spaceSelect.value || !nameInput.value.trim();
      byId("floorplanV2WallNumber").textContent = `현재 벽 ${Math.max(0, points.length - 1)}`;
      zoomStatus.textContent = viewZoom === 1 ? "자동 맞춤" : `${Math.round(viewZoom * 100)}%`;
    }
    function renderPreview() {
      preview.innerHTML = ""; const view = viewBoxFor(points, viewZoom);
      preview.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
      const polygon = document.createElementNS(svgNs, isClosed(points) ? "polygon" : "polyline");
      polygon.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" ")); polygon.setAttribute("class", "floorplan-v2-outline"); preview.append(polygon);
      const bounds = boundsOf(points); const labelSize = Math.min(600, Math.max(160, Math.max(bounds.width, bounds.height) * 0.035));
      points.slice(1).forEach((point, index) => {
        const start = points[index]; const text = document.createElementNS(svgNs, "text");
        text.setAttribute("x", String((start.x + point.x) / 2)); text.setAttribute("y", String((start.y + point.y) / 2 - labelSize * 0.45));
        text.setAttribute("style", `font-size:${labelSize}px`); text.setAttribute("class", "floorplan-v2-measure");
        text.textContent = `${(Math.hypot(point.x - start.x, point.y - start.y) / 1000).toFixed(1)}m`; preview.append(text);
      });
      points.forEach((point, index) => {
        const marker = document.createElementNS(svgNs, "circle"); marker.setAttribute("cx", String(point.x)); marker.setAttribute("cy", String(point.y));
        marker.setAttribute("r", String(Math.max(70, labelSize * 0.18))); marker.setAttribute("class", index === points.length - 1 ? "floorplan-v2-point current" : "floorplan-v2-point"); preview.append(marker);
      });
    }
    function renderWalls() {
      wallList.innerHTML = "";
      points.slice(1).forEach((point, index) => {
        const start = points[index]; const dx = point.x - start.x; const dy = point.y - start.y;
        const direction = dx > 0 ? "→" : dx < 0 ? "←" : dy > 0 ? "↓" : "↑"; const row = document.createElement("tr");
        row.innerHTML = `<td>${index + 1}</td><td>${direction}</td><td>${(Math.hypot(dx, dy) / 1000).toFixed(1)}m</td><td>(${(point.x / 1000).toFixed(1)}, ${(point.y / 1000).toFixed(1)})</td>`; wallList.append(row);
      });
    }
    async function loadSaved(preferredId = "") {
      const keepId = preferredId || savedSelect.value; savedSelect.innerHTML = '<option value="">저장된 기본 도면</option>';
      if (!venueSelect.value || !spaceSelect.value) return;
      try {
        savedFloorplans = await storage.supabaseRequest(`venue_floorplans?select=*&venue_id=eq.${encodeURIComponent(venueSelect.value)}&space_id=eq.${encodeURIComponent(spaceSelect.value)}&is_active=eq.true&order=updated_at.desc`);
        savedFloorplans.forEach((row) => savedSelect.append(new Option(`${row.floorplan_name}${row.is_locked ? " · 잠금" : ""}`, row.id)));
        if ([...savedSelect.options].some((option) => option.value === String(keepId))) savedSelect.value = String(keepId);
      } catch (error) { showMessage(error.message || "기본 도면을 불러오지 못했습니다.", "error"); }
    }
    function parseNotes(notes) {
      if (!notes) return {}; if (typeof notes === "object") return notes;
      try { return JSON.parse(notes); } catch { return {}; }
    }
    async function loadSelected() {
      const selected = savedFloorplans.find((row) => String(row.id) === savedSelect.value); if (!selected) return;
      try {
        const rows = await storage.supabaseRequest(`venue_floorplan_objects?select=*&floorplan_id=eq.${encodeURIComponent(selected.id)}&object_type=eq.hall_outline&is_active=eq.true&order=updated_at.desc&limit=1`);
        const outline = rows?.[0] || null; const storedPoints = outline?.metadata?.points;
        if (!Array.isArray(storedPoints) || !storedPoints.length) throw new Error("저장된 mm 외곽선 좌표가 없습니다.");
        const loadedPoints = storedPoints.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
        if (loadedPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error("저장된 외곽선 좌표가 올바르지 않습니다.");
        currentFloorplan = selected; currentOutline = outline; points = loadedPoints; nameInput.value = selected.floorplan_name || "";
        lockedInput.checked = Boolean(selected.is_locked); setMethod(outline?.metadata?.geometryType || parseNotes(selected.notes).geometry_type);
        wizardTitle.textContent = "기본 도면 확인 및 수정"; wizard.hidden = false; empty.hidden = true; viewZoom = 1; transientMessage = ""; render();
      } catch (error) { showMessage(error.message || "기본 도면을 불러오지 못했습니다.", "error"); }
    }
    async function save() {
      const result = validate(points); const floorplanName = nameInput.value.trim();
      if (!venueSelect.value || !spaceSelect.value || !floorplanName || !result.valid || isEditingLocked()) {
        showMessage("장소, 공간, 도면 이름과 닫힌 외곽선을 확인해 주세요.", "error"); return;
      }
      saveButton.disabled = true; showMessage("기본 도면을 저장하는 중입니다.");
      try {
        const bounds = boundsOf(points);
        const floorplanPayload = { file_id: currentFloorplan?.file_id || null, venue_id: venueSelect.value, space_id: spaceSelect.value,
          floorplan_name: floorplanName, actual_width: bounds.width / 1000, actual_height: bounds.height / 1000, unit: "m",
          is_locked: lockedInput.checked, notes: JSON.stringify({ geometry_version: 2, geometry_type: method, coordinate_unit: "mm", point_count: points.length }) };
        const floorplanRows = await storage.supabaseRequest(currentFloorplan?.id ? `venue_floorplans?id=eq.${encodeURIComponent(currentFloorplan.id)}&select=*` : "venue_floorplans?select=*", {
          method: currentFloorplan?.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(floorplanPayload),
        });
        const floorplan = floorplanRows?.[0]; if (!floorplan?.id) throw new Error("기본 도면 저장 결과를 확인하지 못했습니다.");
        const outlinePayload = { floorplan_id: floorplan.id, object_type: "hall_outline", label: floorplanName, x: 0, y: 0, width: 1, height: 1, rotation: 0,
          is_locked: lockedInput.checked, style: { stroke: "#0f2a43", fill: "rgba(212,175,55,0.12)", strokeWidthMm: 120 },
          metadata: { geometryVersion: 2, geometryType: method, unit: "mm", points: points.map((point) => ({ x: point.x, y: point.y })) }, sort_order: 0 };
        const outlineRows = await storage.supabaseRequest(currentOutline?.id ? `venue_floorplan_objects?id=eq.${encodeURIComponent(currentOutline.id)}&select=*` : "venue_floorplan_objects?select=*", {
          method: currentOutline?.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(outlinePayload),
        });
        currentFloorplan = floorplan; currentOutline = outlineRows?.[0] || currentOutline; wizardTitle.textContent = "기본 도면 확인 및 수정";
        transientMessage = ""; await loadSaved(floorplan.id);
        window.dispatchEvent(new CustomEvent("banquet:base-floorplan-saved", { detail: { floorplanId: floorplan.id } }));
        showMessage("기본 도면을 저장했습니다.", "success"); renderState();
      } catch (error) { showMessage(error.message || "기본 도면 저장에 실패했습니다. V2 migration 적용 여부를 확인해 주세요.", "error"); renderState(); }
    }
    return { initialize, setMode };
  }

  window.BANQUET_ERP_FLOORPLAN_V2_GEOMETRY = { rectanglePoints, addWall, isClosed, segmentIntersection, hasSelfIntersection, autoClose, boundsOf, polygonArea, validate, viewBoxFor, toMillimeters, isFloorplanEditingLocked };
  window.BANQUET_ERP_BASE_FLOORPLAN = { createController };
  const controller = createController(); controller?.initialize();
})();
