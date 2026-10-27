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
  function floorplanOutlineMetrics(points) {
    const validPoints = (Array.isArray(points) ? points : [])
      .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!validPoints.length) return { points: [], minX: 0, minY: 0, maxX: 0, maxY: 0, widthMm: 0, heightMm: 0, areaMm2: 0, signedAreaMm2: 0, segments: [] };
    const xs = validPoints.map((point) => point.x); const ys = validPoints.map((point) => point.y);
    const minX = Math.min(...xs); const minY = Math.min(...ys); const maxX = Math.max(...xs); const maxY = Math.max(...ys);
    let signedTwiceArea = 0;
    const segments = validPoints.slice(1).map((end, index) => {
      const start = validPoints[index];
      return { start, end, lengthMm: Math.hypot(end.x - start.x, end.y - start.y) };
    });
    segments.forEach(({ start, end }) => { signedTwiceArea += start.x * end.y - end.x * start.y; });
    return {
      points: validPoints, minX, minY, maxX, maxY, widthMm: maxX - minX, heightMm: maxY - minY,
      areaMm2: Math.abs(signedTwiceArea) / 2, signedAreaMm2: signedTwiceArea / 2, segments,
    };
  }

  function floorplanObjectWorkspaceCenter(row, workspaceSize, objectSize, offset = { x: 0, y: 0 }) {
    const hasXMm = Number.isFinite(Number(row?.metadata?.xMm));
    const hasYMm = Number.isFinite(Number(row?.metadata?.yMm));
    return {
      x: hasXMm ? Number(row.metadata.xMm) + Number(offset.x || 0) : Number(row?.x || 0) * workspaceSize.width + objectSize.width / 2,
      y: hasYMm ? Number(row.metadata.yMm) + Number(offset.y || 0) : Number(row?.y || 0) * workspaceSize.height + objectSize.height / 2,
    };
  }

  function floorplanObjectIntersectsBox(object, box, scale = 1000) {
    if (!object || !box) return false;
    const halfWidth = Math.max(0, Number(object.widthM || 0) * scale / 2);
    const halfHeight = Math.max(0, Number(object.heightM || 0) * scale / 2);
    return Number(object.x || 0) + halfWidth >= box.x
      && Number(object.x || 0) - halfWidth <= box.x + box.width
      && Number(object.y || 0) + halfHeight >= box.y
      && Number(object.y || 0) - halfHeight <= box.y + box.height;
  }

  function duplicateFloorplanObjects(objects, offset = 200, idFactory = () => crypto.randomUUID()) {
    const delta = typeof offset === "number" ? { x: offset, y: offset } : { x: Number(offset?.x || 0), y: Number(offset?.y || 0) };
    return (objects || []).map((object, index) => ({
      ...JSON.parse(JSON.stringify(object)),
      instanceId: idFactory(object, index),
      x: Number(object.x || 0) + delta.x,
      y: Number(object.y || 0) + delta.y,
      zIndex: Number(object.zIndex || 0) + index + 1,
    }));
  }

  function calculateWorkspaceWorldBounds(frameWidth, frameHeight, objects = [], margin = 0, scale = 1000) {
    const boxes = [{ left: 0, top: 0, right: Number(frameWidth || 0), bottom: Number(frameHeight || 0) }];
    objects.filter((object) => !object?.metadata?.compositeBaseChild).forEach((object) => {
      const width = Math.max(1, Number(object?.widthM || 0) * scale);
      const height = Math.max(1, Number(object?.heightM || 0) * scale);
      const radians = (((Number(object?.rotation || 0) % 360) + 360) % 360) * Math.PI / 180;
      const rotatedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
      const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
      boxes.push({ left: Number(object?.x || 0) - rotatedWidth / 2, right: Number(object?.x || 0) + rotatedWidth / 2, top: Number(object?.y || 0) - rotatedHeight / 2, bottom: Number(object?.y || 0) + rotatedHeight / 2 });
    });
    const minX = Math.min(...boxes.map((box) => box.left)) - margin;
    const minY = Math.min(...boxes.map((box) => box.top)) - margin;
    const maxX = Math.max(...boxes.map((box) => box.right)) + margin;
    const maxY = Math.max(...boxes.map((box) => box.bottom)) + margin;
    return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }

  function transformBasePlanPoint(group, point) {
    const rotation = Number(group?.metadata?.rotation ?? group?.rotation ?? 0);
    const radians = (((rotation % 360) + 360) % 360) * Math.PI / 180;
    const x = Number(point?.x || 0);
    const y = Number(point?.y || 0);
    return {
      x: x * Math.cos(radians) - y * Math.sin(radians) + Number(group?.metadata?.offsetX || 0),
      y: x * Math.sin(radians) + y * Math.cos(radians) + Number(group?.metadata?.offsetY || 0),
    };
  }

  const STRUCTURAL_OBJECT_TYPES = new Set(["door", "wall", "fixed_wall", "structure_area", "calibration", "pillar", "screen", "allowed_area", "blocked_area"]);

  function isFloorplanStructuralObject(object) {
    return STRUCTURAL_OBJECT_TYPES.has(object?.objectType || object?.object_type);
  }

  function cloneFloorplanObjectsForLayout(objects) {
    return (objects || []).map((source) => {
      const object = JSON.parse(JSON.stringify(source));
      const structural = isFloorplanStructuralObject(object);
      object.locked = structural;
      object.metadata = { ...(object.metadata || {}) };
      if (structural) object.metadata.baseFloorplanObject = true;
      else { delete object.metadata.baseFloorplanObject; object.metadata.layoutDraftFromBase = true; }
      return object;
    });
  }

  const LAYOUT_LIBRARY_GROUPS = ["컨벤션", "페스타", "부라노", "올리비아", "카프리", "기타"];

  function layoutLibraryGroupName(spaceName, venueName = "") {
    const name = `${spaceName || ""} ${venueName || ""}`.replace(/\s+/g, "").toLowerCase();
    return LAYOUT_LIBRARY_GROUPS.find((group) => group !== "기타" && name.includes(group.toLowerCase())) || "기타";
  }

  function normalizeLayoutAiContextName(value) {
    return String(value || "").toUpperCase().replace(/\s+|센터/g, "");
  }

  function layoutAiContextMatches(requested, currentNames = []) {
    const target = normalizeLayoutAiContextName(requested);
    return !target || currentNames.some((name) => {
      const current = normalizeLayoutAiContextName(name);
      return current && (current === target || current.endsWith(target) || target.endsWith(current));
    });
  }

  function venueFamilyName(value) {
    return normalizeLayoutAiContextName(value).replace(/[0-9+]+$/g, "");
  }

  function layoutLibraryObjectGeometry(row, width, height) {
    const metadata = row?.metadata || {};
    const objectWidth = Math.max(1, Number(metadata.widthMm) || Number(row?.width) * width || 1);
    const objectHeight = Math.max(1, Number(metadata.heightMm) || Number(row?.height) * height || 1);
    const x = Number.isFinite(Number(metadata.xMm)) ? Number(metadata.xMm) : Number(row?.x) * width + objectWidth / 2;
    const y = Number.isFinite(Number(metadata.yMm)) ? Number(metadata.yMm) : Number(row?.y) * height + objectHeight / 2;
    return { x, y, width: objectWidth, height: objectHeight };
  }

  function layoutLibraryViewBox(width, height, points = [], objects = []) {
    const bounds = [{ x: 0, y: 0 }, { x: width, y: height }];
    (points || []).forEach((point) => bounds.push({ x: Number(point.x) || 0, y: Number(point.y) || 0 }));
    (objects || []).forEach((row) => {
      if (row?.object_type === "hall_outline") return;
      const box = layoutLibraryObjectGeometry(row, width, height);
      bounds.push({ x: box.x - box.width / 2, y: box.y - box.height / 2 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    });
    const xs = bounds.map((point) => point.x); const ys = bounds.map((point) => point.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const padding = Math.max(250, Math.max(maxX - minX, maxY - minY) * 0.045);
    return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
  }

  function parseLayoutAiCommand(text, currentPlan = null) {
    const value = String(text || "").trim();
    const roundRequested = /(라운드|round)/i.test(value); const schoolRequested = /(스쿨|세미나|class|school)/i.test(value);
    if (/(u[- ]?shape|u자|ㅁ[- ]?shape|ㅁ자|t[- ]?shape|t자)/i.test(value) && !schoolRequested) return { unsupportedType: true };
    const grid = value.match(/(\d+)\s*(?:x|×)\s*(\d+)|(\d+)\s*열\s*(\d+)\s*(?:줄|행)/i); const seats = value.match(/(\d+)\s*석\s*씩|테이블(?:당|마다)?\s*(\d+)\s*석/i);
    const people = value.match(/(\d+)\s*명/i); const targetSeats = value.match(/(\d+)\s*석(?!\s*씩)/i); const tables = value.match(/(?:테이블\s*)?(\d+)\s*(?:개|T\b)|테이블\s*(\d+)/i); const hGap = value.match(/가로\s*간격\s*(\d+)\s*mm/i); const vGap = value.match(/(?:줄|세로)\s*간격\s*(\d+)\s*mm/i);
    const tableSpec = value.match(/(?:세미나\s*테이블|테이블)?\s*(1600|1800)(?:\s*mm)?/i);
    const aisle = value.match(/(왼쪽|오른쪽|중앙)\s*통로\s*(\d+)\s*mm/i); const shift = value.match(/전체(?:를)?\s*(뒤|앞|오른쪽|왼쪽)(?:으?로)?\s*(\d+)\s*mm\s*옮겨/i);
    const layoutType = roundRequested ? "round" : schoolRequested ? "school" : currentPlan?.layoutType || "school";
    const plan = { ...(currentPlan || {}), layoutType, orientation: "screen-facing", aisle: { center: 0, left: 0, right: 0, ...(currentPlan?.aisle || {}) } };
    if (grid) { plan.columns = Number(grid[1] || grid[3]); plan.rows = Number(grid[2] || grid[4]); } if (seats) { plan.seatsPerTable = Number(seats[1] || seats[2]); plan.explicitSeats = true; }
    if (people || targetSeats) { plan.targetPeople = Number(people?.[1] || targetSeats?.[1]); plan.capacityMode = people && /들어가|수용|이상/.test(value) ? "at-least" : "exact"; } if (tables) plan.requestedTableCount = Number(tables[1] || tables[2]);
    if (tableSpec) plan.tableWidthMm = Number(tableSpec[1]);
    if (hGap) { plan.horizontalGapMm = Number(hGap[1]); plan.explicitHorizontalGap = true; } if (vGap) { plan.verticalGapMm = Number(vGap[1]); plan.explicitVerticalGap = true; }
    if (aisle) plan.aisle[({ "왼쪽": "left", "오른쪽": "right", "중앙": "center" })[aisle[1]]] = Number(aisle[2]);
    if (/앞(?:줄|행)\s*(?:하나|한\s*줄)?\s*빼/i.test(value)) plan.rows = Math.max(1, Number(plan.rows || 1) - 1);
    if (/(?:마지막|맨\s*뒤)(?:줄|행)\s*(?:하나|한\s*줄)?\s*빼/i.test(value)) plan.rows = Math.max(1, Number(plan.rows || 1) - 1);
    if (shift) plan.shift = { x: /오른쪽/.test(shift[1]) ? Number(shift[2]) : /왼쪽/.test(shift[1]) ? -Number(shift[2]) : 0, y: /뒤/.test(shift[1]) ? Number(shift[2]) : /앞/.test(shift[1]) ? -Number(shift[2]) : 0 };
    if (/오른쪽\s*통로.*더\s*넓혀/i.test(value) && aisle) plan.shift = { x: -Number(aisle[2]), y: 0 };
    if (layoutType === "round") {
      plan.seatsPerTable ||= currentPlan?.seatsPerTable || (/(뷔페|연회)/.test(value) ? 10 : 8);
      const gridCount = Number(plan.columns || 0) * Number(plan.rows || 0);
      if (plan.requestedTableCount && gridCount && plan.requestedTableCount !== gridCount) return { plan, needsConfirmation: true, confirmationMessage: `${plan.requestedTableCount}T와 ${plan.columns}x${plan.rows} 조건이 일치하지 않습니다.` };
      plan.roundTables = plan.requestedTableCount || gridCount; plan.tableCount = plan.roundTables; plan.totalSeats = plan.tableCount * plan.seatsPerTable;
      return { plan, isModification: Boolean(currentPlan), understood: Boolean(plan.columns && plan.rows && plan.tableCount) };
    }
    plan.horizontalGapMm ??= 400; plan.verticalGapMm ??= 700;
    plan.columns ||= currentPlan?.columns || (plan.targetPeople ? 3 : plan.requestedTableCount ? Math.ceil(Math.sqrt(plan.requestedTableCount)) : null); plan.seatsPerTable ||= currentPlan?.seatsPerTable || 2;
    plan.rows ||= currentPlan?.rows || (plan.targetPeople ? Math.ceil(plan.targetPeople / (plan.columns * plan.seatsPerTable)) : plan.requestedTableCount ? Math.ceil(plan.requestedTableCount / plan.columns) : null);
    plan.tableCount = plan.requestedTableCount || Number(plan.columns || 0) * Number(plan.rows || 0); plan.totalSeats = plan.tableCount * plan.seatsPerTable;
    return { plan, isModification: Boolean(currentPlan), understood: Boolean(plan.columns && plan.rows) };
  }

  function layoutAiUnitToMm(value, unit = "mm") {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    return Math.round(amount * ({ mm: 1, cm: 10, m: 1000 }[String(unit).toLowerCase()] || 1));
  }

  function parseLayoutAiEditCommand(text, currentPlan = null) {
    const value = String(text || "").trim();
    if (!value) return null;
    if (/(?:이 상태 )?저장(?:하자|해|해주세요|해줘)?$/.test(value)) return { type: "save" };
    if (/(?:이거|이 배치|이 레이아웃).*(?:실제로 썼어|괜찮았어|사용했어)/.test(value)) return { type: "verify" };
    if (/(?:방금 (?:수정 )?취소|되돌리기|실행 취소)/.test(value)) return { type: "undo" };
    if (/(?:다시 만들어|다시 생성)/.test(value)) return { type: "regenerate" };
    if (/(?:조금|좀)\s*(?:더\s*)?(?:넓혀|벌려)/.test(value)) return { type: "gap-both", amount: 100 };
    const movement = value.match(/(오른쪽|왼쪽|위|아래)(?:으?로)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?(?:\s*(?:옮겨|이동))?/i);
    if (movement) {
      const amount = layoutAiUnitToMm(movement[2], movement[3] || "mm");
      return { type: "move", dx: movement[1] === "오른쪽" ? amount : movement[1] === "왼쪽" ? -amount : 0, dy: movement[1] === "아래" ? amount : movement[1] === "위" ? -amount : 0, amount, direction: movement[1] };
    }
    const gap = value.match(/(앞뒤|세로|좌우|가로)\s*간격(?:을)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(더|늘려|벌려|줄여|좁혀)/i);
    if (gap) {
      const amount = layoutAiUnitToMm(gap[2], gap[3] || "mm") * (/줄여|좁혀/.test(gap[4]) ? -1 : 1);
      return { type: "gap", axis: /앞뒤|세로/.test(gap[1]) ? "vertical" : "horizontal", amount };
    }
    if (/(?:첫|앞|맨 앞)\s*(?:줄|행)(?:을)?\s*(?:하나\s*)?(?:빼|제거)/.test(value)) return { type: "remove-row", edge: "first" };
    if (/(?:마지막|맨 뒤)\s*(?:줄|행)(?:을)?\s*(?:하나\s*)?(?:빼|제거)/.test(value)) return { type: "remove-row", edge: "last" };
    const grid = value.match(/(\d+)\s*(?:x|×)\s*(\d+)\s*(?:으로)?\s*(?:바꿔|변경)/i);
    if (grid) return { type: "grid", columns: Number(grid[1]), rows: Number(grid[2]) };
    const seats = value.match(/(\d+)\s*석씩(?:으로)?\s*(?:바꿔|변경)/i);
    if (seats) return { type: "seats", seatsPerTable: Number(seats[1]) };
    if (/의자(?:를)?\s*(?:하나|1개?)씩\s*더/.test(value)) return { type: "seats", seatsPerTable: Number(currentPlan?.seatsPerTable || 0) + 1 };
    return null;
  }

  function frontDirection(room, objects = []) {
    const candidates = (objects || []).filter((object) => object?.objectType === "screen");
    const references = candidates.length ? candidates : (objects || []).filter((object) => object?.metadata?.frontReference === true || object?.objectType === "front_reference" || object?.objectType === "stage");
    const reference = references[0];
    if (!reference) return "top";
    const x = Number(reference.x || 0); const y = Number(reference.y || 0); const width = Number(room?.widthMm || 0); const height = Number(room?.heightMm || 0);
    const distances = { top: y, bottom: height - y, left: x, right: width - x };
    return Object.keys(distances).reduce((closest, direction) => distances[direction] < distances[closest] ? direction : closest, "top");
  }

  function chairFacingDirection(direction) {
    return ({ top: 0, right: 90, bottom: 180, left: 270 })[direction] ?? 0;
  }

  const ADJUSTABLE_ROUND_SEAT_TEMPLATES = Object.freeze({
    5: [90, 135, 180, 225, 270],
    6: [45, 90, 135, 225, 270, 315],
    7: [45, 90, 135, 180, 225, 270, 315],
  });
  const ROUND_SEAT_TEMPLATES = Object.freeze({
    ...ADJUSTABLE_ROUND_SEAT_TEMPLATES,
    8: [30, 60, 120, 150, 210, 240, 300, 330],
    9: [30, 60, 120, 150, 180, 210, 240, 300, 330],
    10: [0, 30, 60, 120, 150, 180, 210, 240, 300, 330],
  });

  function getRoundSeatAngles(seatCount, front = "top") {
    const template = ROUND_SEAT_TEMPLATES[Number(seatCount)];
    if (!template) return [];
    const rotation = chairFacingDirection(front);
    return template.map((angle) => (angle + rotation) % 360);
  }

  function generateSchoolLayout(plan, room, masters, sessionId = "layout_ai") {
    const table = masters.table; const chair = masters.chair; const columns = Number(plan.columns); const rows = Number(plan.rows); const tableWidth = Number(table.widthMm); const tableHeight = Number(table.heightMm); const chairWidth = Number(chair.widthMm); const chairHeight = Number(chair.heightMm);
    const direction = room.frontDirection || frontDirection(room, room.frontObjects || []); const horizontalFront = direction === "left" || direction === "right"; const awaySign = direction === "top" || direction === "left" ? 1 : -1;
    const groupWidth = columns * tableWidth + (columns - 1) * Number(plan.horizontalGapMm || 0) + Number(plan.aisle?.center || 0); const rowPitch = tableHeight + Number(plan.verticalGapMm || 0);
    const transverseSize = horizontalFront ? room.heightMm : room.widthMm; const near = Number(plan.leftMarginMm ?? room.paddingMm ?? 800) + Number(plan.aisle?.left || 0); const far = transverseSize - Number(plan.rightMarginMm ?? room.paddingMm ?? 800) - Number(plan.aisle?.right || 0);
    const startTransverse = (near + far - groupWidth) / 2 + tableWidth / 2; const clearance = Number(plan.frontOffsetMm ?? room.frontClearanceMm ?? 1200); const frontSize = horizontalFront ? room.widthMm : room.heightMm;
    const startDepth = direction === "top" || direction === "left" ? clearance + tableHeight / 2 : frontSize - clearance - tableHeight / 2; const objects = []; let z = Number(room.baseZIndex || 0);
    let tableIndex = 0; for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      if (tableIndex >= Number(plan.tableCount)) continue; tableIndex += 1;
      const transverse = startTransverse + column * (tableWidth + Number(plan.horizontalGapMm || 0)) + (plan.aisle?.center && column >= Math.ceil(columns / 2) ? Number(plan.aisle.center) : 0); const depth = startDepth + awaySign * row * rowPitch;
      const x = (horizontalFront ? depth : transverse) + Number(plan.shift?.x || 0); const y = (horizontalFront ? transverse : depth) + Number(plan.shift?.y || 0); const metadata = { generatedBy: "layout_ai", generationSessionId: sessionId, row: row + 1, column: column + 1, frontDirection: direction };
      objects.push({ instanceId: `${sessionId}_table_${row}_${column}`, masterObjectId: table.id || "", objectType: "seminar_table", label: `세미나 테이블 ${row + 1}-${column + 1}`, displayShape: table.displayShape || "rect", x, y, widthM: tableWidth / 1000, heightM: tableHeight / 1000, rotation: horizontalFront ? 90 : 0, seatCount: 0, zIndex: ++z, locked: false, metadata });
      const count = Number(plan.seatsPerTable || 2); const gap = count > 1 ? Math.min(150, Math.max(40, (tableWidth - count * chairWidth) / (count - 1))) : 0; const width = count * chairWidth + (count - 1) * gap;
      for (let seat = 0; seat < count; seat += 1) {
        const seatTransverse = transverse - width / 2 + chairWidth / 2 + seat * (chairWidth + gap); const seatDepth = depth + awaySign * (tableHeight / 2 + chairHeight / 2 + 120);
        objects.push({ instanceId: `${sessionId}_chair_${row}_${column}_${seat}`, masterObjectId: chair.id || "", objectType: "chair", label: `의자 ${row + 1}-${column + 1}-${seat + 1}`, displayShape: chair.displayShape || "rect", x: (horizontalFront ? seatDepth : seatTransverse) + Number(plan.shift?.x || 0), y: (horizontalFront ? seatTransverse : seatDepth) + Number(plan.shift?.y || 0), widthM: chairWidth / 1000, heightM: chairHeight / 1000, rotation: chairFacingDirection(direction), seatCount: 1, zIndex: ++z, locked: false, metadata: { ...metadata, seat: seat + 1 } });
      }
    }
    return objects;
  }

  function generateRoundLayout(plan, room, masters, sessionId = "layout_ai") {
    const table = masters.roundTable; const chair = masters.chair;
    const columns = Number(plan.columns); const rows = Number(plan.rows); const tableCount = Number(plan.roundTables || plan.tableCount);
    const tableWidth = Number(table.widthMm); const tableHeight = Number(table.heightMm); const chairWidth = Number(chair.widthMm); const chairHeight = Number(chair.heightMm);
    const direction = room.frontDirection || frontDirection(room, room.frontObjects || []); const angles = getRoundSeatAngles(plan.seatsPerTable, direction);
    const horizontalGap = Number(plan.horizontalGapMm ?? 1200); const verticalGap = Number(plan.verticalGapMm ?? 1200);
    const groupWidth = columns * tableWidth + Math.max(0, columns - 1) * horizontalGap; const groupHeight = rows * tableHeight + Math.max(0, rows - 1) * verticalGap;
    const area = room.usableArea || { left: Number(room.paddingMm || 800), top: Number(room.paddingMm || 800), right: room.widthMm - Number(room.paddingMm || 800), bottom: room.heightMm - Number(room.paddingMm || 800) };
    const startX = (area.left + area.right - groupWidth) / 2 + tableWidth / 2; const startY = (area.top + area.bottom - groupHeight) / 2 + tableHeight / 2;
    const radiusX = tableWidth / 2 + chairWidth / 2 + 150; const radiusY = tableHeight / 2 + chairHeight / 2 + 150; const objects = []; let z = Number(room.baseZIndex || 0); let tableIndex = 0;
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      if (tableIndex >= tableCount) continue; tableIndex += 1;
      const x = startX + column * (tableWidth + horizontalGap); const y = startY + row * (tableHeight + verticalGap);
      const metadata = { generatedBy: "layout_ai", generationSessionId: sessionId, row: row + 1, column: column + 1, frontDirection: direction };
      objects.push({ instanceId: `${sessionId}_round_${row}_${column}`, masterObjectId: table.id || "", objectType: "round_table", label: `라운드 테이블 ${row + 1}-${column + 1}`, displayShape: table.displayShape || "circle", x, y, widthM: tableWidth / 1000, heightM: tableHeight / 1000, rotation: 0, seatCount: 0, zIndex: ++z, locked: false, metadata });
      angles.forEach((angle, seat) => {
        const radians = angle * Math.PI / 180;
        objects.push({ instanceId: `${sessionId}_chair_${row}_${column}_${seat}`, masterObjectId: chair.id || "", objectType: "chair", label: `의자 ${row + 1}-${column + 1}-${seat + 1}`, displayShape: chair.displayShape || "rect", x: x + Math.sin(radians) * radiusX, y: y - Math.cos(radians) * radiusY, widthM: chairWidth / 1000, heightM: chairHeight / 1000, rotation: (angle + 180) % 360, seatCount: 1, zIndex: ++z, locked: false, metadata: { ...metadata, seat: seat + 1, seatAngle: angle } });
      });
    }
    return objects;
  }

  function median(values) {
    const sorted = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function schoolSpacingObjectGeometry(object, room = {}) {
    const metadata = object?.metadata || {}; const widthMm = Number(metadata.widthMm) || Number(object?.widthM) * 1000 || Number(object?.width) * Number(room.widthMm || 0); const heightMm = Number(metadata.heightMm) || Number(object?.heightM) * 1000 || Number(object?.height) * Number(room.heightMm || 0);
    const workspaceObject = object?.objectType !== undefined;
    const normalizedRow = !workspaceObject && Number(object?.width) <= 1 && Number(room.widthMm) > 0;
    const x = workspaceObject ? Number(object.x) : normalizedRow ? Number(object.x || 0) * room.widthMm + widthMm / 2 : Number(metadata.xMm);
    const y = workspaceObject ? Number(object.y) : normalizedRow ? Number(object.y || 0) * room.heightMm + heightMm / 2 : Number(metadata.yMm);
    return { x, y, widthMm, heightMm };
  }

  function clusterByAxis(items, axis, tolerance) {
    const groups = [];
    [...items].sort((a, b) => a[axis] - b[axis]).forEach((item) => {
      const group = groups.find((candidate) => Math.abs(median(candidate.map((row) => row[axis])) - item[axis]) <= tolerance);
      if (group) group.push(item); else groups.push([item]);
    });
    return groups;
  }

  function calculateSchoolSpacingProfile(objects, room = {}, options = {}) {
    const allObjects = objects || []; const tableRows = allObjects.filter((object) => (object.objectType || object.object_type) === "seminar_table");
    const allGeometries = tableRows.map((object) => ({ object, ...schoolSpacingObjectGeometry(object, room) })).filter((item) => [item.x, item.y, item.widthMm, item.heightMm].every(Number.isFinite));
    const matchingSpec = allGeometries.filter((item) => (!options.tableWidthMm || Math.abs(item.widthMm - options.tableWidthMm) <= 50) && (!options.tableDepthMm || Math.abs(item.heightMm - options.tableDepthMm) <= 50));
    const geometries = matchingSpec.length ? matchingSpec : allGeometries;
    if (!geometries.length) return null;
    const tableWidthMm = median(geometries.map((item) => item.widthMm)); const tableDepthMm = median(geometries.map((item) => item.heightMm)); const tolerance = Number(options.toleranceMm || Math.max(180, Math.min(tableWidthMm, tableDepthMm) * 0.6));
    const rowGroups = clusterByAxis(geometries, "y", tolerance); const columnGroups = clusterByAxis(geometries, "x", tolerance);
    const columnPitches = rowGroups.flatMap((group) => group.sort((a, b) => a.x - b.x).slice(1).map((item, index) => item.x - group[index].x));
    const rowPitches = columnGroups.flatMap((group) => group.sort((a, b) => a.y - b.y).slice(1).map((item, index) => item.y - group[index].y));
    const columnPitch = median(columnPitches); const rowPitch = median(rowPitches); const left = Math.min(...geometries.map((item) => item.x - item.widthMm / 2)); const right = Math.max(...geometries.map((item) => item.x + item.widthMm / 2)); const top = Math.min(...geometries.map((item) => item.y - item.heightMm / 2)); const bottom = Math.max(...geometries.map((item) => item.y + item.heightMm / 2));
    const direction = room.frontDirection || "top"; const frontOffset = ({ top, bottom: Number(room.heightMm || 0) - bottom, left, right: Number(room.widthMm || 0) - right })[direction];
    const chairCounts = new Map(); allObjects.filter((object) => (object.objectType || object.object_type) === "chair").forEach((chair) => { const key = `${chair.metadata?.row || ""}:${chair.metadata?.column || ""}`; chairCounts.set(key, (chairCounts.get(key) || 0) + 1); });
    return { tableWidthMm, tableDepthMm, columnPitch, horizontalGapMm: columnPitch == null ? null : columnPitch - tableWidthMm, rowPitch, verticalGapMm: rowPitch == null ? null : rowPitch - tableDepthMm, frontOffsetMm: Number.isFinite(frontOffset) ? frontOffset : null, leftMarginMm: left, rightMarginMm: Number(room.widthMm || 0) ? room.widthMm - right : null, seatsPerTable: Number(options.seatsPerTable) || median([...chairCounts.values()]) };
  }

  function mergeSchoolSpacingProfiles(profiles) {
    const rows = (profiles || []).filter(Boolean); if (!rows.length) return null;
    const keys = ["tableWidthMm", "tableDepthMm", "columnPitch", "horizontalGapMm", "rowPitch", "verticalGapMm", "frontOffsetMm", "leftMarginMm", "rightMarginMm", "seatsPerTable"];
    return Object.fromEntries(keys.map((key) => [key, median(rows.map((row) => row[key]))]));
  }

  function applySchoolSpacingProfile(plan, profile) {
    if (!profile) return plan;
    const next = { ...plan, spacingProfile: profile };
    if (!plan.explicitHorizontalGap && profile.horizontalGapMm != null) next.horizontalGapMm = profile.horizontalGapMm;
    if (!plan.explicitVerticalGap && profile.verticalGapMm != null) next.verticalGapMm = profile.verticalGapMm;
    if (!plan.explicitSeats && profile.seatsPerTable) next.seatsPerTable = profile.seatsPerTable;
    if (profile.frontOffsetMm != null) next.frontOffsetMm = profile.frontOffsetMm;
    if (profile.leftMarginMm != null) next.leftMarginMm = profile.leftMarginMm;
    if (profile.rightMarginMm != null) next.rightMarginMm = profile.rightMarginMm;
    next.totalSeats = Number(next.tableCount || 0) * Number(next.seatsPerTable || 0);
    return next;
  }

  function selectSchoolAnchorPair(anchors, targetCapacity) {
    const rows = (anchors || []).filter((row) => Number(row.capacity) > 0).sort((a, b) => Number(a.capacity) - Number(b.capacity));
    if (!rows.length) return { lower: null, upper: null };
    const lowerRows = rows.filter((row) => Number(row.capacity) <= targetCapacity); const upperRows = rows.filter((row) => Number(row.capacity) >= targetCapacity);
    const preferVerified = (items, edge) => { const verified = items.filter((row) => row.verified); const source = verified.length ? verified : items; return edge === "lower" ? source.at(-1) : source[0]; };
    return { lower: preferVerified(lowerRows, "lower") || null, upper: preferVerified(upperRows, "upper") || null };
  }

  function resolveSchoolTargetPlan(plan, anchors = []) {
    const target = Number(plan?.targetPeople || 0); if (!target) return plan;
    const pair = selectSchoolAnchorPair(anchors, target); const references = [pair.lower, pair.upper].filter(Boolean);
    const nearest = [...references].sort((a, b) => Number(Boolean(b.verified)) - Number(Boolean(a.verified)) || Math.abs(Number(a.capacity) - target) - Math.abs(Number(b.capacity) - target))[0] || null;
    const preferredColumns = [...new Set([nearest?.columns, ...references.map((row) => row.columns), 3].map(Number).filter((value) => value > 0))];
    const preferredSeats = [...new Set([...references.map((row) => row.seatsPerTable), 2, 3].map(Number).filter((value) => value > 0))];
    const candidates = [];
    preferredSeats.forEach((seatsPerTable) => preferredColumns.forEach((columns) => {
      const tableCount = Math.ceil(target / seatsPerTable); const rows = Math.ceil(tableCount / columns); const capacity = tableCount * seatsPerTable; const overshoot = capacity - target;
      const exactPenalty = plan.capacityMode === "exact" && overshoot ? 10000 + overshoot * 100 : overshoot * 100;
      const conventionPenalty = Math.abs(columns - Number(nearest?.columns || columns)) * 10 + (references.some((row) => Number(row.seatsPerTable) === seatsPerTable) ? 0 : 5);
      candidates.push({ columns, rows, seatsPerTable, tableCount, totalSeats: capacity, score: exactPenalty + conventionPenalty + rows });
    }));
    const chosen = candidates.sort((a, b) => a.score - b.score)[0];
    return { ...plan, ...chosen, requestedTableCount: chosen.tableCount, explicitSeats: true, anchorPair: { lowerId: pair.lower?.id || null, upperId: pair.upper?.id || null }, generationStatus: "generated" };
  }

  function validateGeneratedLayout(objects, room, fixedObjects = [], plan = {}) {
    const generated = objects.filter((object) => object.metadata?.generatedBy === "layout_ai"); const errors = []; const warnings = []; const box = (object) => ({ left: object.x - object.widthM * 500, right: object.x + object.widthM * 500, top: object.y - object.heightM * 500, bottom: object.y + object.heightM * 500 }); const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    generated.forEach((object) => { const bounds = box(object); if (bounds.left < 0 || bounds.top < 0 || bounds.right > room.widthMm || bounds.bottom > room.heightMm) errors.push(`${object.label}: room boundary 밖`); fixedObjects.forEach((fixed) => { if (overlaps(bounds, box(fixed))) (fixed.objectType === "door" ? warnings : errors).push(`${object.label}: ${fixed.label || fixed.objectType} 충돌`); }); });
    const tables = generated.filter((object) => ["seminar_table", "round_table"].includes(object.objectType)); const chairs = generated.filter((object) => object.objectType === "chair"); for (let i = 0; i < tables.length; i += 1) for (let j = i + 1; j < tables.length; j += 1) if (overlaps(box(tables[i]), box(tables[j]))) errors.push("테이블 간 겹침");
    chairs.forEach((chair) => tables.forEach((table) => { if ((chair.metadata?.row !== table.metadata?.row || chair.metadata?.column !== table.metadata?.column) && overlaps(box(chair), box(table))) errors.push(`${chair.label}: 다른 테이블과 비정상 겹침`); }));
    if (tables.length !== Number(plan.tableCount)) errors.push("테이블 수 불일치"); if (chairs.length !== Number(plan.totalSeats)) errors.push("의자 수 불일치");
    return { valid: errors.length === 0, warnings: [...new Set(warnings)], errors: [...new Set(errors)], counts: { tables: tables.length, chairs: chairs.length } };
  }

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
      workspaceImportBaseButton,
      workspaceImportBaseModal,
      workspaceImportBaseSelect,
      workspaceImportBaseConfirmButton,
      workspaceImportBaseCancelButton,
      workspaceCompositeAlignButtons,
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
    const fixedObjectTypes = STRUCTURAL_OBJECT_TYPES;
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
    let libraryFilter = "all"; let libraryGroupFilter = ""; let librarySpaceFilter = "all"; let libraryObjectsByLayout = new Map(); let libraryFloorplanObjects = new Map(); let libraryModalMode = "save"; let libraryModalForceNew = false; let pendingLayoutInfo = null;
    let allLibraryLayouts = []; let allLibraryFloorplans = new Map(); let allLibraryVenues = new Map(); let allLibrarySpaces = new Map(); let allLibraryPreviewFiles = new Map(); let libraryLoading = false; let libraryPreviewLayout = null;
    function isWorkspaceBaseObject(object) {
      return Boolean(object?.metadata?.baseFloorplanObject) || fixedObjectTypes.has(object?.objectType);
    }

    function isWorkspaceFixedMaster(master) {
      return fixedObjectTypes.has(master?.object_type) || /고정/.test(String(master?.category || ""));
    }
    const defaultObjectTypes = [
      { object_name: "\uAE30\uB465", category: "\uACE0\uC815 \uAC1D\uCCB4", object_type: "pillar", default_width_m: 0.8, default_height_m: 0.8, default_seat_count: null, display_shape: "rect", can_resize: true, can_rotate: false, is_active: true },
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
    let workspaceBaseObjects = [];
    let workspaceSelectedId = "";
    let workspaceSelectedIds = new Set();
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
    let workspaceFitTimer = null;
    let workspaceUndoStack = [];
    let workspaceRedoStack = [];
    let layoutAiPanel = null;
    let layoutAiPlan = null;
    let layoutAiPreviousPlan = null;
    let layoutAiSessionId = "";
    let layoutAiConversation = [];
    let layoutAiValidation = null;
    let workspaceReferenceOpacity = 0.4;
    let workspaceDimensionMode = "selected";
    let workspaceDimensionUnit = "m";
    let workspaceIncludeDimensionsInExport = true;
    let compositeFloorplans = [];
    const compositeGeometryCache = new Map();

    function isCompositeGroup(object) { return object?.objectType === "base_plan_group" && Boolean(object?.metadata?.sourceBasePlanId); }
    function isCompositeChild(object) { return Boolean(object?.metadata?.compositeBaseChild); }
    function hasCompositeWorkspace() { return workspaceObjects.some(isCompositeGroup); }
    function getWorkspaceWorldBounds(withMargin = false) {
      const margin = withMargin && hasCompositeWorkspace() ? 3000 : 0;
      return calculateWorkspaceWorldBounds(workspaceDrawingWidthMm, workspaceDrawingHeightMm, workspaceObjects, margin, workspaceMeterScale);
    }
    function compositeObjectBounds(object) { const width = Number(object.widthM || 0) * 1000; const height = Number(object.heightM || 0) * 1000; const radians = normalizeDegrees(object.rotation || 0) * Math.PI / 180; const boxWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)); const boxHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)); return { left: object.x - boxWidth / 2, right: object.x + boxWidth / 2, top: object.y - boxHeight / 2, bottom: object.y + boxHeight / 2, width: boxWidth, height: boxHeight }; }
    function compositeReferencePayload(group) { return { sourceBasePlanId: group.metadata.sourceBasePlanId, offsetX: Math.round(Number(group.metadata.offsetX || 0)), offsetY: Math.round(Number(group.metadata.offsetY || 0)), rotation: normalizeDegrees(group.metadata.rotation ?? group.rotation), locked: true }; }

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
      loadAllLibraryLayouts();
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
        .filter((item) => !isWorkspace || (workspaceEditMode === "base" ? isWorkspaceFixedMaster(item) : !isWorkspaceFixedMaster(item)))
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

    function initializeLayoutAiPanel() {
      if (!workspaceStatusbar || document.getElementById("layoutAiPanel")) return;
      const style = document.createElement("style"); style.textContent = `.layout-ai-panel{margin:12px 0;padding:12px;border:1px solid #c8b26a;border-radius:12px;background:#fffdf5;color:#1B2A3A}.layout-ai-panel h3{margin:0 0 6px;color:#102A40}.layout-ai-panel .layout-ai-result{color:#1B2A3A}.layout-ai-history{max-height:150px;overflow:auto;margin:7px 0;display:grid;gap:5px}.layout-ai-message{max-width:88%;padding:6px 9px;border-radius:10px;font-size:13px;white-space:pre-wrap}.layout-ai-message.user{justify-self:end;background:#102A40;color:white}.layout-ai-message.assistant{justify-self:start;background:#eef2f7;color:#1B2A3A}.layout-ai-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.layout-ai-form input{min-width:0}.layout-ai-result{margin-top:6px;font-size:13px}.layout-ai-summary{display:flex;gap:6px;flex-wrap:wrap}.layout-ai-summary span{padding:2px 6px;border-radius:999px;background:#eef2f7;color:#102A40}.layout-ai-actions{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}.layout-ai-errors{color:#b91c1c}.layout-ai-warnings{color:#92400e}`; document.head.append(style);
      layoutAiPanel = document.createElement("section"); layoutAiPanel.id = "layoutAiPanel"; layoutAiPanel.className = "layout-ai-panel"; layoutAiPanel.innerHTML = `<h3>AI 레이아웃</h3><div class="layout-ai-result" data-layout-ai-result>현재 draft를 대화로 생성·수정할 수 있습니다.</div><div class="layout-ai-history" data-layout-ai-history aria-live="polite"></div><form class="layout-ai-form" data-layout-ai-form><input data-layout-ai-input placeholder="명령 입력…" maxlength="200"><button type="submit">전송</button></form><div class="layout-ai-actions"><button type="button" data-layout-ai-save disabled>저장</button><button type="button" data-layout-ai-undo disabled>되돌리기</button><button type="button" data-layout-ai-reset disabled>초기화</button></div>`;
      workspaceStatusbar.parentElement?.insertBefore(layoutAiPanel, workspaceStatusbar);
      layoutAiPanel.querySelector("[data-layout-ai-form]")?.addEventListener("submit", async (event) => { event.preventDefault(); const input = layoutAiPanel.querySelector("[data-layout-ai-input]"); const text = input.value.trim(); if (!text) return; await applyLayoutAiCommand(text); input.value = ""; });
      layoutAiPanel.querySelector("[data-layout-ai-save]")?.addEventListener("click", () => openLayoutAiSaveModal());
      layoutAiPanel.querySelector("[data-layout-ai-undo]")?.addEventListener("click", () => undoLayoutAiChange());
      layoutAiPanel.querySelector("[data-layout-ai-reset]")?.addEventListener("click", resetLayoutAiDraft);
    }
    function layoutAiRequestedSpace(text) { return String(text).replace(/\s+/g, "").match(/(?:부라노|카프리)[123]|컨벤션(?:AB|A|B)/i)?.[0] || ""; }
    async function ensureLayoutAiSpace(text) {
      const requested = layoutAiRequestedSpace(text); if (!requested) return;
      const current = workspaceSpaces.find((space) => String(space.id) === String(workspaceSpaceSelect?.value));
      const currentVenue = workspaceVenues.find((venue) => String(venue.id) === String(workspaceVenueSelect?.value));
      const currentFloorplan = workspaceFloorplans.find((floorplan) => String(floorplan.id) === String(workspaceFloorplanSelect?.value));
      const currentNames = [currentVenue?.venue_name, current?.space_name, currentFloorplan?.floorplan_name];
      if (workspaceFloorplanRecord?.id) {
        if (!layoutAiContextMatches(requested, currentNames)) throw new Error(`현재 편집 공간(${currentNames.filter(Boolean).join(" / ")})과 요청 공간(${requested})이 다릅니다. 공간 전환을 확인해주세요.`);
        return;
      }
      if (layoutAiContextMatches(requested, currentNames)) return;
      const match = workspaceSpaces.find((space) => layoutAiContextMatches(requested, [space.space_name]));
      if (!match) throw new Error(`${requested} 공간을 현재 장소에서 찾지 못했습니다. 장소를 먼저 선택해주세요.`);
      workspaceSpaceSelect.value = match.id; await handleWorkspaceSpaceChange();
      if (workspaceFloorplanSelect?.options.length > 1) { workspaceFloorplanSelect.selectedIndex = 1; await handleWorkspaceFloorplanChange(); }
    }
    function layoutAiMasters(plan) {
      const requestedTableWidth = Number(plan?.tableWidthMm || 0);
      const currentSpace = workspaceSpaces.find((space) => String(space.id) === String(workspaceSpaceSelect?.value)); const currentVenueId = workspaceVenueSelect?.value || "";
      const scopedMasters = (type) => layoutObjectTypes.filter((item) => item.is_active !== false && item.object_type === type).filter((item) => (!item.space_id || String(item.space_id) === String(currentSpace?.id)) && (!item.venue_id || String(item.venue_id) === String(currentVenueId)) && (!item.floor || String(item.floor) === String(currentSpace?.floor))).sort((a, b) => Number(Boolean(b.space_id)) + Number(Boolean(b.venue_id)) + Number(Boolean(b.floor)) - Number(Boolean(a.space_id)) - Number(Boolean(a.venue_id)) - Number(Boolean(a.floor)));
      const seminarTables = scopedMasters("seminar_table");
      const table = seminarTables.find((item) => requestedTableWidth && Math.abs(Number(item.default_width_m || 0) * 1000 - requestedTableWidth) <= 10) || seminarTables[0] || defaultObjectTypes.find((item) => item.object_type === "seminar_table");
      const roundTable = scopedMasters("round_table")[0] || defaultObjectTypes.find((item) => item.object_type === "round_table");
      const chair = scopedMasters("chair")[0] || defaultObjectTypes.find((item) => item.object_type === "chair");
      return { table: { id: table?.id || "", widthMm: Number(table?.default_width_m || 1.8) * 1000, heightMm: Number(table?.default_height_m || .45) * 1000, displayShape: table?.display_shape || "rect" }, roundTable: { id: roundTable?.id || "", widthMm: Number(roundTable?.default_width_m || 1.8) * 1000, heightMm: Number(roundTable?.default_height_m || 1.8) * 1000, displayShape: roundTable?.display_shape || "circle" }, chair: { id: chair?.id || "", widthMm: Number(chair?.default_width_m || .45) * 1000, heightMm: Number(chair?.default_height_m || .45) * 1000, displayShape: chair?.display_shape || "rect" } };
    }
    function layoutAiUsableArea(fixed, room) {
      const allowed = fixed.find((object) => object.objectType === "allowed_area");
      if (!allowed) return null;
      return { left: Math.max(0, allowed.x - allowed.widthM * 500), top: Math.max(0, allowed.y - allowed.heightM * 500), right: Math.min(room.widthMm, allowed.x + allowed.widthM * 500), bottom: Math.min(room.heightMm, allowed.y + allowed.heightM * 500) };
    }
    async function layoutAiSchoolAnchorContext(plan, room, masters) {
      if (!allLibraryLayouts.length) await loadAllLibraryLayouts();
      const currentSpaceId = workspaceSpaceSelect?.value || ""; const currentVenueId = workspaceVenueSelect?.value || "";
      const currentVenueName = workspaceVenues.find((venue) => String(venue.id) === String(currentVenueId))?.venue_name || ""; const currentFamily = venueFamilyName(currentVenueName);
      const candidates = (allLibraryLayouts.length ? allLibraryLayouts : workspaceLayouts).filter((layout) => /school|스쿨|세미나/i.test(String(layout.layout_type || layout.layout_name || ""))).map((layout) => {
        const floorplan = allLibraryFloorplans.get(String(layout.floorplan_id || "")); const candidateRoom = { widthMm: Number(floorplan?.metadata?.widthMm) || Number(floorplan?.actual_width) * 1000 || room.widthMm, heightMm: Number(floorplan?.metadata?.heightMm) || Number(floorplan?.actual_height) * 1000 || room.heightMm, frontDirection: "top" };
        const screenRow = (libraryFloorplanObjects.get(String(layout.floorplan_id || "")) || []).find((object) => object.object_type === "screen");
        if (screenRow) { const screen = schoolSpacingObjectGeometry(screenRow, candidateRoom); candidateRoom.frontDirection = frontDirection(candidateRoom, [{ objectType: "screen", x: screen.x, y: screen.y }]); }
        const profile = calculateSchoolSpacingProfile(libraryObjectsByLayout.get(layout.id) || [], candidateRoom, { seatsPerTable: layout.seats_per_table, tableWidthMm: masters.table.widthMm, tableDepthMm: masters.table.heightMm }); if (!profile) return null;
        const sameSpace = String(layout.space_id || "") === String(currentSpaceId); const sameSpec = Math.abs(Number(profile.tableWidthMm || 0) - Number(masters.table.widthMm || 0)) <= 50 && Math.abs(Number(profile.tableDepthMm || 0) - Number(masters.table.heightMm || 0)) <= 50;
        const venueName = allLibraryVenues.get(String(layout.venue_id || ""))?.venue_name || ""; const sameFamily = currentFamily && venueFamilyName(venueName) === currentFamily;
        const capacity = Number(layout.setup_capacity || layout.max_people || profile.seatsPerTable * Number(layout.table_count || 0));
        const verified = /\[status:verified\]/i.test(String(layout.layout_notes || ""));
        return { id: layout.id, profile, capacity, columns: Number(layout.column_count || 0), rows: Number(layout.row_count || 0), seatsPerTable: Number(layout.seats_per_table || profile.seatsPerTable || 0), verified, priority: sameSpace && sameSpec ? 1 : sameSpace ? 2 : sameFamily && sameSpec ? 3 : sameFamily ? 4 : 5 };
      }).filter((candidate) => candidate && candidate.priority < 5);
      const priority = Math.min(...candidates.map((candidate) => candidate.priority));
      if (!Number.isFinite(priority)) return { anchors: [], profile: null, source: "system-default" };
      const anchors = candidates.filter((candidate) => candidate.priority === priority);
      const pair = selectSchoolAnchorPair(anchors, Number(plan.targetPeople || plan.totalSeats || 0));
      const selected = [pair.lower, pair.upper].filter(Boolean); const preferred = selected.filter((candidate) => candidate.verified);
      return { anchors, profile: mergeSchoolSpacingProfiles((preferred.length ? preferred : selected.length ? selected : anchors).map((candidate) => candidate.profile)), source: priority <= 2 ? "same-space" : "venue-family" };
    }
    async function renderLayoutAiDraft(plan, answer) {
      if (!workspaceFloorplanRecord?.id) throw new Error("공간의 기본 도면을 먼저 선택해주세요.");
      pushWorkspaceHistory(); layoutAiPreviousPlan = layoutAiPlan ? JSON.parse(JSON.stringify(layoutAiPlan)) : null; layoutAiSessionId ||= `layout_ai_${Date.now()}`;
      const fixed = workspaceObjects.filter(isWorkspaceBaseObject); const room = { widthMm: workspaceDrawingWidthMm, heightMm: workspaceDrawingHeightMm, paddingMm: 800, frontClearanceMm: 1200, baseZIndex: getWorkspaceMaxZIndex(), frontDirection: frontDirection({ widthMm: workspaceDrawingWidthMm, heightMm: workspaceDrawingHeightMm }, fixed) }; room.usableArea = layoutAiUsableArea(fixed, room);
      const masters = layoutAiMasters(plan); if (plan.layoutType === "school") { const anchorContext = await layoutAiSchoolAnchorContext(plan, room, masters); plan = resolveSchoolTargetPlan(plan, anchorContext.anchors); plan = applySchoolSpacingProfile(plan, anchorContext.profile); plan.anchorSource = anchorContext.source; }
      const generated = plan.layoutType === "round" ? generateRoundLayout(plan, room, masters, layoutAiSessionId) : generateSchoolLayout(plan, room, masters, layoutAiSessionId); layoutAiValidation = validateGeneratedLayout(generated, room, fixed, plan);
      workspaceObjects = [...fixed, ...generated]; workspaceActiveLayout = null; if (workspaceSavedLayoutSelect) workspaceSavedLayoutSelect.value = ""; layoutAiPlan = plan;
      const spaceName = workspaceSpaces.find((space) => String(space.id) === String(workspaceSpaceSelect?.value))?.space_name || "선택 공간"; plan.spaceId = workspaceSpaceSelect?.value || null; plan.spaceName = spaceName;
      const typeLabel = plan.layoutType === "round" ? "라운드" : "스쿨식"; if (workspaceNameInput) workspaceNameInput.value = `${spaceName} ${typeLabel} ${plan.columns}x${plan.rows} ${plan.totalSeats}석`;
      pendingLayoutInfo = { layout_type: plan.layoutType, layout_name: workspaceNameInput?.value || `AI ${typeLabel}`, min_people: null, max_people: plan.totalSeats, setup_capacity: plan.totalSeats, layout_notes: `[status:generated] AI ${plan.anchorSource || "deterministic"} draft` };
      workspaceSourceRow = { ...(workspaceSourceRow || {}), row_count: plan.rows, column_count: plan.columns, seats_per_table: plan.seatsPerTable, table_count: plan.tableCount, layout_type: plan.layoutType };
      markWorkspaceDirty(); renderWorkspace(); appendLayoutAiTurn(answer, `${typeLabel} ${plan.columns}x${plan.rows}, ${plan.tableCount}T, ${plan.totalSeats}석으로 생성했습니다.`); renderLayoutAiPanel();
    }
    function appendLayoutAiTurn(user, answer) { layoutAiConversation.push({ user, answer }); layoutAiConversation = layoutAiConversation.slice(-10); }
    function layoutAiRoom() {
      const fixed = workspaceObjects.filter(isWorkspaceBaseObject);
      const room = { widthMm: workspaceDrawingWidthMm, heightMm: workspaceDrawingHeightMm, paddingMm: 800, frontClearanceMm: 1200, baseZIndex: getWorkspaceMaxZIndex(), frontDirection: frontDirection({ widthMm: workspaceDrawingWidthMm, heightMm: workspaceDrawingHeightMm }, fixed) };
      room.usableArea = layoutAiUsableArea(fixed, room);
      return { fixed, room };
    }
    function refreshLayoutAiValidation() {
      if (!layoutAiPlan) return;
      const { fixed, room } = layoutAiRoom();
      layoutAiValidation = validateGeneratedLayout(workspaceObjects, room, fixed, layoutAiPlan);
      renderLayoutAiPanel();
    }
    function openLayoutAiSaveModal() {
      refreshLayoutAiValidation();
      if (!layoutAiValidation?.valid) { setStatus("검증 오류를 해결한 뒤 저장해주세요.", "warn"); return; }
      openLayoutInfoModal("save", true);
    }
    async function verifyCurrentLayout(text) {
      if (!workspaceActiveLayout?.id) { appendLayoutAiTurn(text, "먼저 이 레이아웃을 저장해주세요."); renderLayoutAiPanel(); return; }
      const notes = String(workspaceActiveLayout.layout_notes || "").replace(/\[status:(?:generated|verified)\]\s*/gi, "").trim();
      const layout_notes = `[status:verified]${notes ? ` ${notes}` : ""}`;
      const rows = await loggedSupabaseRequest("workspace layout verify", `venue_layouts?id=eq.${encodeURIComponent(workspaceActiveLayout.id)}&select=*`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ layout_notes }) });
      workspaceActiveLayout = rows?.[0] || { ...workspaceActiveLayout, layout_notes }; await loadAllLibraryLayouts(); appendLayoutAiTurn(text, "실사용 확인 레이아웃으로 표시했습니다."); renderLayoutAiPanel();
    }
    function undoLayoutAiChange(user = "방금 수정 취소") {
      if (!workspaceUndoStack.length) { appendLayoutAiTurn(user, "되돌릴 AI 수정이 없습니다."); renderLayoutAiPanel(); return; }
      undoWorkspaceChange(); layoutAiPlan = layoutAiPreviousPlan; layoutAiPreviousPlan = null; refreshLayoutAiValidation();
      appendLayoutAiTurn(user, "직전 상태를 복원했습니다."); renderLayoutAiPanel();
    }
    function updateLayoutAiPlan(plan) {
      plan.tableCount = Number(plan.columns || 0) * Number(plan.rows || 0);
      plan.totalSeats = plan.tableCount * Number(plan.seatsPerTable || 0);
      plan.requestedTableCount = plan.tableCount;
      return plan;
    }
    function moveLayoutAiObjects(command, text) {
      const { fixed, room } = layoutAiRoom();
      const candidate = workspaceObjects.map((object) => isWorkspaceBaseObject(object) ? object : { ...object, x: Number(object.x || 0) + command.dx, y: Number(object.y || 0) + command.dy });
      const validation = validateGeneratedLayout(candidate, room, fixed, layoutAiPlan);
      if (!validation.valid) { appendLayoutAiTurn(text, `${command.direction} 이동 시 경계 또는 고정 구조물과 충돌해서 적용하지 않았습니다.`); renderLayoutAiPanel(); return; }
      pushWorkspaceHistory(); layoutAiPreviousPlan = JSON.parse(JSON.stringify(layoutAiPlan)); workspaceObjects = candidate; layoutAiPlan.shift = { x: Number(layoutAiPlan.shift?.x || 0) + command.dx, y: Number(layoutAiPlan.shift?.y || 0) + command.dy }; layoutAiValidation = validation;
      markWorkspaceDirty(); renderWorkspace(); appendLayoutAiTurn(text, `${command.direction}으로 ${command.amount}mm 이동했습니다.`); renderLayoutAiPanel();
    }
    function removeLayoutAiRow(command, text) {
      if (Number(layoutAiPlan?.rows || 0) <= 1) throw new Error("한 줄 이하로는 줄일 수 없습니다.");
      const removedRow = command.edge === "first" ? 1 : Number(layoutAiPlan.rows);
      pushWorkspaceHistory(); layoutAiPreviousPlan = JSON.parse(JSON.stringify(layoutAiPlan));
      workspaceObjects = workspaceObjects.filter((object) => isWorkspaceBaseObject(object) || Number(object.metadata?.row) !== removedRow).map((object) => command.edge === "first" && !isWorkspaceBaseObject(object) && Number(object.metadata?.row) > 1 ? { ...object, metadata: { ...object.metadata, row: Number(object.metadata.row) - 1 } } : object);
      layoutAiPlan = updateLayoutAiPlan({ ...layoutAiPlan, rows: Number(layoutAiPlan.rows) - 1 }); refreshLayoutAiValidation(); markWorkspaceDirty(); renderWorkspace(); appendLayoutAiTurn(text, `${command.edge === "first" ? "첫" : "마지막"} 줄을 제거했습니다.`); renderLayoutAiPanel();
    }
    async function applyLayoutAiCommand(text) {
      try {
        const edit = parseLayoutAiEditCommand(text, layoutAiPlan);
        if (edit?.type === "save") { openLayoutAiSaveModal(); return; }
        if (edit?.type === "verify") { await verifyCurrentLayout(text); return; }
        if (edit?.type === "undo") { undoLayoutAiChange(text); return; }
        if (edit && !layoutAiPlan) throw new Error("먼저 레이아웃을 생성해주세요.");
        if (edit?.type === "move") { moveLayoutAiObjects(edit, text); return; }
        if (edit?.type === "remove-row") { removeLayoutAiRow(edit, text); return; }
        if (edit?.type === "regenerate") { await renderLayoutAiDraft({ ...layoutAiPlan }, text); return; }
        if (edit?.type === "gap") {
          const key = edit.axis === "vertical" ? "verticalGapMm" : "horizontalGapMm"; const next = Math.max(0, Number(layoutAiPlan[key] || 0) + edit.amount);
          await renderLayoutAiDraft({ ...layoutAiPlan, [key]: next, [edit.axis === "vertical" ? "explicitVerticalGap" : "explicitHorizontalGap"]: true }, text); return;
        }
        if (edit?.type === "gap-both") { await renderLayoutAiDraft({ ...layoutAiPlan, horizontalGapMm: Number(layoutAiPlan.horizontalGapMm || 0) + edit.amount, verticalGapMm: Number(layoutAiPlan.verticalGapMm || 0) + edit.amount, explicitHorizontalGap: true, explicitVerticalGap: true }, text); return; }
        if (edit?.type === "grid") { await renderLayoutAiDraft(updateLayoutAiPlan({ ...layoutAiPlan, columns: edit.columns, rows: edit.rows }), text); return; }
        if (edit?.type === "seats") { await renderLayoutAiDraft(updateLayoutAiPlan({ ...layoutAiPlan, seatsPerTable: edit.seatsPerTable, explicitSeats: true }), text); return; }
        await ensureLayoutAiSpace(text); const parsed = parseLayoutAiCommand(text, layoutAiPlan || (workspaceActiveLayout ? { columns: workspaceActiveLayout.column_count, rows: workspaceActiveLayout.row_count, seatsPerTable: workspaceActiveLayout.seats_per_table || 2 } : null));
        if (parsed.unsupportedType) { appendLayoutAiTurn(text, "현재 자동 생성 V2는 스쿨식과 라운드식을 지원합니다."); renderLayoutAiPanel(); return; }
        if (parsed.needsConfirmation) throw new Error(parsed.confirmationMessage);
        if (!parsed.understood) throw new Error("열×행을 알려주세요. 예: 스쿨식 3x7 또는 라운드 2x3 6T"); await renderLayoutAiDraft(parsed.plan, text);
      } catch (error) { appendLayoutAiTurn(text, error.message || "명령을 적용하지 못했습니다."); renderLayoutAiPanel(); }
    }
    function renderLayoutAiPanel() {
      if (!layoutAiPanel) return; const result = layoutAiPanel.querySelector("[data-layout-ai-result]"); const history = layoutAiPanel.querySelector("[data-layout-ai-history]");
      if (layoutAiPlan) result.innerHTML = `<div class="layout-ai-summary"><span>AI 생성안</span><span>${escapeHtml(layoutAiPlan.spaceName || "")}</span><span>${layoutAiPlan.layoutType === "round" ? "라운드" : "스쿨식"} ${layoutAiPlan.columns}×${layoutAiPlan.rows}</span><span>${layoutAiPlan.tableCount}T</span><span>${layoutAiPlan.totalSeats}석</span></div>${layoutAiValidation?.errors.length ? `<p class="layout-ai-errors">${escapeHtml(layoutAiValidation.errors.slice(0, 3).join(" · "))}</p>` : ""}${layoutAiValidation?.warnings.length ? `<p class="layout-ai-warnings">${escapeHtml(layoutAiValidation.warnings.slice(0, 3).join(" · "))}</p>` : `<p>${layoutAiValidation?.valid ? "검증 완료" : ""}</p>`}`;
      else result.textContent = "현재 draft를 대화로 생성·수정할 수 있습니다.";
      history.innerHTML = layoutAiConversation.slice(-10).map((turn) => `<div class="layout-ai-message user">${escapeHtml(turn.user)}</div><div class="layout-ai-message assistant">${escapeHtml(turn.answer)}</div>`).join("");
      history.scrollTop = history.scrollHeight;
      layoutAiPanel.querySelector("[data-layout-ai-save]").disabled = !layoutAiValidation?.valid; layoutAiPanel.querySelector("[data-layout-ai-undo]").disabled = !workspaceUndoStack.length; layoutAiPanel.querySelector("[data-layout-ai-reset]").disabled = !layoutAiPlan;
    }
    function resetLayoutAiDraft() { if (layoutAiPlan) { pushWorkspaceHistory(); workspaceObjects = workspaceObjects.filter((object) => object.metadata?.generatedBy !== "layout_ai"); } layoutAiPlan = null; layoutAiValidation = null; layoutAiSessionId = ""; pendingLayoutInfo = null; markWorkspaceDirty(); renderWorkspace(); renderLayoutAiPanel(); }

    function bindWorkspaceEvents() {
      initializeLayoutAiPanel();
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
      workspaceImportBaseButton?.addEventListener("click", openCompositeBasePlanModal);
      workspaceImportBaseConfirmButton?.addEventListener("click", importSelectedCompositeBasePlan);
      workspaceImportBaseCancelButton?.addEventListener("click", closeCompositeBasePlanModal);
      workspaceImportBaseModal?.addEventListener("click", (event) => { if (event.target === workspaceImportBaseModal) closeCompositeBasePlanModal(); });
      workspaceCompositeAlignButtons?.forEach((button) => button.addEventListener("click", () => alignSelectedCompositeGroups(button.dataset.compositeAlign)));
      workspaceNewCreateButton?.addEventListener("click", createWorkspaceLayoutFromModal);
      workspaceNewCancelButton?.addEventListener("click", closeWorkspaceNewLayoutModal);
      workspaceNewCancelFooterButton?.addEventListener("click", closeWorkspaceNewLayoutModal);
      workspaceNewModal?.addEventListener("click", (event) => {
        if (event.target === workspaceNewModal) closeWorkspaceNewLayoutModal();
      });
      workspaceSaveButton?.addEventListener("click", () => workspaceEditMode === "base" ? saveWorkspaceBaseFloorplan() : openLayoutInfoModal("save", Boolean(layoutAiPlan)));
      workspaceSaveAsButton?.addEventListener("click", () => workspaceEditMode === "base" ? saveWorkspaceBaseFloorplan() : openLayoutInfoModal("save", true));
      libraryCreateButton?.addEventListener("click", startNewLibraryLayout);
      document.getElementById("floorplanV2EventModeButton")?.addEventListener("click", showLayoutLibrary);
      workspaceBackLibraryButton?.addEventListener("click", showLayoutLibrary);
      libraryFilters?.addEventListener("click", (event) => {
        const clearButton = event.target.closest("button[data-layout-filter-clear]");
        if (clearButton) {
          libraryFilter = "all";
          libraryGroupFilter = "";
          librarySpaceFilter = "all";
          renderLayoutLibrary();
          return;
        }
        const groupButton = event.target.closest("button[data-library-group]");
        if (groupButton) { libraryGroupFilter = groupButton.dataset.libraryGroup; librarySpaceFilter = "all"; renderLayoutLibrary(); return; }
        const spaceButton = event.target.closest("button[data-library-space]");
        if (spaceButton) { librarySpaceFilter = spaceButton.dataset.librarySpace; renderLayoutLibrary(); return; }
        const button = event.target.closest("button[data-layout-filter]"); if (!button) return; libraryFilter = button.dataset.layoutFilter; renderLayoutLibrary();
      });
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
          const selected = [...workspaceSelectedIds].map(findWorkspaceObject).filter(canWorkspaceEditObject);
          if (!selected.length) return;
          event.preventDefault();
          pushWorkspaceHistory();
          const distance = event.shiftKey ? 500 : 100;
          const requested = { x: event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0, y: event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0 };
          const delta = { x: clampNumber(requested.x, -Math.min(...selected.map((object) => object.x)), workspaceSize.width - Math.max(...selected.map((object) => object.x))), y: clampNumber(requested.y, -Math.min(...selected.map((object) => object.y)), workspaceSize.height - Math.max(...selected.map((object) => object.y))) };
          selected.forEach((object) => { object.x += delta.x; object.y += delta.y; });
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
      workspaceSelectedId = "";
      if (workspaceNameInput) {
        workspaceNameInput.value = workspaceEditMode === "base"
          ? (workspaceFloorplanRecord?.floorplan_name || "")
          : (workspaceActiveLayout?.layout_name || "");
        workspaceNameInput.placeholder = workspaceEditMode === "base" ? "기본 도면 이름" : "행사 레이아웃 이름";
      }
      if (workspaceSaveButton) workspaceSaveButton.textContent = workspaceEditMode === "base" ? "기본도면 저장" : "레이아웃 저장";
      if (workspaceSaveAsButton) workspaceSaveAsButton.hidden = workspaceEditMode === "base";
      renderObjectLibrary();
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
        allLibraryVenues = new Map(workspaceVenues.map((row) => [String(row.id), row]));
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
      if (!venueId) { renderLayoutLibrary(); return; }
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
        renderLayoutLibrary();
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
      if (!spaceId) { renderLayoutLibrary(); return; }
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
        renderLayoutLibrary();
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

    async function showLayoutLibrary() {
      floorplanV2EventPanel?.classList.add("library-mode"); floorplanV2EventPanel?.classList.remove("editor-mode");
      renderLayoutLibrary();
      await loadAllLibraryLayouts();
    }
    function scheduleWorkspaceFit() { clearTimeout(workspaceFitTimer); workspaceFitTimer = setTimeout(() => { workspaceFitTimer = null; fitWorkspaceToScreen(); }, 0); }
    function cancelWorkspaceFit() { clearTimeout(workspaceFitTimer); workspaceFitTimer = null; }
    function showLayoutEditor(preserveViewport = false) { floorplanV2EventPanel?.classList.remove("library-mode"); floorplanV2EventPanel?.classList.add("editor-mode"); if (preserveViewport) cancelWorkspaceFit(); else scheduleWorkspaceFit(); }
    async function selectWorkspaceContext(venueId, spaceId, floorplanId) {
      if (venueId) { workspaceVenueSelect.value = venueId; await handleWorkspaceVenueChange(); }
      if (spaceId) { workspaceSpaceSelect.value = spaceId; await handleWorkspaceSpaceChange(); }
      if (floorplanId) { workspaceFloorplanSelect.value = floorplanId; await handleWorkspaceFloorplanChange(); }
    }
    function startNewLibraryLayout() {
      if (!workspaceFloorplanRecord?.id) { setStatus("새 레이아웃을 만들 기본 도면을 선택해 주세요.", "warn"); return; }
      cancelWorkspaceFit();
      workspaceObjects = cloneFloorplanObjectsForLayout(workspaceBaseObjects.length ? workspaceBaseObjects : workspaceObjects.filter(isWorkspaceBaseObject));
      workspaceSelectedId = "";
      workspaceActiveLayout = null;
      workspaceDirty = false;
      resetWorkspaceHistory();
      setWorkspaceEditMode("layout");
      if (workspaceNameInput) workspaceNameInput.value = "";
      updateWorkspaceStatus("저장되지 않음");
      showLayoutEditor(true);
    }
    function typeLabel(type) { return layoutTypeOptions.find(([value]) => value === type)?.[1] || "기타"; }
    async function loadLibraryObjects(layouts = allLibraryLayouts) {
      libraryObjectsByLayout = new Map(); const ids = layouts.map((row) => row.id).filter(Boolean); if (!ids.length) return;
      const rows = await loggedSupabaseRequest("layout library objects", `venue_layout_objects?select=*&layout_id=in.(${ids.join(",")})&is_active=eq.true&order=sort_order.asc`).catch(() => []);
      rows.forEach((row) => { const list = libraryObjectsByLayout.get(row.layout_id) || []; list.push(row); libraryObjectsByLayout.set(row.layout_id, list); });
    }
    async function loadAllLibraryLayouts() {
      if (libraryLoading) return;
      libraryLoading = true;
      renderLayoutLibrary();
      try {
        const [layouts, floorplans, venues, spaces] = await Promise.all([
          loggedSupabaseRequest("layout library all layouts", "venue_layouts?select=*&is_active=eq.true&order=updated_at.desc"),
          loggedSupabaseRequest("layout library floorplans", "venue_floorplans?select=*&is_active=eq.true"),
          workspaceSelectWithActiveFallback("venues", "id,venue_name,is_active", "venue_name.asc"),
          workspaceSelectWithActiveFallback("venue_spaces", "id,space_name,space_code,floor,is_active", "space_name.asc"),
        ]);
        allLibraryLayouts = layouts || [];
        allLibraryFloorplans = new Map((floorplans || []).map((row) => [String(row.id), row]));
        allLibraryVenues = new Map((venues || []).map((row) => [String(row.id), row]));
        allLibrarySpaces = new Map((spaces || []).map((row) => [String(row.id), row]));
        if (!libraryGroupFilter && allLibraryLayouts.length) libraryGroupFilter = layoutLibraryGroup(allLibraryLayouts[0]);
        const previewIds = [...new Set(allLibraryLayouts.map((row) => row.preview_file_id).filter(Boolean))];
        const files = previewIds.length
          ? await loggedSupabaseRequest("layout library preview files", `files?select=id,public_url,storage_path,bucket,original_filename&id=in.(${previewIds.join(",")})`).catch(() => [])
          : [];
        allLibraryPreviewFiles = new Map((files || []).map((row) => [String(row.id), row]));
        await loadLibraryObjects(allLibraryLayouts);
        const floorplanIds = [...new Set(allLibraryLayouts.map((row) => row.floorplan_id).filter(Boolean))];
        const floorplanObjects = floorplanIds.length
          ? await loggedSupabaseRequest("layout library floorplan objects", `venue_floorplan_objects?select=*&floorplan_id=in.(${floorplanIds.join(",")})&is_active=eq.true&order=sort_order.asc`).catch(() => [])
          : [];
        libraryFloorplanObjects = new Map();
        (floorplanObjects || []).forEach((row) => { const list = libraryFloorplanObjects.get(String(row.floorplan_id)) || []; list.push(row); libraryFloorplanObjects.set(String(row.floorplan_id), list); });
      } catch (error) {
        console.error("layout library load failed:", error);
        setStatus(error.message || "저장된 레이아웃을 불러오지 못했습니다.", "error");
      } finally {
        libraryLoading = false;
        renderLayoutLibrary();
      }
    }
    function libraryFloorplan(layout) { return allLibraryFloorplans.get(String(layout.floorplan_id || "")) || null; }
    function libraryVenueName(layout) { return allLibraryVenues.get(String(layout.venue_id || ""))?.venue_name || "장소 미지정"; }
    function librarySpaceName(layout) { return allLibrarySpaces.get(String(layout.space_id || ""))?.space_name || "공간 미지정"; }
    function layoutLibraryGroup(layout) { return layoutLibraryGroupName(librarySpaceName(layout), libraryVenueName(layout)); }
    function libraryPreviewUrl(layout) {
      const file = allLibraryPreviewFiles.get(String(layout.preview_file_id || ""));
      if (!file) return "";
      if (file.public_url) return file.public_url;
      if (!file.bucket || !file.storage_path) return "";
      return `${supabaseConfig.url}/storage/v1/object/public/${encodeURIComponent(file.bucket)}/${String(file.storage_path).split("/").map(encodeURIComponent).join("/")}`;
    }
    function libraryPreview(layout, mode = "thumbnail") {
      const floorplan = libraryFloorplan(layout); const metadata = floorplan?.metadata || {};
      const width = Math.max(1, Number(metadata.widthMm) || Number(floorplan?.actual_width) * 1000 || workspaceDrawingWidthMm);
      const height = Math.max(1, Number(metadata.heightMm) || Number(floorplan?.actual_height) * 1000 || workspaceDrawingHeightMm);
      const baseObjects = libraryFloorplanObjects.get(String(layout.floorplan_id || "")) || [];
      const outlineRow = baseObjects.find((row) => row.object_type === "hall_outline");
      const points = Array.isArray(outlineRow?.metadata?.points) ? outlineRow.metadata.points : (Array.isArray(metadata.points) ? metadata.points : []);
      const objects = [...baseObjects.filter((row) => row.object_type !== "hall_outline"), ...(libraryObjectsByLayout.get(layout.id) || [])];
      const importantTypes = new Set(["door", "screen", "stage", "pillar", "blocked_area", "structure_area"]);
      const shapes = objects.map((row) => {
        const box = layoutLibraryObjectGeometry(row, width, height); const x = box.x; const y = box.y; const w = box.width; const h = box.height;
        const isRound = row.object_type === "round_table"; const isChair = row.object_type === "chair"; const isFixed = importantTypes.has(row.object_type);
        const fill = isChair ? "#94a3b844" : isFixed ? "#0f2a4324" : row.object_type === "round_table" ? "#d4af3755" : "#2563eb33";
        const stroke = isFixed ? "#0f2a43" : row.object_type === "round_table" ? "#9a7b16" : "#2563eb";
        const shape = isRound
          ? `<ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="${h/2}" fill="${fill}" stroke="${stroke}"/>`
          : `<rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" transform="rotate(${Number(row.rotation)||0} ${x} ${y})" rx="${Math.min(80, Math.max(12, Math.min(w,h)*.15))}" fill="${fill}" stroke="${stroke}"/>`;
        const label = isFixed ? `<text class="layout-library-important-label" x="${x}" y="${y}" font-size="${mode === "thumbnail" ? 620 : 480}">${escapeHtml(row.label || objectLabels[row.object_type] || row.object_type)}</text>` : "";
        return `<g>${shape}${label}</g>`;
      }).join("");
      const outline = points.length ? `<polygon points="${points.map((p)=>`${Number(p.x)},${Number(p.y)}`).join(" ")}" fill="#f8fafc" stroke="#0f2a43" stroke-width="40"/>` : `<rect x="20" y="20" width="${Math.max(1,width-40)}" height="${Math.max(1,height-40)}" fill="#f8fafc" stroke="#0f2a43" stroke-width="40"/>`;
      const view = layoutLibraryViewBox(width, height, points, objects);
      return `<div class="layout-library-thumbnail layout-library-thumbnail-${mode}"><svg viewBox="${view.x} ${view.y} ${view.width} ${view.height}" preserveAspectRatio="xMidYMid meet" aria-label="${escapeAttribute(layout.layout_name)} 미리보기">${outline}${shapes}</svg></div>`;
    }
    function objectSummary(layoutId) {
      const counts = new Map(); (libraryObjectsByLayout.get(layoutId) || []).forEach((row) => counts.set(row.label || objectLabels[row.object_type] || row.object_type, (counts.get(row.label || objectLabels[row.object_type] || row.object_type) || 0) + 1));
      return [...counts.entries()].map(([name,count]) => `${name} × ${count}`).join(" · ") || "배치 기물 없음";
    }
    function renderLayoutLibrary() {
      if (!libraryFilters || !libraryGrid) return;
      const groupCounts = new Map(LAYOUT_LIBRARY_GROUPS.map((group) => [group, allLibraryLayouts.filter((row) => layoutLibraryGroup(row) === group).length]));
      const groupRows = libraryGroupFilter ? allLibraryLayouts.filter((row) => layoutLibraryGroup(row) === libraryGroupFilter) : [];
      const spaces = [...new Set(groupRows.map(librarySpaceName))].sort((a,b) => a.localeCompare(b, "ko", { numeric:true }));
      const hasContextFilter = Boolean(libraryGroupFilter || librarySpaceFilter !== "all" || libraryFilter !== "all");
      libraryFilters.innerHTML = `<div class="layout-library-filter-row"><span class="layout-library-filter-label">공간 그룹</span>${LAYOUT_LIBRARY_GROUPS.map((group) => `<button type="button" data-library-group="${group}" class="${libraryGroupFilter===group?"active":""}">${group}<small>${groupCounts.get(group)||0}</small></button>`).join("")}</div>${libraryGroupFilter ? `<div class="layout-library-filter-row"><span class="layout-library-filter-label">하위 공간</span><button type="button" data-library-space="all" class="${librarySpaceFilter==="all"?"active":""}">전체</button>${spaces.map((space) => `<button type="button" data-library-space="${escapeAttribute(space)}" class="${librarySpaceFilter===space?"active":""}">${escapeHtml(space)}</button>`).join("")}</div><div class="layout-library-filter-row"><span class="layout-library-filter-label">레이아웃 유형</span>${layoutTypeOptions.map(([value,label]) => `<button type="button" data-layout-filter="${value}" class="${libraryFilter===value?"active":""}">${label}</button>`).join("")}</div>` : ""}<button type="button" data-layout-filter-clear class="layout-library-clear-filter" ${hasContextFilter ? "" : "disabled"}>선택 초기화</button>`;
      if (libraryLoading && !allLibraryLayouts.length) { libraryGrid.innerHTML = '<p class="layout-library-state">저장된 레이아웃을 불러오는 중입니다.</p>'; return; }
      if (!allLibraryLayouts.length) { libraryGrid.innerHTML = '<p class="layout-library-state">저장된 레이아웃이 없습니다.</p>'; return; }
      if (!libraryGroupFilter) { libraryGrid.innerHTML = '<p class="layout-library-state">공간 그룹을 선택하면 저장된 레이아웃을 볼 수 있습니다.</p>'; return; }
      const rows = groupRows.filter((row) => (librarySpaceFilter === "all" || librarySpaceName(row) === librarySpaceFilter) && (libraryFilter === "all" || row.layout_type === libraryFilter));
      if (!rows.length) { libraryGrid.innerHTML = '<p class="layout-library-state">필터 조건에 맞는 저장 레이아웃이 없습니다.</p>'; return; }
      libraryGrid.innerHTML = rows.map((row) => {
        const objects = libraryObjectsByLayout.get(row.id) || [];
        const tableCount = row.table_count ?? objects.filter((object) => /table/.test(object.object_type || "")).length;
        const seatCount = row.setup_capacity ?? objects.reduce((sum, object) => sum + Number(object.seat_count || 0), 0);
        const savedAt = row.updated_at || row.created_at; const savedLabel = savedAt ? new Intl.DateTimeFormat("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(savedAt)) : "-";
        const floorplanName = libraryFloorplan(row)?.floorplan_name || "기본 도면";
        return `<article class="layout-library-card layout-library-child" data-layout-id="${row.id}" tabindex="0" role="button" aria-label="${escapeAttribute(row.layout_name || "이름 없는 레이아웃")} 미리보기">${libraryPreview(row)}<div class="layout-library-card-heading"><span>${escapeHtml(librarySpaceName(row))}</span><span>${escapeHtml(typeLabel(row.layout_type))}</span></div><h3>${escapeHtml(row.layout_name || "이름 없는 레이아웃")}</h3><p>${escapeHtml(floorplanName)}</p><p class="layout-library-card-meta">${seatCount ? `좌석 ${seatCount}석` : "좌석수 미입력"} · 테이블 ${tableCount || 0}개</p><p class="layout-library-card-meta">저장일 ${escapeHtml(savedLabel)}</p><div class="layout-library-card-actions"><button data-action="preview">미리보기</button><button data-action="edit">편집</button><button data-action="delete" class="danger-button">삭제</button></div></article>`;
      }).join("");
    }
    async function handleLibraryAction(event) {
      const floorplanButton = event.target.closest("button[data-floorplan-action]");
      if (floorplanButton) {
        if (floorplanButton.dataset.floorplanAction === "open-base") {
          workspaceObjects = JSON.parse(JSON.stringify(workspaceBaseObjects.length ? workspaceBaseObjects : workspaceObjects.filter(isWorkspaceBaseObject)));
          workspaceActiveLayout = null;
          setWorkspaceEditMode("base");
          showLayoutEditor();
        } else if (floorplanButton.dataset.floorplanAction === "create-layout") {
          startNewLibraryLayout();
        }
        return;
      }
      const button = event.target.closest("button[data-action]"); const card = event.target.closest("[data-layout-id]"); if (!card) return;
      const layout = allLibraryLayouts.find((row) => String(row.id) === String(card.dataset.layoutId)); if (!layout) return;
      const action = button?.dataset.action || "preview";
      if (action === "preview") { showLibraryPreview(layout); return; }
      if (["open","edit"].includes(action)) { await openLibraryLayout(layout); return; }
      if (action === "info") { workspaceActiveLayout = layout; openLayoutInfoModal("info", false); return; }
      if (action === "duplicate") { await duplicateLibraryLayout(layout); return; }
      if (action === "delete") await deleteLibraryLayout(layout);
    }
    function showLibraryPreview(layout) {
      if (!workspacePreviewModal || !workspacePreviewBody) return;
      libraryPreviewLayout = layout;
      const previewTitle = workspacePreviewModal.querySelector("#layoutWorkspacePreviewTitle");
      if (previewTitle) previewTitle.textContent = layout.layout_name || "레이아웃 미리보기";
      if (workspacePreviewDownloadButton) workspacePreviewDownloadButton.hidden = true;
      workspacePreviewBody.innerHTML = `<div class="layout-library-preview-toolbar"><button type="button" data-library-preview-zoom="out" aria-label="축소">−</button><button type="button" data-library-preview-zoom="reset">자동 맞춤</button><button type="button" data-library-preview-zoom="in" aria-label="확대">＋</button></div><div class="layout-library-preview-viewport" data-library-preview-viewport>${libraryPreview(layout, "modal")}</div>`;
      const viewport = workspacePreviewBody.querySelector("[data-library-preview-viewport]"); let scale = 1;
      workspacePreviewBody.querySelector(".layout-library-preview-toolbar")?.addEventListener("click", (event) => {
        const action = event.target.closest("button[data-library-preview-zoom]")?.dataset.libraryPreviewZoom; if (!action) return;
        scale = action === "reset" ? 1 : Math.min(3, Math.max(.5, scale * (action === "in" ? 1.2 : .8)));
        viewport?.style.setProperty("--library-preview-scale", String(scale));
      });
      workspacePreviewModal.hidden = false;
      workspacePreviewModal.classList.add("visible");
    }
    async function openLibraryLayout(layout) {
      await selectWorkspaceContext(layout.venue_id, layout.space_id, layout.floorplan_id);
      workspaceSavedLayoutSelect.value = layout.id;
      await loadWorkspaceLayoutById(layout.id);
      setWorkspaceEditMode("layout");
      showLayoutEditor();
    }
    function nullableNumber(input) { return input.value === "" ? null : Number(input.value); }
    function openLayoutInfoModal(mode, forceNew) {
      if (!workspaceFloorplanRecord?.id) { setStatus("기본 도면을 먼저 선택해 주세요.", "warn"); return; }
      libraryModalMode = mode; libraryModalForceNew = forceNew; const row = mode === "info" ? workspaceActiveLayout : (workspaceActiveLayout || pendingLayoutInfo);
      librarySpaceInput.value = workspaceSpaceSelect?.selectedOptions?.[0]?.textContent || ""; libraryTypeInput.value = row?.layout_type || "";
      libraryNameInput.value = forceNew && workspaceActiveLayout?.id ? `${row?.layout_name || workspaceNameInput?.value || "새 레이아웃"} - 복사본` : row?.layout_name || workspaceNameInput?.value || "";
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
      await loadAllLibraryLayouts();
    }
    async function deleteLibraryLayout(layout) {
      if (!window.confirm(`레이아웃 '${layout.layout_name}'만 삭제하시겠습니까?`)) return;
      await loggedSupabaseRequest("layout library objects deactivate", `venue_layout_objects?layout_id=eq.${encodeURIComponent(layout.id)}`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_active:false})});
      await loggedSupabaseRequest("layout library deactivate", `venue_layouts?id=eq.${encodeURIComponent(layout.id)}`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_active:false})}); await loadWorkspaceSavedLayouts(); await loadAllLibraryLayouts();
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
      scheduleWorkspaceFit();
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
      scheduleWorkspaceFit();
    }

    function applyWorkspaceHallOutline(outline) {
      const points = Array.isArray(outline?.metadata?.points) ? outline.metadata.points : [];
      const metrics = floorplanOutlineMetrics(points);
      const validPoints = metrics.points;
      workspaceOutlinePoints = validPoints;
      if (!validPoints.length || !workspaceBackgroundLayer) return;
      workspaceGeometryOffset = { x: -metrics.minX, y: -metrics.minY };
      workspaceDrawingWidthMm = Math.max(1000, metrics.widthMm);
      workspaceDrawingHeightMm = Math.max(1000, metrics.heightMm);
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

    function renderWorkspaceFloorplanDimensions() {
      if (!workspaceGuideLayer || workspaceDimensionMode === "hidden" || !workspaceOutlinePoints.length || !workspaceShowFloorplan) return;
      const metrics = floorplanOutlineMetrics(workspaceOutlinePoints);
      const scale = Math.max(0.0001, Number(view.scale) || 1);
      const offset = 18 / scale; const extension = 6 / scale; const fontSize = 13 / scale;
      const outwardSign = metrics.signedAreaMm2 >= 0 ? 1 : -1;
      const group = document.createElementNS(svgNs, "g"); group.dataset.floorplanDimensions = "true"; group.setAttribute("pointer-events", "none");
      metrics.segments.forEach(({ start, end, lengthMm }) => {
        if (!lengthMm) return;
        const dx = end.x - start.x; const dy = end.y - start.y;
        const nx = outwardSign * dy / lengthMm; const ny = outwardSign * -dx / lengthMm;
        const a = { x: start.x + workspaceGeometryOffset.x + nx * offset, y: start.y + workspaceGeometryOffset.y + ny * offset };
        const b = { x: end.x + workspaceGeometryOffset.x + nx * offset, y: end.y + workspaceGeometryOffset.y + ny * offset };
        const line = document.createElementNS(svgNs, "line");
        line.setAttribute("x1", String(a.x)); line.setAttribute("y1", String(a.y)); line.setAttribute("x2", String(b.x)); line.setAttribute("y2", String(b.y));
        line.setAttribute("class", "layout-floorplan-dimension-line"); line.setAttribute("vector-effect", "non-scaling-stroke"); group.append(line);
        [start, end].forEach((point) => {
          const tick = document.createElementNS(svgNs, "line");
          tick.setAttribute("x1", String(point.x + workspaceGeometryOffset.x + nx * (offset - extension)));
          tick.setAttribute("y1", String(point.y + workspaceGeometryOffset.y + ny * (offset - extension)));
          tick.setAttribute("x2", String(point.x + workspaceGeometryOffset.x + nx * (offset + extension)));
          tick.setAttribute("y2", String(point.y + workspaceGeometryOffset.y + ny * (offset + extension)));
          tick.setAttribute("class", "layout-floorplan-dimension-line"); tick.setAttribute("vector-effect", "non-scaling-stroke"); group.append(tick);
        });
        const label = document.createElementNS(svgNs, "text");
        label.setAttribute("x", String((a.x + b.x) / 2 + nx * (8 / scale))); label.setAttribute("y", String((a.y + b.y) / 2 + ny * (8 / scale)));
        label.setAttribute("class", "layout-floorplan-dimension-label"); label.setAttribute("font-size", String(fontSize));
        label.textContent = `${(lengthMm / 1000).toFixed(1)}m`; group.append(label);
      });
      workspaceGuideLayer.append(group);
    }

    async function loadCompositePlanGeometry(floorplanId, lineage = []) {
      const id = String(floorplanId || "");
      if (!id) return [];
      if (lineage.includes(id)) throw new Error("기본도면 순환 참조는 허용되지 않습니다.");
      if (compositeGeometryCache.has(id)) return JSON.parse(JSON.stringify(compositeGeometryCache.get(id)));
      const rows = await loggedSupabaseRequest("composite base objects", `venue_floorplan_objects?select=*&floorplan_id=eq.${encodeURIComponent(id)}&is_active=eq.true&order=sort_order.asc`).catch(() => []);
      const result = [];
      for (const row of rows || []) {
        if (row.object_type === "hall_outline") {
          const points = Array.isArray(row.metadata?.points) ? row.metadata.points : [];
          points.slice(1).forEach((end, index) => {
            const start = points[index]; const length = Math.hypot(Number(end.x) - Number(start.x), Number(end.y) - Number(start.y));
            result.push({ instanceId: `${row.id || id}_outline_${index}`, masterObjectId: "", objectType: "wall", label: row.label || "외곽선", x: (Number(start.x) + Number(end.x)) / 2, y: (Number(start.y) + Number(end.y)) / 2, widthM: length / 1000, heightM: .15, rotation: Math.atan2(Number(end.y) - Number(start.y), Number(end.x) - Number(start.x)) * 180 / Math.PI, seatCount: 0, zIndex: Number(row.sort_order || 0), locked: true, metadata: { start_x_mm: Number(start.x), start_y_mm: Number(start.y), end_x_mm: Number(end.x), end_y_mm: Number(end.y), thickness_mm: 150, baseFloorplanObject: true } });
          });
        } else if (row.object_type === "base_plan_group" && row.metadata?.sourceBasePlanId) {
          const nested = await loadCompositePlanGeometry(row.metadata.sourceBasePlanId, [...lineage, id]);
          const nestedGroup = { rotation: Number(row.metadata.rotation || row.rotation || 0), metadata: row.metadata };
          nested.forEach((object) => result.push(transformCompositeLocalObject(object, nestedGroup)));
        } else {
          result.push(dbObjectToWorkspaceObject(row, false));
        }
      }
      compositeGeometryCache.set(id, JSON.parse(JSON.stringify(result)));
      return result;
    }

    function transformCompositeLocalObject(source, group) {
      const object = JSON.parse(JSON.stringify(source)); const center = transformBasePlanPoint(group, { x: source.x, y: source.y });
      object.x = center.x; object.y = center.y; object.rotation = normalizeDegrees(Number(source.rotation || 0) + Number((group.metadata?.rotation ?? group.rotation) || 0));
      if (["wall", "calibration"].includes(object.objectType)) {
        const metadata = migrateLegacyWallMetadata(source); const start = transformBasePlanPoint(group, { x: metadata.start_x_mm, y: metadata.start_y_mm }); const end = transformBasePlanPoint(group, { x: metadata.end_x_mm, y: metadata.end_y_mm });
        object.metadata = { ...object.metadata, start_x_mm: Math.round(start.x), start_y_mm: Math.round(start.y), end_x_mm: Math.round(end.x), end_y_mm: Math.round(end.y) };
        syncWorkspaceLineObjectFromMetadata(object, true);
      }
      return object;
    }

    function compositeGeometryBounds(objects) {
      if (!objects.length) return { left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 };
      const boxes = objects.map(compositeObjectBounds); const left = Math.min(...boxes.map((box) => box.left)); const right = Math.max(...boxes.map((box) => box.right)); const top = Math.min(...boxes.map((box) => box.top)); const bottom = Math.max(...boxes.map((box) => box.bottom));
      return { left, right, top, bottom, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
    }

    function refreshCompositeGroupChildren(group) {
      if (!isCompositeGroup(group) || !Array.isArray(group._compositeGeometry)) return;
      workspaceObjects = workspaceObjects.filter((object) => object.metadata?.compositeGroupId !== group.instanceId);
      const children = group._compositeGeometry.map((source, index) => {
        const object = transformCompositeLocalObject(source, group);
        object.instanceId = `${group.instanceId}:child:${index}`; object.locked = true;
        object.metadata = { ...(object.metadata || {}), baseFloorplanObject: true, compositeBaseChild: true, compositeGroupId: group.instanceId, sourceBasePlanId: group.metadata.sourceBasePlanId };
        return object;
      });
      const bounds = compositeGeometryBounds(children); group.x = (bounds.left + bounds.right) / 2; group.y = (bounds.top + bounds.bottom) / 2; group.widthM = bounds.width / 1000; group.heightM = bounds.height / 1000;
      group.rotation = 0; group.opacity = .06; workspaceObjects.push(...children);
    }

    function syncCompositeGroupFromObject(group, snap = false) {
      if (!isCompositeGroup(group) || !Array.isArray(group._compositeGeometry)) return;
      const originGroup = { rotation: 0, metadata: { offsetX: 0, offsetY: 0, rotation: Number(group.metadata.rotation || 0) } };
      const originBounds = compositeGeometryBounds(group._compositeGeometry.map((object) => transformCompositeLocalObject(object, originGroup)));
      let nextX = group.x; let nextY = group.y;
      if (snap && workspaceSnap) {
        const moving = compositeObjectBounds(group); const tolerance = 250;
        workspaceObjects.filter((object) => isCompositeGroup(object) && object.instanceId !== group.instanceId).some((other) => {
          const fixed = compositeObjectBounds(other); const candidates = [{ delta: fixed.right - moving.left, axis: "x" }, { delta: fixed.left - moving.right, axis: "x" }, { delta: fixed.bottom - moving.top, axis: "y" }, { delta: fixed.top - moving.bottom, axis: "y" }].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
          if (Math.abs(candidates[0].delta) > tolerance) return false;
          if (candidates[0].axis === "x") nextX += candidates[0].delta; else nextY += candidates[0].delta;
          return true;
        });
      }
      group.metadata.offsetX = Math.round(nextX - (originBounds.left + originBounds.right) / 2);
      group.metadata.offsetY = Math.round(nextY - (originBounds.top + originBounds.bottom) / 2);
      refreshCompositeGroupChildren(group);
    }

    function alignSelectedCompositeGroups(mode) {
      const groups = [...workspaceSelectedIds].map(findWorkspaceObject).filter(isCompositeGroup); if (groups.length < 2) { setStatus("정렬할 기본도면 그룹을 두 개 이상 선택해주세요.", "warn"); return; }
      pushWorkspaceHistory(); const anchor = compositeObjectBounds(groups[0]);
      groups.slice(1).forEach((group) => {
        const box = compositeObjectBounds(group); let dx = 0; let dy = 0;
        if (mode === "left") dx = anchor.left - box.left; if (mode === "right") dx = anchor.right - box.right;
        if (mode === "top") dy = anchor.top - box.top; if (mode === "bottom") dy = anchor.bottom - box.bottom;
        if (mode === "center-x") dx = (anchor.left + anchor.right - box.left - box.right) / 2;
        if (mode === "center-y") dy = (anchor.top + anchor.bottom - box.top - box.bottom) / 2;
        group.x += dx; group.y += dy; syncCompositeGroupFromObject(group, false);
      });
      markWorkspaceDirty(); renderWorkspace();
    }

    async function hydrateCompositeGroup(group) {
      group._compositeGeometry = await loadCompositePlanGeometry(group.metadata.sourceBasePlanId, [String(workspaceFloorplanRecord?.id || "")].filter(Boolean));
      group.metadata = { ...(group.metadata || {}), baseFloorplanObject: Boolean(group.metadata?.baseFloorplanObject), compositeBasePlanGroup: true, locked: true };
      refreshCompositeGroupChildren(group);
    }

    async function hydrateCompositeGroups(objects) {
      for (const group of objects.filter(isCompositeGroup)) await hydrateCompositeGroup(group);
    }

    async function openCompositeBasePlanModal() {
      if (!workspaceFloorplanRecord?.id) { setStatus("불러올 기본 도면을 먼저 선택해주세요.", "warn"); return; }
      compositeFloorplans = await loggedSupabaseRequest("composite floorplan list", "venue_floorplans?select=*&is_active=eq.true&order=floorplan_name.asc").catch(() => []);
      const available = compositeFloorplans.filter((row) => String(row.id) !== String(workspaceFloorplanRecord.id));
      workspaceImportBaseSelect.innerHTML = '<option value="">기본도면 선택</option>' + available.map((row) => `<option value="${escapeAttribute(row.id)}">${escapeHtml(row.floorplan_name || "기본도면")}</option>`).join("");
      workspaceImportBaseModal.hidden = false; workspaceImportBaseModal.classList.add("visible");
    }
    function closeCompositeBasePlanModal() { if (!workspaceImportBaseModal) return; workspaceImportBaseModal.hidden = true; workspaceImportBaseModal.classList.remove("visible"); }
    async function importSelectedCompositeBasePlan() {
      const sourceBasePlanId = workspaceImportBaseSelect?.value || ""; const floorplan = compositeFloorplans.find((row) => String(row.id) === sourceBasePlanId);
      if (!floorplan) return;
      try {
        const geometry = await loadCompositePlanGeometry(sourceBasePlanId, [String(workspaceFloorplanRecord?.id || "")]);
        const localBounds = compositeGeometryBounds(geometry); const existingGroups = workspaceObjects.filter(isCompositeGroup); const right = existingGroups.length ? Math.max(...existingGroups.map((group) => compositeObjectBounds(group).right)) + 500 : 0;
        const isBaseReference = workspaceEditMode === "base";
        const group = { instanceId: crypto.randomUUID ? crypto.randomUUID() : `base_group_${Date.now()}`, masterObjectId: "", objectType: "base_plan_group", label: floorplan.floorplan_name || "기본도면", x: 0, y: 0, widthM: localBounds.width / 1000, heightM: localBounds.height / 1000, rotation: 0, seatCount: 0, zIndex: getWorkspaceMinZIndex() - 1, locked: true, opacity: .06, metadata: { baseFloorplanObject: isBaseReference, compositeBasePlanGroup: true, sourceBasePlanId, offsetX: Math.round(right - localBounds.left), offsetY: Math.round(-localBounds.top), rotation: 0, locked: true }, _compositeGeometry: geometry };
        pushWorkspaceHistory(); workspaceObjects.push(group); refreshCompositeGroupChildren(group); if (isBaseReference) workspaceBaseObjects = workspaceObjects.filter(isWorkspaceBaseObject); workspaceSelectedIds = new Set([group.instanceId]); workspaceSelectedId = group.instanceId; markWorkspaceDirty(); closeCompositeBasePlanModal(); renderWorkspace();
      } catch (error) { setStatus(error.message || "기본도면을 불러오지 못했습니다.", "error"); }
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
        workspaceBaseObjects = [];
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
        .map((row) => dbObjectToWorkspaceObject(row, true))
        .map((object) => ({ ...object, locked: true, metadata: { ...(object.metadata || {}), baseFloorplanObject: true } }));
      const existingLayoutObjects = workspaceObjects.filter((object) => !isWorkspaceBaseObject(object));
      workspaceObjects = [...fixedObjects, ...existingLayoutObjects];
      await hydrateCompositeGroups(fixedObjects);
      workspaceBaseObjects = JSON.parse(JSON.stringify(workspaceObjects.filter(isWorkspaceBaseObject)));
      workspaceCalibration = null;
      fixedObjects.filter((object) => object.objectType === "calibration").forEach(applyWorkspaceCalibrationFromObject);
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
      await loadLibraryObjects(allLibraryLayouts.length ? allLibraryLayouts : workspaceLayouts);
      renderLayoutLibrary();
    }

    async function loadWorkspaceLayoutById(layoutId) {
      workspaceActiveLayout = workspaceLayouts.find((layout) => String(layout.id) === String(layoutId || "")) || null;
      if (workspaceNameInput) workspaceNameInput.value = workspaceActiveLayout?.layout_name || "";
      const baseObjects = JSON.parse(JSON.stringify(workspaceBaseObjects.length ? workspaceBaseObjects : workspaceObjects.filter(isWorkspaceBaseObject)));
      if (!workspaceActiveLayout?.id) {
        workspaceObjects = baseObjects;
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
        ...baseObjects.filter(isFloorplanStructuralObject),
        ...(layoutRows || []).map((row) => dbObjectToWorkspaceObject(row)),
      ];
      await hydrateCompositeGroups(workspaceObjects.filter((object) => !isWorkspaceBaseObject(object)));
      workspaceSelectedId = "";
      workspaceDirty = false;
      updateWorkspaceStatus("??λ맖");
      renderWorkspace();
    }

    async function saveWorkspaceLayout(forceNew) {
      if (layoutAiPlan && !layoutAiValidation?.valid) {
        setStatus("AI 생성안 검증 오류를 해결한 뒤 저장해주세요.", "warn");
        return;
      }
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
        const fixedObjects = workspaceObjects.filter((object) => isWorkspaceBaseObject(object) && !isCompositeChild(object));
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
        layoutAiPlan = null;
        layoutAiValidation = null;
        layoutAiPreviousPlan = null;
        layoutAiSessionId = "";
        resetWorkspaceHistory();
        renderLayoutAiPanel();
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

    async function saveWorkspaceBaseFloorplan() {
      if (!workspaceFloorplanRecord?.id) {
        setStatus("저장할 기본 도면을 먼저 선택해주세요.", "warn");
        return;
      }
      const name = workspaceNameInput?.value?.trim() || workspaceFloorplanRecord.floorplan_name || "기본 도면";
      workspaceSaveButton.disabled = true;
      updateWorkspaceStatus("저장 중");
      try {
        const rows = await loggedSupabaseRequest("workspace base floorplan update", `venue_floorplans?id=eq.${encodeURIComponent(workspaceFloorplanRecord.id)}&select=*`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ floorplan_name: name, actual_width: workspaceDrawingWidthMm / 1000, actual_height: workspaceDrawingHeightMm / 1000 }),
        });
        workspaceFloorplanRecord = rows?.[0] || workspaceFloorplanRecord;
        const structures = workspaceObjects.filter((object) => isWorkspaceBaseObject(object) && !isCompositeChild(object)).map(workspaceObjectToDbShape);
        await replaceFloorplanStructures(workspaceFloorplanRecord.id, structures);
        workspaceDirty = false;
        resetWorkspaceHistory();
        updateWorkspaceStatus("저장됨");
        setStatus("기본 도면과 고정 구조물을 저장했습니다.");
        await loadWorkspaceFloorplanState();
        renderLayoutLibrary();
      } catch (error) {
        console.error("workspace base floorplan save failed:", error);
        updateWorkspaceStatus("저장 실패");
        setStatus(error.message || "기본 도면 저장에 실패했습니다.", "error");
      } finally {
        workspaceSaveButton.disabled = false;
      }
    }

    async function replaceFloorplanStructures(floorplanId, objects) {
      await loggedSupabaseRequest("venue_floorplan_objects structures delete", `venue_floorplan_objects?floorplan_id=eq.${encodeURIComponent(floorplanId)}&object_type=neq.hall_outline`, { method: "DELETE" });
      if (!objects.length) return;
      const rows = objects.map((object, index) => ({
        floorplan_id: floorplanId,
        object_type: object.object_type,
        label: object.label,
        object_type_id: isUuid(object.object_type_id || object.metadata?.object_type_id) ? (object.object_type_id || object.metadata?.object_type_id) : null,
        x: roundValue(object.x),
        y: roundValue(object.y),
        width: roundValue(object.width),
        height: roundValue(object.height),
        rotation: Number(object.rotation || 0),
        memo: object.memo || null,
        is_locked: true,
        metadata: object.metadata || {},
        sort_order: index + 1,
        is_active: true,
      }));
      await loggedSupabaseRequest("venue_floorplan_objects structures insert", "venue_floorplan_objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
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
      const storageX = object.x - workspaceGeometryOffset.x;
      const storageY = object.y - workspaceGeometryOffset.y;
      const storageMetadata = { ...(object.metadata || {}) };
      ["start_x_mm", "end_x_mm"].forEach((key) => {
        if (Number.isFinite(Number(storageMetadata[key]))) storageMetadata[key] = Number(storageMetadata[key]) - workspaceGeometryOffset.x;
      });
      ["start_y_mm", "end_y_mm"].forEach((key) => {
        if (Number.isFinite(Number(storageMetadata[key]))) storageMetadata[key] = Number(storageMetadata[key]) - workspaceGeometryOffset.y;
      });
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
          ...storageMetadata,
          geometryVersion: 2,
          unit: "mm",
          coordinateOrigin: "floorplan",
          coordinateAnchor: "center",
          xMm: Math.round(storageX),
          yMm: Math.round(storageY),
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

    function dbObjectToWorkspaceObject(row, usesFloorplanOrigin = row?.metadata?.coordinateOrigin === "floorplan") {
      const widthM = Math.max(0.1, Number(row.metadata?.widthMm) / 1000 || Number(row.metadata?.default_width_m) || (Number(row.width || 0.05) * workspaceSize.width / workspaceMeterScale));
      const heightM = Math.max(0.1, Number(row.metadata?.heightMm) / 1000 || Number(row.metadata?.default_height_m) || (Number(row.height || 0.05) * workspaceSize.height / workspaceMeterScale));
      const widthPx = widthM * workspaceMeterScale;
      const heightPx = heightM * workspaceMeterScale;
      const coordinateOffset = usesFloorplanOrigin ? workspaceGeometryOffset : { x: 0, y: 0 };
      const center = floorplanObjectWorkspaceCenter(row, workspaceSize, { width: widthPx, height: heightPx }, coordinateOffset);
      const metadata = JSON.parse(JSON.stringify(row.metadata || {}));
      ["start_x_mm", "end_x_mm"].forEach((key) => {
        if (Number.isFinite(Number(metadata[key]))) metadata[key] = Number(metadata[key]) + coordinateOffset.x;
      });
      ["start_y_mm", "end_y_mm"].forEach((key) => {
        if (Number.isFinite(Number(metadata[key]))) metadata[key] = Number(metadata[key]) + coordinateOffset.y;
      });
      const object = {
        instanceId: row.id || (crypto.randomUUID ? crypto.randomUUID() : `object_${Date.now()}_${Math.random().toString(16).slice(2)}`),
        masterObjectId: row.object_type_id || row.metadata?.object_type_id || "",
        objectType: row.object_type,
        label: row.label || objectLabels[row.object_type] || row.object_type,
        x: Number(center.x),
        y: Number(center.y),
        widthM,
        heightM,
        rotation: Number(row.rotation || 0),
        seatCount: Number(row.seat_count || row.metadata?.seat_count || 0),
        zIndex: Number(row.sort_order || 0),
        locked: Boolean(row.is_locked),
        opacity: Number.isFinite(Number(row.metadata?.opacity)) ? Number(row.metadata.opacity) : undefined,
        metadata,
      };
      return ["wall", "calibration"].includes(object.objectType) ? syncWorkspaceLineObjectFromMetadata(object) : object;
    }

    function showWorkspacePreviewNotice() {
      setStatus("誘몃━蹂닿린? PNG ?대낫?닿린???ㅼ쓬 ?④퀎?먯꽌 ??λ맂 醫뚰몴 ?곗씠?곕? 湲곗??쇰줈 ?곌껐?⑸땲??", "warn");
    }

    function showWorkspacePreview() {
      if (!workspacePreviewModal || !workspacePreviewBody || !workspaceSvg) return;
      libraryPreviewLayout = null;
      if (workspacePreviewDownloadButton) workspacePreviewDownloadButton.hidden = false;
      const title = workspacePreviewModal.querySelector("#layoutWorkspacePreviewTitle");
      if (title) title.textContent = "레이아웃 미리보기";
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
      libraryPreviewLayout = null;
      workspacePreviewModal.classList.remove("visible");
      workspacePreviewModal.hidden = true;
      if (workspacePreviewBody) workspacePreviewBody.innerHTML = "";
      if (workspacePreviewDownloadButton) workspacePreviewDownloadButton.hidden = false;
      const title = workspacePreviewModal.querySelector("#layoutWorkspacePreviewTitle");
      if (title) title.textContent = "레이아웃 미리보기";
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
      if (workspaceEditMode === "layout" && isWorkspaceFixedMaster(master)) return;
      if (workspaceEditMode === "base" && !isWorkspaceFixedMaster(master)) return;
      pushWorkspaceHistory();
      const center = point || { x: workspaceSize.width / 2, y: workspaceSize.height / 2 };
      const allowExpandedPosition = hasCompositeWorkspace();
      const object = {
        instanceId: crypto.randomUUID ? crypto.randomUUID() : `object_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        masterObjectId: master.id || "",
        objectType: master.object_type || "object",
        label: master.object_name || objectLabels[master.object_type] || master.object_type || "?ㅻ툕?앺듃",
        displayShape: master.display_shape || getObjectDisplayShape(master),
        x: allowExpandedPosition ? Number(center.x) : clampNumber(center.x, 0, workspaceSize.width),
        y: allowExpandedPosition ? Number(center.y) : clampNumber(center.y, 0, workspaceSize.height),
        widthM: Math.max(0.1, Number(master.default_width_m || 1)),
        heightM: Math.max(0.1, Number(master.default_height_m || 1)),
        rotation: 0,
        seatCount: Number(master.default_seat_count || 0),
        zIndex: getWorkspaceMaxZIndex() + 1,
        locked: workspaceEditMode === "layout" ? false : true,
        metadata: workspaceEditMode === "base" ? { baseFloorplanObject: true } : {},
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
      if (workspaceTool === "select" && (!hitObject || !canWorkspaceEditObject(hitObject))) {
        event.preventDefault();
        const point = getWorkspaceSvgPoint(event);
        workspaceDragState = {
          mode: "marquee",
          start: point,
          end: point,
          initialIds: event.ctrlKey || event.metaKey || event.shiftKey ? [...workspaceSelectedIds] : [],
          moved: false,
        };
        workspaceSvg.setPointerCapture?.(event.pointerId);
        renderWorkspace();
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
      const world = { x: (Number(point?.x || 0) - view.panX) / scale, y: (Number(point?.y || 0) - view.panY) / scale };
      return hasCompositeWorkspace() ? world : { x: clampNumber(world.x, 0, workspaceSize.width), y: clampNumber(world.y, 0, workspaceSize.height) };
    }

    function worldToScreen(point) {
      return {
        x: Number(point?.x || 0) * view.scale + view.panX,
        y: Number(point?.y || 0) * view.scale + view.panY,
      };
    }

    function renderWorkspace() {
      if (!workspaceObjectLayer) return;
      if (!workspaceSelectedId) workspaceSelectedIds.clear();
      else if (!workspaceSelectedIds.has(workspaceSelectedId)) workspaceSelectedIds = new Set([workspaceSelectedId]);
      workspaceSelectedIds = new Set([...workspaceSelectedIds].filter((id) => workspaceObjects.some((object) => object.instanceId === id)));
      updateWorkspaceSvgViewBox();
      workspaceObjectLayer.innerHTML = "";
      if (workspaceSelectionLayer) workspaceSelectionLayer.innerHTML = "";
      if (workspaceGuideLayer) workspaceGuideLayer.innerHTML = "";
      workspaceViewport?.setAttribute("transform", `translate(${view.panX} ${view.panY}) scale(${view.scale})`);
      updateWorkspaceGridPattern();
      const gridBg = document.querySelector("#layoutWorkspaceGridBg");
      const majorGridBg = document.querySelector("#layoutWorkspaceMajorGridBg");
      const worldBounds = getWorkspaceWorldBounds(true);
      [gridBg, majorGridBg].filter(Boolean).forEach((rect) => { rect.setAttribute("x", String(worldBounds.minX)); rect.setAttribute("y", String(worldBounds.minY)); rect.setAttribute("width", String(worldBounds.width)); rect.setAttribute("height", String(worldBounds.height)); });
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
      renderWorkspaceFloorplanDimensions();
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
      if (workspaceGuideLayer && workspaceDragState?.mode === "marquee" && workspaceDragState.start && workspaceDragState.end) {
        const box = getDraftBox(workspaceDragState.start, workspaceDragState.end);
        const marquee = document.createElementNS(svgNs, "rect");
        marquee.classList.add("layout-workspace-marquee");
        marquee.setAttribute("x", String(box.x));
        marquee.setAttribute("y", String(box.y));
        marquee.setAttribute("width", String(box.width));
        marquee.setAttribute("height", String(box.height));
        marquee.setAttribute("fill", "none");
        marquee.setAttribute("stroke", "#2563eb");
        marquee.setAttribute("stroke-width", String(1 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)));
        marquee.setAttribute("stroke-dasharray", `${7 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)} ${5 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)}`);
        marquee.setAttribute("pointer-events", "none");
        workspaceGuideLayer.append(marquee);
        return;
      }
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
      const selected = workspaceSelectedIds.has(object.instanceId);
      const width = object.widthM * workspaceMeterScale;
      const height = object.heightM * workspaceMeterScale;
      const x = -width / 2;
      const y = -height / 2;
      group.classList.add("layout-workspace-object");
      if (selected) group.classList.add("selected");
      group.setAttribute("transform", `translate(${object.x} ${object.y}) rotate(${object.rotation || 0})`);
      group.setAttribute("opacity", String(getWorkspaceObjectOpacity(object)));
      group.dataset.instanceId = object.instanceId;
      if (!canWorkspaceEditObject(object)) {
        group.dataset.baseFloorplanObject = "true";
        group.setAttribute("pointer-events", "none");
      } else {
        group.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey) selectWorkspaceObject(object.instanceId);
        });
        group.addEventListener("pointerdown", (event) => startWorkspaceDrag(event, object.instanceId));
      }
      if (canWorkspaceEditObject(object)) group.append(createWorkspaceObjectHitArea(object, x, y, width, height));
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
      if (!workspaceSelectionLayer || !workspaceSelectedIds.size) return;
      const screenStroke = Math.max(1.5 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE), 1);
      [...workspaceSelectedIds].map(findWorkspaceObject).filter(Boolean).forEach((object) => {
        const width = object.widthM * workspaceMeterScale;
        const height = object.heightM * workspaceMeterScale;
        const group = document.createElementNS(svgNs, "g");
        group.setAttribute("transform", `translate(${object.x} ${object.y}) rotate(${object.rotation || 0})`);
        const box = document.createElementNS(svgNs, "rect");
        box.setAttribute("x", String(-width / 2));
        box.setAttribute("y", String(-height / 2));
        box.setAttribute("width", String(width));
        box.setAttribute("height", String(height));
        box.setAttribute("rx", "6");
        box.setAttribute("fill", "none");
        box.setAttribute("stroke", "#d4af37");
        box.setAttribute("stroke-width", String(screenStroke));
        box.setAttribute("stroke-dasharray", `${8 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)} ${5 / Math.max(view.scale || 1, WORKSPACE_MIN_SCALE)}`);
        box.setAttribute("pointer-events", "none");
        group.append(box);
        if (workspaceSelectedIds.size === 1 && canWorkspaceEditObject(object)) {
          if (!isCompositeGroup(object)) group.append(createWorkspaceResizeHandle(object, width, height));
          group.append(createWorkspaceRotateHandle(object, height));
        }
        workspaceSelectionLayer.append(group);
      });
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
        : (object.label || object.metadata?.label || objectLabels[object.objectType] || "고정 구조물");
      const showNames = isWorkspaceBaseObject(object) || (options.showNames ?? workspaceShowNames);
      if (showNames) {
        const text = document.createElementNS(svgNs, "text");
        text.textContent = label || "";
        text.setAttribute("x", "0");
        text.setAttribute("y", String(Math.min(width, height) < 70 ? height / 2 + 22 : 5));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size",isWorkspaceBaseObject(object) ? "300" : "14");
        text.setAttribute("font-weight", "800");
        text.setAttribute("fill", "#102B55");
        text.setAttribute("class", isWorkspaceBaseObject(object) ? "layout-workspace-base-label" : "layout-workspace-object-label");
        text.setAttribute("paint-order", "stroke");
        text.setAttribute("stroke", "rgba(255,255,255,.92)");
        text.setAttribute("stroke-width", "4");
        text.setAttribute("stroke-linejoin", "round");
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
      if (type === "round_table") return "circle";
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
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        selectWorkspaceObject(instanceId, true);
        return;
      }
      logWorkspacePointerDown(event, { ...pointerHit, type: pointerHit?.type || "object", object }, "move");
      beginWorkspaceObjectMove(event, object);
    }

    function beginWorkspaceObjectMove(event, object) {
      if (!object || !canWorkspaceEditObject(object)) return;
      event.preventDefault();
      event.stopPropagation();
      workspaceSuppressCanvasClick = true;
      if (!workspaceSelectedIds.has(object.instanceId)) {
        workspaceSelectedId = object.instanceId;
        workspaceSelectedIds = new Set([object.instanceId]);
      }
      renderWorkspaceProperties();
      if (workspaceSelectionLayer) workspaceSelectionLayer.innerHTML = "";
      renderWorkspaceSelection();
      updateWorkspaceStatusbar();
      pushWorkspaceHistory();
      const point = getWorkspaceSvgPoint(event);
      const selectedObjects = [...workspaceSelectedIds].map(findWorkspaceObject).filter(canWorkspaceEditObject);
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
        selectedStarts: selectedObjects.map((item) => ({ id: item.instanceId, x: item.x, y: item.y, metadata: JSON.parse(JSON.stringify(item.metadata || {})) })),
        moved: false,
      };
      captureWorkspacePointer(event);
    }

    function startWorkspaceResize(event, instanceId) {
      event.preventDefault();
      event.stopPropagation();
      const object = findWorkspaceObject(instanceId);
      if (!object || !canWorkspaceEditObject(object)) return;
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
      if (!object || !canWorkspaceEditObject(object)) return;
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
      if (workspaceDragState.mode === "marquee") {
        workspaceDragState.end = getWorkspaceSvgPoint(event);
        workspaceDragState.moved = true;
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
      if (!object || !canWorkspaceEditObject(object)) return;
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
        const freeMove = hasCompositeWorkspace();
        const nextCenter = applyWorkspaceSnapPoint({
          x: freeMove ? workspaceDragState.startObjectX + deltaX : clampNumber(workspaceDragState.startObjectX + deltaX, 0, workspaceSize.width),
          y: freeMove ? workspaceDragState.startObjectY + deltaY : clampNumber(workspaceDragState.startObjectY + deltaY, 0, workspaceSize.height),
        });
        logWorkspacePointerMove(event, { dxWorld: deltaX, dyWorld: deltaY, nextCenter });
        const snappedDelta = { x: nextCenter.x - workspaceDragState.startObjectX, y: nextCenter.y - workspaceDragState.startObjectY };
        const starts = workspaceDragState.selectedStarts || [{ id: object.instanceId, x: workspaceDragState.startObjectX, y: workspaceDragState.startObjectY, metadata: workspaceDragState.startMetadata }];
        const boundedDelta = freeMove ? snappedDelta : {
          x: clampNumber(snappedDelta.x, -Math.min(...starts.map((item) => item.x)), workspaceSize.width - Math.max(...starts.map((item) => item.x))),
          y: clampNumber(snappedDelta.y, -Math.min(...starts.map((item) => item.y)), workspaceSize.height - Math.max(...starts.map((item) => item.y))),
        };
        starts.forEach((start) => {
          const selectedObject = findWorkspaceObject(start.id);
          if (!selectedObject || !canWorkspaceEditObject(selectedObject)) return;
          if (["wall", "calibration"].includes(selectedObject.objectType)) {
            const startMetadata = migrateLegacyWallMetadata({ ...selectedObject, metadata: start.metadata });
            const startCenterMm = workspacePointToMillimeters({ x: start.x, y: start.y });
            const nextCenterMm = workspacePointToMillimeters({ x: start.x + boundedDelta.x, y: start.y + boundedDelta.y });
            const deltaMmX = nextCenterMm.x - startCenterMm.x;
            const deltaMmY = nextCenterMm.y - startCenterMm.y;
            selectedObject.metadata = { ...startMetadata, start_x_mm: Math.round(Number(startMetadata.start_x_mm || 0) + deltaMmX), start_y_mm: Math.round(Number(startMetadata.start_y_mm || 0) + deltaMmY), end_x_mm: Math.round(Number(startMetadata.end_x_mm || 0) + deltaMmX), end_y_mm: Math.round(Number(startMetadata.end_y_mm || 0) + deltaMmY) };
            syncWorkspaceLineObjectFromMetadata(selectedObject);
          } else {
            selectedObject.x = start.x + boundedDelta.x;
            selectedObject.y = start.y + boundedDelta.y;
          }
        });
        starts.map((start) => findWorkspaceObject(start.id)).filter(isCompositeGroup).forEach((group) => syncCompositeGroupFromObject(group, true));
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
      const movedLayoutAiObject = Boolean(workspaceDragState?.moved && layoutAiPlan);
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
      if (workspaceDragState?.mode === "marquee") {
        const box = getDraftBox(workspaceDragState.start, workspaceDragState.end);
        const matched = workspaceObjects.filter((object) => canWorkspaceEditObject(object) && floorplanObjectIntersectsBox(object, box, workspaceMeterScale)).map((object) => object.instanceId);
        workspaceSelectedIds = new Set([...(workspaceDragState.initialIds || []), ...matched]);
        workspaceSelectedId = [...workspaceSelectedIds].at(-1) || "";
        workspaceSuppressCanvasClick = true;
      }
      workspaceDragState = null;
      workspaceSvg?.classList.remove("is-panning");
      releaseWorkspacePointer(event);
      renderWorkspace();
      if (movedLayoutAiObject) refreshLayoutAiValidation();
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
        x: Number(center.x),
        y: Number(center.y),
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

    function selectWorkspaceObject(instanceId, additive = false) {
      const object = findWorkspaceObject(instanceId);
      if (object && !canWorkspaceEditObject(object)) return;
      if (!additive) workspaceSelectedIds = new Set(instanceId ? [instanceId] : []);
      else if (workspaceSelectedIds.has(instanceId)) workspaceSelectedIds.delete(instanceId);
      else if (instanceId) workspaceSelectedIds.add(instanceId);
      workspaceSelectedId = [...workspaceSelectedIds].at(-1) || "";
      renderWorkspace();
    }

    function canWorkspaceEditObject(object) {
      if (!object) return false;
      if (workspaceEditMode === "base") return isWorkspaceBaseObject(object) && !workspaceFloorplanRecord?.is_locked;
      if (isCompositeGroup(object) && !isWorkspaceBaseObject(object)) return true;
      return !object.locked && !isFloorplanStructuralObject(object);
    }

    function renderWorkspaceProperties() {
      const object = findWorkspaceObject(workspaceSelectedId);
      const selectionCount = workspaceSelectedIds.size;
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
      const propertiesPanel = workspaceLabelInput?.closest?.(".layout-editor-properties");
      const panelHelp = propertiesPanel?.querySelector?.(".layout-panel-title p");
      propertiesPanel?.classList.toggle("multi-selection", selectionCount > 1);
      if (panelHelp) panelHelp.textContent = selectionCount > 1 ? `${selectionCount}개 객체 선택됨` : object ? "선택한 오브젝트를 편집합니다." : "도면에서 오브젝트를 선택하세요.";
      inputs.concat(buttons).forEach((el) => {
        if (el) el.disabled = !object;
      });
      if (selectionCount > 1) {
        inputs.forEach((input) => { if (input) { input.value = ""; input.disabled = true; } });
        buttons.forEach((button) => { if (button) button.disabled = false; });
        if (workspaceRotate90Button) workspaceRotate90Button.disabled = true;
        return;
      }
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
      if (!canWorkspaceEditObject(object)) {
        inputs.concat(buttons).forEach((el) => { if (el) el.disabled = true; });
      }
      if (isCompositeGroup(object)) {
        [workspaceWidthInput, workspaceHeightInput, workspaceSeatCountInput, workspaceZIndexInput, workspaceOpacityInput, workspaceDuplicateButton, workspaceBringFrontButton, workspaceForwardButton, workspaceBackwardButton, workspaceSendBackButton].forEach((input) => { if (input) input.disabled = true; });
        if (panelHelp) panelHelp.textContent = `기본도면: ${object.label} · 내부 구조물 잠금`;
      }
      const isWallLike = ["wall", "calibration"].includes(object.objectType);
      [workspaceXInput, workspaceYInput, workspaceWidthInput, workspaceHeightInput, workspaceRotationInput].forEach((input) => {
        if (input && isWallLike) input.disabled = true;
      });
      workspaceLabelInput.value = object.label || "";
      workspaceXInput.value = isCompositeGroup(object) ? Math.round(Number(object.metadata.offsetX || 0)) : roundNumber(object.x);
      workspaceYInput.value = isCompositeGroup(object) ? Math.round(Number(object.metadata.offsetY || 0)) : roundNumber(object.y);
      workspaceWidthInput.value = roundNumber(object.widthM);
      workspaceHeightInput.value = roundNumber(object.heightM);
      workspaceRotationInput.value = Math.round(isCompositeGroup(object) ? Number(object.metadata.rotation || 0) : Number(object.rotation || 0));
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
      if (!object || !canWorkspaceEditObject(object)) return;
      pushWorkspaceHistory();
      object.label = workspaceLabelInput.value.trim() || object.label;
      if (isCompositeGroup(object)) {
        object.metadata.offsetX = Math.round(toWorkspaceNumber(workspaceXInput.value, object.metadata.offsetX || 0));
        object.metadata.offsetY = Math.round(toWorkspaceNumber(workspaceYInput.value, object.metadata.offsetY || 0));
        object.metadata.rotation = normalizeDegrees(toWorkspaceNumber(workspaceRotationInput.value, object.metadata.rotation || 0));
        refreshCompositeGroupChildren(object); markWorkspaceDirty(); renderWorkspace(); return;
      }
      const nextX = toWorkspaceNumber(workspaceXInput.value, object.x);
      const nextY = toWorkspaceNumber(workspaceYInput.value, object.y);
      object.x = hasCompositeWorkspace() ? nextX : clampNumber(nextX, 0, workspaceSize.width);
      object.y = hasCompositeWorkspace() ? nextY : clampNumber(nextY, 0, workspaceSize.height);
      object.widthM = Math.max(0.1, toWorkspaceNumber(workspaceWidthInput.value, object.widthM));
      object.heightM = Math.max(0.1, toWorkspaceNumber(workspaceHeightInput.value, object.heightM));
      object.rotation = normalizeDegrees(toWorkspaceNumber(workspaceRotationInput.value, object.rotation || 0));
      object.seatCount = Math.max(0, Math.round(toWorkspaceNumber(workspaceSeatCountInput.value, object.seatCount || 0)));
      object.zIndex = Math.round(toWorkspaceNumber(workspaceZIndexInput.value, object.zIndex || 0));
      if (workspaceOpacityInput) {
        object.opacity = clampNumber(toWorkspaceNumber(workspaceOpacityInput.value, getWorkspaceObjectOpacity(object) * 100) / 100, 0, 1);
        object.metadata = { ...(object.metadata || {}), opacity: object.opacity };
      }
      if (isCompositeGroup(object)) syncCompositeGroupFromObject(object, true);
      markWorkspaceDirty();
      renderWorkspace();
    }

    function updateSelectedWorkspaceWallFromInputs(sourceInput = null) {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object || !canWorkspaceEditObject(object) || !["wall", "calibration"].includes(object.objectType)) return;
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
      const selected = [...workspaceSelectedIds].map(findWorkspaceObject).filter(canWorkspaceEditObject);
      if (!selected.length) return;
      pushWorkspaceHistory();
      selected.forEach((object, index) => {
        if (mode === "front") object.zIndex = getWorkspaceMaxZIndex() + index + 1;
        if (mode === "forward") object.zIndex += 1;
        if (mode === "backward") object.zIndex -= 1;
        if (mode === "back") object.zIndex = getWorkspaceMinZIndex() - selected.length + index;
      });
      markWorkspaceDirty();
      renderWorkspace();
    }

    function duplicateWorkspaceObject() {
      const selected = [...workspaceSelectedIds].map(findWorkspaceObject).filter(canWorkspaceEditObject);
      if (!selected.length) return;
      pushWorkspaceHistory();
      const maxZ = getWorkspaceMaxZIndex();
      const offset = hasCompositeWorkspace() ? { x: 200, y: 200 } : {
        x: clampNumber(200, -Math.min(...selected.map((object) => object.x)), workspaceSize.width - Math.max(...selected.map((object) => object.x))),
        y: clampNumber(200, -Math.min(...selected.map((object) => object.y)), workspaceSize.height - Math.max(...selected.map((object) => object.y))),
      };
      const copies = duplicateFloorplanObjects(selected, offset, (_, index) => crypto.randomUUID ? crypto.randomUUID() : `object_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`)
        .map((copy, index) => ({ ...copy, zIndex: maxZ + index + 1 }));
      workspaceObjects.push(...copies);
      workspaceSelectedIds = new Set(copies.map((copy) => copy.instanceId));
      workspaceSelectedId = copies.at(-1)?.instanceId || "";
      markWorkspaceDirty();
      renderWorkspace();
    }

    function rotateWorkspaceObject90() {
      const object = findWorkspaceObject(workspaceSelectedId);
      if (!object || !canWorkspaceEditObject(object)) return;
      pushWorkspaceHistory();
      if (isCompositeGroup(object)) { object.metadata.rotation = normalizeDegrees(Number(object.metadata.rotation || 0) + 90); refreshCompositeGroupChildren(object); }
      else object.rotation = normalizeDegrees(Number(object.rotation || 0) + 90);
      markWorkspaceDirty();
      renderWorkspace();
    }

    function deleteSelectedWorkspaceObject() {
      const deletableIds = new Set([...workspaceSelectedIds].map(findWorkspaceObject).filter(canWorkspaceEditObject).map((object) => object.instanceId));
      if (!deletableIds.size) return;
      pushWorkspaceHistory();
      workspaceObjects = workspaceObjects.filter((object) => !deletableIds.has(object.instanceId) && !deletableIds.has(object.metadata?.compositeGroupId));
      workspaceSelectedIds.clear();
      workspaceSelectedId = "";
      markWorkspaceDirty();
      renderWorkspace();
    }

    function resetWorkspaceLayout() {
      workspaceObjects = [];
      workspaceBaseObjects = [];
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
      const preserveViewport = !floorplanId || String(workspaceFloorplanSelect?.value || "") === String(floorplanId);
      const previousView = { ...view };
      if (preserveViewport) cancelWorkspaceFit();
      if (floorplanId && String(workspaceFloorplanSelect?.value || "") !== String(floorplanId)) {
        workspaceFloorplanSelect.value = floorplanId;
        await handleWorkspaceFloorplanChange();
      }
      pushWorkspaceHistory();
      workspaceObjects = useCurrentFloorplan
        ? cloneFloorplanObjectsForLayout(workspaceBaseObjects.length ? workspaceBaseObjects : workspaceObjects.filter(isWorkspaceBaseObject))
        : [];
      workspaceShowFloorplan = useCurrentFloorplan;
      workspaceGrid = !useCurrentFloorplan;
      if (workspaceViewFloorplanInput) workspaceViewFloorplanInput.checked = workspaceShowFloorplan;
      if (workspaceViewGridInput) workspaceViewGridInput.checked = workspaceGrid;
      workspaceSelectedId = "";
      workspaceActiveLayout = layoutName ? { layout_name: layoutName.trim() || "???덉씠?꾩썐" } : null;
      if (workspaceNameInput) workspaceNameInput.value = workspaceActiveLayout?.layout_name || "";
      if (workspaceSavedLayoutSelect) workspaceSavedLayoutSelect.value = "";
      setWorkspaceEditMode("layout");
      if (preserveViewport) Object.assign(view, previousView);
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
      const bounds = getWorkspaceWorldBounds(true);
      const scaleX = canvasWidth / bounds.width;
      const scaleY = canvasHeight / bounds.height;
      view.scale = clampNumber(Math.min(scaleX, scaleY) * 0.92, WORKSPACE_MIN_SCALE, WORKSPACE_MAX_SCALE);
      view.panX = (canvasWidth - bounds.width * view.scale) / 2 - bounds.minX * view.scale;
      view.panY = (canvasHeight - bounds.height * view.scale) / 2 - bounds.minY * view.scale;
      renderWorkspace();
    }

    function setWorkspaceActualSize() {
      view.scale = 1;
      centerWorkspaceView();
    }

    function centerWorkspaceView() {
      updateWorkspaceSvgViewBox();
      const bounds = getWorkspaceWorldBounds(false);
      view.panX = workspaceViewportSize.width / 2 - ((bounds.minX + bounds.maxX) / 2) * view.scale;
      view.panY = workspaceViewportSize.height / 2 - ((bounds.minY + bounds.maxY) / 2) * view.scale;
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
      if (selected) selected.textContent = workspaceSelectedIds.size > 1 ? `선택: ${workspaceSelectedIds.size}개 객체` : `\uC120\uD0DD: ${object?.label || "\uC5C6\uC74C"}`;
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
      const displayBounds = hasCompositeWorkspace() ? getWorkspaceWorldBounds(false) : { width: workspaceDrawingWidthMm, height: workspaceDrawingHeightMm };
      const displayWidthMm = Math.round(displayBounds.width);
      const displayHeightMm = Math.round(displayBounds.height);
      const sizeLabel = `${formatMmAsMeters(displayWidthMm)} x ${formatMmAsMeters(displayHeightMm)}`;
      const mmLabel = `${displayWidthMm}mm x ${displayHeightMm}mm`;
      const metrics = floorplanOutlineMetrics(workspaceOutlinePoints);
      const floorplanName = workspaceFloorplanRecord?.floorplan_name || workspaceSourceRow?.layout_type || "선택 없음";
      const areaLabel = metrics.areaMm2 ? `${formatDecimal(metrics.areaMm2 / 1000000, 1)}m²` : "-";
      workspaceFloorplanInfo.innerHTML = `
        <span>\uAE30\uC900 \uAE30\uBCF8\uB3C4\uBA74: ${escapeHtml(floorplanName)}</span>
        <span>\uC7A5\uC18C: ${escapeHtml([venueName, spaceName].filter(Boolean).join(" / "))}</span>
        <span>\uC804\uCCB4\uD06C\uAE30: ${escapeHtml(sizeLabel)}</span>
        <span>\uBA74\uC801: ${escapeHtml(areaLabel)}</span>
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
        selectedIds: [...workspaceSelectedIds],
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
        selectedIds: [...workspaceSelectedIds],
        activeLayoutId: workspaceActiveLayout?.id || "",
      });
      restoreWorkspaceSnapshot(workspaceUndoStack.pop());
    }

    function redoWorkspaceChange() {
      if (!workspaceRedoStack.length) return;
      workspaceUndoStack.push({
        objects: cloneWorkspaceObjects(),
        selectedId: workspaceSelectedId,
        selectedIds: [...workspaceSelectedIds],
        activeLayoutId: workspaceActiveLayout?.id || "",
      });
      restoreWorkspaceSnapshot(workspaceRedoStack.pop());
    }

    function restoreWorkspaceSnapshot(snapshot) {
      workspaceObjects = JSON.parse(JSON.stringify(snapshot?.objects || []));
      workspaceSelectedId = snapshot?.selectedId || "";
      workspaceSelectedIds = new Set(snapshot?.selectedIds || (workspaceSelectedId ? [workspaceSelectedId] : []));
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

    function applyWorkspaceSnapPoint(point) {
      if (!workspaceSnap || !workspaceGrid) return point;
      const millimeters = workspacePointToMillimeters(point);
      return workspaceMillimetersToPoint({
        x: snapToGrid(millimeters.x, workspaceGridSizeMm),
        y: snapToGrid(millimeters.y, workspaceGridSizeMm),
      });
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
      const point = { x: Number(pointMm.x || 0), y: Number(pointMm.y || 0) };
      return hasCompositeWorkspace() ? point : { x: clampNumber(point.x, 0, workspaceSize.width), y: clampNumber(point.y, 0, workspaceSize.height) };
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

    function syncWorkspaceLineObjectFromMetadata(object, preserveWorldCoordinates = false) {
      if (!["wall", "calibration"].includes(object?.objectType)) return object;
      const metadata = migrateLegacyWallMetadata(object);
      const start = preserveWorldCoordinates ? { x: Number(metadata.start_x_mm || 0), y: Number(metadata.start_y_mm || 0) } : workspaceMillimetersToPoint({ x: metadata.start_x_mm, y: metadata.start_y_mm });
      const end = preserveWorldCoordinates ? { x: Number(metadata.end_x_mm || 0), y: Number(metadata.end_y_mm || 0) } : workspaceMillimetersToPoint({ x: metadata.end_x_mm, y: metadata.end_y_mm });
      const drawingLength = distanceBetweenPoints(start, end);
      object.metadata = metadata;
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      const allowExpandedCoordinates = preserveWorldCoordinates || isCompositeChild(object) || hasCompositeWorkspace();
      object.x = allowExpandedCoordinates ? centerX : clampNumber(centerX, 0, workspaceSize.width);
      object.y = allowExpandedCoordinates ? centerY : clampNumber(centerY, 0, workspaceSize.height);
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
        const shape = object.display_shape || object.metadata?.display_shape || (object.object_type === "round_table" ? "circle" : "rect");
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

    const api = {
      bindEvents,
      openEditor,
      async openLayoutPreviewById(layoutId) {
        if (!allLibraryLayouts.length || !allLibraryLayouts.some((row) => String(row.id) === String(layoutId))) await loadAllLibraryLayouts();
        const layout = allLibraryLayouts.find((row) => String(row.id) === String(layoutId));
        if (!layout) return false;
        showLibraryPreview(layout);
        return true;
      },
    };
    window.BANQUET_ERP_FLOORPLAN_EDITOR_INSTANCE = api;
    return api;
  }

  window.BANQUET_ERP_FLOORPLAN_EDITOR = {
    createFloorplanEditor,
    floorplanOutlineMetrics,
    floorplanObjectWorkspaceCenter,
    floorplanObjectIntersectsBox,
    duplicateFloorplanObjects,
    calculateWorkspaceWorldBounds,
    transformBasePlanPoint,
    isFloorplanStructuralObject,
    cloneFloorplanObjectsForLayout,
    layoutLibraryGroupName,
    normalizeLayoutAiContextName,
    layoutAiContextMatches,
    venueFamilyName,
    layoutLibraryObjectGeometry,
    layoutLibraryViewBox,
    parseLayoutAiCommand,
    layoutAiUnitToMm,
    parseLayoutAiEditCommand,
    frontDirection,
    chairFacingDirection,
    getRoundSeatAngles,
    generateSchoolLayout,
    generateRoundLayout,
    calculateSchoolSpacingProfile,
    mergeSchoolSpacingProfiles,
    applySchoolSpacingProfile,
    selectSchoolAnchorPair,
    resolveSchoolTargetPlan,
    validateGeneratedLayout,
  };
})();

