(function () {
  "use strict";

  const physics = window.BANQUET_ERP_EVENT_BLOCK_PHYSICS;
  const NS = "http://www.w3.org/2000/svg";
  const COMPLETE_KEY = "banquetBoard.eventBlocks.completed.v1";
  const CELL = 15;
  const GAP = 0;
  const FLOOR = 328;
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const jellyQuality = !prefersReducedMotion?.matches && (navigator.hardwareConcurrency || 4) >= 6 ? "high" : "normal";
  let events = [];
  let layout = [];
  let previousRows = new Map();
  let initialized = false;
  let visible = true;
  let frame = 0;

  const mount = document.getElementById("eventBlockBoard");
  const empty = document.getElementById("eventBlockEmpty");
  const dialog = document.getElementById("eventBlockDetail");

  function completedIds() {
    try { return JSON.parse(localStorage.getItem(COMPLETE_KEY) || "[]").map(String); }
    catch { return []; }
  }

  function saveCompleted(id) {
    try { localStorage.setItem(COMPLETE_KEY, JSON.stringify([...new Set([...completedIds(), String(id)])])); }
    catch (error) { console.debug("event block completion state unavailable", error); }
  }

  function svgNode(name, attributes = {}) {
    const node = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function easeSpring(t) {
    const clamped = Math.min(1, Math.max(0, t));
    return 1 - Math.exp(-7 * clamped) * Math.cos(10.5 * clamped);
  }

  function animate(duration, update, done, delay = 0) {
    if (prefersReducedMotion?.matches || !visible) { update(1); done?.(); return; }
    const start = performance.now() + delay;
    const tick = (now) => {
      if (now < start) { frame = requestAnimationFrame(tick); return; }
      const progress = Math.min(1, (now - start) / duration);
      update(progress);
      if (progress < 1) frame = requestAnimationFrame(tick); else done?.();
    };
    frame = requestAnimationFrame(tick);
  }

  function targetY(piece) {
    return FLOOR - (piece.targetRow + piece.height) * (CELL + GAP);
  }

  function pieceTransform(piece, y = targetY(piece), sx = 1, sy = 1) {
    const centerX = (piece.minX + piece.width / 2) * (CELL + GAP);
    const bottom = y + piece.height * (CELL + GAP);
    return `translate(8 ${y}) translate(${centerX} ${bottom}) scale(${sx} ${sy}) translate(${-centerX} ${-bottom})`;
  }

  function pieceColor(index) {
    return `url(#eventBlockJelly${index % 5})`;
  }

  function addDefinitions(svg) {
    const defs = svgNode("defs");
    [
      ["#91dded", "#3187a6", "#174d6c"], ["#d2b6f4", "#8b68bd", "#4c387c"],
      ["#8ce0c7", "#3e9a7d", "#205c52"], ["#f0c391", "#b77a4f", "#70442f"],
      ["#ed9fae", "#b95f75", "#713445"],
    ].forEach((colors, index) => {
      const gradient = svgNode("linearGradient", { id: `eventBlockJelly${index}`, x1: "0", y1: "0", x2: "0", y2: "1" });
      gradient.append(
        svgNode("stop", { offset: "0", "stop-color": colors[0], "stop-opacity": ".9" }),
        svgNode("stop", { offset: ".24", "stop-color": colors[0], "stop-opacity": ".78" }),
        svgNode("stop", { offset: ".62", "stop-color": colors[1], "stop-opacity": ".86" }),
        svgNode("stop", { offset: "1", "stop-color": colors[2], "stop-opacity": ".94" }),
      );
      defs.append(gradient);
    });
    const gloss = svgNode("linearGradient", { id: "eventBlockJellyGloss", x1: "0", y1: "0", x2: ".2", y2: "1" });
    gloss.append(
      svgNode("stop", { offset: "0", "stop-color": "#ffffff", "stop-opacity": ".58" }),
      svgNode("stop", { offset: ".18", "stop-color": "#ffffff", "stop-opacity": ".24" }),
      svgNode("stop", { offset: ".42", "stop-color": "#ffffff", "stop-opacity": "0" }),
      svgNode("stop", { offset: "1", "stop-color": "#ffffff", "stop-opacity": ".03" }),
    );
    defs.append(gloss);
    const depthShade = svgNode("linearGradient", { id: "eventBlockJellyShade", x1: "0", y1: "0", x2: ".12", y2: "1" });
    depthShade.append(svgNode("stop", { offset: ".55", "stop-color": "#00131e", "stop-opacity": "0" }), svgNode("stop", { offset: "1", "stop-color": "#00131e", "stop-opacity": ".28" }));
    defs.append(depthShade);
    const shadow = svgNode("filter", { id: "eventBlockJellyShadow", x: "-35%", y: "-35%", width: "170%", height: "190%" });
    shadow.append(svgNode("feGaussianBlur", { stdDeviation: "3.4" }));
    defs.append(shadow);
    const depth = svgNode("filter", { id: "eventBlockJellyHigh", x: "-18%", y: "-18%", width: "136%", height: "142%", "color-interpolation-filters": "sRGB" });
    const inverse = svgNode("feComponentTransfer", { in: "SourceAlpha", result: "inverseAlpha" });
    inverse.append(svgNode("feFuncA", { type: "table", tableValues: "1 0" }));
    const lighting = svgNode("feSpecularLighting", { in: "SourceAlpha", surfaceScale: "3", specularConstant: ".34", specularExponent: "22", "lighting-color": "#eefcff", result: "specular" });
    lighting.append(svgNode("feDistantLight", { azimuth: "225", elevation: "48" }));
    const merge = svgNode("feMerge");
    merge.append(svgNode("feMergeNode", { in: "SourceGraphic" }), svgNode("feMergeNode", { in: "innerShadow" }), svgNode("feMergeNode", { in: "specularIn" }));
    depth.append(
      inverse,
      svgNode("feGaussianBlur", { in: "inverseAlpha", stdDeviation: "1.5", result: "innerBlur" }),
      svgNode("feOffset", { in: "innerBlur", dx: "-1.1", dy: "-1.4", result: "innerOffset" }),
      svgNode("feComposite", { in: "innerOffset", in2: "SourceAlpha", operator: "in", result: "innerMask" }),
      svgNode("feColorMatrix", { in: "innerMask", type: "matrix", values: "0 0 0 0 0 0 0 0 0 0.08 0 0 0 0 0.13 0 0 0 .42 0", result: "innerShadow" }),
      lighting,
      svgNode("feComposite", { in: "specular", in2: "SourceAlpha", operator: "in", result: "specularIn" }),
      merge,
    );
    defs.append(depth);
    svg.append(defs);
  }

  function renderPiece(svg, piece, index, isNew) {
    const group = svgNode("g", { class: "event-block-piece", role: "button", tabindex: "0", "data-event-block-id": piece.id, "data-jelly-quality": jellyQuality, "aria-label": `${piece.venueLabel} ${piece.organizerLabel}` });
    const contourCells = piece.cells.map((cell) => ({ x: cell.x, y: piece.height - cell.y - 1 }));
    const contour = physics.buildPieceContour(contourCells, { cellSize: CELL, radius: CELL * .22 });
    const jelly = svgNode("g", { class: "event-block-jelly-layers", "aria-hidden": "true" });
    const shadow = svgNode("path", { class: "event-block-jelly-shadow", d: contour });
    const base = svgNode("path", { class: "event-block-jelly-base", d: contour, fill: pieceColor(index) });
    if (jellyQuality === "high") base.setAttribute("filter", "url(#eventBlockJellyHigh)");
    jelly.append(
      shadow,
      base,
      svgNode("path", { class: "event-block-jelly-depth", d: contour, fill: "url(#eventBlockJellyShade)" }),
      svgNode("path", { class: "event-block-jelly-gloss", d: contour, fill: "url(#eventBlockJellyGloss)" }),
      svgNode("path", { class: "event-block-jelly-bottom-rim", d: contour }),
      svgNode("path", { class: "event-block-jelly-rim", d: contour }),
    );
    group.append(jelly);
    const [labelRow, rowCells] = physics.widestRow(piece);
    if (rowCells.length >= 2) {
      const min = Math.min(...rowCells.map((cell) => cell.x));
      const max = Math.max(...rowCells.map((cell) => cell.x));
      const label = svgNode("text", { class: "event-block-label", x: ((min + max + 1) / 2) * (CELL + GAP), y: (piece.height - (labelRow - piece.targetRow) - .5) * (CELL + GAP), "text-anchor": "middle" });
      const venue = svgNode("tspan", { x: label.getAttribute("x"), dy: "-1" });
      venue.textContent = piece.venueLabel;
      label.append(venue);
      if (rowCells.length >= 4) {
        const organizer = svgNode("tspan", { x: label.getAttribute("x"), dy: "7" });
        organizer.textContent = String(piece.organizerLabel).slice(0, 12);
        label.append(organizer);
      }
      group.append(label);
    }
    group.style.transformOrigin = "center bottom";
    group.setAttribute("transform", pieceTransform(piece));
    const activate = () => tapPiece(group, piece);
    group.addEventListener("click", activate);
    group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    svg.append(group);

    const oldRow = previousRows.get(piece.id);
    const fromY = isNew ? -piece.height * (CELL + GAP) - 24 : oldRow != null ? FLOOR - (oldRow + piece.height) * (CELL + GAP) : targetY(piece);
    const distance = Math.abs(fromY - targetY(piece));
    const duration = Math.max(450, Math.min(750, 450 + distance * 1.15));
    const delay = initialized ? 0 : index * 50;
    if (isNew || oldRow !== piece.targetRow) {
      animate(duration, (progress) => {
        const y = fromY + (targetY(piece) - fromY) * easeSpring(progress);
        const stretching = progress < .92;
        group.setAttribute("transform", pieceTransform(piece, y, stretching ? .96 : 1, stretching ? 1.06 : 1));
      }, () => landingSquash(group, piece), delay);
    }
  }

  function jellyFrame(progress, frames) {
    const nextIndex = Math.min(frames.length - 1, frames.findIndex((frame) => frame.at >= progress));
    const next = frames[nextIndex < 0 ? frames.length - 1 : nextIndex];
    const previous = frames[Math.max(0, (nextIndex < 0 ? frames.length - 1 : nextIndex) - 1)];
    const distance = Math.max(.0001, next.at - previous.at);
    const amount = Math.min(1, Math.max(0, (progress - previous.at) / distance));
    return { sx: previous.sx + (next.sx - previous.sx) * amount, sy: previous.sy + (next.sy - previous.sy) * amount };
  }

  function landingSquash(group, piece) {
    const frames = [{ at: 0, sx: .96, sy: 1.06 }, { at: .34, sx: 1.10, sy: .90 }, { at: .72, sx: .98, sy: 1.03 }, { at: 1, sx: 1, sy: 1 }];
    group.classList.add("is-landing");
    animate(230, (progress) => {
      const scale = jellyFrame(progress, frames);
      group.setAttribute("transform", pieceTransform(piece, targetY(piece), scale.sx, scale.sy));
    }, () => { group.classList.remove("is-landing"); group.setAttribute("transform", pieceTransform(piece)); });
  }

  function tapPiece(group, piece) {
    navigator.vibrate?.(10);
    const frames = [{ at: 0, sx: 1, sy: 1 }, { at: .4, sx: 1.04, sy: .96 }, { at: .72, sx: .985, sy: 1.015 }, { at: 1, sx: 1, sy: 1 }];
    animate(190, (progress) => {
      const scale = jellyFrame(progress, frames);
      group.setAttribute("transform", pieceTransform(piece, targetY(piece), scale.sx, scale.sy));
    }, () => { group.setAttribute("transform", pieceTransform(piece)); openDetail(piece); });
  }

  function formatRange(piece) {
    return piece.start === piece.end || !piece.end ? piece.start : `${piece.start} ~ ${piece.end}`;
  }

  function openDetail(piece) {
    if (!dialog) return;
    const event = piece.event;
    dialog.querySelector("[data-event-block-organizer]").textContent = event.companyName || event.organizer || "주최 미정";
    dialog.querySelector("[data-event-block-name]").textContent = event.eventName || "행사명 미정";
    dialog.querySelector("[data-event-block-date]").textContent = formatRange(piece);
    dialog.querySelector("[data-event-block-venue]").textContent = event.venue || piece.venueLabel;
    dialog.querySelector("[data-event-block-people]").textContent = event.guestCount ? `${Number(event.guestCount).toLocaleString("ko-KR")}명` : "인원 미정";
    const schedules = dialog.querySelector("[data-event-block-schedules]");
    schedules.innerHTML = "";
    (event.schedule || []).slice(0, 8).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = [item.date, item.time, item.content, item.venue].filter(Boolean).join(" · ");
      schedules.append(li);
    });
    schedules.hidden = !schedules.children.length;
    const original = dialog.querySelector("[data-event-block-original]");
    original.hidden = !event.storagePath;
    original.onclick = () => window.openStoredExcel?.(event.storagePath, { eventOrderId: event.id, originalFilename: event.originalFilename || "" });
    dialog.querySelector("[data-event-block-complete]").onclick = () => { dialog.close(); completePiece(piece); };
    dialog.showModal();
  }

  function completePiece(piece) {
    const group = [...mount.querySelectorAll("[data-event-block-id]")].find((node) => node.dataset.eventBlockId === piece.id);
    if (!group) return;
    navigator.vibrate?.(20);
    const frames = [{ at: 0, sx: 1, sy: 1 }, { at: .34, sx: 1.10, sy: 1.10 }, { at: 1, sx: .85, sy: .85 }];
    animate(260, (progress) => {
      const scale = jellyFrame(progress, frames);
      group.style.opacity = String(progress < .3 ? 1 : 1 - (progress - .3) / .7);
      group.setAttribute("transform", pieceTransform(piece, targetY(piece), scale.sx, scale.sy));
    }, () => { saveCompleted(piece.id); render({ events }); });
  }

  function render(options = {}) {
    if (!mount || !physics) return;
    events = options.events || events;
    const selectedDate = window.BANQUET_ERP_OPERATION_BOARD?.getSelectedDate?.() || new Date().toISOString().slice(0, 10);
    const next = physics.buildLayout(events, { anchorDate: selectedDate, completedIds: completedIds(), limit: 12 });
    const previousIds = new Set(layout.map((piece) => piece.id));
    cancelAnimationFrame(frame);
    mount.innerHTML = "";
    const svg = svgNode("svg", { class: "event-block-svg", viewBox: `0 0 ${physics.BOARD_COLUMNS * (CELL + GAP) + 16} 340`, preserveAspectRatio: "xMidYMax meet", "aria-label": "테트리스형 행사 블록 보드" });
    addDefinitions(svg);
    const floor = svgNode("line", { class: "event-block-floor", x1: "8", x2: String(physics.BOARD_COLUMNS * (CELL + GAP) + 8), y1: String(FLOOR + 1), y2: String(FLOOR + 1) });
    svg.append(floor);
    next.forEach((piece, index) => renderPiece(svg, piece, index, initialized ? !previousIds.has(piece.id) : true));
    mount.append(svg);
    empty.hidden = Boolean(next.length);
    previousRows = new Map(next.map((piece) => [piece.id, piece.targetRow]));
    layout = next;
    initialized = true;
  }

  dialog?.querySelector("[data-event-block-close]")?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  if (mount && "IntersectionObserver" in window) new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.05 }).observe(mount);

  window.BANQUET_ERP_EVENT_BLOCK_BOARD = { render };
})();
