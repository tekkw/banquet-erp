/* Floorplan Editor V2, phase 1: real-world millimeter hall outlines. */
(function registerBaseFloorplanWizard() {
  const svgNs = "http://www.w3.org/2000/svg";
  const directions = {
    right: { dx: 1, dy: 0, label: "→" },
    down: { dx: 0, dy: 1, label: "↓" },
    left: { dx: -1, dy: 0, label: "←" },
    up: { dx: 0, dy: -1, label: "↑" },
  };

  function rectanglePoints(widthMm, heightMm) {
    return [
      { x: 0, y: 0 }, { x: widthMm, y: 0 },
      { x: widthMm, y: heightMm }, { x: 0, y: heightMm }, { x: 0, y: 0 },
    ];
  }

  function addWall(points, direction, lengthMm) {
    const vector = directions[direction];
    if (!vector || !Number.isFinite(lengthMm) || lengthMm <= 0) return points;
    const next = [...points];
    const last = next.at(-1) || { x: 0, y: 0 };
    next.push({ x: last.x + vector.dx * lengthMm, y: last.y + vector.dy * lengthMm });
    return next;
  }

  function isClosed(points) {
    if (points.length < 4) return false;
    const first = points[0];
    const last = points.at(-1);
    return first.x === last.x && first.y === last.y;
  }

  function segmentIntersection(a, b, c, d) {
    const abVertical = a.x === b.x;
    const cdVertical = c.x === d.x;
    if (abVertical && cdVertical) {
      if (a.x !== c.x) return false;
      return Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
    }
    if (!abVertical && !cdVertical) {
      if (a.y !== c.y) return false;
      return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
    }
    const verticalA = abVertical ? a : c;
    const verticalB = abVertical ? b : d;
    const horizontalA = abVertical ? c : a;
    const horizontalB = abVertical ? d : b;
    return verticalA.x >= Math.min(horizontalA.x, horizontalB.x)
      && verticalA.x <= Math.max(horizontalA.x, horizontalB.x)
      && horizontalA.y >= Math.min(verticalA.y, verticalB.y)
      && horizontalA.y <= Math.max(verticalA.y, verticalB.y);
  }

  function hasSelfIntersection(points) {
    const segmentCount = Math.max(0, points.length - 1);
    for (let left = 0; left < segmentCount; left += 1) {
      for (let right = left + 1; right < segmentCount; right += 1) {
        const adjacent = right === left + 1 || (left === 0 && right === segmentCount - 1 && isClosed(points));
        if (adjacent) continue;
        if (segmentIntersection(points[left], points[left + 1], points[right], points[right + 1])) return true;
      }
    }
    return false;
  }

  function boundsOf(points) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs, 0);
    const maxX = Math.max(...xs, 1000);
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys, 1000);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function autoClose(points) {
    if (isClosed(points)) return points;
    const last = points.at(-1) || { x: 0, y: 0 };
    const candidates = [];
    if (last.x === 0 || last.y === 0) {
      candidates.push([...points, { x: 0, y: 0 }]);
    } else {
      candidates.push([...points, { x: 0, y: last.y }, { x: 0, y: 0 }]);
      candidates.push([...points, { x: last.x, y: 0 }, { x: 0, y: 0 }]);
    }
    return candidates.find((candidate) => !hasSelfIntersection(candidate)) || points;
  }

  function validate(points) {
    if (!isClosed(points)) return { valid: false, message: "외곽선이 닫히지 않았습니다." };
    if (hasSelfIntersection(points)) return { valid: false, message: "외곽선이 자기 자신과 교차합니다." };
    const bounds = boundsOf(points);
    if (bounds.width <= 0 || bounds.height <= 0) return { valid: false, message: "가로와 세로 길이가 모두 필요합니다." };
    return { valid: true, message: "외곽선이 정상적으로 닫혔습니다." };
  }

  function createController() {
    const byId = (id) => document.getElementById(id);
    const baseModeButton = byId("floorplanV2BaseModeButton");
    if (!baseModeButton) return null;
    const eventModeButton = byId("floorplanV2EventModeButton");
    const basePanel = byId("floorplanV2BasePanel");
    const eventPanel = byId("floorplanV2EventPanel");
    const venueSelect = byId("floorplanV2VenueSelect");
    const spaceSelect = byId("floorplanV2SpaceSelect");
    const savedSelect = byId("floorplanV2SavedSelect");
    const wizard = byId("floorplanV2Wizard");
    const empty = byId("floorplanV2Empty");
    const rectangleFields = byId("floorplanV2RectangleFields");
    const polygonFields = byId("floorplanV2PolygonFields");
    const preview = byId("floorplanV2Preview");
    const wallList = byId("floorplanV2WallList");
    const validation = byId("floorplanV2Validation");
    const saveButton = byId("floorplanV2SaveButton");
    const lockedInput = byId("floorplanV2LockedInput");
    const storage = window.BANQUET_ERP_STORAGE.createStorageService({ supabaseConfig: window.BANQUET_ERP_CONSTANTS.supabaseConfig });
    let venues = [];
    let spaces = [];
    let savedFloorplans = [];
    let points = [{ x: 0, y: 0 }];
    let selectedDirection = "right";
    let method = "rectangle";

    function setMode(nextMode) {
      const base = nextMode === "base";
      basePanel.hidden = !base;
      eventPanel.hidden = base;
      baseModeButton.classList.toggle("active", base);
      eventModeButton.classList.toggle("active", !base);
      baseModeButton.setAttribute("aria-selected", String(base));
      eventModeButton.setAttribute("aria-selected", String(!base));
    }

    async function initialize() {
      bindEvents();
      setMode("base");
      try {
        [venues, spaces] = await Promise.all([
          storage.supabaseRequest("venues?select=id,venue_name&is_active=eq.true&order=venue_name.asc"),
          storage.supabaseRequest("venue_spaces?select=id,space_name,floor&is_active=eq.true&order=space_name.asc"),
        ]);
        renderVenueOptions();
      } catch (error) {
        validation.textContent = error.message || "장소 정보를 불러오지 못했습니다.";
        validation.className = "floorplan-v2-validation error";
      }
      render();
    }

    function bindEvents() {
      baseModeButton.addEventListener("click", () => setMode("base"));
      eventModeButton.addEventListener("click", () => setMode("event"));
      byId("floorplanV2NewButton").addEventListener("click", openWizard);
      byId("floorplanV2CancelButton").addEventListener("click", closeWizard);
      byId("floorplanV2BuildRectangleButton").addEventListener("click", buildRectangle);
      byId("floorplanV2AddWallButton").addEventListener("click", addCurrentWall);
      byId("floorplanV2AutoCloseButton").addEventListener("click", () => { points = autoClose(points); render(); });
      byId("floorplanV2UndoWallButton").addEventListener("click", () => { if (points.length > 1) points.pop(); render(); });
      byId("floorplanV2ResetButton").addEventListener("click", resetGeometry);
      saveButton.addEventListener("click", save);
      venueSelect.addEventListener("change", () => { renderSpaceOptions(); loadSaved(); });
      spaceSelect.addEventListener("change", loadSaved);
      savedSelect.addEventListener("change", loadSelected);
      document.querySelectorAll('input[name="floorplanV2Method"]').forEach((input) => input.addEventListener("change", (event) => {
        method = event.target.value;
        rectangleFields.hidden = method !== "rectangle";
        polygonFields.hidden = method !== "orthogonal_polygon";
        resetGeometry();
      }));
      byId("floorplanV2Directions").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
        selectedDirection = button.dataset.direction;
        byId("floorplanV2Directions").querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
      }));
    }

    function renderVenueOptions() {
      venueSelect.innerHTML = '<option value="">장소를 선택하세요</option>';
      venues.forEach((venue) => venueSelect.append(new Option(venue.venue_name, venue.id)));
      renderSpaceOptions();
    }

    function renderSpaceOptions() {
      spaceSelect.innerHTML = '<option value="">공간을 선택하세요</option>';
      spaces.forEach((space) => spaceSelect.append(new Option([space.space_name, space.floor].filter(Boolean).join(" / "), space.id)));
    }

    function openWizard() {
      wizard.hidden = false;
      empty.hidden = true;
      resetGeometry();
      byId("floorplanV2NameInput").focus();
    }

    function closeWizard() {
      wizard.hidden = true;
      empty.hidden = false;
    }

    function resetGeometry() {
      points = [{ x: 0, y: 0 }];
      render();
    }

    function buildRectangle() {
      const widthMm = Number(byId("floorplanV2WidthInput").value) * 1000;
      const heightMm = Number(byId("floorplanV2HeightInput").value) * 1000;
      points = widthMm > 0 && heightMm > 0 ? rectanglePoints(widthMm, heightMm) : [{ x: 0, y: 0 }];
      render();
    }

    function addCurrentWall() {
      const lengthMm = Number(byId("floorplanV2LengthInput").value) * 1000;
      points = addWall(points, selectedDirection, lengthMm);
      render();
    }

    function render() {
      renderPreview();
      renderWalls();
      const result = validate(points);
      validation.textContent = result.message;
      validation.className = `floorplan-v2-validation${result.valid ? " success" : ""}`;
      saveButton.disabled = !result.valid;
      byId("floorplanV2WallNumber").textContent = `현재 벽 ${points.length}`;
    }

    function renderPreview() {
      preview.innerHTML = "";
      const bounds = boundsOf(points);
      const padding = Math.max(1000, Math.max(bounds.width, bounds.height) * 0.12);
      preview.setAttribute("viewBox", `${bounds.minX - padding} ${bounds.minY - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`);
      const polygon = document.createElementNS(svgNs, isClosed(points) ? "polygon" : "polyline");
      polygon.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
      polygon.setAttribute("class", "floorplan-v2-outline");
      preview.append(polygon);
      points.slice(1).forEach((point, index) => {
        const start = points[index];
        const length = Math.hypot(point.x - start.x, point.y - start.y);
        const text = document.createElementNS(svgNs, "text");
        text.setAttribute("x", String((start.x + point.x) / 2));
        text.setAttribute("y", String((start.y + point.y) / 2 - 180));
        text.setAttribute("class", "floorplan-v2-measure");
        text.textContent = `${(length / 1000).toFixed(1)}m`;
        preview.append(text);
      });
    }

    function renderWalls() {
      wallList.innerHTML = "";
      points.slice(1).forEach((point, index) => {
        const start = points[index];
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        const direction = dx > 0 ? "→" : dx < 0 ? "←" : dy > 0 ? "↓" : "↑";
        const row = document.createElement("tr");
        row.innerHTML = `<td>${index + 1}</td><td>${direction}</td><td>${(Math.hypot(dx, dy) / 1000).toFixed(1)}m</td><td>${(point.x / 1000).toFixed(1)}, ${(point.y / 1000).toFixed(1)}</td>`;
        wallList.append(row);
      });
    }

    async function loadSaved() {
      savedSelect.innerHTML = '<option value="">저장된 기본 도면</option>';
      if (!spaceSelect.value) return;
      try {
        savedFloorplans = await storage.supabaseRequest(`venue_floorplans?select=*&space_id=eq.${encodeURIComponent(spaceSelect.value)}&is_active=eq.true&order=updated_at.desc`);
        savedFloorplans.forEach((row) => savedSelect.append(new Option(`${row.floorplan_name}${row.is_locked ? " · 잠금" : ""}`, row.id)));
      } catch (error) {
        validation.textContent = error.message || "기본 도면을 불러오지 못했습니다.";
      }
    }

    async function loadSelected() {
      const selected = savedFloorplans.find((row) => String(row.id) === savedSelect.value);
      if (!selected) return;
      const rows = await storage.supabaseRequest(`venue_floorplan_objects?select=*&floorplan_id=eq.${encodeURIComponent(selected.id)}&object_type=eq.hall_outline&is_active=eq.true&limit=1`);
      const storedPoints = rows?.[0]?.metadata?.points;
      if (Array.isArray(storedPoints) && storedPoints.length) points = storedPoints.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
      byId("floorplanV2NameInput").value = selected.floorplan_name || "";
      lockedInput.checked = Boolean(selected.is_locked);
      wizard.hidden = false;
      empty.hidden = true;
      render();
    }

    async function save() {
      const result = validate(points);
      const floorplanName = byId("floorplanV2NameInput").value.trim();
      if (!venueSelect.value || !spaceSelect.value || !floorplanName || !result.valid) {
        validation.textContent = "장소, 공간, 도면 이름과 닫힌 외곽선을 확인해 주세요.";
        validation.className = "floorplan-v2-validation error";
        return;
      }
      saveButton.disabled = true;
      validation.textContent = "기본 도면을 저장하는 중입니다.";
      try {
        const bounds = boundsOf(points);
        const floorplanRows = await storage.supabaseRequest("venue_floorplans?select=*", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({
            file_id: null,
            venue_id: venueSelect.value,
            space_id: spaceSelect.value,
            floorplan_name: floorplanName,
            actual_width: bounds.width / 1000,
            actual_height: bounds.height / 1000,
            unit: "m",
            is_locked: lockedInput.checked,
            notes: JSON.stringify({ geometry_version: 2, geometry_type: method, coordinate_unit: "mm" }),
          }),
        });
        const floorplan = floorplanRows?.[0];
        if (!floorplan?.id) throw new Error("기본 도면 저장 결과를 확인하지 못했습니다.");
        await storage.supabaseRequest("venue_floorplan_objects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            floorplan_id: floorplan.id,
            object_type: "hall_outline",
            label: floorplanName,
            x: 0, y: 0, width: 1, height: 1, rotation: 0,
            is_locked: lockedInput.checked,
            style: { stroke: "#0f2a43", fill: "rgba(212,175,55,0.12)", strokeWidthMm: 120 },
            metadata: { geometryType: method, unit: "mm", points: points.map((point) => ({ x: point.x, y: point.y })) },
            sort_order: 0,
          }),
        });
        validation.textContent = "기본 도면을 저장했습니다.";
        validation.className = "floorplan-v2-validation success";
        await loadSaved();
        savedSelect.value = floorplan.id;
      } catch (error) {
        validation.textContent = error.message || "기본 도면 저장에 실패했습니다. V2 migration 적용 여부를 확인해 주세요.";
        validation.className = "floorplan-v2-validation error";
      } finally {
        saveButton.disabled = !validate(points).valid;
      }
    }

    return { initialize, setMode };
  }

  window.BANQUET_ERP_FLOORPLAN_V2_GEOMETRY = { rectanglePoints, addWall, isClosed, hasSelfIntersection, autoClose, boundsOf, validate };
  window.BANQUET_ERP_BASE_FLOORPLAN = { createController };
  const controller = createController();
  controller?.initialize();
})();
